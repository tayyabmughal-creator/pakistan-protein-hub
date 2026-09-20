"""Admin order API shapes.

Two deliberate properties:

**Nothing financial is writable.** No serializer here can set payment_status,
paid_at, an amount or a fulfilment status. Those move through command endpoints
that validate the transition, apply the stock consequence and record who did it.
A writable ModelSerializer over an order is how any staff account could PATCH an
order to PAID, which is what Phase 0 removed.

**The list is lean.** An order list renders hundreds of rows; it does not need
every line item. The detail endpoint carries the full picture.
"""

from decimal import Decimal

from rest_framework import serializers

from .models import Order, OrderHistory, OrderItem, ReturnItem, ReturnRequest


class AdminOrderItemSerializer(serializers.ModelSerializer):
    """The snapshot, as recorded at the time of sale."""

    class Meta:
        model = OrderItem
        fields = [
            "id", "product", "variant",
            "product_name", "sku", "variant_description", "brand_name",
            "quantity", "price", "compare_at_price", "line_discount", "line_total",
        ]
        read_only_fields = fields


class AdminOrderHistorySerializer(serializers.ModelSerializer):
    actor_email = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = OrderHistory
        fields = [
            "id", "kind", "kind_label", "from_status", "to_status",
            "actor", "actor_email", "note", "is_customer_visible", "created_at",
        ]
        read_only_fields = fields

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else "system"


class AdminOrderListSerializer(serializers.ModelSerializer):
    """One row in the orders table. No line items — see the detail endpoint."""

    customer_name = serializers.CharField(source="customer_display_name", read_only=True)
    customer_phone = serializers.CharField(read_only=True)
    items_count = serializers.IntegerField(read_only=True)
    is_settled = serializers.BooleanField(read_only=True)
    payment_label = serializers.CharField(source="get_payment_status_display", read_only=True)
    fulfilment_label = serializers.CharField(
        source="get_fulfilment_status_display", read_only=True
    )

    class Meta:
        model = Order
        fields = [
            "id", "customer_name", "customer_phone",
            "total_amount", "refunded_amount",
            "payment_method", "payment_status", "payment_label",
            "fulfilment_status", "fulfilment_label",
            "sales_channel", "is_settled", "items_count",
            "courier_name", "tracking_number",
            "created_at", "confirmed_at", "shipped_at", "delivered_at",
        ]
        read_only_fields = fields


class AdminOrderDetailSerializer(AdminOrderListSerializer):
    items = AdminOrderItemSerializer(many=True, read_only=True)
    history = AdminOrderHistorySerializer(many=True, read_only=True)
    customer_email = serializers.SerializerMethodField()
    available_transitions = serializers.SerializerMethodField()

    class Meta(AdminOrderListSerializer.Meta):
        fields = AdminOrderListSerializer.Meta.fields + [
            "user", "guest_name", "guest_email", "guest_phone_number", "customer_email",
            "shipping_address", "subtotal_amount", "discount_amount", "shipping_fee",
            "applied_promo_code", "payment_reference", "payment_tracker",
            "staff_note", "inventory_committed", "paid_at", "cancelled_at", "packed_at",
            "items", "history", "available_transitions",
        ]
        read_only_fields = fields

    def get_customer_email(self, obj):
        return obj.user.email if obj.user_id else obj.guest_email

    def get_available_transitions(self, obj):
        """What this order can move to next.

        Served from the same table the transition endpoint validates against, so
        the admin cannot offer a button that the API will then refuse.
        """
        from .services import OrderTransitionService

        allowed = OrderTransitionService.FULFILMENT_TRANSITIONS.get(
            obj.fulfilment_status, set()
        )
        labels = dict(Order.FULFILMENT_STATUS_CHOICES)
        return [{"value": status, "label": labels[status]} for status in sorted(allowed)]


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


class OrderTransitionCommandSerializer(serializers.Serializer):
    """Move an order's fulfilment state."""

    status = serializers.ChoiceField(
        choices=[code for code, _ in Order.FULFILMENT_STATUS_CHOICES]
    )
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
    courier_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    tracking_number = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate(self, attrs):
        # A shipped parcel nobody can trace is a support call waiting to happen.
        if attrs["status"] == Order.FULFILMENT_SHIPPED and not attrs.get("tracking_number"):
            raise serializers.ValidationError(
                {"tracking_number": "A tracking number is required when marking an order shipped."}
            )
        if attrs["status"] == Order.FULFILMENT_CANCELLED and not (attrs.get("reason") or "").strip():
            raise serializers.ValidationError(
                {"reason": "A reason is required when cancelling an order."}
            )
        return attrs


class OrderNoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=2000)


class ReturnItemInputSerializer(serializers.Serializer):
    order_item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class CreateReturnSerializer(serializers.Serializer):
    lines = ReturnItemInputSerializer(many=True)
    reason = serializers.ChoiceField(
        choices=[code for code, _ in ReturnRequest.REASON_CHOICES], default="OTHER"
    )
    customer_note = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Select at least one item to return.")
        return value


class ReturnDecisionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject"])
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["action"] == "reject" and not (attrs.get("reason") or "").strip():
            raise serializers.ValidationError(
                {"reason": "A reason is required when rejecting a return."}
            )
        return attrs


class ReceiveReturnSerializer(serializers.Serializer):
    """Per-line restock decisions.

    Per line because of two tubs sent back, one may be resealable and the other
    leaking. A single decision for the whole return would force the same answer
    for both.
    """

    restock = serializers.DictField(child=serializers.BooleanField())


class RefundSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)


class AdminReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="order_item.product_name", read_only=True)
    sku = serializers.CharField(source="order_item.sku", read_only=True)

    class Meta:
        model = ReturnItem
        fields = [
            "id", "order_item", "product_name", "sku",
            "quantity", "restock", "restocked_at", "condition_note",
        ]
        read_only_fields = fields


class AdminReturnSerializer(serializers.ModelSerializer):
    items = AdminReturnItemSerializer(many=True, read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    customer_name = serializers.CharField(
        source="order.customer_display_name", read_only=True
    )
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = ReturnRequest
        fields = [
            "id", "reference", "order", "customer_name",
            "status", "status_label", "reason", "reason_label",
            "customer_note", "staff_note",
            "refund_amount", "refunded_at",
            "requested_at", "resolved_at", "is_open", "items",
        ]
        read_only_fields = fields
