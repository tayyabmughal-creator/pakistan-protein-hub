"""Admin catalogue endpoints.

Publishing is a command, not a field. Setting ``publish_status`` through a
generic update would let a product go live with no image, no price and no
brand — the completeness checklist exists precisely to stop that, and it can
only stop it if publishing goes through somewhere that consults it.
"""

import logging

from django.db.models import Count, Prefetch
from rest_framework import generics, status, views
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.permissions import HasCapability
from inventory.views_admin import AdminPagination
from operations import audit
from users.capabilities import CAP_CATALOG_EDIT, CAP_CATALOG_PUBLISH, CAP_CATALOG_VIEW

from .models import Brand, Category, Goal, Product, ProductMedia, ProductVariant
from .serializers_admin import (
    AdminBrandSerializer,
    AdminCategorySerializer,
    AdminGoalSerializer,
    AdminMediaSerializer,
    AdminProductDetailSerializer,
    AdminProductListSerializer,
    AdminVariantSerializer,
    PublishSerializer,
    completeness,
)
from .services import sync_legacy_product_fields

logger = logging.getLogger(__name__)


def _product_detail_queryset():
    return Product.objects.select_related("brand_ref", "category").prefetch_related(
        Prefetch(
            "variants",
            queryset=ProductVariant.objects.prefetch_related("balances").order_by(
                "sort_order", "id"
            ),
        ),
        "media",
        "goals",
    )


class AdminProductListView(generics.ListCreateAPIView):
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW
    pagination_class = AdminPagination

    def get_serializer_class(self):
        return (
            AdminProductListSerializer
            if self.request.method == "GET"
            else AdminProductDetailSerializer
        )

    def get_queryset(self):
        queryset = (
            Product.objects.select_related("brand_ref", "category")
            .prefetch_related("variants__balances", "media")
            .annotate(variant_count=Count("variants", distinct=True), media_count=Count("media", distinct=True))
            .order_by("-updated_at")
        )
        params = self.request.query_params

        search = (params.get("search") or "").strip()
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(variants__sku__icontains=search)
                | Q(brand_ref__name__icontains=search)
            ).distinct()

        for field in ("category", "brand_ref", "supplement_type", "publish_status"):
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})

        if params.get("incomplete") == "true":
            # The blocking checks, expressed as a query so the filter is cheap.
            from django.db.models import Q

            queryset = queryset.filter(
                Q(brand_ref__isnull=True) | Q(media__isnull=True) | Q(variants__isnull=True)
            ).distinct()

        return queryset

    def perform_create(self, serializer):
        product = serializer.save()
        audit.record(
            action="catalog.create",
            entity=product,
            actor=self.request.user,
            summary=f"Created product {product.name}",
            request=self.request,
        )


class AdminProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminProductDetailSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW
    queryset = _product_detail_queryset()

    def perform_update(self, serializer):
        from operations.audit import snapshot

        before = snapshot(serializer.instance)
        product = serializer.save()
        sync_legacy_product_fields(product)
        audit.record(
            action="catalog.update",
            entity=product,
            actor=self.request.user,
            summary=f"Updated {product.name}",
            before=before,
            after=snapshot(product),
            request=self.request,
        )

    def perform_destroy(self, instance):
        # Deleting a product that has been sold would take its order lines with
        # it. Those lines are a financial record, so archive instead.
        if instance.variants.filter(order_items__isnull=False).exists():
            raise ValidationError(
                "This product appears on past orders and cannot be deleted. "
                "Archive it instead — it will stop being sold and its history stays intact."
            )
        audit.record(
            action="catalog.delete",
            entity=instance,
            actor=self.request.user,
            summary=f"Deleted {instance.name}",
            request=self.request,
        )
        instance.delete()



class AdminProductPublishView(views.APIView):
    """POST /api/admin/v2/catalog/products/<pk>/publish/

    Publishing is a command because it has a precondition. A product with no
    image, no price or no brand renders a broken page and cannot be bought;
    the checklist knows that, and this is where it gets consulted.
    """

    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_PUBLISH

    def post(self, request, pk):
        product = _product_detail_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        publish = serializer.validated_data["publish"]

        if publish:
            report = completeness(product)
            if not report["can_publish"]:
                return Response(
                    {
                        "error": "This product is not ready to publish.",
                        "missing": report["blocking"],
                        "completeness": report,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        product.publish_status = Product.STATUS_PUBLISHED if publish else Product.STATUS_DRAFT
        product.is_active = publish
        product.save(update_fields=["publish_status", "is_active", "updated_at"])

        audit.record(
            action="catalog.publish" if publish else "catalog.unpublish",
            entity=product,
            actor=request.user,
            summary=f"{'Published' if publish else 'Unpublished'} {product.name}",
            request=request,
        )
        return Response(AdminProductDetailSerializer(product).data)


class AdminVariantListView(generics.CreateAPIView):
    serializer_class = AdminVariantSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT

    def perform_create(self, serializer):
        variant = serializer.save()
        sync_legacy_product_fields(variant.product)
        audit.record(
            action="catalog.create",
            entity=variant,
            actor=self.request.user,
            summary=f"Added variant {variant.sku} to {variant.product.name}",
            request=self.request,
        )


class AdminVariantDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminVariantSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW
    queryset = ProductVariant.objects.select_related("product").prefetch_related("balances")

    def perform_update(self, serializer):
        from operations.audit import snapshot

        before = snapshot(serializer.instance)
        variant = serializer.save()
        sync_legacy_product_fields(variant.product)
        audit.record(
            action="catalog.update",
            entity=variant,
            actor=self.request.user,
            summary=f"Updated variant {variant.sku}",
            before=before,
            after=snapshot(variant),
            request=self.request,
        )

    def perform_destroy(self, instance):
        if instance.order_items.exists():
            raise ValidationError(
                f"{instance.sku} appears on past orders and cannot be deleted. "
                "Deactivate it instead — it stops being sold and the history stays intact."
            )
        if instance.is_default and instance.product.variants.count() > 1:
            raise ValidationError(
                "This is the default variant. Make another one the default first, "
                "or the product page will have nothing to open on."
            )
        product = instance.product
        audit.record(
            action="catalog.delete",
            entity=instance,
            actor=self.request.user,
            summary=f"Deleted variant {instance.sku}",
            request=self.request,
        )
        instance.delete()
        sync_legacy_product_fields(product)


class AdminMediaListView(generics.CreateAPIView):
    serializer_class = AdminMediaSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT

    def perform_create(self, serializer):
        media = serializer.save()
        sync_legacy_product_fields(media.product)
        audit.record(
            action="catalog.update",
            entity=media.product,
            actor=self.request.user,
            summary=f"Added an image to {media.product.name}",
            request=self.request,
        )


class AdminMediaDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminMediaSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW
    queryset = ProductMedia.objects.select_related("product")

    def perform_destroy(self, instance):
        product = instance.product
        instance.delete()
        sync_legacy_product_fields(product)
        audit.record(
            action="catalog.update",
            entity=product,
            actor=self.request.user,
            summary=f"Removed an image from {product.name}",
            request=self.request,
        )


class AdminBrandListView(generics.ListCreateAPIView):
    serializer_class = AdminBrandSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW

    def get_queryset(self):
        return Brand.objects.annotate(product_count=Count("products")).order_by(
            "sort_order", "name"
        )

    def perform_create(self, serializer):
        brand = serializer.save()
        audit.record(
            action="catalog.create",
            entity=brand,
            actor=self.request.user,
            summary=f"Created brand {brand.name}",
            request=self.request,
        )


class AdminBrandDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AdminBrandSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW

    def get_queryset(self):
        return Brand.objects.annotate(product_count=Count("products"))

    def perform_destroy(self, instance):
        if instance.products.exists():
            raise ValidationError(
                f"{instance.name} still has {instance.products.count()} product(s). "
                "Move them to another brand first."
            )
        instance.delete()


class AdminGoalListView(generics.ListCreateAPIView):
    serializer_class = AdminGoalSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_EDIT
    required_read_capability = CAP_CATALOG_VIEW
    queryset = Goal.objects.all()


class AdminCategoryListV2View(generics.ListAPIView):
    serializer_class = AdminCategorySerializer
    permission_classes = [HasCapability]
    required_capability = CAP_CATALOG_VIEW

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count("products")).order_by(
            "sort_order", "name"
        )
