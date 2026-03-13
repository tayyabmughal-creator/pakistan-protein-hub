from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Promotion

User = get_user_model()


class PromotionApiTests(APITestCase):
    def test_promotions_endpoint_only_returns_active_valid_promotions(self):
        now = timezone.now()
        Promotion.objects.create(
            code="SAVE10",
            description="Ten percent off",
            discount_percentage=10,
            valid_from=now - timedelta(days=1),
            valid_to=now + timedelta(days=1),
            active=True,
            usage_limit=50,
            used_count=3,
        )
        Promotion.objects.create(
            code="EXPIRED",
            description="Expired code",
            discount_percentage=15,
            valid_from=now - timedelta(days=3),
            valid_to=now - timedelta(days=1),
            active=True,
            usage_limit=50,
            used_count=1,
        )

        response = self.client.get("/api/promotions/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["code"], "SAVE10")
        self.assertTrue(response.data[0]["is_valid"])


class AdminPromotionApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="StrongPass123",
            name="Admin",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)
        self.promotion = Promotion.objects.create(
            code="RAMADAN20",
            description="Seasonal campaign",
            discount_percentage=20,
            valid_from=timezone.now(),
            valid_to=timezone.now() + timedelta(days=10),
            active=True,
            usage_limit=100,
            used_count=0,
        )

    def test_admin_can_list_promotions(self):
        response = self.client.get("/api/admin/promotions/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["code"], "RAMADAN20")

    def test_admin_can_create_promotion(self):
        response = self.client.post(
            "/api/admin/promotions/",
            {
                "code": "WHEY15",
                "description": "Protein campaign",
                "discount_percentage": 15,
                "valid_from": timezone.now().isoformat(),
                "valid_to": (timezone.now() + timedelta(days=5)).isoformat(),
                "active": True,
                "usage_limit": 50,
                "used_count": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Promotion.objects.filter(code="WHEY15").exists())

    def test_admin_can_update_promotion(self):
        response = self.client.patch(
            f"/api/admin/promotions/{self.promotion.id}/",
            {
                "description": "Updated campaign",
                "active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.promotion.refresh_from_db()
        self.assertEqual(self.promotion.description, "Updated campaign")
        self.assertFalse(self.promotion.active)
