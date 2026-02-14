from rest_framework import serializers
from .models import Order, OrderItem

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'quantity', 'price']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status = serializers.CharField(read_only=True)
    payment_status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'user', 'items', 'total_amount', 'shipping_address', 'payment_method', 'payment_status', 'status', 'created_at']
        read_only_fields = ['user', 'total_amount']

class CreateOrderSerializer(serializers.Serializer):
    address_id = serializers.IntegerField(required=True)
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default='COD')

class AdminOrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    # Status is writable here
    
    class Meta:
        model = Order
        fields = ['id', 'user', 'items', 'total_amount', 'shipping_address', 'payment_method', 'payment_status', 'status', 'created_at']
        read_only_fields = ['user', 'total_amount', 'shipping_address', 'payment_method', 'items', 'created_at']
