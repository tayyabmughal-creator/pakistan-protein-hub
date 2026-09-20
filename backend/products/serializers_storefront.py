"""What a customer's browser receives.

Separate from both the legacy `ProductSerializer` (single price, single stock,
no variants — what the current Vite SPA reads) and the admin serializers (the
whole editable surface). A storefront payload should carry what a product page
renders and nothing else: no cost prices, no internal notes, no draft content.

Three properties this has to get right, because the storefront is where they
become visible to customers:

**One canonical price and availability.** The same numbers the product page
shows, the structured data declares, and the cart charges. If they can differ,
a customer will eventually see one price and be charged another.

**Honest discounts.** A compare-at price only appears when it is genuinely
higher. There is no "was" price invented for display.

**Honest availability.** Per variant, from the ledger, counting reserved units
as unavailable — because they are.
"""

from decimal import Decimal

from rest_framework import serializers

from inventory.models import InventoryBalance, InventoryLocation

from .models import Brand, Category, Goal, Product, ProductMedia, ProductVariant


def money(value):
    """Always two decimal places, or None.

    Aggregates come back from the database with whatever scale the expression
    produced — `Min("price")` yields `9000` on SQLite and `9000.00` on
    PostgreSQL. Emitting both shapes makes the frontend guess, so every money
    field in this API is normalised here instead.
    """
    if value is None:
        return None
    return f"{Decimal(value):.2f}"


def _available_for(variant, balances_by_variant):
    balance = balances_by_variant.get(variant.id)
    return max(balance, 0) if balance is not None else 0


class StorefrontBrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "logo", "description", "country_of_origin"]


class StorefrontCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "image", "description"]


class StorefrontGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = ["id", "name", "slug", "description"]


class StorefrontMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductMedia
        fields = ["id", "image", "alt_text", "sort_order", "is_primary", "variant"]


class StorefrontVariantSerializer(serializers.ModelSerializer):
    """The sellable thing. Everything the buy box needs for one option."""

    descriptor = serializers.CharField(read_only=True)
    available = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    savings = serializers.SerializerMethodField()
    discount_percentage = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id", "sku", "flavor", "size_label", "descriptor",
            "serving_count", "serving_size", "net_weight_grams",
            "price", "compare_at_price", "savings", "discount_percentage",
            "available", "in_stock",
        ]

    def _balances(self):
        return self.context.get("balances", {})

    def get_available(self, obj):
        return _available_for(obj, self._balances())

    def get_in_stock(self, obj):
        return _available_for(obj, self._balances()) > 0

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Never show a "was" price that is not a saving. The admin refuses to
        # store one, but a legacy row could still carry it, and a fake discount
        # reaching a customer is worse than no discount.
        if not instance.has_genuine_discount:
            data["compare_at_price"] = None
            data["savings"] = None
            data["discount_percentage"] = 0
        return data

    def get_savings(self, obj):
        return money(obj.savings) if obj.has_genuine_discount else None


class StorefrontProductCardSerializer(serializers.ModelSerializer):
    """One product in a grid. Deliberately small — a listing renders dozens."""

    brand = serializers.SerializerMethodField()
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    image = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    compare_at_price = serializers.SerializerMethodField()
    discount_percentage = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "short_description",
            "brand", "category_slug", "supplement_type",
            "image", "price", "compare_at_price", "discount_percentage",
            "in_stock", "variant_count", "rating",
        ]

    def _sellable(self, obj):
        return [variant for variant in obj.variants.all() if variant.is_active]

    def _cheapest(self, obj):
        sellable = self._sellable(obj)
        return min(sellable, key=lambda variant: variant.price) if sellable else None

    def get_brand(self, obj):
        if obj.brand_ref_id:
            return {"name": obj.brand_ref.name, "slug": obj.brand_ref.slug}
        return {"name": obj.brand, "slug": ""} if obj.brand else None

    def get_image(self, obj):
        media = obj.primary_image
        if media and media.image:
            return {"url": media.image.url, "alt": media.alt_text or obj.name}
        return None

    def get_price(self, obj):
        variant = self._cheapest(obj)
        return money(variant.price) if variant else None

    def get_compare_at_price(self, obj):
        variant = self._cheapest(obj)
        return (
            money(variant.compare_at_price)
            if variant and variant.has_genuine_discount
            else None
        )

    def get_discount_percentage(self, obj):
        variant = self._cheapest(obj)
        return variant.discount_percentage if variant else 0

    def get_in_stock(self, obj):
        balances = self.context.get("balances", {})
        return any(_available_for(v, balances) > 0 for v in self._sellable(obj))

    def get_variant_count(self, obj):
        return len(self._sellable(obj))

    def get_rating(self, obj):
        """Only when there is genuine review data.

        Returning a zero or a default here would put an empty star rating on
        every card, which reads as "rated badly" rather than "not yet rated" —
        and an invented aggregate rating in structured data is a Google penalty.
        """
        reviews = getattr(obj, "review_count", None)
        average = getattr(obj, "review_average", None)
        if not reviews or average is None:
            return None
        return {"average": round(float(average), 1), "count": reviews}


class StorefrontProductDetailSerializer(StorefrontProductCardSerializer):
    """Everything a product page renders."""

    brand = StorefrontBrandSerializer(source="brand_ref", read_only=True)
    category = StorefrontCategorySerializer(read_only=True)
    goals = StorefrontGoalSerializer(many=True, read_only=True)
    variants = serializers.SerializerMethodField()
    media = StorefrontMediaSerializer(many=True, read_only=True)
    benefit_list = serializers.SerializerMethodField()

    class Meta(StorefrontProductCardSerializer.Meta):
        fields = [
            "id", "name", "slug", "short_description", "description",
            "brand", "category", "goals", "supplement_type",
            "benefits", "benefit_list", "ingredients", "usage_directions",
            "warnings", "allergens", "nutrition_facts",
            "seo_title", "seo_description",
            "variants", "media", "image",
            "price", "compare_at_price", "discount_percentage", "in_stock",
            "variant_count", "rating",
        ]

    def get_variants(self, obj):
        active = [variant for variant in obj.variants.all() if variant.is_active]
        return StorefrontVariantSerializer(active, many=True, context=self.context).data

    def get_benefit_list(self, obj):
        """Benefits are entered one per line; the page renders them as a list."""
        return [line.strip() for line in obj.benefits.splitlines() if line.strip()]


def balances_for(products, location=None):
    """``{variant_id: available}`` for these products, in one query.

    Passed through serializer context so a listing of 24 products does not make
    24 stock queries — the N+1 that would make every category page slow.
    """
    location = location or InventoryLocation.get_default()
    if location is None:
        return {}

    variant_ids = [variant.id for product in products for variant in product.variants.all()]
    if not variant_ids:
        return {}

    rows = InventoryBalance.objects.filter(
        variant_id__in=variant_ids, location=location
    ).values("variant_id", "on_hand", "reserved")
    return {row["variant_id"]: row["on_hand"] - row["reserved"] for row in rows}
