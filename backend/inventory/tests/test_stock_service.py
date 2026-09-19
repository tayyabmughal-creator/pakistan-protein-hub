"""The inventory invariants, one test each.

The property that matters most: ``available = on_hand - reserved``, never
negative, whatever sequence of operations runs and however many times a retry
repeats one.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from inventory import services
from inventory.models import (
    InventoryBalance,
    InventoryLocation,
    StockMovement,
    StockReservation,
)
from products.models import Category, Product, ProductVariant


def make_variant(*, sku="PN-TEST", stock=10, price="1000.00", name="Test Whey"):
    category, _ = Category.objects.get_or_create(slug="protein", defaults={"name": "Protein"})
    product = Product.objects.create(
        name=name,
        slug=sku.lower(),
        category=category,
        brand="TestBrand",
        weight="2kg",
        description="x",
        price=Decimal(price),
        stock=stock,
    )
    # The post_save signal creates the default variant and opens the balance.
    return product.variants.get()


class BalanceArithmeticTests(TestCase):
    def test_available_is_derived_from_on_hand_and_reserved(self):
        variant = make_variant(stock=10)
        balance = InventoryBalance.objects.get(variant=variant)

        self.assertEqual(balance.on_hand, 10)
        self.assertEqual(balance.reserved, 0)
        self.assertEqual(balance.available, 10)

        services.reserve(variant=variant, quantity=3, reference="checkout:1")
        balance.refresh_from_db()

        # Reserving does not remove goods from the shelf, only from sale.
        self.assertEqual(balance.on_hand, 10)
        self.assertEqual(balance.reserved, 3)
        self.assertEqual(balance.available, 7)

    def test_the_database_refuses_negative_on_hand(self):
        from django.db import IntegrityError, transaction

        variant = make_variant(stock=5)
        balance = InventoryBalance.objects.get(variant=variant)
        balance.on_hand = -1
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                balance.save()

    def test_the_database_refuses_reserving_more_than_is_present(self):
        from django.db import IntegrityError, transaction

        variant = make_variant(stock=5)
        balance = InventoryBalance.objects.get(variant=variant)
        balance.reserved = 6
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                balance.save()


class ReserveCommitReleaseTests(TestCase):
    def setUp(self):
        self.variant = make_variant(stock=10)

    def balance(self):
        return InventoryBalance.objects.get(variant=self.variant)

    def test_the_full_round_trip(self):
        services.reserve(variant=self.variant, quantity=4, reference="checkout:1")
        self.assertEqual(self.balance().available, 6)

        services.commit(reference="checkout:1")
        balance = self.balance()

        # Committing sells: the goods leave, and the hold is gone with them.
        self.assertEqual(balance.on_hand, 6)
        self.assertEqual(balance.reserved, 0)
        self.assertEqual(balance.available, 6)

        sale = StockMovement.objects.get(movement_type=StockMovement.SALE)
        self.assertEqual(sale.quantity, -4)
        self.assertEqual(sale.balance_after, 6)

    def test_release_frees_the_hold_and_sells_nothing(self):
        services.reserve(variant=self.variant, quantity=4, reference="checkout:1")
        services.release(reference="checkout:1", reason="payment failed")

        balance = self.balance()
        self.assertEqual(balance.on_hand, 10)
        self.assertEqual(balance.reserved, 0)
        self.assertEqual(balance.available, 10)
        self.assertFalse(StockMovement.objects.filter(movement_type=StockMovement.SALE).exists())

    def test_reserving_more_than_is_available_is_refused(self):
        with self.assertRaises(services.InsufficientStock) as ctx:
            services.reserve(variant=self.variant, quantity=11, reference="checkout:1")
        self.assertIn("Only 10 left", str(ctx.exception))
        self.assertEqual(self.balance().reserved, 0)

    def test_a_second_checkout_cannot_take_what_the_first_holds(self):
        services.reserve(variant=self.variant, quantity=8, reference="checkout:1")

        with self.assertRaises(services.InsufficientStock):
            services.reserve(variant=self.variant, quantity=3, reference="checkout:2")

        # The first hold is untouched by the second's failure.
        self.assertEqual(self.balance().reserved, 8)

    # -- idempotency: retries and duplicate deliveries are normal ----------

    def test_reserving_twice_for_one_checkout_holds_stock_once(self):
        first = services.reserve(variant=self.variant, quantity=3, reference="checkout:1")
        second = services.reserve(variant=self.variant, quantity=3, reference="checkout:1")

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(self.balance().reserved, 3)
        self.assertEqual(
            StockReservation.objects.filter(reference="checkout:1", status="ACTIVE").count(), 1
        )

    def test_committing_twice_sells_once(self):
        """A duplicate payment webhook must not sell the goods a second time."""
        services.reserve(variant=self.variant, quantity=4, reference="checkout:1")
        services.commit(reference="checkout:1")
        services.commit(reference="checkout:1")

        self.assertEqual(self.balance().on_hand, 6)
        self.assertEqual(StockMovement.objects.filter(movement_type=StockMovement.SALE).count(), 1)

    def test_releasing_twice_frees_once(self):
        services.reserve(variant=self.variant, quantity=4, reference="checkout:1")
        services.release(reference="checkout:1")
        services.release(reference="checkout:1")

        balance = self.balance()
        self.assertEqual(balance.reserved, 0)
        self.assertEqual(balance.on_hand, 10)

    def test_releasing_after_committing_does_not_give_stock_back(self):
        """Money was taken and goods went out. A late release must not restock."""
        services.reserve(variant=self.variant, quantity=4, reference="checkout:1")
        services.commit(reference="checkout:1")
        services.release(reference="checkout:1")

        self.assertEqual(self.balance().on_hand, 6)

    def test_committing_nothing_is_not_an_error(self):
        self.assertEqual(services.commit(reference="never-reserved"), [])


class LastUnitTests(TestCase):
    """The case that decides whether the shop oversells."""

    def setUp(self):
        self.variant = make_variant(stock=1)

    def test_only_one_of_two_checkouts_can_hold_the_last_unit(self):
        services.reserve(variant=self.variant, quantity=1, reference="checkout:A")

        with self.assertRaises(services.InsufficientStock):
            services.reserve(variant=self.variant, quantity=1, reference="checkout:B")

        balance = InventoryBalance.objects.get(variant=self.variant)
        self.assertEqual(balance.available, 0)
        self.assertEqual(balance.reserved, 1)

    def test_the_loser_can_buy_it_once_the_winner_abandons_checkout(self):
        services.reserve(variant=self.variant, quantity=1, reference="checkout:A")
        services.release(reference="checkout:A", reason="payment abandoned")

        services.reserve(variant=self.variant, quantity=1, reference="checkout:B")
        services.commit(reference="checkout:B")

        balance = InventoryBalance.objects.get(variant=self.variant)
        self.assertEqual(balance.on_hand, 0)
        self.assertEqual(balance.available, 0)


class AdjustmentTests(TestCase):
    def setUp(self):
        self.variant = make_variant(stock=10)

    def test_receiving_stock_raises_on_hand_and_records_it(self):
        services.receive_stock(
            variant=self.variant, quantity=20, reason="Supplier delivery #4471"
        )
        balance = InventoryBalance.objects.get(variant=self.variant)
        self.assertEqual(balance.on_hand, 30)

        movement = StockMovement.objects.filter(movement_type=StockMovement.RECEIPT).get()
        self.assertEqual(movement.quantity, 20)
        self.assertEqual(movement.balance_after, 30)

    def test_a_manual_adjustment_without_a_reason_is_refused(self):
        """'Why is on_hand different from yesterday' must always have an answer."""
        with self.assertRaises(ValidationError) as ctx:
            services.adjust_stock(
                variant=self.variant, delta=-3,
                movement_type=StockMovement.MANUAL_ADJUSTMENT, reason="",
            )
        self.assertIn("reason is required", str(ctx.exception))

    def test_an_adjustment_cannot_drive_stock_negative(self):
        with self.assertRaises(ValidationError):
            services.adjust_stock(
                variant=self.variant, delta=-50,
                movement_type=StockMovement.DAMAGE, reason="Flood",
            )
        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, 10)

    def test_an_adjustment_cannot_strand_reserved_orders(self):
        services.reserve(variant=self.variant, quantity=8, reference="order:1")

        with self.assertRaises(ValidationError) as ctx:
            services.adjust_stock(
                variant=self.variant, delta=-5,
                movement_type=StockMovement.DAMAGE, reason="Damaged in storage",
            )
        self.assertIn("reserved for orders", str(ctx.exception))

    def test_a_physical_count_records_the_difference_and_the_date(self):
        balance = services.set_counted_quantity(
            variant=self.variant, counted=7, reason="Monthly stocktake"
        )
        self.assertEqual(balance.on_hand, 7)
        self.assertIsNotNone(balance.last_counted_at)

        movement = StockMovement.objects.filter(movement_type=StockMovement.STOCKTAKE).get()
        self.assertEqual(movement.quantity, -3)

    def test_returning_goods_puts_them_back(self):
        services.return_to_stock(
            variant=self.variant, quantity=2, reason="Customer returned, unopened"
        )
        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, 12)
        self.assertTrue(StockMovement.objects.filter(movement_type=StockMovement.RETURN).exists())


class ExpiryTests(TestCase):
    def test_an_abandoned_checkout_stops_holding_stock(self):
        """Otherwise every abandoned payment removes stock from sale permanently."""
        from datetime import timedelta

        variant = make_variant(stock=5)
        services.reserve(
            variant=variant, quantity=5, reference="checkout:abandoned",
            ttl=timedelta(seconds=-1),  # already expired
        )
        self.assertEqual(InventoryBalance.objects.get(variant=variant).available, 0)

        released = services.release_expired_reservations()

        self.assertEqual(released, 1)
        self.assertEqual(InventoryBalance.objects.get(variant=variant).available, 5)
        self.assertEqual(
            StockReservation.objects.get(reference="checkout:abandoned").status, "EXPIRED"
        )

    def test_a_live_reservation_is_left_alone(self):
        variant = make_variant(stock=5)
        services.reserve(variant=variant, quantity=2, reference="checkout:live")

        services.release_expired_reservations()

        self.assertEqual(InventoryBalance.objects.get(variant=variant).available, 3)


class LedgerIntegrityTests(TestCase):
    def test_the_ledger_sums_to_the_balance_through_a_full_lifecycle(self):
        """The balance is a cache of the ledger. They must never disagree."""
        variant = make_variant(stock=10)

        services.receive_stock(variant=variant, quantity=15, reason="Delivery")
        services.reserve(variant=variant, quantity=4, reference="order:1")
        services.commit(reference="order:1")
        services.adjust_stock(
            variant=variant, delta=-2, movement_type=StockMovement.DAMAGE, reason="Torn seal"
        )
        services.return_to_stock(variant=variant, quantity=1, reason="Returned")
        services.reserve(variant=variant, quantity=3, reference="order:2")
        services.release(reference="order:2")

        balance = InventoryBalance.objects.get(variant=variant)
        self.assertEqual(balance.on_hand, 20)  # 10 + 15 - 4 - 2 + 1
        self.assertEqual(balance.reserved, 0)

        self.assertEqual(services.verify_ledger_matches_balances(), [])

    def test_a_divergence_is_reported_rather_than_hidden(self):
        variant = make_variant(stock=10)

        # Simulate the exact failure mode this check exists to catch: something
        # wrote the balance without posting a movement.
        InventoryBalance.objects.filter(variant=variant).update(on_hand=99)

        mismatches = services.verify_ledger_matches_balances()

        self.assertEqual(len(mismatches), 1)
        self.assertEqual(mismatches[0]["sku"], variant.sku)
        self.assertEqual(mismatches[0]["on_hand"], 99)
        self.assertEqual(mismatches[0]["ledger_total"], 10)
        self.assertEqual(mismatches[0]["difference"], 89)

    def test_every_movement_records_who_and_why(self):
        from users.models import User

        variant = make_variant(stock=10)
        staff = User.objects.create_user(
            username="ops@example.com", email="ops@example.com", name="Ops", password="pw"
        )

        services.adjust_stock(
            variant=variant, delta=-1, movement_type=StockMovement.DAMAGE,
            actor=staff, reason="Dropped during unpacking",
        )

        movement = StockMovement.objects.filter(movement_type=StockMovement.DAMAGE).get()
        self.assertEqual(movement.actor, staff)
        self.assertEqual(movement.reason, "Dropped during unpacking")
        self.assertIsNotNone(movement.created_at)


class LegacyFieldSyncTests(TestCase):
    """The columns the current storefront still reads must stay correct."""

    def test_selling_stock_updates_the_legacy_product_column(self):
        from products.services import sync_legacy_product_fields

        variant = make_variant(stock=10)
        services.reserve(variant=variant, quantity=4, reference="order:1")
        services.commit(reference="order:1")

        product = sync_legacy_product_fields(variant.product)
        self.assertEqual(product.stock, 6)

    def test_reserved_stock_is_not_shown_as_buyable(self):
        from products.services import sync_legacy_product_fields

        variant = make_variant(stock=10)
        services.reserve(variant=variant, quantity=4, reference="checkout:1")

        product = sync_legacy_product_fields(variant.product)
        # 6, not 10: reserved units cannot be bought by anyone else.
        self.assertEqual(product.stock, 6)

    def test_editing_the_legacy_price_moves_the_variant_price(self):
        variant = make_variant(stock=10, price="1000.00")
        product = variant.product

        product.price = Decimal("1200.00")
        product.save()

        variant.refresh_from_db()
        self.assertEqual(variant.price, Decimal("1200.00"))

    def test_editing_the_legacy_discount_creates_a_genuine_compare_price(self):
        variant = make_variant(stock=10, price="1000.00")
        product = variant.product

        product.discount_price = Decimal("800.00")
        product.save()

        variant.refresh_from_db()
        self.assertEqual(variant.price, Decimal("800.00"))
        self.assertEqual(variant.compare_at_price, Decimal("1000.00"))
        self.assertTrue(variant.has_genuine_discount)
        self.assertEqual(variant.discount_percentage, 20)

    def test_editing_the_legacy_stock_posts_a_ledger_movement(self):
        """A hand-edited number must not be a hole in the audit trail."""
        variant = make_variant(stock=10)
        product = variant.product

        product.stock = 25
        product.save()

        balance = InventoryBalance.objects.get(variant=variant)
        self.assertEqual(balance.on_hand, 25)

        movement = StockMovement.objects.filter(reference=f"product:{product.pk}").get()
        self.assertEqual(movement.quantity, 15)
        self.assertIn("via the product form", movement.reason)

    def test_a_compare_price_below_the_selling_price_is_not_a_discount(self):
        variant = make_variant(stock=5, price="1000.00")
        variant.compare_at_price = Decimal("900.00")
        variant.save()

        self.assertFalse(variant.has_genuine_discount)
        self.assertEqual(variant.discount_percentage, 0)
        self.assertEqual(variant.savings, Decimal("0.00"))
