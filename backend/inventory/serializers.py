"""Inventory API shapes.

Balances are read-only over HTTP. Stock changes only through the operation
endpoints — receive, adjust, count — because each of those records *why* it
happened. A PATCH that sets ``on_hand = 40`` is exactly the hole in the audit
trail the ledger exists to close.
"""

from rest_framework import serializers

from .models import InventoryBalance, InventoryLocation, StockMovement, StockReservation


class InventoryLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryLocation
        fields = [
            "id", "code", "name", "city", "address",
            "is_fulfilment", "is_pickup_point", "is_default", "is_active",
        ]


class InventoryBalanceSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="variant.sku", read_only=True)
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    variant_description = serializers.CharField(source="variant.descriptor", read_only=True)
    brand = serializers.SerializerMethodField()
    location_code = serializers.CharField(source="location.code", read_only=True)

    available = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)

    #: Surfaced deliberately. Every balance migrated from the legacy stock
    #: column has never been counted, and the admin should say so rather than
    #: present a migrated guess as an observation.
    never_counted = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBalance
        fields = [
            "id", "variant", "sku", "product_name", "variant_description", "brand",
            "location", "location_code",
            "on_hand", "reserved", "available",
            "low_stock_threshold", "is_low_stock", "is_out_of_stock",
            "last_counted_at", "never_counted", "updated_at",
        ]
        read_only_fields = fields

    def get_brand(self, obj):
        product = obj.variant.product
        return product.brand_ref.name if product.brand_ref_id else product.brand

    def get_never_counted(self, obj):
        return obj.last_counted_at is None


class StockMovementSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="variant.sku", read_only=True)
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    actor_email = serializers.SerializerMethodField()
    movement_label = serializers.CharField(source="get_movement_type_display", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id", "variant", "sku", "product_name",
            "quantity", "movement_type", "movement_label",
            "reference", "order", "actor", "actor_email", "reason",
            "balance_after", "created_at",
        ]
        read_only_fields = fields

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else "system"


class StockReservationSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(source="variant.sku", read_only=True)

    class Meta:
        model = StockReservation
        fields = [
            "id", "variant", "sku", "quantity", "reference",
            "order", "status", "expires_at", "resolved_at", "created_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Operations — the only way stock changes
# ---------------------------------------------------------------------------


class ReceiveStockSerializer(serializers.Serializer):
    """Stock arrived from a supplier."""

    variant = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(
        max_length=255, required=False, allow_blank=True,
        help_text="Supplier and delivery note, e.g. 'Delivery 4471 from ON Pakistan'.",
    )
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)


class AdjustStockSerializer(serializers.Serializer):
    """Damage, write-off or a correction."""

    variant = serializers.IntegerField()
    delta = serializers.IntegerField()
    movement_type = serializers.ChoiceField(
        choices=[
            StockMovement.DAMAGE,
            StockMovement.MANUAL_ADJUSTMENT,
            StockMovement.RETURN,
        ]
    )
    # Required, not optional. "Why is on_hand different from yesterday" must
    # always have an answer, and an adjustment without one is indistinguishable
    # from theft or a bug.
    reason = serializers.CharField(max_length=255)

    def validate_delta(self, value):
        if value == 0:
            raise serializers.ValidationError("An adjustment must change the quantity.")
        return value

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("A reason is required for a stock adjustment.")
        return value


class StocktakeSerializer(serializers.Serializer):
    """A physical count. The difference is posted as a movement."""

    variant = serializers.IntegerField()
    counted = serializers.IntegerField(min_value=0)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
