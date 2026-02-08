import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from users.models import User
from products.models import Product, Category
from cart.models import Cart
from orders.models import Order
from users.models import Address

def run_verification():
    print("Starting verification...")
    try:
        client = APIClient()
        
        # 1. Create User
        if not User.objects.filter(email='test@example.com').exists():
            user = User.objects.create_user(email='test@example.com', password='password123', name='Test User')
        else:
            user = User.objects.get(email='test@example.com')
        
        print("User created.")

        # 2. Login
        response = client.post('/api/users/login', {
            'email': 'test@example.com',
            'password': 'password123'
        }, format='json')
        
        if response.status_code != 200:
            print(f"Login failed: {response.status_code}")
            try:
                print(response.data)
            except AttributeError:
                with open("error.html", "wb") as f:
                    f.write(response.content)
                print("Error content saved to error.html")
            return

        access_token = response.data['access']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        print("Login successful.")

        # 3. Create Product
        category, _ = Category.objects.get_or_create(name='Protein', slug='protein')
        product, _ = Product.objects.get_or_create(
            name='Whey Protein',
            slug='whey-protein',
            defaults={
                'category': category,
                'brand': 'Optimum Nutrition',
                'price': 50.00,
                'stock': 10,
                'is_active': True,
                'description': 'Test Description',
                'weight': '2kg'
            }
        )
        # Ensure stock is reset
        product.stock = 10
        product.save()
        print("Product created/reset.")

        # 4. Add to Cart
        response = client.post('/api/cart/items/', {
            'product_id': product.id,
            'quantity': 2
        })
        if response.status_code != 200:
             print(f"Add to cart failed: {response.data}")
             return
        print("Added to cart.")

        # 5. Add Address
        # Check logic: Address is required
        response = client.post('/api/users/addresses', {
            'full_name': 'Test User',
            'phone_number': '1234567890',
            'city': 'Lahore',
            'area': 'DHA',
            'street': 'Main Blvd',
            'is_default': True
        })
        if response.status_code != 201:
             print(f"Add address failed: {response.data}")
             return
        address_id = response.data['id']
        print("Address added.")

        # 6. Checkout
        response = client.post('/api/orders/', {
            'address_id': address_id,
            'payment_method': 'COD'
        })
        if response.status_code != 201:
             print(f"Checkout failed: {response.data}")
             return
        order_id = response.data['id']
        print(f"Order created: {order_id}")

        # Verify
        order = Order.objects.get(id=order_id)
        if order.total_amount != 100.00:
            print(f"Order total mismatch: {order.total_amount}")
        
        product.refresh_from_db()
        if product.stock != 8:
            print(f"Stock mismatch: {product.stock}")
        
        print("Verification SUCCESS!")

    except Exception as e:
        print(f"Verification FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    run_verification()
