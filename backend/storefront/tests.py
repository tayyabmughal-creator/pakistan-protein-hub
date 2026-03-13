from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem
from products.models import Category, Product
from promotions.models import Promotion
from .models import HomePageSettings


User = get_user_model()


class StorefrontAdminApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="StrongPass123",
            name="Admin",
            is_staff=True,
        )
        self.customer = User.objects.create_user(
            username="customer@example.com",
            email="customer@example.com",
            password="StrongPass123",
            name="Customer",
        )
        category = Category.objects.create(name="Protein", slug="protein")
        self.product = Product.objects.create(
            name="Premium Whey",
            slug="premium-whey",
            category=category,
            brand="ON",
            weight="2 lbs",
            description="Protein",
            price="10000.00",
            stock=4,
            is_active=True,
        )
        order = Order.objects.create(
            user=self.customer,
            total_amount="10000.00",
            shipping_address="Customer, Street, City",
            payment_method="COD",
            status="PENDING",
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            quantity=1,
            price="10000.00",
        )
        self.promotion = Promotion.objects.create(
            code="POWER50",
            description="Featured homepage sale",
            discount_percentage=50,
            valid_from="2026-01-01T00:00:00Z",
            valid_to="2026-12-31T00:00:00Z",
            active=True,
            usage_limit=100,
            used_count=0,
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_dashboard_endpoint_returns_expected_sections(self):
        response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("overview", response.data)
        self.assertIn("revenue_trend", response.data)
        self.assertIn("recent_orders", response.data)

    def test_admin_homepage_settings_can_be_updated(self):
        response = self.client.put(
            "/api/admin/homepage-settings/",
            {
                "hero_badge": "Trusted supplements",
                "hero_title_line_one": "BUILD",
                "hero_title_line_two": "STRENGTH",
                "hero_description": "Updated",
                "hero_stat_one_label": "Customers",
                "hero_stat_one_value": "5K+",
                "hero_stat_two_label": "Orders",
                "hero_stat_two_value": "1K+",
                "hero_stat_three_label": "Cities",
                "hero_stat_three_value": "20+",
                "deal_badge": "Flash deal",
                "deal_title": "WHEY SALE",
                "deal_subtitle": "Discounts live",
                "deal_code": "WHEY10",
                "deal_enabled": True,
                "deal_target_date": "2026-12-31T00:00:00Z",
                "featured_promotion_id": self.promotion.id,
                "support_email": "support@example.com",
                "support_phone": "03000000000",
                "announcement_text": "Now live",
                "facebook_url": "https://facebook.com/paknutrition",
                "instagram_url": "https://instagram.com/paknutrition",
                "tiktok_url": "https://tiktok.com/@paknutrition",
                "youtube_url": "https://youtube.com/@paknutrition",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(HomePageSettings.get_solo().hero_badge, "Trusted supplements")
        self.assertEqual(HomePageSettings.get_solo().instagram_url, "https://instagram.com/paknutrition")
        self.assertTrue(HomePageSettings.get_solo().deal_enabled)
        self.assertEqual(HomePageSettings.get_solo().featured_promotion_id, self.promotion.id)

    def test_public_homepage_settings_endpoint_is_available(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/storefront/homepage-settings/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("hero_badge", response.data)
        self.assertIn("facebook_url", response.data)
        self.assertIn("deal_is_live", response.data)
        self.assertIn("effective_deal_code", response.data)

    def test_admin_orders_report_downloads_csv(self):
        response = self.client.get("/api/admin/reports/orders/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")
