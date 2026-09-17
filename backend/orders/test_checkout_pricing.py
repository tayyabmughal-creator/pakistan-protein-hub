"""Checkout must price from the catalogue, not from the basket.

The registered-checkout path used to take ``CartItem.price_snapshot`` — written
once when the item was added — as the sale price. A basket left open across a
price rise checked out at the old price, and the guest path (which read the live
price) disagreed with the registered path about what the same item cost.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from cart.models import Cart, CartItem
from orders.models import Order
from orders.services import CheckoutPreparationService, OrderService, PromotionService
from products.models import Category, Product
from promotions.models import Promotion
from users.models import Address, User


class CheckoutRepricingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="shopper", email="shopper@example.com", password="pw", name="Shopper"
        )
        self.address = Address.objects.create(
            user=self.user,
            full_name="Shopper",
            phone_number="03001234567",
            city="Lahore",
            area="Gulberg",
            street="1 Main St",
        )
        self.category = Category.objects.create(name="Protein", slug="protein")
        self.product = Product.objects.create(
            name="Whey Gold",
            slug="whey-gold",
            category=self.category,
            brand="ON",
            weight="2kg",
            description="x",
            price=Decimal("10000.00"),
            stock=10,
        )
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=1)

    def test_price_rise_after_add_to_cart_is_charged_at_the_new_price(self):
        item = CartItem.objects.get()
        self.assertEqual(item.price_snapshot, Decimal("10000.00"))

        self.product.price = Decimal("13000.00")
        self.product.save(update_fields=["price"])

        with self.captureOnCommitCallbacks(execute=True):
            order = OrderService.create_order(self.user, self.address.id)

        self.assertEqual(order.subtotal_amount, Decimal("13000.00"))
        self.assertEqual(order.items.get().price, Decimal("13000.00"))

    def test_price_drop_after_add_to_cart_is_charged_at_the_new_price(self):
        self.product.discount_price = Decimal("7000.00")
        self.product.save(update_fields=["discount_price"])

        with self.captureOnCommitCallbacks(execute=True):
            order = OrderService.create_order(self.user, self.address.id)

        self.assertEqual(order.subtotal_amount, Decimal("7000.00"))

    def test_deactivated_product_cannot_be_checked_out(self):
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])

        with self.assertRaises(ValidationError) as ctx:
            OrderService.create_order(self.user, self.address.id)
        self.assertIn("no longer available", str(ctx.exception))
        self.assertEqual(Order.objects.count(), 0)

    def test_insufficient_stock_is_rejected_before_an_order_exists(self):
        self.product.stock = 0
        self.product.save(update_fields=["stock"])

        with self.assertRaises(ValidationError):
            OrderService.create_order(self.user, self.address.id)
        self.assertEqual(Order.objects.count(), 0)

    def test_guest_and_registered_paths_price_identically(self):
        self.product.price = Decimal("11111.00")
        self.product.save(update_fields=["price"])

        registered = CheckoutPreparationService.prepare_registered_checkout(
            user=self.user, address_id=self.address.id
        )
        guest = CheckoutPreparationService.prepare_guest_checkout(
            guest_name="G",
            guest_email="g@example.com",
            guest_phone_number="03000000000",
            city="Lahore",
            area="DHA",
            street="2 Side St",
            items=[{"product": self.product, "quantity": 1}],
        )

        self.assertEqual(registered["subtotal_amount"], guest["subtotal_amount"])
        self.assertEqual(registered["total_amount"], guest["total_amount"])

    def test_free_shipping_threshold_boundary(self):
        # The rule is "free above 5000", so exactly 5000 still pays shipping.
        self.product.price = Decimal("5000.00")
        self.product.save(update_fields=["price"])
        at_threshold = CheckoutPreparationService.prepare_registered_checkout(
            user=self.user, address_id=self.address.id
        )
        self.assertEqual(at_threshold["shipping_fee"], Decimal("250.00"))
        self.assertEqual(at_threshold["total_amount"], Decimal("5250.00"))

        self.product.price = Decimal("5000.01")
        self.product.save(update_fields=["price"])
        above = CheckoutPreparationService.prepare_registered_checkout(
            user=self.user, address_id=self.address.id
        )
        self.assertEqual(above["shipping_fee"], Decimal("0.00"))

    def test_promo_preview_matches_what_checkout_charges(self):
        Promotion.objects.create(
            code="SAVE10",
            discount_percentage=10,
            valid_to=timezone.now() + timezone.timedelta(days=7),
            usage_limit=100,
        )
        self.product.price = Decimal("9000.00")
        self.product.save(update_fields=["price"])

        preview = OrderService.preview_discount(user=self.user, promo_code="SAVE10")
        with self.captureOnCommitCallbacks(execute=True):
            order = OrderService.create_order(
                self.user, self.address.id, promo_code="SAVE10"
            )

        self.assertEqual(preview["total_amount"], order.total_amount)
        self.assertEqual(preview["discount_amount"], order.discount_amount)


class CouponRedemptionTests(TestCase):
    def setUp(self):
        self.promotion = Promotion.objects.create(
            code="LAST1",
            discount_percentage=10,
            valid_to=timezone.now() + timezone.timedelta(days=7),
            usage_limit=1,
            used_count=0,
        )

    def test_redemption_increments_atomically(self):
        PromotionService.consume_redemption(self.promotion)
        self.promotion.refresh_from_db()
        self.assertEqual(self.promotion.used_count, 1)

    def test_redemption_beyond_the_limit_is_refused(self):
        PromotionService.consume_redemption(self.promotion)

        # A second claim must lose rather than overrun the limit. The old code
        # read used_count into Python and wrote back +1, so two concurrent
        # redemptions both wrote 1 and the coupon was used twice.
        stale = Promotion.objects.get(pk=self.promotion.pk)
        stale.used_count = 0  # simulate a stale in-memory copy
        with self.assertRaises(ValidationError):
            PromotionService.consume_redemption(stale)

        self.promotion.refresh_from_db()
        self.assertEqual(self.promotion.used_count, 1)

    def test_a_stale_instance_cannot_inflate_the_count(self):
        """Increment happens in SQL, so an out-of-date copy cannot rewind it."""
        PromotionService.consume_redemption(self.promotion)
        self.promotion.usage_limit = 5
        self.promotion.save(update_fields=["usage_limit"])

        stale = Promotion.objects.get(pk=self.promotion.pk)
        stale.used_count = 0
        PromotionService.consume_redemption(stale)

        self.promotion.refresh_from_db()
        self.assertEqual(self.promotion.used_count, 2)
