from django.db import models
from django.conf import settings
from products.models import Product

class Order(models.Model):
    ORDER_STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('SHIPPED', 'Shipped'),
        ('DELIVERED', 'Delivered'),
        ('CANCELLED', 'Cancelled'),
    )
    PAYMENT_METHOD_CHOICES = (
        ('COD', 'Cash on Delivery'),
    )
    PAYMENT_STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PAID', 'Paid'),
        ('FAILED', 'Failed'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='orders')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    shipping_address = models.TextField() # Snapshot of address
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHOD_CHOICES, default='COD')
    payment_status = models.CharField(max_length=10, choices=PAYMENT_STATUS_CHOICES, default='PENDING')
    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} - {self.user.email}"

class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True) # Keep order item even if product deleted
    product_name = models.CharField(max_length=255) # Snapshot
    quantity = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2) # Snapshot price

    def __str__(self):
        return f"{self.quantity} x {self.product_name}"
