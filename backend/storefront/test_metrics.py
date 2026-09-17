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
