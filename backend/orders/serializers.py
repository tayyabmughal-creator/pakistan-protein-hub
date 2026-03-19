from rest_framework import serializers
from products.models import Product
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
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True), source='product')
    quantity = serializers.IntegerField(min_value=1)


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


class PromotionPreviewItemSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True), source='product')
    quantity = serializers.IntegerField(min_value=1)


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
    # Status is writable here
    
    class Meta:
        model = Order
        fields = [
            'id', 'user', 'guest_name', 'guest_email', 'guest_phone_number',
            'customer_name', 'customer_email', 'customer_phone_number', 'customer_type', 'items_count',
            'items', 'subtotal_amount', 'discount_amount', 'shipping_fee', 'applied_promo_code', 'total_amount', 'shipping_address', 'payment_method',
            'payment_provider', 'payment_reference', 'payment_tracker', 'payment_note', 'payment_status', 'paid_at', 'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['user', 'total_amount', 'shipping_address', 'payment_method', 'items', 'created_at', 'shipping_fee']
