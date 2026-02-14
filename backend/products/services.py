from django.db import transaction
from django.core.exceptions import ValidationError
from .models import Product

class StockService:
    @staticmethod
    def deduct_stock(product_id: int, quantity: int):
        """
        Atomically deduct stock for a product.
        Raises ValidationError if stock is insufficient.
        """
        with transaction.atomic():
            # Lock the row for update to prevent race conditions
            try:
                product = Product.objects.select_for_update().get(id=product_id)
            except Product.DoesNotExist:
                raise ValidationError(f"Product with id {product_id} does not exist")
            
            if product.stock < quantity:
                raise ValidationError(f"Insufficient stock for product {product.name}. Available: {product.stock}, Requested: {quantity}")
            
            product.stock -= quantity
            product.save()
            return product.stock

    @staticmethod
    def restore_stock(product_id: int, quantity: int):
        """
        Atomically restore stock (e.g. on order cancellation).
        """
        with transaction.atomic():
            product = Product.objects.select_for_update().get(id=product_id)
            product.stock += quantity
            product.save()
            return product.stock
