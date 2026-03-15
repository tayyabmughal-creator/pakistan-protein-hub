from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem
from products.models import Category, Product
from users.models import Address

User = get_user_model()


class UserAuthTests(APITestCase):
    def test_user_can_register_and_login(self):
        register_response = self.client.post(
            "/api/users/register/",
            {
                "name": "Test User",
                "email": "user@example.com",
                "password": "StrongPass123",
            },
            format="json",
        )

        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="user@example.com").exists())

        login_response = self.client.post(
            "/api/users/login/",
            {
                "email": "user@example.com",
                "password": "StrongPass123",
            },
            format="json",
        )

        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_response.data)
        self.assertIn("refresh", login_response.data)

    def test_profile_endpoint_returns_current_user(self):
        user = User.objects.create_user(
            username="profile@example.com",
            email="profile@example.com",
            name="Profile User",
            password="StrongPass123",
        )
        self.client.force_authenticate(user=user)

        response = self.client.get("/api/users/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], user.email)


class AdminUserManagementTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            name="Admin User",
            password="StrongPass123",
            is_staff=True,
            is_superuser=True,
        )
        self.customer = User.objects.create_user(
            username="customer@example.com",
            email="customer@example.com",
            name="Customer User",
            password="StrongPass123",
            phone_number="+923001112233",
        )
        Address.objects.create(
            user=self.customer,
            full_name="Customer User",
            phone_number="+923001112233",
            city="Lahore",
            area="Gulberg",
            street="Main Boulevard",
            is_default=True,
        )

        category = Category.objects.create(name="Protein", slug="protein")
        product = Product.objects.create(
            name="Whey Protein",
            slug="whey-protein",
            category=category,
            brand="PakNutrition",
            weight="2kg",
            description="Lean protein",
            price="12000.00",
            discount_price="9999.00",
            stock=10,
        )
        order = Order.objects.create(
            user=self.customer,
            total_amount="9999.00",
            subtotal_amount="12000.00",
            discount_amount="2001.00",
            applied_promo_code="MEGA10",
            shipping_address="Lahore, Gulberg, Main Boulevard",
            payment_method="COD",
            payment_status="PENDING",
            status="PENDING",
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            quantity=2,
            price="4999.50",
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_user_list_returns_customer_summary_fields(self):
        response = self.client.get("/api/admin/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        customer = next(item for item in response.data if item["email"] == self.customer.email)
        self.assertEqual(customer["order_count"], 1)
        self.assertEqual(customer["address_count"], 1)
        self.assertEqual(customer["account_type"], "Customer")
        self.assertEqual(customer["total_spent"], "9999.00")

    def test_admin_user_detail_returns_addresses_and_recent_orders(self):
        response = self.client.get(f"/api/admin/users/{self.customer.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["default_address"]["city"], "Lahore")
        self.assertEqual(len(response.data["addresses"]), 1)
        self.assertEqual(len(response.data["recent_orders"]), 1)
        self.assertEqual(response.data["recent_orders"][0]["items_count"], 2)

    def test_admin_can_toggle_customer_account_status(self):
        response = self.client.patch(
            f"/api/admin/users/{self.customer.id}/",
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)
        self.assertFalse(response.data["is_active"])
