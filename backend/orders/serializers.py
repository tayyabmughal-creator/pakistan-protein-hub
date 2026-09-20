from rest_framework import serializers
from products.models import Product, ProductVariant
from promotions.models import Promotion
from .models import Order, OrderItem, PaymentSession

class OrderItemSerializer(serializers.ModelSerializer):
    product_image = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'quantity', 'price', 'product_image']

    def get_product_image(self, obj):
        if obj.product and obj.product.image:
            return obj.product.image.url
        return None

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status = serializers.CharField(read_only=True)
    payment_status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone_number = serializers.SerializerMethodField()
    customer_type = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    payment_note = serializers.SerializerMethodField()

    def get_customer_name(self, obj):
        if obj.user_id:
            return obj.user.name or obj.user.email
        return obj.guest_name or "Guest"

    def get_customer_email(self, obj):
        if obj.user_id:
            return obj.user.email
        return obj.guest_email or ""

    def get_customer_phone_number(self, obj):
        if obj.user_id:
            return obj.user.phone_number or ""
        return obj.guest_phone_number or ""

    def get_customer_type(self, obj):
        return "Registered" if obj.user_id else "Guest"

    def get_items_count(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_payment_note(self, obj):
        return (obj.payment_payload or {}).get("note", "")

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'guest_name', 'guest_email', 'guest_phone_number',
            'customer_name', 'customer_email', 'customer_phone_number', 'customer_type', 'items_count',
            'items', 'subtotal_amount', 'discount_amount', 'shipping_fee', 'applied_promo_code', 'total_amount', 'shipping_address', 'payment_method',
            'payment_provider', 'payment_reference', 'payment_tracker', 'payment_note', 'payment_status', 'paid_at', 'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['user', 'total_amount']

class GuestOrderItemInputSerializer(serializers.Serializer):
    """One basket line.

    ``variant_id`` is optional for backward compatibility: the current SPA and
    the Expo admin post ``product_id`` alone and must keep working. Omitting it
    means "the default variant", which is what the pipeline already did
    implicitly — now it is a stated rule rather than an accident.

    Supplying it is how a storefront that offers a size or flavour choice says
    which one the customer picked. Without it, choosing the 5lb tub and being
    charged for the 2lb one is unavoidable, because the request cannot express
    the difference.
    """

    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True), source='product')
    variant_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariant.objects.filter(is_active=True),
        source='variant',
        required=False,
        allow_null=True,
    )
    quantity = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        variant = attrs.get('variant')
        product = attrs.get('product')
        # A variant belonging to a different product would let a crafted
        # request buy a cheap variant under an expensive product's name, or
        # bill an expensive variant while shipping against a cheap one.
        if variant is not None and product is not None and variant.product_id != product.id:
            raise serializers.ValidationError(
                {'variant_id': 'That option does not belong to this product.'}
            )
        return attrs


class CreateOrderSerializer(serializers.Serializer):
    address_id = serializers.IntegerField(required=False)
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default='COD')
    promo_code = serializers.CharField(required=False, allow_blank=True)
    payment_reference = serializers.CharField(required=False, allow_blank=True)
    payment_note = serializers.CharField(required=False, allow_blank=True)
    guest_name = serializers.CharField(required=False, allow_blank=False)
    guest_email = serializers.EmailField(required=False)
    guest_phone_number = serializers.CharField(required=False, allow_blank=False)
    city = serializers.CharField(required=False, allow_blank=False)
    area = serializers.CharField(required=False, allow_blank=False)
    street = serializers.CharField(required=False, allow_blank=False)
    items = GuestOrderItemInputSerializer(many=True, required=False)

    def validate(self, attrs):
        from .services import PaymentMethodService

        request = self.context.get('request')
        is_authenticated = bool(request and request.user and request.user.is_authenticated)
        available_method_codes = {method["code"] for method in PaymentMethodService.get_available_methods()}
        if attrs["payment_method"] not in available_method_codes:
            raise serializers.ValidationError({"payment_method": "This payment method is not currently available."})

        if PaymentMethodService.is_manual_method(attrs["payment_method"]) and not attrs.get("payment_reference", "").strip():
            raise serializers.ValidationError({"payment_reference": "Transaction reference is required for this payment method."})

        if is_authenticated:
            if not attrs.get('address_id'):
                raise serializers.ValidationError({'address_id': 'Address ID is required.'})
            return attrs

        required_fields = ['guest_name', 'guest_email', 'guest_phone_number', 'city', 'area', 'street', 'items']
        missing = [field for field in required_fields if not attrs.get(field)]
        if missing:
            raise serializers.ValidationError({field: 'This field is required for guest checkout.' for field in missing})
        return attrs


class GuestOrderLookupSerializer(serializers.Serializer):
    order_id = serializers.IntegerField(required=True)
    email = serializers.EmailField(required=False)
    phone_number = serializers.CharField(required=False, allow_blank=False)

    def validate(self, attrs):
        if not attrs.get('email') and not attrs.get('phone_number'):
            raise serializers.ValidationError("Provide either email or phone number.")
        return attrs


class PromotionPreviewItemSerializer(GuestOrderItemInputSerializer):
    """The same line shape as a real order.

    Deliberately inherits rather than redeclaring: a preview that could not
    carry the variant would quote the default variant's price and then charge
    the chosen one at checkout. The customer seeing one total and being billed
    another is the single thing a quote must never do, and the only reliable
    way to prevent it is for the quote and the order to parse the basket
    identically.
    """


class CheckoutQuoteSerializer(serializers.Serializer):
    """What will this basket cost me?

    The promo-preview serializer below demands a non-blank code, so it cannot
    answer that question for the common case of a customer with no coupon. A
    checkout page has to show shipping and the total before the customer
    commits, so this accepts a basket with an optional code.
    """

    promo_code = serializers.CharField(required=False, allow_blank=True, default="")
    items = PromotionPreviewItemSerializer(many=True, required=False)


class PromotionPreviewSerializer(serializers.Serializer):
    promo_code = serializers.CharField(required=True, allow_blank=False)
    items = PromotionPreviewItemSerializer(many=True, required=False)

    def validate_promo_code(self, value):
        code = value.strip().upper()
        if not Promotion.objects.filter(code=code).exists():
            raise serializers.ValidationError("Promotion code not found.")
        return code


class PaymentMethodSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    provider = serializers.CharField(allow_blank=True)
    is_online = serializers.BooleanField()
    requires_reference = serializers.BooleanField()
    reference_label = serializers.CharField(allow_blank=True)
    details = serializers.ListField(child=serializers.CharField())


class PaymentSessionSerializer(serializers.ModelSerializer):
    order = OrderSerializer(read_only=True)
    public_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PaymentSession
        fields = [
            'public_id',
            'payment_method',
            'provider',
            'status',
            'checkout_url',
            'gateway_reference',
            'subtotal_amount',
            'discount_amount',
            'shipping_fee',
            'total_amount',
            'applied_promo_code',
            'order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class AdminPaymentSessionSerializer(serializers.ModelSerializer):
    order = OrderSerializer(read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone_number = serializers.SerializerMethodField()
    customer_type = serializers.SerializerMethodField()

    def get_customer_name(self, obj):
        if obj.user_id:
            return obj.user.name or obj.user.email
        return obj.guest_name or "Guest"

    def get_customer_email(self, obj):
        if obj.user_id:
            return obj.user.email
        return obj.guest_email or ""

    def get_customer_phone_number(self, obj):
        if obj.user_id:
            return obj.user.phone_number or ""
        return obj.guest_phone_number or ""

    def get_customer_type(self, obj):
        return "Registered" if obj.user_id else "Guest"

    class Meta:
        model = PaymentSession
        fields = [
            'public_id',
            'payment_method',
            'provider',
            'status',
            'checkout_url',
            'gateway_tracker',
            'gateway_reference',
            'subtotal_amount',
            'discount_amount',
            'shipping_fee',
            'total_amount',
            'applied_promo_code',
            'shipping_address',
            'items_snapshot',
            'customer_name',
            'customer_email',
            'customer_phone_number',
            'customer_type',
            'order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class AdminPaymentSessionActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "fail"])
    # Approving a payment by hand overrides what the provider told us. It has to
    # say why, and the reason is written to the session and the log.
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        if attrs.get("action") == "approve" and not (attrs.get("reason") or "").strip():
            raise serializers.ValidationError(
                {"reason": "A reason is required when approving a payment manually."}
            )
        return attrs


class AdminOrderTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[code for code, _ in Order.ORDER_STATUS_CHOICES])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)

class AdminOrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone_number = serializers.SerializerMethodField()
    customer_type = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    payment_note = serializers.SerializerMethodField()

    def get_customer_name(self, obj):
        if obj.user_id:
            return obj.user.name or obj.user.email
        return obj.guest_name or "Guest"

    def get_customer_email(self, obj):
        if obj.user_id:
            return obj.user.email
        return obj.guest_email or ""

    def get_customer_phone_number(self, obj):
        if obj.user_id:
            return obj.user.phone_number or ""
        return obj.guest_phone_number or ""

    def get_customer_type(self, obj):
        return "Registered" if obj.user_id else "Guest"

    def get_items_count(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_payment_note(self, obj):
        return (obj.payment_payload or {}).get("note", "")

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'guest_name', 'guest_email', 'guest_phone_number',
            'customer_name', 'customer_email', 'customer_phone_number', 'customer_type', 'items_count',
            'items', 'subtotal_amount', 'discount_amount', 'shipping_fee', 'applied_promo_code', 'total_amount', 'shipping_address', 'payment_method',
            'payment_provider', 'payment_reference', 'payment_tracker', 'payment_note', 'payment_status', 'paid_at', 'status', 'created_at', 'updated_at'
        ]
        # Everything financial is read-only. payment_status, paid_at, the
        # amounts, the promo code and the provider references used to be
        # assignable through this serializer, which let any staff account mark
        # an order paid by PATCH — with no invariant, no stock consequence and
        # no record of who did it. `status` is read-only too: order movement
        # goes through AdminOrderTransitionView, which validates the transition
        # and restocks on cancellation.
        read_only_fields = [
            'id', 'user', 'items', 'items_count', 'created_at', 'updated_at',
            'guest_name', 'guest_email', 'guest_phone_number',
            'subtotal_amount', 'discount_amount', 'shipping_fee', 'total_amount',
            'applied_promo_code', 'shipping_address', 'payment_method',
            'payment_provider', 'payment_reference', 'payment_tracker',
            'payment_status', 'paid_at', 'status',
        ]
