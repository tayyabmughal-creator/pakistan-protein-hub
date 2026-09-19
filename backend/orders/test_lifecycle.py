"""Order lifecycle: two statuses, explicit stock consequences, returns.

The property these exist to protect: an order's payment state and its
fulfilment state move independently, and every move that touches stock says so
in the ledger.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from inventory import services as inventory_services
from inventory.models import InventoryBalance, StockMovement
from orders.models import Order, OrderHistory, ReturnRequest
from orders.services import OrderService, OrderTransitionService, ReturnService
from products.models import Category, Product
from users.models import Address, User


def make_product(*, name="Whey Gold", stock=20, price="10000.00", slug=None):
    category, _ = Category.objects.get_or_create(slug="protein", defaults={"name": "Protein"})
    return Product.objects.create(
        name=name,
        slug=slug or name.lower().replace(" ", "-"),
        category=category,
        brand="Optimum Nutrition",
        weight="2kg",
        description="x",
        price=Decimal(price),
        stock=stock,
    )


class CodOrderLifecycleTests(TestCase):
    """The path that carries most of the business."""

    def setUp(self):
        self.product = make_product(stock=20)
        self.order = OrderService.create_guest_order(
            guest_name="Customer",
            guest_email="c@example.com",
            guest_phone_number="03001234567",
            city="Lahore",
            area="Gulberg",
            street="1 Main St",
            items=[{"product": self.product, "quantity": 2}],
            payment_method="COD",
        )

    def test_a_cod_order_is_money_owed_not_money_received(self):
        self.assertEqual(self.order.payment_status, Order.PAYMENT_COD_PENDING)
        self.assertEqual(self.order.fulfilment_status, Order.FULFILMENT_PENDING_CONFIRMATION)
        self.assertFalse(self.order.is_settled)

    def test_the_line_snapshot_carries_everything_a_receipt_needs(self):
        item = self.order.items.get()
        variant = self.product.variants.get()

        self.assertEqual(item.sku, variant.sku)
        self.assertEqual(item.brand_name, "Optimum Nutrition")
        self.assertEqual(item.variant_description, "2kg")
        self.assertEqual(item.line_total, Decimal("20000.00"))

    def test_a_later_catalogue_edit_does_not_rewrite_the_order(self):
        """An order is a financial record, not a view over live catalogue data."""
        item = self.order.items.get()

        self.product.name = "Renamed Product"
        self.product.price = Decimal("99999.00")
        self.product.save()

        item.refresh_from_db()
        self.assertEqual(item.product_name, "Whey Gold")
        self.assertEqual(item.price, Decimal("10000.00"))
        self.assertEqual(item.line_total, Decimal("20000.00"))

    def test_delivery_collects_the_cash_and_makes_it_revenue(self):
        for status in (
            Order.FULFILMENT_CONFIRMED,
            Order.FULFILMENT_PACKED,
            Order.FULFILMENT_SHIPPED,
            Order.FULFILMENT_DELIVERED,
        ):
            OrderTransitionService.transition_fulfilment(
                order_id=self.order.id, to_status=status
            )

        self.order.refresh_from_db()
        self.assertEqual(self.order.fulfilment_status, Order.FULFILMENT_DELIVERED)
        self.assertEqual(self.order.payment_status, Order.PAYMENT_PAID)
        self.assertIsNotNone(self.order.paid_at)
        self.assertIsNotNone(self.order.delivered_at)
        self.assertTrue(self.order.is_settled)

    def test_skipping_a_step_is_refused(self):
        with self.assertRaises(ValidationError) as ctx:
            OrderTransitionService.transition_fulfilment(
                order_id=self.order.id, to_status=Order.FULFILMENT_DELIVERED
            )
        self.assertIn("can only move to", str(ctx.exception))

    def test_every_transition_is_recorded_with_who_and_why(self):
        staff = User.objects.create_user(
            username="ops@example.com", email="ops@example.com", name="Ops", password="pw"
        )
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id,
            to_status=Order.FULFILMENT_CONFIRMED,
            actor=staff,
            reason="Confirmed by phone",
        )

        entry = OrderHistory.objects.filter(
            order=self.order, kind=OrderHistory.KIND_FULFILMENT
        ).first()
        self.assertEqual(entry.from_status, Order.FULFILMENT_PENDING_CONFIRMATION)
        self.assertEqual(entry.to_status, Order.FULFILMENT_CONFIRMED)
        self.assertEqual(entry.actor, staff)
        self.assertEqual(entry.note, "Confirmed by phone")

    def test_shipping_records_the_courier_and_tracking_number(self):
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_CONFIRMED
        )
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_PACKED
        )
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id,
            to_status=Order.FULFILMENT_SHIPPED,
            courier_name="TCS",
            tracking_number="TCS-99887766",
        )

        self.order.refresh_from_db()
        self.assertEqual(self.order.courier_name, "TCS")
        self.assertEqual(self.order.tracking_number, "TCS-99887766")
        self.assertIsNotNone(self.order.shipped_at)

    def test_the_legacy_status_stays_correct_for_the_current_storefront(self):
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_CONFIRMED
        )
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "CONFIRMED")

        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_PACKED
        )
        self.order.refresh_from_db()
        # Packing is not a state the old vocabulary had; it stays CONFIRMED
        # rather than inventing a value the SPA cannot render.
        self.assertEqual(self.order.status, "CONFIRMED")


class CancellationTests(TestCase):
    def setUp(self):
        self.product = make_product(stock=20)
        self.order = OrderService.create_guest_order(
            guest_name="Customer",
            guest_email="c@example.com",
            guest_phone_number="03001234567",
            city="Lahore", area="Gulberg", street="1 Main St",
            items=[{"product": self.product, "quantity": 3}],
            payment_method="COD",
        )
        self.variant = self.product.variants.get()

    def test_cancelling_puts_the_goods_back_and_says_so_in_the_ledger(self):
        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, 17)

        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id,
            to_status=Order.FULFILMENT_CANCELLED,
            reason="Customer changed their mind",
        )

        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, 20)
        movement = StockMovement.objects.filter(
            movement_type=StockMovement.CANCELLATION
        ).get()
        self.assertEqual(movement.quantity, 3)

    def test_cancelling_twice_does_not_restock_twice(self):
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_CANCELLED
        )
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_CANCELLED
        )

        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, 20)
        self.assertEqual(
            StockMovement.objects.filter(movement_type=StockMovement.CANCELLATION).count(), 1
        )

    def test_a_paid_order_cannot_be_cancelled_without_refunding(self):
        """Money and stock must not be resolved separately."""
        self.order.payment_status = Order.PAYMENT_PAID
        self.order.save(update_fields=["payment_status"])

        with self.assertRaises(ValidationError) as ctx:
            OrderTransitionService.transition_fulfilment(
                order_id=self.order.id, to_status=Order.FULFILMENT_CANCELLED
            )
        self.assertIn("Refund it before cancelling", str(ctx.exception))
        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, 17)

    def test_a_cancelled_order_is_never_revenue(self):
        OrderTransitionService.transition_fulfilment(
            order_id=self.order.id, to_status=Order.FULFILMENT_CANCELLED
        )
        self.order.refresh_from_db()
        self.assertFalse(self.order.is_settled)


class ReturnTests(TestCase):
    def setUp(self):
        self.product = make_product(stock=20)
        self.order = OrderService.create_guest_order(
            guest_name="Customer",
            guest_email="c@example.com",
            guest_phone_number="03001234567",
            city="Lahore", area="Gulberg", street="1 Main St",
            items=[{"product": self.product, "quantity": 4}],
            payment_method="COD",
        )
        self.variant = self.product.variants.get()
        for status in (
            Order.FULFILMENT_CONFIRMED,
            Order.FULFILMENT_PACKED,
            Order.FULFILMENT_SHIPPED,
            Order.FULFILMENT_DELIVERED,
        ):
            OrderTransitionService.transition_fulfilment(
                order_id=self.order.id, to_status=status
            )
        self.order.refresh_from_db()
        self.item = self.order.items.get()

    def open_return(self, quantity=2):
        return ReturnService.request_return(
            order=self.order,
            lines=[{"order_item_id": self.item.id, "quantity": quantity}],
            reason="DAMAGED",
            customer_note="Seal was broken",
        )

    def test_a_return_cannot_be_opened_before_the_goods_have_shipped(self):
        fresh = OrderService.create_guest_order(
            guest_name="C", guest_email="c2@example.com", guest_phone_number="03000000000",
            city="Lahore", area="A", street="S",
            items=[{"product": self.product, "quantity": 1}],
            payment_method="COD",
        )
        with self.assertRaises(ValidationError):
            ReturnService.request_return(
                order=fresh,
                lines=[{"order_item_id": fresh.items.get().id, "quantity": 1}],
            )

    def test_more_cannot_be_returned_than_was_bought(self):
        with self.assertRaises(ValidationError) as ctx:
            self.open_return(quantity=5)
        self.assertIn("Only 4", str(ctx.exception))

    def test_two_returns_cannot_together_exceed_what_was_bought(self):
        first = self.open_return(quantity=3)
        ReturnService.approve(return_request=first)

        with self.assertRaises(ValidationError) as ctx:
            self.open_return(quantity=2)
        self.assertIn("Only 1", str(ctx.exception))

    def test_receiving_sellable_goods_puts_them_back_on_the_shelf(self):
        request = self.open_return(quantity=2)
        ReturnService.approve(return_request=request)

        before = InventoryBalance.objects.get(variant=self.variant).on_hand
        item = request.items.get()
        ReturnService.receive_goods(
            return_request=request, restock_decisions={item.pk: True}
        )

        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, before + 2)
        self.assertTrue(StockMovement.objects.filter(movement_type=StockMovement.RETURN).exists())

    def test_goods_that_come_back_unsellable_do_not_go_on_the_shelf(self):
        request = self.open_return(quantity=2)
        ReturnService.approve(return_request=request)

        before = InventoryBalance.objects.get(variant=self.variant).on_hand
        item = request.items.get()
        ReturnService.receive_goods(
            return_request=request, restock_decisions={item.pk: False}
        )

        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, before)
        item.refresh_from_db()
        self.assertFalse(item.restock)
        self.assertIsNone(item.restocked_at)

    def test_refunding_money_is_independent_of_receiving_goods(self):
        """The whole reason these are two models."""
        request = self.open_return(quantity=2)
        ReturnService.approve(return_request=request)

        # Money goes back before the parcel arrives — a normal goodwill case.
        ReturnService.record_refund(return_request=request, amount=Decimal("20000.00"))

        self.order.refresh_from_db()
        self.assertEqual(self.order.refunded_amount, Decimal("20000.00"))
        self.assertEqual(self.order.payment_status, Order.PAYMENT_PARTIALLY_REFUNDED)
        # No stock has moved: nothing has physically come back yet.
        self.assertFalse(StockMovement.objects.filter(movement_type=StockMovement.RETURN).exists())

    def test_a_full_refund_marks_the_order_refunded(self):
        request = self.open_return(quantity=4)
        ReturnService.approve(return_request=request)
        ReturnService.record_refund(return_request=request, amount=self.order.total_amount)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PAYMENT_REFUNDED)

    def test_refunding_more_than_the_order_was_worth_is_refused(self):
        request = self.open_return(quantity=4)
        ReturnService.approve(return_request=request)

        with self.assertRaises(ValidationError) as ctx:
            ReturnService.record_refund(
                return_request=request, amount=self.order.total_amount + Decimal("1.00")
            )
        self.assertIn("more than the order was worth", str(ctx.exception))

    def test_rejecting_a_return_requires_a_reason(self):
        request = self.open_return()
        with self.assertRaises(ValidationError):
            ReturnService.reject(return_request=request, reason="")

        ReturnService.reject(return_request=request, reason="Outside the returns window")
        request.refresh_from_db()
        self.assertEqual(request.status, ReturnRequest.STATUS_REJECTED)
        self.assertFalse(request.is_open)

    def test_a_rejected_return_frees_the_quantity_for_another_request(self):
        first = self.open_return(quantity=4)
        ReturnService.reject(return_request=first, reason="Wrong reason given")

        # The rejected quantity no longer counts against the order.
        second = self.open_return(quantity=4)
        self.assertEqual(second.items.get().quantity, 4)

    def test_the_whole_return_appears_in_the_order_history(self):
        request = self.open_return()
        ReturnService.approve(return_request=request)
        ReturnService.receive_goods(
            return_request=request, restock_decisions={request.items.get().pk: True}
        )
        ReturnService.record_refund(return_request=request, amount=Decimal("5000.00"))

        kinds = list(
            OrderHistory.objects.filter(order=self.order).values_list("kind", flat=True)
        )
        self.assertIn(OrderHistory.KIND_RETURN, kinds)
        self.assertIn(OrderHistory.KIND_REFUND, kinds)


class SalesChannelTests(TestCase):
    def test_an_online_order_is_labelled_as_such(self):
        product = make_product(stock=5)
        order = OrderService.create_guest_order(
            guest_name="C", guest_email="c@example.com", guest_phone_number="03001234567",
            city="Lahore", area="A", street="S",
            items=[{"product": product, "quantity": 1}],
            payment_method="COD",
        )
        self.assertEqual(order.sales_channel, Order.CHANNEL_ONLINE)

    def test_a_customer_can_be_found_by_phone_number(self):
        """The counter staff's most common lookup."""
        product = make_product(stock=5)
        OrderService.create_guest_order(
            guest_name="C", guest_email="c@example.com", guest_phone_number="03009998877",
            city="Lahore", area="A", street="S",
            items=[{"product": product, "quantity": 1}],
            payment_method="COD",
        )
        self.assertEqual(Order.objects.filter(guest_phone_number="03009998877").count(), 1)
