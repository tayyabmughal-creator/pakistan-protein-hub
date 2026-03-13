from decimal import Decimal
from django.utils import timezone

from rest_framework import serializers

from orders.models import Order
from promotions.models import Promotion
from .models import HomePageSettings


class HomePageSettingsSerializer(serializers.ModelSerializer):
    featured_promotion_id = serializers.PrimaryKeyRelatedField(
        queryset=Promotion.objects.all(),
        source="featured_promotion",
        required=False,
        allow_null=True,
    )
    featured_promotion = serializers.SerializerMethodField()
    effective_deal_code = serializers.SerializerMethodField()
    effective_deal_target_date = serializers.SerializerMethodField()
    deal_is_live = serializers.SerializerMethodField()
    deal_is_expired = serializers.SerializerMethodField()

    class Meta:
        model = HomePageSettings
        fields = [
            "hero_badge",
            "hero_title_line_one",
            "hero_title_line_two",
            "hero_description",
            "hero_stat_one_label",
            "hero_stat_one_value",
            "hero_stat_two_label",
            "hero_stat_two_value",
            "hero_stat_three_label",
            "hero_stat_three_value",
            "deal_badge",
            "deal_title",
            "deal_subtitle",
            "deal_code",
            "deal_enabled",
            "deal_target_date",
            "featured_promotion_id",
            "featured_promotion",
            "effective_deal_code",
            "effective_deal_target_date",
            "deal_is_live",
            "deal_is_expired",
            "support_email",
            "support_phone",
            "announcement_text",
            "facebook_url",
            "instagram_url",
            "tiktok_url",
            "youtube_url",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate(self, attrs):
        deal_enabled = attrs.get("deal_enabled", getattr(self.instance, "deal_enabled", False))
        featured_promotion = attrs.get("featured_promotion", getattr(self.instance, "featured_promotion", None))

        if deal_enabled and not featured_promotion:
            raise serializers.ValidationError({
                "featured_promotion_id": "Select a featured promotion when the homepage sale banner is enabled."
            })

        return attrs

    def get_deal_is_live(self, obj):
        target_date = obj.featured_promotion.valid_to if obj.featured_promotion_id else obj.deal_target_date
        return obj.deal_enabled and target_date > timezone.now()

    def get_deal_is_expired(self, obj):
        target_date = obj.featured_promotion.valid_to if obj.featured_promotion_id else obj.deal_target_date
        return obj.deal_enabled and target_date <= timezone.now()

    def get_effective_deal_code(self, obj):
        return obj.featured_promotion.code if obj.featured_promotion_id else obj.deal_code

    def get_effective_deal_target_date(self, obj):
        return obj.featured_promotion.valid_to if obj.featured_promotion_id else obj.deal_target_date

    def get_featured_promotion(self, obj):
        if not obj.featured_promotion_id:
            return None
        promotion = obj.featured_promotion
        return {
            "id": promotion.id,
            "code": promotion.code,
            "discount_percentage": promotion.discount_percentage,
            "valid_from": promotion.valid_from,
            "valid_to": promotion.valid_to,
            "active": promotion.active,
            "is_valid": promotion.is_valid(),
        }


class DashboardSummarySerializer(serializers.Serializer):
    overview = serializers.DictField()
    revenue_trend = serializers.ListField()
    customer_growth = serializers.ListField()
    order_status_breakdown = serializers.ListField()
    top_products = serializers.ListField()
    low_stock_products = serializers.ListField()
    recent_orders = serializers.ListField()


class AdminRecentOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    customer_name = serializers.CharField()
    customer_type = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class AdminOverviewSerializer(serializers.Serializer):
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    monthly_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_orders = serializers.IntegerField()
    pending_orders = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    guest_orders = serializers.IntegerField()
    active_products = serializers.IntegerField()
    low_stock_products = serializers.IntegerField()
    avg_order_value = serializers.DecimalField(max_digits=12, decimal_places=2)


def decimal_or_zero(value):
    return value if value is not None else Decimal("0.00")
