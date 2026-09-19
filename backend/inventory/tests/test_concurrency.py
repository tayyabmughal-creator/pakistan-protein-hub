"""Concurrent purchase of the last unit.

This is the test the whole reservation design exists for: two customers reach
checkout at the same moment for the one remaining tub. Exactly one must get it.

**These tests are skipped on SQLite, and that is not a workaround.** SQLite
ignores ``SELECT ... FOR UPDATE`` entirely, so the test would pass while proving
nothing — which is worse than not running it, because a green tick would imply a
guarantee that is not there. CI runs the backend suite against PostgreSQL 16
precisely so these execute for real, and the production configuration check
refuses to start on SQLite for the same reason.

``TransactionTestCase`` rather than ``TestCase``: the normal wrapping
transaction would hide every interaction between threads.
"""

from decimal import Decimal

from django.db import connection, connections
from django.test import TransactionTestCase, skipUnlessDBFeature

from inventory import services
from inventory.models import (
    InventoryBalance,
    InventoryLocation,
    StockMovement,
    StockReservation,
)
from products.models import Category, Product

CONCURRENCY_MESSAGE = (
    "Requires PostgreSQL: SQLite ignores select_for_update, so this would pass "
    "without testing anything."
)


def ensure_location():
    """TransactionTestCase truncates tables between tests, taking the location
    the data migration created with them. Everything is keyed by location, so
    without this nothing can be sold."""
    return InventoryLocation.objects.get_or_create(
        code="main-shop",
        defaults={"name": "Pak Nutrition Shop", "is_active": True, "is_default": True},
    )[0]


def make_variant(*, sku, stock, price="1000.00"):
    category, _ = Category.objects.get_or_create(slug="protein", defaults={"name": "Protein"})
    product = Product.objects.create(
        name=sku,
        slug=sku.lower(),
        category=category,
        brand="TestBrand",
        weight="2kg",
        description="x",
        price=Decimal(price),
        stock=stock,
    )
    return product.variants.get()


def run_concurrently(target, count):
    """Run `target(index)` in `count` threads, returning (results, errors).

    Each thread closes its own database connection afterwards — Django opens one
    per thread and leaving them open exhausts the pool.
    """
    import threading

    results, errors = [], []
    barrier = threading.Barrier(count)
    lock = threading.Lock()

    def worker(index):
        try:
            # Start together, so the threads genuinely contend rather than
            # running one after another by accident of scheduling.
            barrier.wait(timeout=10)
            outcome = target(index)
            with lock:
                results.append(outcome)
        except Exception as exc:  # noqa: BLE001 — the point is to collect these
            with lock:
                errors.append(exc)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    return results, errors


@skipUnlessDBFeature("has_select_for_update")
class LastUnitConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        if connection.vendor == "sqlite":
            self.skipTest(CONCURRENCY_MESSAGE)
        ensure_location()

    def test_two_simultaneous_checkouts_cannot_both_take_the_last_unit(self):
        variant = make_variant(sku="PN-LAST-ONE", stock=1)

        def attempt(index):
            try:
                services.reserve(
                    variant=variant, quantity=1, reference=f"checkout:{index}"
                )
                return "reserved"
            except services.InsufficientStock:
                return "refused"

        results, errors = run_concurrently(attempt, 2)

        self.assertEqual(errors, [], f"unexpected errors: {errors}")
        self.assertEqual(sorted(results), ["refused", "reserved"])

        balance = InventoryBalance.objects.get(variant=variant)
        self.assertEqual(balance.reserved, 1)
        self.assertEqual(balance.available, 0)
        self.assertEqual(
            StockReservation.objects.filter(status=StockReservation.ACTIVE).count(), 1
        )

    def test_ten_customers_racing_for_three_units_yields_exactly_three(self):
        variant = make_variant(sku="PN-THREE-LEFT", stock=3)

        def attempt(index):
            try:
                services.reserve(variant=variant, quantity=1, reference=f"checkout:{index}")
                return "reserved"
            except services.InsufficientStock:
                return "refused"

        results, errors = run_concurrently(attempt, 10)

        self.assertEqual(errors, [], f"unexpected errors: {errors}")
        self.assertEqual(results.count("reserved"), 3)
        self.assertEqual(results.count("refused"), 7)

        balance = InventoryBalance.objects.get(variant=variant)
        self.assertEqual(balance.reserved, 3)
        self.assertEqual(balance.available, 0)

    def test_concurrent_commits_of_one_checkout_sell_the_goods_once(self):
        """Two webhook deliveries arriving together must not sell twice."""
        variant = make_variant(sku="PN-DOUBLE-WEBHOOK", stock=10)
        services.reserve(variant=variant, quantity=4, reference="checkout:1")

        def attempt(index):
            return len(services.commit(reference="checkout:1"))

        results, errors = run_concurrently(attempt, 2)

        self.assertEqual(errors, [], f"unexpected errors: {errors}")
        # One call does the work, the other finds nothing active.
        self.assertEqual(sorted(results), [0, 1])

        balance = InventoryBalance.objects.get(variant=variant)
        self.assertEqual(balance.on_hand, 6)
        self.assertEqual(balance.reserved, 0)
        self.assertEqual(
            StockMovement.objects.filter(movement_type=StockMovement.SALE).count(), 1
        )

    def test_concurrent_sell_and_adjust_never_produces_negative_stock(self):
        variant = make_variant(sku="PN-RACE-ADJUST", stock=5)

        def attempt(index):
            if index % 2 == 0:
                try:
                    services.reserve(
                        variant=variant, quantity=1, reference=f"checkout:{index}"
                    )
                    services.commit(reference=f"checkout:{index}")
                    return "sold"
                except services.InsufficientStock:
                    return "refused"
            try:
                services.adjust_stock(
                    variant=variant, delta=-1,
                    movement_type=StockMovement.DAMAGE, reason="Concurrent write-off",
                )
                return "written-off"
            except Exception:  # noqa: BLE001 — refusal is a valid outcome here
                return "refused"

        _, errors = run_concurrently(attempt, 8)

        self.assertEqual(errors, [], f"unexpected errors: {errors}")

        balance = InventoryBalance.objects.get(variant=variant)
        self.assertGreaterEqual(balance.on_hand, 0)
        self.assertGreaterEqual(balance.reserved, 0)
        self.assertGreaterEqual(balance.available, 0)
        self.assertEqual(services.verify_ledger_matches_balances(), [])


@skipUnlessDBFeature("has_select_for_update")
class CouponConcurrencyTests(TransactionTestCase):
    """A coupon limited to one use must be redeemed once, not once per thread."""

    reset_sequences = True

    def setUp(self):
        if connection.vendor == "sqlite":
            self.skipTest(CONCURRENCY_MESSAGE)
        ensure_location()

    def test_a_single_use_coupon_cannot_be_redeemed_twice(self):
        from django.utils import timezone

        from orders.services import PromotionService
        from promotions.models import Promotion

        promotion = Promotion.objects.create(
            code="ONLYONE",
            discount_percentage=50,
            valid_to=timezone.now() + timezone.timedelta(days=1),
            usage_limit=1,
            used_count=0,
        )

        def attempt(index):
            from django.core.exceptions import ValidationError

            try:
                PromotionService.consume_redemption(
                    Promotion.objects.get(pk=promotion.pk)
                )
                return "redeemed"
            except ValidationError:
                return "refused"

        results, errors = run_concurrently(attempt, 6)

        self.assertEqual(errors, [], f"unexpected errors: {errors}")
        self.assertEqual(results.count("redeemed"), 1)

        promotion.refresh_from_db()
        self.assertEqual(promotion.used_count, 1)
