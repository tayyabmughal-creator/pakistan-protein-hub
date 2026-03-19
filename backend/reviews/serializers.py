from rest_framework import serializers
from .models import Review
from orders.models import OrderItem

class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'user', 'user_name', 'product', 'rating', 'comment', 'created_at']
        read_only_fields = ['user', 'created_at']

    def get_user_name(self, obj):
        full_name = getattr(obj.user, "name", "") or ""
        if full_name.strip():
            return full_name.strip()
        return "Verified Buyer"

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return attrs

        actor = request.user
        product = attrs.get('product') or getattr(self.instance, "product", None)
        if not product:
            return attrs

        review_owner = self.instance.user if self.instance and actor.is_staff and self.instance.user != actor else actor
        
        # Check verified purchase
        # Strict implementation per requirement: "Only verified purchasers can review"
        # We check if there is at least one OrderItem for this product in a DELIVERED order for this user.
        # Note: OrderItem.product is nullable if deleted, but we only create reviews for existing products.
        has_purchased = OrderItem.objects.filter(
            order__user=review_owner,
            order__status='DELIVERED', 
            product=product
        ).exists()

        if not has_purchased:
            raise serializers.ValidationError("You can only review products you have purchased and received.")
        
        # Check if already reviewed (handled by unique_together but good to have explicit error)
        existing_review = Review.objects.filter(user=review_owner, product=product)
        if self.instance:
            existing_review = existing_review.exclude(pk=self.instance.pk)
        if existing_review.exists():
            raise serializers.ValidationError("You have already reviewed this product.")

        return attrs

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
