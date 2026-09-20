"""Public storefront API.

Serves the Next.js storefront. Read-only, unauthenticated, and deliberately
narrow: only published products, only active variants, and only the fields a
page renders.

Out-of-stock products are **listed, not hidden**, and sorted last. Hiding them
was a real bug in the reference implementation: a freshly created product with
no stock rows yet was published, priced and categorised, and still invisible
everywhere including search, while the admin showed it perfectly. Stock is a
label on a product, not a reason to deny it exists — the card says "out of
stock" and checkout still refuses the sale.
"""

import logging

from django.db.models import (
    Avg,
    BooleanField,
    Count,
    ExpressionWrapper,
    F,
    Max,
    Min,
    Prefetch,
    Q,
)
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.models import InventoryBalance, InventoryLocation

from .models import Brand, Category, Goal, Product, ProductVariant
from .serializers_storefront import (
    StorefrontBrandSerializer,
    StorefrontCategorySerializer,
    StorefrontGoalSerializer,
    StorefrontProductCardSerializer,
    StorefrontProductDetailSerializer,
    balances_for,
    money,
)

logger = logging.getLogger(__name__)


class StockLocationMixin:
    """Resolves the stock location once per request.

    Both the in-stock subquery and the balances lookup need it, and each was
    fetching it separately — two identical queries on every listing and detail
    page, for a row that cannot change mid-request.
    """

    @property
    def stock_location(self):
        if not hasattr(self, "_stock_location"):
            self._stock_location = InventoryLocation.get_default()
        return self._stock_location


class StorefrontPagination(PageNumberPagination):
    page_size = 24  # a 3- or 4-column grid divides evenly
    page_size_query_param = "page_size"
    max_page_size = 60


def published_products():
    """The only queryset the storefront may read from."""
    return (
        Product.objects.filter(
            is_active=True, publish_status=Product.STATUS_PUBLISHED
        )
        .select_related("brand_ref", "category")
        .prefetch_related(
            Prefetch(
                "variants",
                queryset=ProductVariant.objects.filter(is_active=True).order_by(
                    "sort_order", "id"
                ),
            ),
            "media",
            "goals",
        )
    )


def with_ratings(queryset):
    """Annotate genuine review data. Absent means not yet rated, not zero."""
    return queryset.annotate(
        review_count=Count("reviews", distinct=True),
        review_average=Avg("reviews__rating"),
    )


class StorefrontProductListView(StockLocationMixin, generics.ListAPIView):
    """GET /api/v2/storefront/products/"""

    serializer_class = StorefrontProductCardSerializer
    permission_classes = [AllowAny]
    pagination_class = StorefrontPagination
    authentication_classes = []

    SORTS = {
        "newest": ["-created_at"],
        "price_low": ["cheapest_price"],
        "price_high": ["-cheapest_price"],
        "name": ["name"],
    }

    def get_queryset(self):
        params = self.request.query_params
        in_stock_ids = self._in_stock_ids()
        queryset = with_ratings(published_products()).annotate(
            cheapest_price=Min("variants__price", filter=Q(variants__is_active=True))
        )

        if params.get("category"):
            queryset = queryset.filter(category__slug=params["category"])
        if params.get("brand"):
            # Several brands at once: ?brand=optimum-nutrition&brand=dymatize
            queryset = queryset.filter(brand_ref__slug__in=params.getlist("brand"))
        if params.get("goal"):
            queryset = queryset.filter(goals__slug__in=params.getlist("goal")).distinct()
        if params.get("type"):
            queryset = queryset.filter(supplement_type__in=params.getlist("type"))

        if params.get("flavor"):
            queryset = queryset.filter(
                variants__flavor__in=params.getlist("flavor"), variants__is_active=True
            ).distinct()
        if params.get("size"):
            queryset = queryset.filter(
                variants__size_label__in=params.getlist("size"), variants__is_active=True
            ).distinct()

        if params.get("min_price"):
            queryset = queryset.filter(cheapest_price__gte=params["min_price"])
        if params.get("max_price"):
            queryset = queryset.filter(cheapest_price__lte=params["max_price"])

        search = (params.get("q") or "").strip()
        if search:
            queryset = self._search(queryset, search)

        if params.get("in_stock") == "true":
            queryset = queryset.filter(id__in=in_stock_ids)

        # Out of stock sinks to the bottom of every ordering rather than
        # disappearing from it. `-stocked` puts True (in stock) first.
        queryset = queryset.annotate(
            stocked=ExpressionWrapper(
                Q(id__in=in_stock_ids), output_field=BooleanField()
            )
        )
        sort = self.SORTS.get(params.get("sort", "newest"), self.SORTS["newest"])
        return queryset.order_by("-stocked", *sort)

    @staticmethod
    def _search(queryset, term):
        """Substring search across the fields customers actually type.

        PostgreSQL full text and trigram are the next step; this covers brand,
        name, SKU and supplement type, which is what most storefront searches
        are. Synonyms are handled by SEARCH_SYNONYMS so "preworkout" finds
        "pre-workout".
        """
        expanded = {term}
        lowered = term.lower()
        for canonical, synonyms in SEARCH_SYNONYMS.items():
            if lowered == canonical or lowered in synonyms:
                expanded.add(canonical)
                expanded.update(synonyms)

        condition = Q()
        for word in expanded:
            condition |= (
                Q(name__icontains=word)
                | Q(short_description__icontains=word)
                | Q(brand_ref__name__icontains=word)
                | Q(category__name__icontains=word)
                | Q(ingredients__icontains=word)
                | Q(variants__sku__icontains=word)
            )
        return queryset.filter(condition).distinct()

    def _in_stock_ids(self):
        """Product ids with at least one variant a customer could actually buy.

        A subquery rather than a materialised list: the id set is evaluated by
        PostgreSQL inside the main query instead of being shipped to Python and
        back, which matters once the catalogue outgrows a few hundred rows.
        """
        location = self.stock_location
        if location is None:
            # No location configured yet — nothing has stock. Say so honestly
            # rather than defaulting to "everything is available".
            return ProductVariant.objects.none().values_list("product_id", flat=True)
        return (
            InventoryBalance.objects.filter(
                location=location, on_hand__gt=F("reserved"), variant__is_active=True
            )
            .values_list("variant__product_id", flat=True)
            .distinct()
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        page = getattr(self, "_page_products", None)
        context["balances"] = balances_for(page, self.stock_location) if page else {}
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        # Stock for exactly the products on this page, in one query.
        self._page_products = page if page is not None else list(queryset)
        serializer = self.get_serializer(self._page_products, many=True)
        return (
            self.get_paginated_response(serializer.data)
            if page is not None
            else Response(serializer.data)
        )


#: Supplement vocabulary. Customers type "preworkout" and "pre workout" and
#: expect the same shelf.
SEARCH_SYNONYMS = {
    "whey": {"protein", "wpi", "wpc"},
    "mass gainer": {"gainer", "mass", "weight gainer"},
    "pre-workout": {"preworkout", "pre workout", "pump"},
    "creatine": {"monohydrate", "creatine monohydrate"},
    "bcaa": {"amino", "aminos", "eaa", "branched chain"},
    "isolate": {"iso", "whey isolate"},
    "casein": {"slow protein", "night protein"},
}


class StorefrontProductDetailView(StockLocationMixin, generics.RetrieveAPIView):
    """GET /api/v2/storefront/products/<slug>/

    The slug is the public URL, preserved from the old storefront.
    """

    serializer_class = StorefrontProductDetailSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    lookup_field = "slug"

    def get_queryset(self):
        return with_ratings(published_products())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        product = getattr(self, "_product", None)
        context["balances"] = balances_for([product], self.stock_location) if product else {}
        return context

    def retrieve(self, request, *args, **kwargs):
        self._product = self.get_object()
        serializer = self.get_serializer(self._product)
        return Response(serializer.data)


class StorefrontRelatedProductsView(StockLocationMixin, generics.ListAPIView):
    """GET /api/v2/storefront/products/<slug>/related/

    Same category, same goals, never the product itself. Deliberately not
    random: `ORDER BY ?` is both slow and non-deterministic, so the page
    changes on every reload and can never be cached.
    """

    serializer_class = StorefrontProductCardSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = None

    def get_queryset(self):
        product = generics.get_object_or_404(published_products(), slug=self.kwargs["slug"])
        goal_ids = list(product.goals.values_list("id", flat=True))

        queryset = (
            with_ratings(published_products())
            .exclude(pk=product.pk)
            .annotate(
                shared_goals=Count("goals", filter=Q(goals__id__in=goal_ids), distinct=True),
                same_brand=ExpressionWrapper(
                    Q(brand_ref_id=product.brand_ref_id) if product.brand_ref_id else Q(pk=None),
                    output_field=BooleanField(),
                ),
            )
            .filter(Q(category_id=product.category_id) | Q(goals__id__in=goal_ids))
            .distinct()
            .order_by("-shared_goals", "-same_brand", "-created_at")[:8]
        )
        self._page_products = list(queryset)
        return self._page_products

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["balances"] = balances_for(
            getattr(self, "_page_products", []), self.stock_location
        )
        return context


class StorefrontFiltersView(APIView):
    """GET /api/v2/storefront/filters/

    The options a collection page can offer, with counts. Served from the data
    rather than hardcoded, so a filter never offers a value that matches
    nothing.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        products = published_products()
        category = request.query_params.get("category")
        if category:
            products = products.filter(category__slug=category)

        product_ids = list(products.values_list("id", flat=True))
        variants = ProductVariant.objects.filter(
            product_id__in=product_ids, is_active=True
        )

        price_range = variants.aggregate(low=Min("price"), high=Max("price"))

        return Response(
            {
                "brands": [
                    {"slug": row["brand_ref__slug"], "name": row["brand_ref__name"], "count": row["n"]}
                    for row in products.filter(brand_ref__isnull=False)
                    .values("brand_ref__slug", "brand_ref__name")
                    .annotate(n=Count("id"))
                    .order_by("-n")
                ],
                "categories": [
                    {"slug": row["category__slug"], "name": row["category__name"], "count": row["n"]}
                    for row in products.values("category__slug", "category__name")
                    .annotate(n=Count("id"))
                    .order_by("-n")
                ],
                "goals": [
                    {"slug": row["goals__slug"], "name": row["goals__name"], "count": row["n"]}
                    for row in products.filter(goals__isnull=False)
                    .values("goals__slug", "goals__name")
                    .annotate(n=Count("id"))
                    .order_by("-n")
                ],
                "supplement_types": [
                    {
                        "value": row["supplement_type"],
                        "label": dict(Product.SUPPLEMENT_TYPES).get(
                            row["supplement_type"], row["supplement_type"]
                        ),
                        "count": row["n"],
                    }
                    for row in products.values("supplement_type")
                    .annotate(n=Count("id"))
                    .order_by("-n")
                ],
                "flavors": sorted(
                    value
                    for value in variants.exclude(flavor="")
                    .values_list("flavor", flat=True)
                    .distinct()
                ),
                "sizes": sorted(
                    value
                    for value in variants.exclude(size_label="")
                    .values_list("size_label", flat=True)
                    .distinct()
                ),
                "price": {
                    "min": money(price_range["low"] or 0),
                    "max": money(price_range["high"] or 0),
                },
            }
        )


class StorefrontSettingsView(APIView):
    """GET /api/v2/storefront/settings/

    Shop-wide policy the storefront displays. Served rather than duplicated in
    the frontend so the page and the checkout cannot disagree about money.

    The shipping threshold is a strict `>` on the server, so an order of
    exactly Rs 5,000 pays delivery. A storefront that hardcoded "free over
    5,000" and rendered it as "5,000 and above" would promise free delivery on
    the boundary and then charge for it — the comparison is published here so
    the copy can be written to match.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from orders.services import FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE

        return Response(
            {
                "currency": "PKR",
                "shipping": {
                    "free_over": str(FREE_SHIPPING_THRESHOLD),
                    "comparison": "greater_than",
                    "standard_fee": str(STANDARD_SHIPPING_FEE),
                },
                "cod_available": True,
            }
        )


class StorefrontBrandListView(generics.ListAPIView):
    serializer_class = StorefrontBrandSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = None
    queryset = Brand.objects.filter(is_active=True).order_by("sort_order", "name")


class StorefrontCategoryListView(generics.ListAPIView):
    serializer_class = StorefrontCategorySerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = None
    queryset = Category.objects.filter(is_active=True).order_by("sort_order", "name")


class StorefrontGoalListView(generics.ListAPIView):
    serializer_class = StorefrontGoalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = None
    queryset = Goal.objects.filter(is_active=True).order_by("sort_order", "name")


class StorefrontSitemapView(APIView):
    """GET /api/v2/storefront/sitemap/

    Everything indexable, with last-modified dates, so the Next.js app can
    generate a sitemap without reimplementing what counts as published.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(
            {
                "products": [
                    {"slug": row["slug"], "updated_at": row["updated_at"]}
                    for row in published_products().values("slug", "updated_at")
                ],
                "categories": [
                    {"slug": row["slug"]}
                    for row in Category.objects.filter(is_active=True).values("slug")
                ],
                "brands": [
                    {"slug": row["slug"]}
                    for row in Brand.objects.filter(is_active=True).values("slug")
                ],
                "goals": [
                    {"slug": row["slug"]}
                    for row in Goal.objects.filter(is_active=True).values("slug")
                ],
            }
        )
