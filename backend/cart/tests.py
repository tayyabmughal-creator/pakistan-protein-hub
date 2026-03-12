from django.contrib.auth import get_user_model
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase

from products.models import Category, Product
from .models import CartItem


User = get_user_model()


class CartApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cart@example.com",
            email="cart@example.com",
            name="Cart User",
            password="StrongPass123",
        )
        self.category = Category.objects.create(name="Creatine", slug="creatine")
        self.product = Product.objects.create(
            name="Micronized Creatine",
            slug="micronized-creatine",
            category=self.category,
            brand="ON",
            weight="300g",
            description="Creatine monohydrate",
            price="4500.00",
            stock=5,
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_add_to_cart_creates_snapshot_price(self):
        response = self.client.post(
            "/api/cart/items/",
            {"product_id": self.product.id, "quantity": 2},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = CartItem.objects.get(cart__user=self.user, product=self.product)
        self.assertEqual(item.price_snapshot, Decimal(str(self.product.final_price)))
        self.assertEqual(item.quantity, 2)

    def test_sync_cart_caps_quantity_at_stock(self):
        response = self.client.post(
            "/api/cart/sync/",
            {"items": [{"product_id": self.product.id, "quantity": 8}]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = CartItem.objects.get(cart__user=self.user, product=self.product)
        self.assertEqual(item.quantity, self.product.stock)
