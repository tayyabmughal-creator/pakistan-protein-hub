"""The order screens staff work from, and who may use them.

The property under test throughout: nothing financial is assignable. Every
state change is a named command that validates the move, applies the stock
consequence and records who did it.
"""

from decimal import Decimal

from django.core.management import call_command
from rest_framework.test import APITestCase

from inventory.models import InventoryBalance, StockMovement
from operations.models import AdminAuditLog
from orders.models import Order, OrderHistory, ReturnRequest
from orders.services import OrderService, OrderTransitionService
from products.models import Category, Product
from users.capabilities import (
    ROLE_FULFILMENT,
    ROLE_MANAGER,
    ROLE_MARKETING,
    ROLE_OWNER,
)
from users.test_capabilities import make_staff


def make_product(*, name="Whey Gold", stock=50, price="10000.00", slug=None):
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


def make_order(product, *, quantity=2, phone="03001234567", name="Customer"):
    return OrderService.create_guest_order(
        guest_name=name,
        guest_email="c@example.com",
        guest_phone_number=phone,
        city="Lahore", area="Gulberg", street="1 Main St",
        items=[{"product": product, "quantity": quantity}],
        payment_method="COD",
    )


class OrderApiAuthorisationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.product = make_product()
        self.order = make_order(self.product)

    def test_an_anonymous_caller_sees_nothing(self):
        self.assertEqual(self.client.get("/api/admin/v2/orders/").status_code, 401)

    def test_a_staff_account_with_no_role_sees_nothing(self):
        self.client.force_authenticate(user=make_staff("new@example.com"))
        self.assertEqual(self.client.get("/api/admin/v2/orders/").status_code, 403)

    def test_marketing_can_read_orders_but_not_move_them(self):
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))

        self.assertEqual(self.client.get("/api/admin/v2/orders/").status_code, 200)

        response = self.client.post(
            f"/api/admin/v2/orders/{self.order.id}/transition/",
            {"status": Order.FULFILMENT_CONFIRMED},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.order.refresh_from_db()
        self.assertEqual(self.order.fulfilment_status, Order.FULFILMENT_PENDING_CONFIRMATION)

    def test_fulfilment_can_move_an_order_but_not_cancel_it(self):
        """Cancelling returns stock and closes out money owed — a heavier act."""
        self.client.force_authenticate(user=make_staff("packer@example.com", ROLE_FULFILMENT))

        confirm = self.client.post(
            f"/api/admin/v2/orders/{self.order.id}/transition/",
            {"status": Order.FULFILMENT_CONFIRMED},
            format="json",
        )
        self.assertEqual(confirm.status_code, 200)

        cancel = self.client.post(
            f"/api/admin/v2/orders/{self.order.id}/transition/",
            {"status": Order.FULFILMENT_CANCELLED, "reason": "Customer asked"},
            format="json",
        )
        self.assertEqual(cancel.status_code, 403)

    def test_fulfilment_cannot_refund(self):
        self.client.force_authenticate(user=make_staff("packer2@example.com", ROLE_FULFILMENT))
        response = self.client.post(
            "/api/admin/v2/returns/1/refund/", {"amount": "100.00"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_there_is_no_way_to_patch_an_order(self):
        """The Phase 0 hole: any staff account marking an order PAID."""
        self.client.force_authenticate(user=make_staff("owner@example.com", ROLE_OWNER))

        for method in ("put", "patch"):
            response = getattr(self.client, method)(
                f"/api/admin/v2/orders/{self.order.id}/",
                {"payment_status": "PAID", "total_amount": "1.00"},
                format="json",
            )
            self.assertEqual(response.status_code, 405)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PAYMENT_COD_PENDING)
        self.assertEqual(self.order.total_amount, Decimal("20000.00"))


class OrderListingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("ops@example.com", ROLE_MANAGER))
        self.product = make_product(stock=100)
        self.a = make_order(self.product, phone="03001111111", name="Ahmed")
        self.b = make_order(self.product, phone="03002222222", name="Bilal")

    def test_the_list_is_paginated_and_lean(self):
        response = self.client.get("/api/admin/v2/orders/")
        body = response.json()

        self.assertIn("count", body)
        # The list view does not carry line items; hundreds of rows do not need them.
        self.assertNotIn("items", body["results"][0])
        self.assertIn("items_count", body["results"][0])

    def test_searching_by_phone_finds_the_order(self):
        """What counter staff search by more than anything else."""
        response = self.client.get("/api/admin/v2/orders/", {"search": "03002222222"})
        results = response.json()["results"]

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.b.id)

    def test_searching_by_order_number_finds_the_order(self):
        response = self.client.get("/api/admin/v2/orders/", {"search": str(self.a.id)})
        self.assertIn(self.a.id, [row["id"] for row in response.json()["results"]])

    def test_searching_by_sku_finds_orders_containing_it(self):
        sku = self.product.variants.get().sku
        response = self.client.get("/api/admin/v2/orders/", {"search": sku})
        self.assertEqual(response.json()["count"], 2)

    def test_payment_and_fulfilment_filter_independently(self):
        """The whole point of splitting them."""
        OrderTransitionService.transition_fulfilment(
            order_id=self.a.id, to_status=Order.FULFILMENT_CONFIRMED
        )

        by_fulfilment = self.client.get(
            "/api/admin/v2/orders/", {"fulfilment_status": Order.FULFILMENT_CONFIRMED}
        )
        self.assertEqual(by_fulfilment.json()["count"], 1)

        # Both are still COD_PENDING: confirming a parcel does not collect cash.
        by_payment = self.client.get(
            "/api/admin/v2/orders/", {"payment_status": Order.PAYMENT_COD_PENDING}
        )
        self.assertEqual(by_payment.json()["count"], 2)

    def test_the_detail_view_carries_items_and_history(self):
        response = self.client.get(f"/api/admin/v2/orders/{self.a.id}/")
        body = response.json()

        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["items"][0]["sku"], self.product.variants.get().sku)
        self.assertIn("history", body)

    def test_the_detail_view_advertises_only_valid_next_steps(self):
        """The admin must not offer a button the API will refuse."""
        response = self.client.get(f"/api/admin/v2/orders/{self.a.id}/")
        offered = {t["value"] for t in response.json()["available_transitions"]}

        self.assertEqual(offered, {Order.FULFILMENT_CONFIRMED, Order.FULFILMENT_CANCELLED})
        self.assertNotIn(Order.FULFILMENT_DELIVERED, offered)

    def test_the_queue_counts_what_needs_doing(self):
        OrderTransitionService.transition_fulfilment(
            order_id=self.a.id, to_status=Order.FULFILMENT_CONFIRMED
        )

        body = self.client.get("/api/admin/v2/orders/queues/").json()

        self.assertEqual(body["awaiting_confirmation"], 1)
        self.assertEqual(body["confirmed"], 1)
        self.assertEqual(body["cod_orders_outstanding"], 2)
        self.assertEqual(Decimal(body["cod_cash_outstanding"]), Decimal("40000.00"))
        self.assertIn("cod_cash_outstanding", body["definitions"])


class OrderCommandTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.staff = make_staff("ops@example.com", ROLE_MANAGER)
        self.client.force_authenticate(user=self.staff)
        self.product = make_product(stock=50)
        self.order = make_order(self.product)
        self.variant = self.product.variants.get()

    def transition(self, to_status, **extra):
        return self.client.post(
            f"/api/admin/v2/orders/{self.order.id}/transition/",
            {"status": to_status, **extra},
            format="json",
        )

    def test_an_invalid_jump_is_refused_with_the_reason(self):
        response = self.transition(Order.FULFILMENT_DELIVERED)
        self.assertEqual(response.status_code, 400)
        self.assertIn("can only move to", response.json()["error"])

    def test_shipping_without_a_tracking_number_is_refused(self):
        """A shipped parcel nobody can trace is a support call waiting to happen."""
        self.transition(Order.FULFILMENT_CONFIRMED)
        self.transition(Order.FULFILMENT_PACKED)

        response = self.transition(Order.FULFILMENT_SHIPPED)
        self.assertEqual(response.status_code, 400)
        self.assertIn("tracking_number", response.json())

    def test_shipping_records_the_courier(self):
        self.transition(Order.FULFILMENT_CONFIRMED)
        self.transition(Order.FULFILMENT_PACKED)
        response = self.transition(
            Order.FULFILMENT_SHIPPED, courier_name="TCS", tracking_number="TCS-1234"
        )

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.tracking_number, "TCS-1234")

    def test_delivering_a_cod_order_collects_the_cash(self):
        self.transition(Order.FULFILMENT_CONFIRMED)
        self.transition(Order.FULFILMENT_PACKED)
        self.transition(Order.FULFILMENT_SHIPPED, tracking_number="TCS-1")
        response = self.transition(Order.FULFILMENT_DELIVERED)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["payment_status"], Order.PAYMENT_PAID)
        self.assertTrue(body["is_settled"])

    def test_cancelling_without_a_reason_is_refused(self):
        response = self.transition(Order.FULFILMENT_CANCELLED)
        self.assertEqual(response.status_code, 400)
        self.assertIn("reason", response.json())

    def test_cancelling_returns_the_stock(self):
        before = InventoryBalance.objects.get(variant=self.variant).on_hand

        response = self.transition(Order.FULFILMENT_CANCELLED, reason="Customer changed mind")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, before + 2)
        self.assertTrue(
            StockMovement.objects.filter(movement_type=StockMovement.CANCELLATION).exists()
        )

    def test_every_transition_is_audited(self):
        self.transition(Order.FULFILMENT_CONFIRMED, reason="Confirmed by phone")

        entry = AdminAuditLog.objects.get(action="order.transition")
        self.assertEqual(entry.actor, self.staff)
        self.assertEqual(entry.reason, "Confirmed by phone")
        self.assertIn(str(self.order.id), entry.summary)

    def test_an_internal_note_is_recorded_and_not_shown_to_the_customer(self):
        response = self.client.post(
            f"/api/admin/v2/orders/{self.order.id}/note/",
            {"note": "Customer asked for delivery after 6pm"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        entry = OrderHistory.objects.filter(kind=OrderHistory.KIND_NOTE).get()
        self.assertFalse(entry.is_customer_visible)
        self.assertEqual(entry.actor, self.staff)


class ReturnApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.staff = make_staff("manager@example.com", ROLE_MANAGER)
        self.client.force_authenticate(user=self.staff)
        self.product = make_product(stock=50)
        self.order = make_order(self.product, quantity=4)
        self.variant = self.product.variants.get()

        for status_value in (
            Order.FULFILMENT_CONFIRMED,
            Order.FULFILMENT_PACKED,
            Order.FULFILMENT_SHIPPED,
            Order.FULFILMENT_DELIVERED,
        ):
            OrderTransitionService.transition_fulfilment(
                order_id=self.order.id, to_status=status_value
            )
        self.order.refresh_from_db()
        self.item = self.order.items.get()

    def open_return(self, quantity=2):
        response = self.client.post(
            f"/api/admin/v2/orders/{self.order.id}/returns/",
            {
                "lines": [{"order_item_id": self.item.id, "quantity": quantity}],
                "reason": "DAMAGED",
                "customer_note": "Seal broken",
            },
            format="json",
        )
        return response

    def test_opening_a_return(self):
        response = self.open_return()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], ReturnRequest.STATUS_REQUESTED)

    def test_returning_more_than_was_bought_is_refused(self):
        response = self.open_return(quantity=9)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Only 4", response.json()["error"])

    def test_rejecting_requires_a_reason(self):
        return_id = self.open_return().json()["id"]
        response = self.client.post(
            f"/api/admin/v2/returns/{return_id}/decision/",
            {"action": "reject"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_receiving_goods_restocks_only_what_is_sellable(self):
        return_id = self.open_return(quantity=2).json()["id"]
        self.client.post(
            f"/api/admin/v2/returns/{return_id}/decision/",
            {"action": "approve"}, format="json",
        )

        return_request = ReturnRequest.objects.get(pk=return_id)
        line = return_request.items.get()
        before = InventoryBalance.objects.get(variant=self.variant).on_hand

        response = self.client.post(
            f"/api/admin/v2/returns/{return_id}/receive/",
            {"restock": {str(line.id): False}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        # Not resellable, so it does not go back on the shelf.
        self.assertEqual(InventoryBalance.objects.get(variant=self.variant).on_hand, before)

    def test_refunding_is_independent_of_the_goods_coming_back(self):
        return_id = self.open_return(quantity=2).json()["id"]
        self.client.post(
            f"/api/admin/v2/returns/{return_id}/decision/",
            {"action": "approve"}, format="json",
        )

        response = self.client.post(
            f"/api/admin/v2/returns/{return_id}/refund/",
            {"amount": "20000.00", "note": "Goodwill"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.refunded_amount, Decimal("20000.00"))
        self.assertEqual(self.order.payment_status, Order.PAYMENT_PARTIALLY_REFUNDED)
        # No goods have come back yet.
        self.assertFalse(
            StockMovement.objects.filter(movement_type=StockMovement.RETURN).exists()
        )

    def test_refunding_more_than_the_order_is_refused(self):
        return_id = self.open_return(quantity=4).json()["id"]
        self.client.post(
            f"/api/admin/v2/returns/{return_id}/decision/",
            {"action": "approve"}, format="json",
        )

        response = self.client.post(
            f"/api/admin/v2/returns/{return_id}/refund/",
            {"amount": "999999.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("more than the order was worth", response.json()["error"])

    def test_a_refund_is_audited(self):
        return_id = self.open_return(quantity=1).json()["id"]
        self.client.post(
            f"/api/admin/v2/returns/{return_id}/decision/",
            {"action": "approve"}, format="json",
        )
        self.client.post(
            f"/api/admin/v2/returns/{return_id}/refund/",
            {"amount": "5000.00"}, format="json",
        )

        entry = AdminAuditLog.objects.get(action="order.refund")
        self.assertEqual(entry.actor, self.staff)
        self.assertIn("5000", entry.summary)

    def test_the_open_returns_queue_counts_them(self):
        self.open_return()
        body = self.client.get("/api/admin/v2/orders/queues/").json()
        self.assertEqual(body["open_returns"], 1)
