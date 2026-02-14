from django.db import models
from django.conf import settings
from products.models import Product

class Cart(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def total_price(self):
        return sum(item.total_price for item in self.items.all())

    def __str__(self):
        return f"Cart of {self.user.email}"

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)
    # Adding price_snapshot to lock price at add-time as mandated by requirement
    price_snapshot = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    class Meta:
        unique_together = ('cart', 'product')

    def save(self, *args, **kwargs):
        if not self.price_snapshot:
            self.price_snapshot = self.product.final_price
        super().save(*args, **kwargs)

    @property
    def total_price(self):
        # Use snapshot if available, else current price (fallback)
        price = self.price_snapshot if self.price_snapshot else self.product.final_price
        return price * self.quantity

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"
