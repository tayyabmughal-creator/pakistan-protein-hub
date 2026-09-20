"""Dashboard metric definitions.

Every metric on the admin dashboard is defined here, once, and every metric
publishes the definition it was computed from. This exists because the previous
dashboard called ``Order.objects.exclude(status="CANCELLED")`` "revenue" — a
population that includes orders whose payment is still PENDING, unpaid COD
orders that were never delivered, and orders whose payment outright FAILED.
Meanwhile the "top products" widget computed a *different* population from order
line items, so two numbers on the same screen could disagree while both being
labelled revenue.

The business rule
-----------------
**Settled revenue is money PakNutrition has actually received.**

* An online payment counts once the provider has confirmed it — ``payment_status
  = PAID``. The ``payments`` app is what sets that, only after server-to-server
  verification.
* A **COD order counts on delivery**, not on placement. A COD parcel is cash
  the rider has not collected yet; counting it at checkout books revenue for
  goods that may be refused at the door.
* Cancelled and failed orders never count.

Orders that are sold but not yet collected are reported separately as
``pending_cod_value`` so the number is visible without being mixed into revenue.
"""

from decimal import Decimal

from django.db.models import Avg, Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce

from orders.models import Order

#: Payment methods where money arrives at the door rather than up front.
COD_METHODS = {"COD"}

_MONEY = DecimalField(max_digits=12, decimal_places=2)


def _zero():
    return Value(Decimal("0.00"), output_field=_MONEY)


# --------------------------------------------------------------------------
# Populations — the single source of "which orders count".
# --------------------------------------------------------------------------


def settled_revenue_q() -> Q:
    """Orders whose money PakNutrition has actually received.

    Keyed on ``fulfilment_status``, not the legacy combined ``status``, so this
    is the same rule as ``Order.is_settled``. Two definitions of "settled" in
    one codebase is exactly the disagreement this module exists to prevent.

    A partially refunded order still counts: money was received, and some of it
    was returned. ``refunded_amount`` is reported separately rather than netted
    off here, because "we took 40,000 and gave back 5,000" is two facts.
    """
    settled_payment = Q(payment_status__in=Order.SETTLED_PAYMENT_STATUSES) & ~Q(
        fulfilment_status=Order.FULFILMENT_CANCELLED
    )
    cod_delivered = Q(payment_method__in=COD_METHODS) & Q(
        fulfilment_status=Order.FULFILMENT_DELIVERED
    )
    return settled_payment | cod_delivered


def pending_cod_q() -> Q:
    """COD orders sold but not yet collected — real, but not yet revenue."""
    return (
        Q(payment_method__in=COD_METHODS)
        & ~Q(
            fulfilment_status__in=[
                Order.FULFILMENT_DELIVERED,
                Order.FULFILMENT_CANCELLED,
            ]
        )
        & ~Q(payment_status__in=Order.SETTLED_PAYMENT_STATUSES)
    )


def settled_revenue_q_for_items() -> Q:
    """The same population, expressed for a queryset rooted at OrderItem.

    Kept next to ``settled_revenue_q`` deliberately: when the rule changes, both
    forms are in front of you. A product-level widget and an order-level widget
    drifting apart is exactly the bug this module exists to prevent.
    """
    settled_payment = Q(order__payment_status__in=Order.SETTLED_PAYMENT_STATUSES) & ~Q(
        order__fulfilment_status=Order.FULFILMENT_CANCELLED
    )
    cod_delivered = Q(order__payment_method__in=COD_METHODS) & Q(
        order__fulfilment_status=Order.FULFILMENT_DELIVERED
    )
    return settled_payment | cod_delivered


def settled_orders():
    return Order.objects.filter(settled_revenue_q())


#: Published alongside every figure so a reader can check what it counted.
METRIC_DEFINITIONS = {
    "settled_revenue": (
        "Sum of total_amount for orders that are paid online (payment_status=PAID, "
        "not cancelled) or COD orders that reached DELIVERED. Excludes pending, "
        "failed and cancelled orders."
    ),
    "monthly_settled_revenue": "settled_revenue restricted to orders created this calendar month.",
    "pending_cod_value": (
        "Sum of total_amount for COD orders not yet delivered and not cancelled. "
        "Cash not yet collected — deliberately NOT counted as revenue."
    ),
    "avg_order_value": "settled_revenue divided by the number of settled orders.",
    "gross_orders": "Every order ever placed, regardless of payment or fulfilment state.",
    "revenue_trend": "settled_revenue grouped by calendar month of order creation.",
    "top_products": (
        "Units and value from order items belonging to settled orders — the same "
        "population as settled_revenue, so the two agree."
    ),
    "low_stock": (
        "Active variants whose available stock (on hand minus reserved) is at or "
        "below that item's own low-stock threshold. Read from the inventory "
        "ledger, not the legacy product column."
    ),
    "out_of_stock": "Active variants with nothing available to sell.",
    "never_counted": (
        "Balances migrated from the old stock column that have never been "
        "physically counted. These figures are unverified."
    ),
    "top_skus": (
        "Units and value by SKU over the settled population. By SKU rather than "
        "product, because two flavours of the same product are different things "
        "to reorder."
    ),
    "top_brands": "Units and value by brand over the settled population.",
    "open_returns": "Return requests not yet completed, rejected or cancelled.",
    "pending_orders": "Orders in PENDING status, awaiting staff confirmation.",
    "total_customers": "Non-staff user accounts.",
    "guest_orders": "Orders placed without an account.",
}


# --------------------------------------------------------------------------
# Aggregates
# --------------------------------------------------------------------------


def revenue_summary(*, since=None):
    """Settled revenue, order count and AOV over the settled population."""
    queryset = settled_orders()
    if since is not None:
        queryset = queryset.filter(created_at__gte=since)

    aggregate = queryset.aggregate(
        total=Coalesce(Sum("total_amount"), _zero(), output_field=_MONEY),
        orders=Count("id"),
        average=Coalesce(Avg("total_amount"), _zero(), output_field=_MONEY),
    )
    return {
        "revenue": aggregate["total"],
        "orders": aggregate["orders"],
        "average_order_value": aggregate["average"],
    }


def pending_cod_value():
    return Order.objects.filter(pending_cod_q()).aggregate(
        total=Coalesce(Sum("total_amount"), _zero(), output_field=_MONEY)
    )["total"]


def payment_split():
    """How settled revenue divides between online payment and cash on delivery."""
    queryset = settled_orders()
    online = queryset.exclude(payment_method__in=COD_METHODS).aggregate(
        total=Coalesce(Sum("total_amount"), _zero(), output_field=_MONEY),
        orders=Count("id"),
    )
    cod = queryset.filter(payment_method__in=COD_METHODS).aggregate(
        total=Coalesce(Sum("total_amount"), _zero(), output_field=_MONEY),
        orders=Count("id"),
    )
    return {
        "online_revenue": online["total"],
        "online_orders": online["orders"],
        "cod_revenue": cod["total"],
        "cod_orders": cod["orders"],
    }


# ---------------------------------------------------------------------------
# Inventory health
# ---------------------------------------------------------------------------
# These read the inventory ledger, not the legacy Product.stock column. That
# column is derived and carries a single hardcoded threshold, so it could not
# see reserved units or a per-item low-stock level — an item with 10 on hand and
# 9 reserved looked healthy while being one sale from unsellable.


def inventory_health():
    from django.db.models import F

    from inventory.models import InventoryBalance, InventoryLocation

    location = InventoryLocation.get_default()
    if location is None:
        return {
            "low_stock": 0,
            "out_of_stock": 0,
            "never_counted": 0,
            "units_on_hand": 0,
            "units_reserved": 0,
        }

    balances = InventoryBalance.objects.filter(location=location, variant__is_active=True)
    aggregate = balances.aggregate(on_hand=Sum("on_hand"), reserved=Sum("reserved"))

    return {
        # available > 0 but at or below this item's own threshold.
        "low_stock": balances.filter(
            on_hand__gt=F("reserved"),
            on_hand__lte=F("reserved") + F("low_stock_threshold"),
        ).count(),
        "out_of_stock": balances.filter(on_hand__lte=F("reserved")).count(),
        # Migrated from the old stock column and never reconciled against a shelf.
        "never_counted": balances.filter(last_counted_at__isnull=True).count(),
        "units_on_hand": aggregate["on_hand"] or 0,
        "units_reserved": aggregate["reserved"] or 0,
    }


def low_stock_items(limit=8):
    """The items closest to being unsellable, worst first."""
    from django.db.models import F, IntegerField, ExpressionWrapper

    from inventory.models import InventoryBalance, InventoryLocation

    location = InventoryLocation.get_default()
    if location is None:
        return []

    rows = (
        InventoryBalance.objects.filter(
            location=location,
            variant__is_active=True,
            on_hand__lte=F("reserved") + F("low_stock_threshold"),
        )
        .select_related("variant__product__brand_ref")
        .annotate(
            available_qty=ExpressionWrapper(
                F("on_hand") - F("reserved"), output_field=IntegerField()
            )
        )
        .order_by("available_qty")[:limit]
    )

    return [
        {
            "sku": row.variant.sku,
            "name": row.variant.product.name,
            "variant": row.variant.descriptor,
            "brand": (
                row.variant.product.brand_ref.name
                if row.variant.product.brand_ref_id
                else row.variant.product.brand
            ),
            "on_hand": row.on_hand,
            "reserved": row.reserved,
            "available": row.available_qty,
            "never_counted": row.last_counted_at is None,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Fulfilment and returns
# ---------------------------------------------------------------------------


def fulfilment_breakdown():
    """Orders by where the goods are, which is not where the money is."""
    from orders.models import Order

    labels = dict(Order.FULFILMENT_STATUS_CHOICES)
    counts = dict(
        Order.objects.values_list("fulfilment_status").annotate(n=Count("id"))
    )
    return [
        {"status": status, "label": label, "count": counts.get(status, 0)}
        for status, label in labels.items()
    ]


def payment_breakdown():
    from orders.models import Order

    labels = dict(Order.PAYMENT_STATUS_CHOICES)
    counts = dict(Order.objects.values_list("payment_status").annotate(n=Count("id")))
    return [
        {"status": status, "label": label, "count": counts.get(status, 0)}
        for status, label in labels.items()
    ]


def returns_summary():
    from orders.models import ReturnRequest

    open_statuses = [
        ReturnRequest.STATUS_REQUESTED,
        ReturnRequest.STATUS_APPROVED,
        ReturnRequest.STATUS_RECEIVED,
    ]
    return {
        "open": ReturnRequest.objects.filter(status__in=open_statuses).count(),
        "awaiting_decision": ReturnRequest.objects.filter(
            status=ReturnRequest.STATUS_REQUESTED
        ).count(),
        "refunded_value": str(
            ReturnRequest.objects.aggregate(t=Sum("refund_amount"))["t"] or Decimal("0.00")
        ),
    }


# ---------------------------------------------------------------------------
# What sells
# ---------------------------------------------------------------------------


def top_skus(limit=5):
    """Best sellers by SKU, over the settled population only.

    By SKU rather than product name, because "Whey Gold" in chocolate and in
    vanilla are different things to reorder.
    """
    from orders.models import OrderItem

    rows = (
        OrderItem.objects.filter(settled_revenue_q_for_items())
        .exclude(sku="")
        .values("sku", "product_name", "variant_description")
        .annotate(
            units=Coalesce(Sum("quantity"), 0),
            revenue=Coalesce(Sum("line_total"), _zero(), output_field=_MONEY),
        )
        .order_by("-units")[:limit]
    )
    return [
        {
            "sku": row["sku"],
            "name": row["product_name"],
            "variant": row["variant_description"],
            "units": row["units"],
            "revenue": str(row["revenue"]),
        }
        for row in rows
    ]


def top_brands(limit=5):
    from orders.models import OrderItem

    rows = (
        OrderItem.objects.filter(settled_revenue_q_for_items())
        .exclude(brand_name="")
        .values("brand_name")
        .annotate(
            units=Coalesce(Sum("quantity"), 0),
            revenue=Coalesce(Sum("line_total"), _zero(), output_field=_MONEY),
        )
        .order_by("-revenue")[:limit]
    )
    return [
        {"brand": row["brand_name"], "units": row["units"], "revenue": str(row["revenue"])}
        for row in rows
    ]
