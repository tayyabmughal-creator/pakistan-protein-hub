from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from products.models import Category, Product
from promotions.models import Promotion
from users.models import Address
from .models import Order
from django.utils import timezone
from datetime import timedelta


User = get_user_model()


class OrderApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="orders@example.com",
            email="orders@example.com",
            name="Order User",
            password="StrongPass123",
        )
        self.category = Category.objects.create(name="Mass", slug="mass")
        self.product = Product.objects.create(
            name="Mass Gainer",
            slug="mass-gainer",
            category=self.category,
            brand="MuscleTech",
            weight="5kg",
            description="High calorie mass gainer",
            price="12000.00",
            stock=10,
            is_active=True,
        )
        self.address = Address.objects.create(
            user=self.user,
            full_name="Order User",
            phone_number="123456789",
            city="Karachi",
            area="Clifton",
            street="Street 1",
            is_default=True,
        )
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=2)
        self.client.force_authenticate(user=self.user)
        self.promotion = Promotion.objects.create(
            code="SAVE10",
            description="Ten off",
            discount_percentage=10,
            valid_from=timezone.now() - timedelta(days=1),
            valid_to=timezone.now() + timedelta(days=1),
            active=True,
            usage_limit=10,
            used_count=0,
        )

    def test_create_order_moves_cart_items_into_order_and_deducts_stock(self):
        response = self.client.post(
            "/api/orders/",
            {"address_id": self.address.id, "payment_method": "COD"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(user=self.user)
        self.product.refresh_from_db()
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(str(order.total_amount), "24000.00")
        self.assertEqual(self.product.stock, 8)
        self.assertEqual(self.user.cart.items.count(), 0)

    def test_create_order_applies_promotion_discount(self):
        response = self.client.post(
            "/api/orders/",
            {"address_id": self.address.id, "payment_method": "COD", "promo_code": "SAVE10"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(user=self.user)
        self.assertEqual(str(order.subtotal_amount), "24000.00")
        self.assertEqual(str(order.discount_amount), "2400.00")
        self.assertEqual(str(order.total_amount), "21600.00")
        self.assertEqual(order.applied_promo_code, "SAVE10")
        self.promotion.refresh_from_db()
        self.assertEqual(self.promotion.used_count, 1)

    def test_cancel_pending_order_restores_stock(self):
        order = Order.objects.create(
            user=self.user,
            total_amount="12000.00",
            shipping_address="Order User, 123456789, Street 1, Clifton, Karachi",
            payment_method="COD",
            status="PENDING",
        )
        order.items.create(
            product=self.product,
            product_name=self.product.name,
            quantity=1,
            price="12000.00",
        )
        self.product.stock = 9
        self.product.save(update_fields=["stock"])

        response = self.client.post(f"/api/orders/{order.id}/cancel/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(order.status, "CANCELLED")
        self.assertEqual(self.product.stock, 10)

    def test_guest_can_place_order_without_account(self):
        self.client.force_authenticate(user=None)

        response = self.client.post(
            "/api/orders/",
            {
                "guest_name": "Guest Buyer",
                "guest_email": "guest@example.com",
                "guest_phone_number": "03001234567",
                "city": "Karachi",
                "area": "Clifton",
                "street": "Street 1",
                "payment_method": "COD",
                "items": [{"product_id": self.product.id, "quantity": 2}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(guest_email="guest@example.com")
        self.product.refresh_from_db()
        self.assertIsNone(order.user)
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(self.product.stock, 8)

    def test_guest_promo_preview_returns_discounted_totals(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/orders/promo-preview/",
            {
                "promo_code": "SAVE10",
                "items": [{"product_id": self.product.id, "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["code"], "SAVE10")
        self.assertEqual(str(response.data["discount_amount"]), "2400.00")

    def test_guest_can_lookup_order_by_reference_and_email(self):
        self.client.force_authenticate(user=None)
        order = Order.objects.create(
            user=None,
            guest_name="Guest Buyer",
            guest_email="guest@example.com",
            guest_phone_number="03001234567",
            total_amount="12000.00",
            shipping_address="Guest Buyer, 03001234567, Street 1, Clifton, Karachi",
            payment_method="COD",
        )

        response = self.client.post(
            "/api/orders/guest-lookup/",
            {"order_id": order.id, "email": "guest@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["guest_email"], "guest@example.com")
