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
    """Orders whose money PakNutrition has actually received."""
    online_paid = Q(payment_status="PAID") & ~Q(status="CANCELLED")
    cod_delivered = Q(payment_method__in=COD_METHODS) & Q(status="DELIVERED")
    return online_paid | cod_delivered


def pending_cod_q() -> Q:
    """COD orders sold but not yet collected — real, but not yet revenue."""
    return (
        Q(payment_method__in=COD_METHODS)
        & ~Q(status__in=["DELIVERED", "CANCELLED"])
        & ~Q(payment_status="PAID")
    )


def settled_revenue_q_for_items() -> Q:
    """The same population, expressed for a queryset rooted at OrderItem.

    Kept next to ``settled_revenue_q`` deliberately: when the rule changes, both
    forms are in front of you. A product-level widget and an order-level widget
    drifting apart is exactly the bug this module exists to prevent.
    """
    online_paid = Q(order__payment_status="PAID") & ~Q(order__status="CANCELLED")
    cod_delivered = Q(order__payment_method__in=COD_METHODS) & Q(order__status="DELIVERED")
    return online_paid | cod_delivered


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
    "low_stock_products": "Active products with stock <= 5.",
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
