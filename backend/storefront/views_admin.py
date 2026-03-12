import csv
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order, OrderItem
from products.models import Product, Category
from reviews.models import Review
from .models import HomePageSettings
from .serializers import HomePageSettingsSerializer

User = get_user_model()


class AdminHomePageSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = HomePageSettingsSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_object(self):
        return HomePageSettings.get_solo()


class AdminDashboardSummaryView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        revenue_source = Order.objects.exclude(status="CANCELLED")

        total_revenue = revenue_source.aggregate(
            total=Coalesce(Sum("total_amount"), Value(Decimal("0.00")), output_field=DecimalField(max_digits=12, decimal_places=2))
        )["total"]
        monthly_revenue = revenue_source.filter(created_at__gte=month_start).aggregate(
            total=Coalesce(Sum("total_amount"), Value(Decimal("0.00")), output_field=DecimalField(max_digits=12, decimal_places=2))
        )["total"]
        avg_order_value = revenue_source.aggregate(
            value=Coalesce(Avg("total_amount"), Value(Decimal("0.00")), output_field=DecimalField(max_digits=12, decimal_places=2))
        )["value"]

        overview = {
            "total_revenue": total_revenue,
            "monthly_revenue": monthly_revenue,
            "total_orders": Order.objects.count(),
            "pending_orders": Order.objects.filter(status="PENDING").count(),
            "total_customers": User.objects.filter(is_staff=False).count(),
            "guest_orders": Order.objects.filter(user__isnull=True).count(),
            "active_products": Product.objects.filter(is_active=True).count(),
            "low_stock_products": Product.objects.filter(stock__lte=5, is_active=True).count(),
            "avg_order_value": avg_order_value,
        }

        start_month = (month_start - timedelta(days=150)).replace(day=1)
        revenue_trend_qs = (
            revenue_source.filter(created_at__gte=start_month)
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(
                total=Coalesce(Sum("total_amount"), Value(Decimal("0.00")), output_field=DecimalField(max_digits=12, decimal_places=2)),
                orders=Count("id"),
            )
            .order_by("month")
        )
        revenue_trend = [
            {
                "month": entry["month"].strftime("%b %Y"),
                "revenue": float(entry["total"]),
                "orders": entry["orders"],
            }
            for entry in revenue_trend_qs
        ]

        customer_growth_qs = (
            User.objects.filter(is_staff=False, date_joined__gte=start_month)
            .annotate(month=TruncMonth("date_joined"))
            .values("month")
            .annotate(customers=Count("id"))
            .order_by("month")
        )
        customer_growth = [
            {
                "month": entry["month"].strftime("%b %Y"),
                "customers": entry["customers"],
            }
            for entry in customer_growth_qs
        ]

        order_status_breakdown = list(
            Order.objects.values("status").annotate(count=Count("id")).order_by("status")
        )

        top_products_qs = (
            OrderItem.objects.exclude(order__status="CANCELLED")
            .values(name=F("product_name"))
            .annotate(
                units_sold=Coalesce(Sum("quantity"), 0),
                revenue=Coalesce(
                    Sum(ExpressionWrapper(F("quantity") * F("price"), output_field=DecimalField(max_digits=12, decimal_places=2))),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by("-units_sold")[:5]
        )
        top_products = [
            {
                "name": entry["name"],
                "units_sold": entry["units_sold"],
                "revenue": float(entry["revenue"]),
            }
            for entry in top_products_qs
        ]

        low_stock_products = list(
            Product.objects.filter(is_active=True, stock__lte=5)
            .values("id", "name", "stock", "brand")
            .order_by("stock", "name")[:8]
        )

        recent_orders = [
            {
                "id": order.id,
                "customer_name": order.user.name if order.user_id else order.guest_name or order.guest_email or "Guest",
                "customer_type": "Registered" if order.user_id else "Guest",
                "total_amount": order.total_amount,
                "status": order.status,
                "created_at": order.created_at,
            }
            for order in Order.objects.select_related("user").order_by("-created_at")[:8]
        ]

        return Response(
            {
                "overview": overview,
                "revenue_trend": revenue_trend,
                "customer_growth": customer_growth,
                "order_status_breakdown": order_status_breakdown,
                "top_products": top_products,
                "low_stock_products": low_stock_products,
                "recent_orders": recent_orders,
            }
        )


class AdminCatalogSummaryView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        categories = Category.objects.annotate(product_count=Count("products")).values(
            "id", "name", "slug", "product_count"
        )
        reviews = Review.objects.values("product__name").annotate(count=Count("id")).order_by("-count")[:5]
        return Response(
            {
                "categories": list(categories),
                "reviews": [
                    {"product_name": item["product__name"] or "Deleted product", "review_count": item["count"]}
                    for item in reviews
                ],
            }
        )


class AdminReportDownloadView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, report_key):
        if report_key == "orders":
            return self._orders_report()
        if report_key == "customers":
            return self._customers_report()
        if report_key == "inventory":
            return self._inventory_report()
        return Response({"detail": "Unknown report."}, status=404)

    def _orders_report(self):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="orders-report.csv"'
        writer = csv.writer(response)
        writer.writerow(["Order ID", "Customer", "Customer Type", "Status", "Payment", "Total", "Created"])
        for order in Order.objects.select_related("user").order_by("-created_at"):
            writer.writerow(
                [
                    order.id,
                    order.user.email if order.user_id else order.guest_email,
                    "Registered" if order.user_id else "Guest",
                    order.status,
                    order.payment_method,
                    order.total_amount,
                    order.created_at.isoformat(),
                ]
            )
        return response

    def _customers_report(self):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="customers-report.csv"'
        writer = csv.writer(response)
        writer.writerow(["Customer ID", "Name", "Email", "Phone", "Joined", "Orders"])
        customers = User.objects.filter(is_staff=False).annotate(order_count=Count("orders")).order_by("-date_joined")
        for customer in customers:
            writer.writerow(
                [
                    customer.id,
                    customer.name,
                    customer.email,
                    customer.phone_number or "",
                    customer.date_joined.isoformat(),
                    customer.order_count,
                ]
            )
        return response

    def _inventory_report(self):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="inventory-report.csv"'
        writer = csv.writer(response)
        writer.writerow(["Product ID", "Name", "Brand", "Category", "Stock", "Price", "Active"])
        products = Product.objects.select_related("category").order_by("name")
        for product in products:
            writer.writerow(
                [
                    product.id,
                    product.name,
                    product.brand,
                    product.category.name,
                    product.stock,
                    product.final_price,
                    "Yes" if product.is_active else "No",
                ]
            )
        return response
