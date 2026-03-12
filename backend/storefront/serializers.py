from decimal import Decimal

from rest_framework import serializers

from orders.models import Order
from .models import HomePageSettings


class HomePageSettingsSerializer(serializers.ModelSerializer):
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
            "deal_target_date",
            "support_email",
            "support_phone",
            "announcement_text",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]


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
