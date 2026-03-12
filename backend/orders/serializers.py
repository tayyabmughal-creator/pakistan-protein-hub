from rest_framework import serializers
from products.models import Product
from .models import Order, OrderItem

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

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'guest_name', 'guest_email', 'guest_phone_number',
            'items', 'total_amount', 'shipping_address', 'payment_method',
            'payment_status', 'status', 'created_at'
        ]
        read_only_fields = ['user', 'total_amount']

class GuestOrderItemInputSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True), source='product')
    quantity = serializers.IntegerField(min_value=1)


class CreateOrderSerializer(serializers.Serializer):
    address_id = serializers.IntegerField(required=False)
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default='COD')
    guest_name = serializers.CharField(required=False, allow_blank=False)
    guest_email = serializers.EmailField(required=False)
    guest_phone_number = serializers.CharField(required=False, allow_blank=False)
    city = serializers.CharField(required=False, allow_blank=False)
    area = serializers.CharField(required=False, allow_blank=False)
    street = serializers.CharField(required=False, allow_blank=False)
    items = GuestOrderItemInputSerializer(many=True, required=False)

    def validate(self, attrs):
        request = self.context.get('request')
        is_authenticated = bool(request and request.user and request.user.is_authenticated)

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

class AdminOrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    # Status is writable here
    
    class Meta:
        model = Order
        fields = [
            'id', 'user', 'guest_name', 'guest_email', 'guest_phone_number',
            'items', 'total_amount', 'shipping_address', 'payment_method',
            'payment_status', 'status', 'created_at'
        ]
        read_only_fields = ['user', 'total_amount', 'shipping_address', 'payment_method', 'items', 'created_at']
