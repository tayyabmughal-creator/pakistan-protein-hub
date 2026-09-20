"""Admin catalogue API shapes.

The shape staff edit is not the shape customers read. A customer wants one
price and one picture; staff want the whole variant matrix, the content fields
the storefront will render, and an honest account of what is still missing.

That last part is the completeness checklist. A product can be saved
incomplete — half-entered work should not be lost — but it says plainly what
publishing it would mean.
"""

from decimal import Decimal

from rest_framework import serializers

from inventory.models import InventoryBalance, InventoryLocation

from .models import Brand, Category, Goal, Product, ProductMedia, ProductVariant


class AdminBrandSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Brand
        fields = [
            "id", "name", "slug", "logo", "description", "country_of_origin",
            "seo_title", "seo_description", "is_active", "sort_order", "product_count",
        ]
        read_only_fields = ["id", "slug", "product_count"]


class AdminGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = ["id", "name", "slug", "description", "sort_order", "is_active"]
        read_only_fields = ["id", "slug"]


class AdminCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = [
            "id", "name", "slug", "image", "description",
            "seo_title", "seo_description", "sort_order", "is_active", "product_count",
        ]
        read_only_fields = ["id", "product_count"]


class AdminVariantSerializer(serializers.ModelSerializer):
    """One sellable thing. Price lives here; stock does not.

    Stock is read-only in this serializer even though it is displayed. Moving
    stock happens through the inventory operations so that every change carries
    a type, a reason and an actor — a variant form that could set on_hand would
    be a hole straight through that.
    """

    descriptor = serializers.CharField(read_only=True)
    on_hand = serializers.SerializerMethodField()
    reserved = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()
    never_counted = serializers.SerializerMethodField()
    has_genuine_discount = serializers.BooleanField(read_only=True)
    discount_percentage = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id", "product", "sku", "barcode",
            "flavor", "size_label", "net_weight_grams", "serving_count", "serving_size",
            "price", "compare_at_price", "has_genuine_discount", "discount_percentage",
            "is_active", "is_default", "sort_order", "descriptor",
            "on_hand", "reserved", "available", "never_counted",
        ]
        read_only_fields = [
            "id", "descriptor", "on_hand", "reserved", "available", "never_counted",
            "has_genuine_discount", "discount_percentage",
        ]

    def _balance(self, obj):
        location = InventoryLocation.get_default()
        if location is None:
            return None
        # Prefetched by the view; falls back to a query when used standalone.
        for balance in getattr(obj, "_prefetched_objects_cache", {}).get("balances", []):
            if balance.location_id == location.id:
                return balance
        return InventoryBalance.objects.filter(variant=obj, location=location).first()

    def get_on_hand(self, obj):
        balance = self._balance(obj)
        return balance.on_hand if balance else 0

    def get_reserved(self, obj):
        balance = self._balance(obj)
        return balance.reserved if balance else 0

    def get_available(self, obj):
        balance = self._balance(obj)
        return balance.available if balance else 0

    def get_never_counted(self, obj):
        balance = self._balance(obj)
        return balance.last_counted_at is None if balance else True

    def validate(self, attrs):
        price = attrs.get("price", getattr(self.instance, "price", None))
        compare = attrs.get("compare_at_price", getattr(self.instance, "compare_at_price", None))

        # A compare-at price at or below the selling price is a fake discount.
        # Refuse it rather than silently not rendering it, so whoever typed it
        # learns why it is not showing.
        if compare is not None and price is not None and compare <= price:
            raise serializers.ValidationError(
                {
                    "compare_at_price": (
                        f"The 'was' price must be higher than the selling price "
                        f"({price}), or it is not a saving. Leave it empty if there "
                        "is no discount."
                    )
                }
            )
        if price is not None and price < Decimal("0.00"):
            raise serializers.ValidationError({"price": "Price cannot be negative."})
        return attrs


class AdminMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductMedia
        fields = [
            "id", "product", "variant", "image", "alt_text",
            "sort_order", "is_primary", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_alt_text(self, value):
        # Not enforced at the database, because an import should be able to land
        # first and be completed afterwards. Enforced here, where a human is
        # typing, because a missing alt text is an accessibility failure on
        # every page the image appears on.
        if not value.strip():
            raise serializers.ValidationError(
                "Describe the image. Screen readers and image search both need it."
            )
        return value


def completeness(product) -> dict:
    """What is still missing before this is worth publishing.

    Returns each check with whether it passes and why it matters. Blocking
    checks are the ones that would make a live product page wrong or unusable;
    the rest are quality.
    """
    variants = list(product.variants.all())
    media = list(product.media.all())
    active_variants = [variant for variant in variants if variant.is_active]

    checks = [
        {
            "key": "has_variant",
            "label": "At least one sellable variant",
            "passed": bool(active_variants),
            "blocking": True,
            "why": "Without one the product has no SKU and no price, and cannot be bought.",
        },
        {
            "key": "has_image",
            "label": "At least one image",
            "passed": bool(media),
            "blocking": True,
            "why": "Supplements do not sell without a picture of the tub.",
        },
        {
            "key": "alt_text",
            "label": "Every image described",
            "passed": all(item.alt_text.strip() for item in media) if media else False,
            "blocking": False,
            "why": "Needed by screen readers and by image search.",
        },
        {
            "key": "brand",
            "label": "Linked to a brand",
            "passed": product.brand_ref_id is not None,
            "blocking": True,
            "why": "Otherwise it appears under no brand filter and on no brand page.",
        },
        {
            "key": "description",
            "label": "Full description",
            "passed": len(product.description.strip()) >= 50,
            "blocking": True,
            "why": "The product page has nothing to say without it.",
        },
        {
            "key": "short_description",
            "label": "Short description",
            "passed": bool(product.short_description.strip()),
            "blocking": False,
            "why": "Used on cards and in search results.",
        },
        {
            "key": "ingredients",
            "label": "Ingredients",
            "passed": bool(product.ingredients.strip()),
            "blocking": False,
            "why": "Customers with allergies check this before buying.",
        },
        {
            "key": "nutrition",
            "label": "Nutrition facts",
            "passed": bool(product.nutrition_facts),
            "blocking": False,
            "why": "The number most supplement buyers compare on.",
        },
        {
            "key": "usage",
            "label": "How to use it",
            "passed": bool(product.usage_directions.strip()),
            "blocking": False,
            "why": "Reduces support questions and returns.",
        },
        {
            "key": "warnings",
            "label": "Warnings and allergens",
            "passed": bool(product.warnings.strip() or product.allergens.strip()),
            "blocking": False,
            "why": "A safety obligation, not a nice-to-have.",
        },
        {
            "key": "seo",
            "label": "SEO title and description",
            "passed": bool(product.seo_title.strip() and product.seo_description.strip()),
            "blocking": False,
            "why": "Without them, search engines write their own and usually worse.",
        },
        {
            "key": "goals",
            "label": "Tagged with at least one goal",
            "passed": product.goals.exists(),
            "blocking": False,
            "why": "How customers shop: mass gain, cutting, endurance.",
        },
    ]

    blocking_failures = [check for check in checks if check["blocking"] and not check["passed"]]
    passed = sum(1 for check in checks if check["passed"])

    return {
        "checks": checks,
        "score": round(100 * passed / len(checks)),
        "can_publish": not blocking_failures,
        "blocking": [check["label"] for check in blocking_failures],
    }


class AdminProductListSerializer(serializers.ModelSerializer):
    """One row in the catalogue table."""

    brand_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True)
    variant_count = serializers.IntegerField(read_only=True)
    media_count = serializers.IntegerField(read_only=True)
    total_available = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "brand_ref", "brand_name",
            "category", "category_name", "supplement_type",
            "publish_status", "is_active",
            "variant_count", "media_count", "total_available", "primary_image",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_brand_name(self, obj):
        return obj.brand_ref.name if obj.brand_ref_id else obj.brand

    def get_primary_image(self, obj):
        media = obj.primary_image
        return media.image.url if media and media.image else None

    def get_total_available(self, obj):
        location = InventoryLocation.get_default()
        if location is None:
            return 0
        return sum(
            balance.available
            for variant in obj.variants.all()
            for balance in variant.balances.all()
            if balance.location_id == location.id
        )


class AdminProductDetailSerializer(serializers.ModelSerializer):
    variants = AdminVariantSerializer(many=True, read_only=True)
    media = AdminMediaSerializer(many=True, read_only=True)
    completeness = serializers.SerializerMethodField()
    goal_ids = serializers.PrimaryKeyRelatedField(
        queryset=Goal.objects.all(), source="goals", many=True, required=False
    )
    brand_name = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "category", "brand_ref", "brand_name",
            "short_description", "description", "benefits", "ingredients",
            "usage_directions", "warnings", "allergens", "nutrition_facts",
            "supplement_type", "goal_ids",
            "seo_title", "seo_description",
            "publish_status", "is_active",
            "variants", "media", "completeness",
            "created_at", "updated_at",
        ]
        # slug is read-only: it is a live URL, and renaming one silently breaks
        # every inbound link. Changing it is a deliberate act with a redirect,
        # not a side effect of editing a product name.
        read_only_fields = [
            "id", "slug", "variants", "media", "completeness", "brand_name",
            "created_at", "updated_at",
        ]

    def get_brand_name(self, obj):
        return obj.brand_ref.name if obj.brand_ref_id else obj.brand

    def get_completeness(self, obj):
        return completeness(obj)

    def validate_nutrition_facts(self, value):
        """A list of {label, amount, daily_value} rows."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Nutrition facts must be a list of rows.")
        for row in value:
            if not isinstance(row, dict) or "label" not in row:
                raise serializers.ValidationError(
                    'Each row needs at least a "label", e.g. {"label": "Protein", "amount": "24g"}.'
                )
        return value


class PublishSerializer(serializers.Serializer):
    publish = serializers.BooleanField()
