from django.db import transaction
from django.core.exceptions import ValidationError
from .models import Order, OrderItem
# Assuming Product and StockService are accessible
from products.models import Product
from products.services import StockService
from cart.models import Cart
from users.models import Address

class OrderService:
    @staticmethod
    def create_order(user, address_id, payment_method='COD'):
        with transaction.atomic():
            # 1. Get Cart
            try:
                cart = Cart.objects.get(user=user)
                cart_items = cart.items.select_related('product').all()
            except Cart.DoesNotExist:
                 raise ValidationError("Cart is empty")

            if not cart_items:
                raise ValidationError("Cart is empty")

            # 2. Validate Address
            try:
                address = Address.objects.get(id=address_id, user=user)
            except Address.DoesNotExist:
                raise ValidationError("Invalid address ID")
            
            # 3. Create Order
            total_amount = cart.total_price # Should be calculated from items now to be safe or use cart.total_price property
            # Let's recalculate to be 100% sure with locked prices if we had price locks, 
            # but we are doing it atomically now. 
            # For strictness, let's re-verify stock and price.
            
            # Construct address string snapshot
            shipping_address = f"{address.full_name}, {address.phone_number}, {address.street}, {address.area}, {address.city}"

            order = Order.objects.create(
                user=user,
                total_amount=0, # Will update after items
                shipping_address=shipping_address,
                payment_method=payment_method
            )

            final_total = 0
            
            for item in cart_items:
                # 4. Deduct Stock (Atomic)
                StockService.deduct_stock(item.product.id, item.quantity)
                
                # 5. Create Order Item
                # Determine price: use snapshot from cart item if available
                price = item.price_snapshot if item.price_snapshot else item.product.final_price
                
                OrderItem.objects.create(
                    order=order,
                    product=item.product,
                    product_name=item.product.name,
                    quantity=item.quantity,
                    price=price
                )
                final_total += price * item.quantity
            
            order.total_amount = final_total
            order.save()

            # 6. Clear Cart
            cart.items.all().delete() 
            # or cart.delete() ? Requirement "Clear cart". Usually empty items.
            
            return order
