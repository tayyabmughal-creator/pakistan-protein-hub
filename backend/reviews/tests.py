from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from products.models import Category, Product
from orders.models import Order, OrderItem
from .models import Review


User = get_user_model()


class ReviewApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reviews@example.com",
            email="reviews@example.com",
            name="Review User",
            password="StrongPass123",
        )
        category = Category.objects.create(name="BCAA", slug="bcaa")
        self.product = Product.objects.create(
            name="BCAA Powder",
            slug="bcaa-powder",
            category=category,
            brand="XTEND",
            weight="30 servings",
            description="Recovery support",
            price="6500.00",
            stock=20,
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_review_requires_verified_purchase(self):
        response = self.client.post(
            "/api/reviews/",
            {"product": self.product.id, "rating": 5, "comment": "Excellent"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Review.objects.count(), 0)

    def test_verified_purchaser_can_submit_review(self):
        order = Order.objects.create(
            user=self.user,
            total_amount="6500.00",
            shipping_address="Review User, 123, Street, Area, City",
            payment_method="COD",
            status="DELIVERED",
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            quantity=1,
            price="6500.00",
        )

        response = self.client.post(
            "/api/reviews/",
            {"product": self.product.id, "rating": 5, "comment": "Excellent"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Review.objects.count(), 1)

    def test_review_list_includes_user_name_for_storefront(self):
        Review.objects.create(
            user=self.user,
            product=self.product,
            rating=4,
            comment="Solid recovery product",
        )

        self.client.force_authenticate(user=None)
        response = self.client.get(f"/api/reviews/?product_id={self.product.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["user_name"], "Review User")

    def test_review_eligibility_shows_can_review_after_delivered_order(self):
        order = Order.objects.create(
            user=self.user,
            total_amount="6500.00",
            shipping_address="Review User, 123, Street, Area, City",
            payment_method="COD",
            status="DELIVERED",
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            quantity=1,
            price="6500.00",
        )

        response = self.client.get(f"/api/reviews/eligibility/?product_id={self.product.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_review"])
        self.assertFalse(response.data["already_reviewed"])

    def test_review_author_can_update_existing_review(self):
        order = Order.objects.create(
            user=self.user,
            total_amount="6500.00",
            shipping_address="Review User, 123, Street, Area, City",
            payment_method="COD",
            status="DELIVERED",
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            quantity=1,
            price="6500.00",
        )
        review = Review.objects.create(
            user=self.user,
            product=self.product,
            rating=4,
            comment="Good",
        )

        response = self.client.patch(
            f"/api/reviews/{review.id}/",
            {"rating": 5, "comment": "Excellent"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        review.refresh_from_db()
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.comment, "Excellent")
