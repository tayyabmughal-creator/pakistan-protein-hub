from django.db import transaction
from django.core.exceptions import ValidationError
from decimal import Decimal, ROUND_HALF_UP
from .models import Order, OrderItem
# Assuming Product and StockService are accessible
from products.models import Product
from products.services import StockService
from cart.models import Cart
from users.models import Address
from .notifications import send_order_notifications
from promotions.models import Promotion


class PromotionService:
    @staticmethod
    def get_valid_promotion(code):
        normalized = (code or "").strip().upper()
        if not normalized:
            return None
        try:
            promotion = Promotion.objects.get(code=normalized)
        except Promotion.DoesNotExist:
            raise ValidationError("Invalid promo code")
        if not promotion.is_valid():
            raise ValidationError("Promo code is not active")
        return promotion

    @staticmethod
    def calculate_discount(subtotal, promotion):
        if not promotion:
            return Decimal("0.00")
        discount = (Decimal(subtotal) * Decimal(promotion.discount_percentage) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        return discount

class OrderService:
    @staticmethod
    def preview_discount(*, user=None, items=None, promo_code=""):
        promotion = PromotionService.get_valid_promotion(promo_code)
        if user:
            try:
                cart = Cart.objects.get(user=user)
                cart_items = cart.items.select_related('product').all()
            except Cart.DoesNotExist:
                raise ValidationError("Cart is empty")
            if not cart_items:
                raise ValidationError("Cart is empty")
            subtotal = sum(
                (item.price_snapshot if item.price_snapshot else item.product.final_price) * item.quantity
                for item in cart_items
            )
        else:
            if not items:
                raise ValidationError("Cart is empty")
            subtotal = sum(item["product"].final_price * item["quantity"] for item in items)

        discount = PromotionService.calculate_discount(subtotal, promotion)
        total = Decimal(subtotal) - discount
        return {
            "code": promotion.code,
            "discount_percentage": promotion.discount_percentage,
            "subtotal_amount": subtotal,
            "discount_amount": discount,
            "total_amount": total,
        }

    @staticmethod
    def create_order(user, address_id, payment_method='COD', promo_code=''):
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
                promotion=None,
                applied_promo_code="",
                subtotal_amount=0,
                discount_amount=0,
                total_amount=0, # Will update after items
                shipping_address=shipping_address,
                payment_method=payment_method
            )

            subtotal = Decimal("0.00")
            
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
                subtotal += price * item.quantity

            promotion = PromotionService.get_valid_promotion(promo_code) if promo_code else None
            discount = PromotionService.calculate_discount(subtotal, promotion)
            order.subtotal_amount = subtotal
            order.discount_amount = discount
            order.total_amount = subtotal - discount
            if promotion:
                order.promotion = promotion
                order.applied_promo_code = promotion.code
                promotion.used_count += 1
                promotion.save(update_fields=["used_count"])
            order.save()

            # 6. Clear Cart
            cart.items.all().delete() 
            # or cart.delete() ? Requirement "Clear cart". Usually empty items.
            send_order_notifications(order)
            return order

    @staticmethod
    def create_guest_order(*, guest_name, guest_email, guest_phone_number, city, area, street, items, payment_method='COD', promo_code=''):
        with transaction.atomic():
            if not items:
                raise ValidationError("Cart is empty")

            shipping_address = f"{guest_name}, {guest_phone_number}, {street}, {area}, {city}"
            order = Order.objects.create(
                user=None,
                guest_name=guest_name,
                guest_email=guest_email,
                guest_phone_number=guest_phone_number,
                promotion=None,
                applied_promo_code="",
                subtotal_amount=0,
                discount_amount=0,
                total_amount=0,
                shipping_address=shipping_address,
                payment_method=payment_method,
            )

            subtotal = Decimal("0.00")
            for item in items:
                product = item['product']
                quantity = item['quantity']

                StockService.deduct_stock(product.id, quantity)
                price = product.final_price

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=product.name,
                    quantity=quantity,
                    price=price
                )
                subtotal += price * quantity

            promotion = PromotionService.get_valid_promotion(promo_code) if promo_code else None
            discount = PromotionService.calculate_discount(subtotal, promotion)
            order.subtotal_amount = subtotal
            order.discount_amount = discount
            order.total_amount = subtotal - discount
            if promotion:
                order.promotion = promotion
                order.applied_promo_code = promotion.code
                promotion.used_count += 1
                promotion.save(update_fields=["used_count"])
            order.save()
            send_order_notifications(order)
            return order
