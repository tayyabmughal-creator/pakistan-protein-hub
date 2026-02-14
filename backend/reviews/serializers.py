from rest_framework import serializers
from .models import Review
from orders.models import Order, OrderItem

class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ['id', 'user', 'product', 'rating', 'comment', 'created_at']
        read_only_fields = ['user', 'created_at']

    def validate(self, attrs):
        request = self.context.get('request')
        if not request:
             return attrs 
        
        user = request.user
        product = attrs['product']
        
        # Check verified purchase
        # Strict implementation per requirement: "Only verified purchasers can review"
        # We check if there is at least one OrderItem for this product in a DELIVERED order for this user.
        # Note: OrderItem.product is nullable if deleted, but we only create reviews for existing products.
        has_purchased = OrderItem.objects.filter(
            order__user=user, 
            order__status='DELIVERED', 
            product=product
        ).exists()

        if not has_purchased:
            raise serializers.ValidationError("You can only review products you have purchased and received.")
        
        # Check if already reviewed (handled by unique_together but good to have explicit error)
        if Review.objects.filter(user=user, product=product).exists():
             raise serializers.ValidationError("You have already reviewed this product.")

        return attrs

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
