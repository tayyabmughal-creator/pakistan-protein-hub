"""Report what is wrong with the data before anyone relies on it.

    python manage.py audit_legacy_data
    python manage.py audit_legacy_data --strict   # non-zero exit if anything is found

Read-only. Changes nothing, ever.

Run this before a migration rehearsal and again after cutover. It looks for the
things that are legal in the database but wrong for the business: products with
no sellable variant, balances that disagree with their ledger, orders whose
line totals do not add up, stock that has never been counted.

The point is to find these while someone is looking, rather than when a
customer does.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Count, F, Q, Sum

from inventory.models import InventoryBalance, StockReservation
from inventory.services import verify_ledger_matches_balances
from orders.models import Order, OrderItem
from products.models import Brand, Product, ProductMedia, ProductVariant


class Finding:
    def __init__(self, severity, title, detail, items=None):
        self.severity = severity  # "error" | "warning" | "info"
        self.title = title
        self.detail = detail
        self.items = items or []


class Command(BaseCommand):
    help = "Audit catalogue, inventory and order data for inconsistencies. Read-only."

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Exit non-zero if any error-level finding is reported.",
        )
        parser.add_argument("--limit", type=int, default=10, help="Examples to list per finding.")

    def handle(self, *args, **options):
        findings = []
        findings += self._audit_catalogue()
        findings += self._audit_inventory()
        findings += self._audit_orders()

        self._report(findings, limit=options["limit"])

        errors = [f for f in findings if f.severity == "error"]
        if options["strict"] and errors:
            self.stderr.write(
                self.style.ERROR(f"\n{len(errors)} error-level finding(s). Failing as requested.")
            )
            raise SystemExit(1)
        return f"{len(findings)} finding(s)"

    # -- catalogue ---------------------------------------------------------

    def _audit_catalogue(self):
        findings = []

        unsellable = Product.objects.annotate(n=Count("variants")).filter(n=0)
        if unsellable.exists():
            findings.append(
                Finding(
                    "error",
                    f"{unsellable.count()} product(s) have no variant",
                    "These have no SKU and no price, so they cannot be bought. They are "
                    "invisible failures: they look fine in the admin list.",
                    list(unsellable.values_list("slug", flat=True)),
                )
            )

        no_default = (
            Product.objects.annotate(
                n=Count("variants"),
                defaults=Count("variants", filter=Q(variants__is_default=True)),
            )
            .filter(n__gt=0, defaults=0)
        )
        if no_default.exists():
            findings.append(
                Finding(
                    "error",
                    f"{no_default.count()} product(s) have variants but no default",
                    "The product page has nothing to open on.",
                    list(no_default.values_list("slug", flat=True)),
                )
            )

        free_priced = ProductVariant.objects.filter(price__lte=Decimal("0.00"), is_active=True)
        if free_priced.exists():
            findings.append(
                Finding(
                    "error",
                    f"{free_priced.count()} active variant(s) are priced at zero",
                    "These are sellable for nothing.",
                    list(free_priced.values_list("sku", flat=True)),
                )
            )

        fake_discounts = ProductVariant.objects.filter(
            compare_at_price__isnull=False, compare_at_price__lte=F("price")
        )
        if fake_discounts.exists():
            findings.append(
                Finding(
                    "warning",
                    f"{fake_discounts.count()} variant(s) have a compare-at price that is not a saving",
                    "A compare-at price at or below the selling price is not a discount. "
                    "It will not display as one, but it should be cleared.",
                    list(fake_discounts.values_list("sku", flat=True)),
                )
            )

        no_media = Product.objects.annotate(n=Count("media")).filter(n=0, is_active=True)
        if no_media.exists():
            findings.append(
                Finding(
                    "warning",
                    f"{no_media.count()} active product(s) have no image",
                    "Supplements do not sell without a picture of the tub.",
                    list(no_media.values_list("slug", flat=True)),
                )
            )

        no_alt = ProductMedia.objects.filter(alt_text="")
        if no_alt.exists():
            findings.append(
                Finding(
                    "warning",
                    f"{no_alt.count()} image(s) have no alt text",
                    "An accessibility failure on every page they appear on, and invisible "
                    "to image search.",
                )
            )

        unbranded = Product.objects.filter(brand_ref__isnull=True)
        if unbranded.exists():
            findings.append(
                Finding(
                    "warning",
                    f"{unbranded.count()} product(s) are not linked to a Brand",
                    "They will not appear under any brand filter or brand page.",
                    list(unbranded.values_list("slug", flat=True)),
                )
            )

        duplicate_brands = self._near_duplicate_brands()
        if duplicate_brands:
            findings.append(
                Finding(
                    "warning",
                    f"{len(duplicate_brands)} possible duplicate brand name(s)",
                    "These differ only by case, spacing or punctuation and are probably "
                    "the same company split into several brands.",
                    duplicate_brands,
                )
            )

        return findings

    @staticmethod
    def _near_duplicate_brands():
        seen = {}
        duplicates = []
        for name in Brand.objects.values_list("name", flat=True):
            key = "".join(ch for ch in name.lower() if ch.isalnum())
            if key in seen:
                duplicates.append(f"{seen[key]!r} / {name!r}")
            else:
                seen[key] = name
        return duplicates

    # -- inventory ---------------------------------------------------------

    def _audit_inventory(self):
        findings = []

        mismatches = verify_ledger_matches_balances()
        if mismatches:
            findings.append(
                Finding(
                    "error",
                    f"{len(mismatches)} balance(s) disagree with the stock ledger",
                    "The balance is a cache of the ledger. A disagreement means something "
                    "wrote stock without recording why.",
                    [
                        f"{m['sku']}: on_hand={m['on_hand']} ledger={m['ledger_total']} "
                        f"(off by {m['difference']:+d})"
                        for m in mismatches
                    ],
                )
            )

        never_counted = InventoryBalance.objects.filter(
            last_counted_at__isnull=True, on_hand__gt=0
        )
        if never_counted.exists():
            findings.append(
                Finding(
                    "warning",
                    f"{never_counted.count()} balance(s) have never been physically counted",
                    "These came from the legacy Product.stock column, which nothing ever "
                    "reconciled against a shelf. Do a stocktake before trusting them: "
                    "python manage.py shell -c \"...set_counted_quantity(...)\"",
                )
            )

        stale = StockReservation.objects.filter(status=StockReservation.ACTIVE).count()
        if stale:
            findings.append(
                Finding(
                    "info",
                    f"{stale} active stock reservation(s)",
                    "Stock held for checkouts in progress. Expired ones are released by "
                    "inventory.services.release_expired_reservations.",
                )
            )

        out_of_stock = InventoryBalance.objects.filter(
            on_hand__lte=F("reserved"), variant__is_active=True
        )
        if out_of_stock.exists():
            findings.append(
                Finding(
                    "info",
                    f"{out_of_stock.count()} active variant(s) are out of stock",
                    "Nothing available to sell.",
                )
            )

        return findings

    # -- orders ------------------------------------------------------------

    def _audit_orders(self):
        findings = []

        no_sku = OrderItem.objects.filter(sku="")
        if no_sku.exists():
            findings.append(
                Finding(
                    "warning",
                    f"{no_sku.count()} order line(s) have no SKU recorded",
                    "Pre-migration lines whose product has since been deleted. They keep "
                    "their name and price, so the financial record is intact, but they "
                    "cannot be reported on by SKU.",
                )
            )

        bad_totals = []
        for item in OrderItem.objects.exclude(line_total=0).iterator():
            if item.line_total != item.computed_line_total:
                bad_totals.append(
                    f"order {item.order_id} line {item.id}: stored={item.line_total} "
                    f"computed={item.computed_line_total}"
                )
        if bad_totals:
            findings.append(
                Finding(
                    "error",
                    f"{len(bad_totals)} order line(s) do not add up",
                    "The stored line total differs from price x quantity - discount.",
                    bad_totals,
                )
            )

        # A paid order that never took its goods out of inventory has been sold
        # twice as far as stock is concerned.
        uncommitted = Order.objects.filter(
            payment_status=Order.PAYMENT_PAID, inventory_committed=False
        ).exclude(fulfilment_status=Order.FULFILMENT_CANCELLED)
        if uncommitted.exists():
            findings.append(
                Finding(
                    "error",
                    f"{uncommitted.count()} paid order(s) never drew down stock",
                    "The customer paid and the goods were never taken out of inventory, "
                    "so they are still being offered for sale.",
                    list(uncommitted.values_list("id", flat=True)),
                )
            )

        contradictory = Order.objects.filter(
            fulfilment_status=Order.FULFILMENT_CANCELLED, payment_status=Order.PAYMENT_PAID
        )
        if contradictory.exists():
            findings.append(
                Finding(
                    "error",
                    f"{contradictory.count()} cancelled order(s) are still marked paid",
                    "Either the money should have been refunded, or the order should not "
                    "be cancelled. Neither the customer nor the accounts are right here.",
                    list(contradictory.values_list("id", flat=True)),
                )
            )

        over_refunded = Order.objects.filter(refunded_amount__gt=F("total_amount"))
        if over_refunded.exists():
            findings.append(
                Finding(
                    "error",
                    f"{over_refunded.count()} order(s) are refunded for more than they were worth",
                    "",
                    list(over_refunded.values_list("id", flat=True)),
                )
            )

        return findings

    # -- output ------------------------------------------------------------

    def _report(self, findings, *, limit):
        if not findings:
            self.stdout.write(self.style.SUCCESS("No issues found."))
            return

        styles = {
            "error": self.style.ERROR,
            "warning": self.style.WARNING,
            "info": lambda text: text,
        }
        labels = {"error": "ERROR  ", "warning": "WARNING", "info": "INFO   "}

        counts = {"error": 0, "warning": 0, "info": 0}
        for finding in findings:
            counts[finding.severity] += 1
            style = styles[finding.severity]
            self.stdout.write("")
            self.stdout.write(style(f"{labels[finding.severity]} {finding.title}"))
            if finding.detail:
                for line in finding.detail.split("\n"):
                    self.stdout.write(f"         {line}")
            for example in finding.items[:limit]:
                self.stdout.write(f"           - {example}")
            if len(finding.items) > limit:
                self.stdout.write(f"           … and {len(finding.items) - limit} more")

        self.stdout.write("")
        self.stdout.write(
            f"{counts['error']} error(s), {counts['warning']} warning(s), {counts['info']} note(s)."
        )
