from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, Product


class ProductApiTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Whey", slug="whey")
        self.product = Product.objects.create(
            name="Gold Whey",
            slug="gold-whey",
            category=self.category,
            brand="Optimum",
            weight="2lb",
            description="Premium whey protein",
            price="8500.00",
            discount_price="7999.00",
            stock=12,
            is_active=True,
        )

    def test_product_list_supports_category_slug_filter(self):
        response = self.client.get("/api/products/?category_slug=whey")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["slug"], self.product.slug)

    def test_product_detail_returns_final_price(self):
        response = self.client.get(f"/api/products/{self.product.slug}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["final_price"], "7999.00")

    def test_category_list_includes_product_count(self):
        response = self.client.get("/api/categories/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["products_count"], 1)
