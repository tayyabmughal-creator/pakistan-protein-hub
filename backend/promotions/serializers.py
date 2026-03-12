from rest_framework import serializers

from .models import Promotion


class PromotionSerializer(serializers.ModelSerializer):
    is_valid = serializers.SerializerMethodField()

    class Meta:
        model = Promotion
        fields = [
            'id',
            'code',
            'description',
            'discount_percentage',
            'valid_from',
            'valid_to',
            'active',
            'usage_limit',
            'used_count',
            'is_valid',
        ]

    def get_is_valid(self, obj):
        return obj.is_valid()
