"""Revenue means money received.

The dashboard used to sum every non-cancelled order and call it revenue, which
counted unpaid COD, pending payments and failed payments. These tests pin the
definition down and check that the order-level and item-level widgets report the
same population.
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem
from products.models import Category, Product
from storefront import metrics
from users.models import User


#: The legacy combined status, mapped to the fulfilment status that now carries
#: the meaning. Metrics key on fulfilment_status, because that is what
#: Order.is_settled uses and the two must not drift apart.
FULFILMENT_FOR = {
    "PENDING": Order.FULFILMENT_PENDING_CONFIRMATION,
    "CONFIRMED": Order.FULFILMENT_CONFIRMED,
    "SHIPPED": Order.FULFILMENT_SHIPPED,
    "DELIVERED": Order.FULFILMENT_DELIVERED,
    "CANCELLED": Order.FULFILMENT_CANCELLED,
}


def make_order(*, method, payment_status, status, total="1000.00"):
    order = Order.objects.create(
        guest_name="Customer",
        guest_email="c@example.com",
        guest_phone_number="03001234567",
        subtotal_amount=Decimal(total),
        total_amount=Decimal(total),
        shipping_address="addr",
        payment_method=method,
        payment_status=payment_status,
        fulfilment_status=FULFILMENT_FOR[status],
        status=status,
    )
    OrderItem.objects.create(
        order=order,
        product=None,
        product_name="Whey Gold",
        quantity=1,
        price=Decimal(total),
    )
    return order


class SettledRevenueTests(TestCase):
    def test_pending_cod_is_not_revenue(self):
        make_order(method="COD", payment_status="PENDING", status="PENDING")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))

    def test_confirmed_but_undelivered_cod_is_not_revenue(self):
        make_order(method="COD", payment_status="PENDING", status="SHIPPED")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))

    def test_delivered_cod_is_revenue(self):
        make_order(method="COD", payment_status="PENDING", status="DELIVERED")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("1000.00"))

    def test_failed_online_payment_is_not_revenue(self):
        make_order(method="SAFEPAY", payment_status="FAILED", status="PENDING")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))

    def test_pending_online_payment_is_not_revenue(self):
        make_order(method="SAFEPAY", payment_status="PENDING", status="PENDING")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))

    def test_paid_online_payment_is_revenue(self):
        make_order(method="SAFEPAY", payment_status="PAID", status="CONFIRMED")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("1000.00"))

    def test_cancelled_order_is_never_revenue_even_if_paid(self):
        make_order(method="SAFEPAY", payment_status="PAID", status="CANCELLED")
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))

    def test_pending_cod_is_reported_separately(self):
        make_order(method="COD", payment_status="PENDING", status="CONFIRMED", total="750.00")
        self.assertEqual(metrics.pending_cod_value(), Decimal("750.00"))
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))

    def test_payment_split_adds_up_to_settled_revenue(self):
        make_order(method="SAFEPAY", payment_status="PAID", status="CONFIRMED", total="400.00")
        make_order(method="COD", payment_status="PENDING", status="DELIVERED", total="600.00")

        split = metrics.payment_split()
        self.assertEqual(split["online_revenue"], Decimal("400.00"))
        self.assertEqual(split["cod_revenue"], Decimal("600.00"))
        self.assertEqual(
            split["online_revenue"] + split["cod_revenue"],
            metrics.revenue_summary()["revenue"],
        )

    def test_order_and_item_populations_agree(self):
        """The two widgets must never describe different populations."""
        make_order(method="SAFEPAY", payment_status="PAID", status="CONFIRMED", total="500.00")
        make_order(method="COD", payment_status="PENDING", status="PENDING", total="900.00")
        make_order(method="COD", payment_status="PENDING", status="DELIVERED", total="300.00")

        order_revenue = metrics.revenue_summary()["revenue"]
        item_revenue = sum(
            item.price * item.quantity
            for item in OrderItem.objects.filter(metrics.settled_revenue_q_for_items())
        )
        self.assertEqual(order_revenue, Decimal("800.00"))
        self.assertEqual(item_revenue, order_revenue)

    def test_average_order_value_uses_the_settled_population(self):
        make_order(method="SAFEPAY", payment_status="PAID", status="CONFIRMED", total="1000.00")
        make_order(method="SAFEPAY", payment_status="PAID", status="CONFIRMED", total="3000.00")
        make_order(method="COD", payment_status="PENDING", status="PENDING", total="99999.00")

        summary = metrics.revenue_summary()
        self.assertEqual(summary["orders"], 2)
        self.assertEqual(summary["average_order_value"], Decimal("2000.00"))


class DashboardEndpointTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pw",
            name="Admin",
            is_staff=True,
        )
        # The API authenticates with JWT, not sessions, so force_authenticate
        # rather than force_login.
        self.client.force_authenticate(user=self.admin)

    def test_dashboard_publishes_its_metric_definitions(self):
        make_order(method="COD", payment_status="PENDING", status="PENDING", total="5000.00")
        response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("metric_definitions", body)
        self.assertIn("settled_revenue", body["metric_definitions"])
        # An unpaid, undelivered COD order is visible as pending, not revenue.
        self.assertEqual(Decimal(str(body["overview"]["total_revenue"])), Decimal("0.00"))
        self.assertEqual(
            Decimal(str(body["overview"]["pending_cod_value"])), Decimal("5000.00")
        )


class SettledDefinitionAgreementTests(TestCase):
    """The order property and the metrics query must never disagree.

    Two definitions of "settled" in one codebase is the exact failure this
    module was created to fix. These tests fail if they drift apart.
    """

    def _assert_agree(self):
        via_property = sorted(order.id for order in Order.objects.all() if order.is_settled)
        via_query = sorted(metrics.settled_orders().values_list("id", flat=True))
        self.assertEqual(
            via_property,
            via_query,
            "Order.is_settled and metrics.settled_orders() disagree",
        )

    def test_they_agree_across_every_combination(self):
        from orders.models import Order as OrderModel

        for method in ("COD", "SAFEPAY"):
            for payment in [code for code, _ in OrderModel.PAYMENT_STATUS_CHOICES]:
                for fulfilment in [code for code, _ in OrderModel.FULFILMENT_STATUS_CHOICES]:
                    OrderModel.objects.create(
                        guest_name="C",
                        guest_email="c@example.com",
                        guest_phone_number="03001234567",
                        subtotal_amount=Decimal("100.00"),
                        total_amount=Decimal("100.00"),
                        shipping_address="addr",
                        payment_method=method,
                        payment_status=payment,
                        fulfilment_status=fulfilment,
                    )

        self.assertGreater(Order.objects.count(), 50)
        self._assert_agree()

    def test_a_cancelled_paid_order_is_not_settled_either_way(self):
        from orders.models import Order as OrderModel

        OrderModel.objects.create(
            guest_name="C", guest_email="c@example.com", guest_phone_number="0300",
            subtotal_amount=Decimal("100.00"), total_amount=Decimal("100.00"),
            shipping_address="addr", payment_method="SAFEPAY",
            payment_status=OrderModel.PAYMENT_PAID,
            fulfilment_status=OrderModel.FULFILMENT_CANCELLED,
        )
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("0.00"))
        self._assert_agree()

    def test_a_partially_refunded_order_still_counts(self):
        """Money was received and some was returned. Two facts, not one."""
        from orders.models import Order as OrderModel

        OrderModel.objects.create(
            guest_name="C", guest_email="c@example.com", guest_phone_number="0300",
            subtotal_amount=Decimal("100.00"), total_amount=Decimal("100.00"),
            refunded_amount=Decimal("30.00"),
            shipping_address="addr", payment_method="SAFEPAY",
            payment_status=OrderModel.PAYMENT_PARTIALLY_REFUNDED,
            fulfilment_status=OrderModel.FULFILMENT_DELIVERED,
        )
        # Not netted off: the refund is reported separately.
        self.assertEqual(metrics.revenue_summary()["revenue"], Decimal("100.00"))
        self._assert_agree()


class InventoryHealthMetricTests(TestCase):
    """Stock figures come from the ledger, not the legacy product column."""

    def _variant(self, *, stock, slug, threshold=5):
        from inventory.models import InventoryBalance
        from products.models import Category, Product

        category, _ = Category.objects.get_or_create(
            slug="protein", defaults={"name": "Protein"}
        )
        product = Product.objects.create(
            name=slug, slug=slug, category=category, brand="B", weight="2kg",
            description="x", price=Decimal("1000.00"), stock=stock,
        )
        variant = product.variants.get()
        InventoryBalance.objects.filter(variant=variant).update(low_stock_threshold=threshold)
        return variant

    def test_reserved_units_count_against_availability(self):
        """The bug the legacy column could not express: 10 on hand, 9 reserved."""
        from inventory import services

        variant = self._variant(stock=10, slug="nearly-gone", threshold=5)
        services.reserve(variant=variant, quantity=9, reference="order:1")

        health = metrics.inventory_health()
        self.assertEqual(health["low_stock"], 1)
        self.assertEqual(health["units_reserved"], 9)

    def test_a_per_item_threshold_is_respected(self):
        """Not one hardcoded number for a 5-rupee sachet and a 20kg sack."""
        self._variant(stock=10, slug="high-threshold", threshold=20)
        self._variant(stock=10, slug="low-threshold", threshold=2)

        self.assertEqual(metrics.inventory_health()["low_stock"], 1)

    def test_never_counted_balances_are_surfaced(self):
        self._variant(stock=10, slug="unverified")
        self.assertEqual(metrics.inventory_health()["never_counted"], 1)

    def test_low_stock_items_lists_the_worst_first(self):
        self._variant(stock=1, slug="worst", threshold=5)
        self._variant(stock=4, slug="better", threshold=5)

        rows = metrics.low_stock_items()
        self.assertEqual([row["available"] for row in rows], [1, 4])
        self.assertTrue(rows[0]["never_counted"])


class TopSellerTests(TestCase):
    def test_top_sellers_are_reported_by_sku_not_product(self):
        """Two flavours of one product are different things to reorder."""
        from orders.models import Order as OrderModel, OrderItem

        order = OrderModel.objects.create(
            guest_name="C", guest_email="c@example.com", guest_phone_number="0300",
            subtotal_amount=Decimal("300.00"), total_amount=Decimal("300.00"),
            shipping_address="addr", payment_method="SAFEPAY",
            payment_status=OrderModel.PAYMENT_PAID,
            fulfilment_status=OrderModel.FULFILMENT_DELIVERED,
        )
        for sku, variant, quantity in (
            ("PN-WHEY-CHOC", "Chocolate, 2kg", 5),
            ("PN-WHEY-VAN", "Vanilla, 2kg", 2),
        ):
            OrderItem.objects.create(
                order=order, product_name="Whey Gold", sku=sku,
                variant_description=variant, brand_name="Optimum Nutrition",
                quantity=quantity, price=Decimal("100.00"),
                line_total=Decimal("100.00") * quantity,
            )

        rows = metrics.top_skus()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["sku"], "PN-WHEY-CHOC")
        self.assertEqual(rows[0]["units"], 5)

        brands = metrics.top_brands()
        self.assertEqual(brands[0]["brand"], "Optimum Nutrition")
        self.assertEqual(brands[0]["units"], 7)

    def test_unsettled_orders_do_not_appear_in_top_sellers(self):
        from orders.models import Order as OrderModel, OrderItem

        order = OrderModel.objects.create(
            guest_name="C", guest_email="c@example.com", guest_phone_number="0300",
            subtotal_amount=Decimal("100.00"), total_amount=Decimal("100.00"),
            shipping_address="addr", payment_method="COD",
            payment_status=OrderModel.PAYMENT_COD_PENDING,
            fulfilment_status=OrderModel.FULFILMENT_SHIPPED,
        )
        OrderItem.objects.create(
            order=order, product_name="Whey", sku="PN-X", quantity=9,
            price=Decimal("100.00"), line_total=Decimal("900.00"),
        )
        self.assertEqual(metrics.top_skus(), [])
