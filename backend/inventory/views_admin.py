"""Admin inventory endpoints.

Reading is a list of balances. Writing is three named operations — receive,
adjust, count — and nothing else. There is deliberately no endpoint that sets
``on_hand`` directly: every change has a type, a reason and an actor, or it
does not happen.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import F, Q
from rest_framework import generics, status, views
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from common.permissions import HasCapability
from operations import audit
from products.models import ProductVariant
from products.services import sync_legacy_product_fields
from users.capabilities import (
    CAP_INVENTORY_ADJUST,
    CAP_INVENTORY_RECEIVE,
    CAP_INVENTORY_VIEW,
)

from . import services
from .models import InventoryBalance, InventoryLocation, StockMovement
from .serializers import (
    AdjustStockSerializer,
    InventoryBalanceSerializer,
    InventoryLocationSerializer,
    ReceiveStockSerializer,
    StockMovementSerializer,
    StocktakeSerializer,
)

logger = logging.getLogger(__name__)


class AdminPagination(PageNumberPagination):
    """Server-side paging. An admin list must not load the whole table."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class AdminInventoryListView(generics.ListAPIView):
    """GET /api/admin/inventory/ — stock levels, filterable and searchable."""

    serializer_class = InventoryBalanceSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_INVENTORY_VIEW
    pagination_class = AdminPagination

    def get_queryset(self):
        queryset = (
            InventoryBalance.objects.select_related(
                "variant__product__brand_ref", "location"
            )
            .order_by("variant__product__name", "variant__sort_order")
        )

        params = self.request.query_params

        search = (params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(variant__sku__icontains=search)
                | Q(variant__product__name__icontains=search)
                | Q(variant__barcode__icontains=search)
            )

        location = params.get("location")
        if location:
            queryset = queryset.filter(location__code=location)

        stock_filter = params.get("stock")
        if stock_filter == "low":
            queryset = queryset.filter(
                on_hand__gt=F("reserved"),
                on_hand__lte=F("reserved") + F("low_stock_threshold"),
            )
        elif stock_filter == "out":
            queryset = queryset.filter(on_hand__lte=F("reserved"))
        elif stock_filter == "never_counted":
            # The balances migrated from the legacy stock column. Surfacing
            # these is how a stocktake gets prioritised.
            queryset = queryset.filter(last_counted_at__isnull=True)

        return queryset


class AdminStockMovementListView(generics.ListAPIView):
    """GET /api/admin/inventory/movements/ — the ledger."""

    serializer_class = StockMovementSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_INVENTORY_VIEW
    pagination_class = AdminPagination

    def get_queryset(self):
        queryset = StockMovement.objects.select_related(
            "variant__product", "actor"
        ).order_by("-created_at", "-id")

        params = self.request.query_params
        if params.get("variant"):
            queryset = queryset.filter(variant_id=params["variant"])
        if params.get("sku"):
            queryset = queryset.filter(variant__sku=params["sku"])
        if params.get("movement_type"):
            queryset = queryset.filter(movement_type=params["movement_type"])
        if params.get("order"):
            queryset = queryset.filter(order_id=params["order"])
        return queryset


class AdminInventoryLocationListView(generics.ListAPIView):
    serializer_class = InventoryLocationSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_INVENTORY_VIEW

    def get_queryset(self):
        return InventoryLocation.objects.filter(is_active=True)


class _StockOperationView(views.APIView):
    """Shared plumbing: resolve the variant, run the operation, audit it."""

    serializer_class = None
    audit_action = ""

    def _get_variant(self, variant_id):
        return (
            ProductVariant.objects.select_related("product")
            .filter(pk=variant_id)
            .first()
        )

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = self._get_variant(data["variant"])
        if variant is None:
            return Response(
                {"error": "That product variant does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        balance_before = services.get_available(variant)

        try:
            balance = self.perform(variant, data, request)
        except DjangoValidationError as exc:
            # A refusal here is the service protecting an invariant — e.g.
            # reducing stock below what is reserved for unshipped orders. Report
            # it as a 400 with the reason, not a 500.
            return Response(
                {"error": "; ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST
            )

        # The legacy Product.stock column the current storefront still reads.
        sync_legacy_product_fields(variant.product)

        audit.record(
            action=self.audit_action,
            entity=variant,
            actor=request.user,
            summary=self.summary(variant, data, balance_before, balance),
            reason=data.get("reason", ""),
            request=request,
            entity_label=f"{variant.sku} ({variant.product.name})",
        )

        return Response(
            InventoryBalanceSerializer(balance).data, status=status.HTTP_200_OK
        )

    def perform(self, variant, data, request):
        raise NotImplementedError

    def summary(self, variant, data, before, balance):
        return f"{variant.sku}: available {before} -> {balance.available}"


class AdminReceiveStockView(_StockOperationView):
    """POST /api/admin/inventory/receive/ — stock arrived."""

    permission_classes = [HasCapability]
    required_capability = CAP_INVENTORY_RECEIVE
    serializer_class = ReceiveStockSerializer
    audit_action = "inventory.receive"

    def perform(self, variant, data, request):
        return services.receive_stock(
            variant=variant,
            quantity=data["quantity"],
            actor=request.user,
            reason=data.get("reason", ""),
            reference=data.get("reference", ""),
        )

    def summary(self, variant, data, before, balance):
        return f"Received {data['quantity']} of {variant.sku} (now {balance.on_hand} on hand)"


class AdminAdjustStockView(_StockOperationView):
    """POST /api/admin/inventory/adjust/ — damage, write-off, correction."""

    permission_classes = [HasCapability]
    required_capability = CAP_INVENTORY_ADJUST
    serializer_class = AdjustStockSerializer
    audit_action = "inventory.adjust"

    def perform(self, variant, data, request):
        return services.adjust_stock(
            variant=variant,
            delta=data["delta"],
            movement_type=data["movement_type"],
            actor=request.user,
            reason=data["reason"],
        )

    def summary(self, variant, data, before, balance):
        return (
            f"Adjusted {variant.sku} by {data['delta']:+d} "
            f"({data['movement_type']}), now {balance.on_hand} on hand"
        )


class AdminStocktakeView(_StockOperationView):
    """POST /api/admin/inventory/count/ — a physical count.

    The operation that makes migrated stock trustworthy. Every balance carried
    over from the legacy column is flagged never-counted until this runs.
    """

    permission_classes = [HasCapability]
    required_capability = CAP_INVENTORY_ADJUST
    serializer_class = StocktakeSerializer
    audit_action = "inventory.stocktake"

    def perform(self, variant, data, request):
        return services.set_counted_quantity(
            variant=variant,
            counted=data["counted"],
            actor=request.user,
            reason=data.get("reason", ""),
        )

    def summary(self, variant, data, before, balance):
        return f"Counted {variant.sku}: {data['counted']} on the shelf"
