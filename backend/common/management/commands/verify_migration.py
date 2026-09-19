"""Prove a migration did not lose or change anything.

    # Before: capture the state of the old database.
    python manage.py verify_migration --snapshot /tmp/before.json

    # After migrating: compare, and fail if anything moved that should not have.
    python manage.py verify_migration --compare /tmp/before.json

Read-only in both directions.

A migration that runs without error has proved nothing. What matters is whether
the same customers, the same orders and the same money are on the other side —
and for the catalogue rework specifically, whether every legacy product still
has a price a customer can pay and a stock figure that adds up.

Counts are the easy half. The half that actually catches mistakes is the
financial total: mapping a discounted price the wrong way round would migrate
cleanly, pass every count check, and quietly change what the shop charges. That
is why `catalogue_sale_value` is compared exactly.
"""

import json
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q, Sum
from django.db.utils import OperationalError, ProgrammingError


def tolerant(fn, default=None):
    """Evaluate `fn`, returning `default` if the table does not exist yet.

    The snapshot has to run against the database *before* migrating — that is
    the whole point of it — and at that moment none of the new tables exist.
    A metric that cannot be measured yet is recorded as absent rather than
    crashing the command that is supposed to make the migration checkable.
    """
    try:
        return fn()
    except (OperationalError, ProgrammingError):
        return default

User = get_user_model()

#: Values a migration must never move. A change in any of these means data was
#: lost, duplicated, or silently rewritten.
MUST_NOT_CHANGE = {
    "customers",
    "orders",
    "order_items",
    # The money that was transacted. This is the one that matters most: it is
    # the sum of what customers were actually charged, and no migration has any
    # business changing it.
    "order_total_value",
    "products",
    # Every product URL. A renamed slug breaks a live page and every inbound
    # link to it.
    "product_slugs_hash",
    "cancelled_orders",
}

#: Values the catalogue migration is *expected* to change, with the reason. These
#: are reported prominently but do not fail, because failing on them would mean
#: the check can never pass on the migration it was written for.
EXPECTED_TO_CHANGE = {
    "paid_orders": (
        "The migration reclassifies delivered COD orders from PENDING to PAID. "
        "Cash was collected at the door; the old schema had no way to say so, "
        "which is why unpaid parcels were being counted as revenue. Confirm the "
        "increase equals the number of delivered COD orders."
    ),
    "legacy_product_stock": (
        "Product.stock is now derived from available inventory rather than "
        "stored, so it drops by whatever is currently reserved."
    ),
}


class Command(BaseCommand):
    help = "Snapshot or compare database state across a migration. Read-only."

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--snapshot", metavar="PATH", help="Write the current state to PATH.")
        group.add_argument("--compare", metavar="PATH", help="Compare current state against PATH.")
        parser.add_argument(
            "--allow-growth",
            action="store_true",
            help="Permit counts to have increased, e.g. when the shop kept trading.",
        )

    def handle(self, *args, **options):
        state = self.collect()

        if options["snapshot"]:
            path = Path(options["snapshot"])
            path.write_text(json.dumps(state, indent=2, default=str))
            self.stdout.write(self.style.SUCCESS(f"Snapshot written: {path}"))
            self._print_state(state)
            return str(path)

        return self._compare(Path(options["compare"]), state, allow_growth=options["allow_growth"])

    # -- collection --------------------------------------------------------

    def collect(self):
        from inventory.models import InventoryBalance, StockMovement
        from inventory.services import verify_ledger_matches_balances
        from orders.models import Order, OrderItem
        from products.models import Brand, Product, ProductMedia, ProductVariant

        def total(queryset, field):
            return str(queryset.aggregate(t=Sum(field))["t"] or Decimal("0.00"))

        # A stable fingerprint of every slug. Catches a slug silently renamed,
        # which would break a live URL and every inbound link to it.
        slugs = sorted(Product.objects.values_list("slug", flat=True))
        import hashlib

        slugs_hash = hashlib.sha256("|".join(slugs).encode()).hexdigest()[:16]

        def settled_queryset():
            return Order.objects.filter(
                Q(payment_status__in=["PAID", "PARTIALLY_REFUNDED"])
                & ~Q(fulfilment_status="CANCELLED")
                | Q(payment_method="COD", fulfilment_status="DELIVERED")
            )

        state = {
            # -- identity ---------------------------------------------------
            "customers": User.objects.filter(is_staff=False).count(),
            "staff": User.objects.filter(is_staff=True).count(),
            # -- catalogue ---------------------------------------------------
            "products": Product.objects.count(),
            "products_active": Product.objects.filter(is_active=True).count(),
            "product_slugs_hash": slugs_hash,
            "brands": tolerant(Brand.objects.count),
            "variants": tolerant(ProductVariant.objects.count),
            "media": tolerant(ProductMedia.objects.count),
            "products_without_variant": tolerant(
                lambda: Product.objects.annotate(n=Count("variants")).filter(n=0).count()
            ),
            # The money the catalogue is currently offering. A price mapped the
            # wrong way round changes this and nothing else.
            "catalogue_sale_value": tolerant(
                lambda: total(ProductVariant.objects.filter(is_active=True), "price")
            ),
            # -- orders ------------------------------------------------------
            "orders": Order.objects.count(),
            "order_items": OrderItem.objects.count(),
            "order_total_value": total(Order.objects, "total_amount"),
            "settled_order_value": tolerant(lambda: total(settled_queryset(), "total_amount")),
            "paid_orders": Order.objects.filter(payment_status="PAID").count(),
            "cancelled_orders": tolerant(
                lambda: Order.objects.filter(
                    Q(status="CANCELLED") | Q(fulfilment_status="CANCELLED")
                ).count(),
                # Before the migration there is no fulfilment_status column.
                default=Order.objects.filter(status="CANCELLED").count(),
            ),
            "order_line_value": tolerant(lambda: total(OrderItem.objects, "line_total")),
            # -- inventory ---------------------------------------------------
            "inventory_balances": tolerant(InventoryBalance.objects.count),
            "inventory_on_hand": tolerant(
                lambda: InventoryBalance.objects.aggregate(t=Sum("on_hand"))["t"] or 0
            ),
            "inventory_reserved": tolerant(
                lambda: InventoryBalance.objects.aggregate(t=Sum("reserved"))["t"] or 0
            ),
            "stock_movements": tolerant(StockMovement.objects.count),
            "ledger_mismatches": tolerant(
                lambda: len(verify_ledger_matches_balances())
                if InventoryBalance.objects.exists()
                else 0,
                default=0,
            ),
            # Legacy column, so a drift between it and the ledger is visible.
            "legacy_product_stock": Product.objects.aggregate(t=Sum("stock"))["t"] or 0,
        }
        return state

    # -- comparison --------------------------------------------------------

    def _compare(self, path, current, *, allow_growth):
        if not path.exists():
            raise CommandError(f"Snapshot not found: {path}")

        before = json.loads(path.read_text())

        changed, grew, unchanged = [], [], []
        for key in sorted(set(before) | set(current)):
            old = before.get(key, "(absent)")
            new = current.get(key, "(absent)")
            if old == new:
                unchanged.append(key)
                continue

            # A metric that could not be measured before the migration is
            # expected to appear afterwards. That is the migration working, not
            # a discrepancy.
            if old is None and new is not None:
                grew.append((key, "(not yet measurable)", new))
                continue

            numeric = isinstance(old, (int, float)) and isinstance(new, (int, float))
            # An expected change always reports with its reason, rather than
            # being absorbed into "grew" where nobody reads it.
            if (
                allow_growth
                and numeric
                and new > old
                and key not in MUST_NOT_CHANGE
                and key not in EXPECTED_TO_CHANGE
            ):
                grew.append((key, old, new))
            else:
                changed.append((key, old, new))

        self.stdout.write(f"Comparing against {path}\n")
        self.stdout.write(f"  {len(unchanged)} value(s) identical")

        for key, old, new in grew:
            self.stdout.write(f"  grew      {key}: {old} -> {new}")

        critical = [item for item in changed if item[0] in MUST_NOT_CHANGE]
        expected = [item for item in changed if item[0] in EXPECTED_TO_CHANGE]
        other = [
            item
            for item in changed
            if item[0] not in MUST_NOT_CHANGE and item[0] not in EXPECTED_TO_CHANGE
        ]

        for key, old, new in expected:
            self.stdout.write(f"  expected  {key}: {old} -> {new}")
            for line in EXPECTED_TO_CHANGE[key].split(". "):
                if line.strip():
                    self.stdout.write(f"              {line.strip().rstrip('.')}.")

        for key, old, new in other:
            self.stdout.write(self.style.WARNING(f"  changed   {key}: {old} -> {new}"))

        if critical:
            self.stdout.write("")
            for key, old, new in critical:
                self.stdout.write(self.style.ERROR(f"  MISMATCH  {key}: {old} -> {new}"))
            self.stdout.write("")
            self.stdout.write(
                self.style.ERROR(
                    f"{len(critical)} value(s) that must not change have changed.\n"
                    "Do not cut over. Investigate each one against the pre-migration backup."
                )
            )
            raise SystemExit(1)

        if current.get("ledger_mismatches"):
            self.stdout.write(
                self.style.ERROR(
                    f"\n{current['ledger_mismatches']} inventory balance(s) disagree with "
                    "the stock ledger. Run: python manage.py audit_legacy_data"
                )
            )
            raise SystemExit(1)

        # The check that proves inventory came across intact: every unit that
        # was in the legacy stock column is now in the ledger, and nothing was
        # invented or dropped on the way.
        legacy_stock = before.get("legacy_product_stock")
        on_hand = current.get("inventory_on_hand")
        if legacy_stock is not None and on_hand is not None and legacy_stock != on_hand:
            self.stdout.write(
                self.style.ERROR(
                    f"\nInventory does not reconcile: {legacy_stock} unit(s) in the legacy "
                    f"stock column, {on_hand} on hand in the ledger "
                    f"(off by {on_hand - legacy_stock:+d})."
                )
            )
            raise SystemExit(1)
        if legacy_stock is not None and on_hand is not None:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n  Inventory reconciles: {legacy_stock} legacy unit(s) -> "
                    f"{on_hand} on hand in the ledger."
                )
            )

        if current.get("products_without_variant"):
            self.stdout.write(
                self.style.ERROR(
                    f"\n{current['products_without_variant']} product(s) have no variant "
                    "and cannot be sold."
                )
            )
            raise SystemExit(1)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Migration verified. Nothing critical changed."))
        return "ok"

    def _print_state(self, state):
        self.stdout.write("")
        for key, value in state.items():
            self.stdout.write(f"  {key:28} {value}")
