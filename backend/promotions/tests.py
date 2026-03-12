from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Promotion


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
