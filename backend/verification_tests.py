import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User
from products.models import Product, Category
from cart.models import Cart, CartItem
from orders.models import Order

@pytest.mark.django_db
class TestECommerceFlow:
    def setup_method(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='test@example.com', password='password123', name='Test User')
        self.category = Category.objects.create(name='Protein', slug='protein')
        self.product = Product.objects.create(
            name='Whey Protein',
            slug='whey-protein',
            category=self.category,
            brand='Optimum Nutrition',
            price=50.00,
            stock=10,
            is_active=True
        )

    def test_full_purchase_flow(self):
        # 1. Login
        response = self.client.post(reverse('token_obtain_pair'), {
            'email': 'test@example.com',
            'password': 'password123'
        })
        assert response.status_code == status.HTTP_200_OK
        access_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')

        # 2. Add to Cart
        response = self.client.post(reverse('cart-add'), {
            'product_id': self.product.id,
            'quantity': 2
        })
        assert response.status_code == status.HTTP_200_OK
        cart = Cart.objects.get(user=self.user)
        assert cart.items.first().quantity == 2

        # 3. Add Address
        response = self.client.post(reverse('address-list'), {
            'full_name': 'Test User',
            'phone_number': '1234567890',
            'city': 'Lahore',
            'area': 'DHA',
            'street': 'Main Blvd',
            'is_default': True
        })
        assert response.status_code == status.HTTP_201_CREATED
        address_id = response.data['id']

        # 4. Checkout (Create Order)
        response = self.client.post(reverse('order-list-create'), {
            'address_id': address_id,
            'payment_method': 'COD'
        })
        assert response.status_code == status.HTTP_201_CREATED
        order_id = response.data['id']
        
        order = Order.objects.get(id=order_id)
        assert order.total_amount == 100.00 # 50 * 2
        assert order.status == 'PENDING'
        
        # Verify Stock Reduction
        product = Product.objects.get(id=self.product.id)
        assert product.stock == 8 # 10 - 2

        # 5. Order Cancellation
        response = self.client.post(reverse('order-cancel', kwargs={'pk': order_id}))
        assert response.status_code == status.HTTP_200_OK
        
        order.refresh_from_db()
        assert order.status == 'CANCELLED'
        
        # Verify Stock Restoration
        product.refresh_from_db()
        assert product.stock == 10

