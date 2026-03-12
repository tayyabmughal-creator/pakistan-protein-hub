from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


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
