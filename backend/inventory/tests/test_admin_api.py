"""The inventory endpoints staff actually use, and who may use them.

Authorisation is tested at the endpoint, not at the permission class, because
the endpoint is what someone with a browser and the network tab can reach.
"""

from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APITestCase

from inventory import services
from inventory.models import InventoryBalance, StockMovement
from operations.models import AdminAuditLog
from products.models import Category, Product
from users.capabilities import ROLE_FULFILMENT, ROLE_MARKETING, ROLE_OWNER
from users.test_capabilities import make_staff


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


class InventoryApiAuthorisationTests(APITestCase):
    """Who can reach what."""

    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.product = make_product()
        self.variant = self.product.variants.get()

    def test_an_anonymous_caller_cannot_see_stock(self):
        self.assertEqual(self.client.get("/api/admin/inventory/").status_code, 401)

    def test_a_customer_cannot_see_stock(self):
        from users.models import User

        customer = User.objects.create_user(
            username="c@example.com", email="c@example.com", name="C", password="pw"
        )
        self.client.force_authenticate(user=customer)
        self.assertEqual(self.client.get("/api/admin/inventory/").status_code, 403)

    def test_a_staff_account_with_no_role_cannot_see_stock(self):
        self.client.force_authenticate(user=make_staff("new@example.com"))
        self.assertEqual(self.client.get("/api/admin/inventory/").status_code, 403)

    def test_fulfilment_can_see_and_change_stock(self):
        self.client.force_authenticate(user=make_staff("packer@example.com", ROLE_FULFILMENT))
        self.assertEqual(self.client.get("/api/admin/inventory/").status_code, 200)

        response = self.client.post(
            "/api/admin/inventory/receive/",
            {"variant": self.variant.id, "quantity": 5, "reason": "Delivery 1"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_marketing_can_do_neither(self):
        """Marketing has no business touching stock."""
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))

        self.assertEqual(self.client.get("/api/admin/inventory/").status_code, 403)
        response = self.client.post(
            "/api/admin/inventory/adjust/",
            {"variant": self.variant.id, "delta": -1, "movement_type": "DAMAGE", "reason": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_there_is_no_endpoint_that_sets_stock_directly(self):
        """Every change must carry a type, a reason and an actor."""
        self.client.force_authenticate(user=make_staff("owner@example.com", ROLE_OWNER))
        balance = InventoryBalance.objects.get(variant=self.variant)

        for method in ("put", "patch", "delete"):
            response = getattr(self.client, method)(
                f"/api/admin/inventory/{balance.id}/", {"on_hand": 999}, format="json"
            )
            self.assertIn(response.status_code, (404, 405))

        balance.refresh_from_db()
        self.assertEqual(balance.on_hand, 20)


class InventoryOperationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.staff = make_staff("ops@example.com", ROLE_FULFILMENT)
        self.client.force_authenticate(user=self.staff)
        self.product = make_product(stock=20)
        self.variant = self.product.variants.get()

    def balance(self):
        return InventoryBalance.objects.get(variant=self.variant)

    def test_receiving_stock_raises_the_balance_and_records_who(self):
        response = self.client.post(
            "/api/admin/inventory/receive/",
            {"variant": self.variant.id, "quantity": 30, "reason": "Delivery 4471"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["on_hand"], 50)
        self.assertEqual(self.balance().on_hand, 50)

        movement = StockMovement.objects.filter(movement_type=StockMovement.RECEIPT).get()
        self.assertEqual(movement.actor, self.staff)
        self.assertEqual(movement.reason, "Delivery 4471")

    def test_an_adjustment_without_a_reason_is_refused(self):
        response = self.client.post(
            "/api/admin/inventory/adjust/",
            {"variant": self.variant.id, "delta": -3, "movement_type": "DAMAGE", "reason": ""},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("reason", str(response.json()).lower())
        self.assertEqual(self.balance().on_hand, 20)

    def test_writing_off_damage_lowers_the_balance(self):
        response = self.client.post(
            "/api/admin/inventory/adjust/",
            {
                "variant": self.variant.id, "delta": -3,
                "movement_type": "DAMAGE", "reason": "Torn seals in transit",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.balance().on_hand, 17)

    def test_an_adjustment_that_would_strand_reserved_orders_is_refused_with_the_reason(self):
        services.reserve(variant=self.variant, quantity=18, reference="order:1")

        response = self.client.post(
            "/api/admin/inventory/adjust/",
            {
                "variant": self.variant.id, "delta": -10,
                "movement_type": "DAMAGE", "reason": "Flood",
            },
            format="json",
        )

        # A 400 explaining the problem, not a 500.
        self.assertEqual(response.status_code, 400)
        self.assertIn("reserved for orders", response.json()["error"])
        self.assertEqual(self.balance().on_hand, 20)

    def test_a_physical_count_records_the_difference_and_clears_never_counted(self):
        self.assertIsNone(self.balance().last_counted_at)

        response = self.client.post(
            "/api/admin/inventory/count/",
            {"variant": self.variant.id, "counted": 17, "reason": "Monthly stocktake"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["never_counted"])
        self.assertIsNotNone(self.balance().last_counted_at)

        movement = StockMovement.objects.filter(movement_type=StockMovement.STOCKTAKE).get()
        self.assertEqual(movement.quantity, -3)

    def test_an_unknown_variant_is_a_404_not_a_crash(self):
        response = self.client.post(
            "/api/admin/inventory/receive/",
            {"variant": 999999, "quantity": 1},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_an_operation_keeps_the_legacy_product_column_correct(self):
        """The current storefront still reads Product.stock."""
        self.client.post(
            "/api/admin/inventory/receive/",
            {"variant": self.variant.id, "quantity": 10, "reason": "Delivery"},
            format="json",
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 30)


class InventoryListingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("ops@example.com", ROLE_FULFILMENT))
        self.plenty = make_product(name="Plenty", slug="plenty", stock=100).variants.get()
        self.low = make_product(name="Low Stock", slug="low", stock=2).variants.get()
        self.none_left = make_product(name="Sold Out", slug="sold-out", stock=0).variants.get()

    def test_the_list_reports_on_hand_reserved_and_available(self):
        services.reserve(variant=self.plenty, quantity=10, reference="order:1")

        response = self.client.get("/api/admin/inventory/", {"search": "Plenty"})
        row = response.json()["results"][0]

        self.assertEqual(row["on_hand"], 100)
        self.assertEqual(row["reserved"], 10)
        self.assertEqual(row["available"], 90)

    def test_low_stock_can_be_filtered(self):
        response = self.client.get("/api/admin/inventory/", {"stock": "low"})
        skus = [row["sku"] for row in response.json()["results"]]
        self.assertIn(self.low.sku, skus)
        self.assertNotIn(self.plenty.sku, skus)

    def test_out_of_stock_can_be_filtered(self):
        response = self.client.get("/api/admin/inventory/", {"stock": "out"})
        skus = [row["sku"] for row in response.json()["results"]]
        self.assertIn(self.none_left.sku, skus)
        self.assertNotIn(self.plenty.sku, skus)

    def test_never_counted_can_be_filtered(self):
        """How a stocktake gets prioritised after the migration."""
        services.set_counted_quantity(variant=self.plenty, counted=100, reason="Counted")

        response = self.client.get("/api/admin/inventory/", {"stock": "never_counted"})
        skus = [row["sku"] for row in response.json()["results"]]

        self.assertNotIn(self.plenty.sku, skus)
        self.assertIn(self.low.sku, skus)

    def test_searching_by_sku_finds_the_row(self):
        response = self.client.get("/api/admin/inventory/", {"search": self.low.sku})
        self.assertEqual(response.json()["count"], 1)

    def test_the_ledger_is_readable_and_filterable(self):
        services.receive_stock(variant=self.plenty, quantity=5, reason="Delivery")

        response = self.client.get(
            "/api/admin/inventory/movements/", {"sku": self.plenty.sku}
        )
        self.assertEqual(response.status_code, 200)
        types = [row["movement_type"] for row in response.json()["results"]]
        self.assertIn(StockMovement.RECEIPT, types)

    def test_the_list_is_paginated(self):
        response = self.client.get("/api/admin/inventory/")
        body = response.json()
        self.assertIn("count", body)
        self.assertIn("results", body)


class InventoryAuditTrailTests(APITestCase):
    """Every privileged stock action leaves a record of who and why."""

    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.staff = make_staff("ops@example.com", ROLE_FULFILMENT)
        self.client.force_authenticate(user=self.staff)
        self.variant = make_product(stock=20).variants.get()

    def test_receiving_stock_is_audited(self):
        self.client.post(
            "/api/admin/inventory/receive/",
            {"variant": self.variant.id, "quantity": 10, "reason": "Delivery 99"},
            format="json",
        )

        entry = AdminAuditLog.objects.get(action="inventory.receive")
        self.assertEqual(entry.actor, self.staff)
        self.assertEqual(entry.actor_label, "ops@example.com")
        self.assertEqual(entry.entity_type, "products.ProductVariant")
        self.assertEqual(entry.reason, "Delivery 99")
        self.assertIn(self.variant.sku, entry.entity_label)

    def test_an_adjustment_is_audited_with_its_reason(self):
        self.client.post(
            "/api/admin/inventory/adjust/",
            {
                "variant": self.variant.id, "delta": -2,
                "movement_type": "DAMAGE", "reason": "Dropped during unpacking",
            },
            format="json",
        )

        entry = AdminAuditLog.objects.get(action="inventory.adjust")
        self.assertEqual(entry.reason, "Dropped during unpacking")
        self.assertIn("-2", entry.summary)

    def test_a_refused_operation_writes_no_audit_entry(self):
        """Nothing happened, so nothing is recorded as having happened."""
        self.client.post(
            "/api/admin/inventory/adjust/",
            {"variant": self.variant.id, "delta": -999, "movement_type": "DAMAGE", "reason": "x"},
            format="json",
        )
        self.assertFalse(AdminAuditLog.objects.filter(action="inventory.adjust").exists())

    def test_the_audit_entry_carries_the_request_id(self):
        """So an audit entry can be tied back to the request that caused it."""
        self.client.post(
            "/api/admin/inventory/receive/",
            {"variant": self.variant.id, "quantity": 1, "reason": "x"},
            format="json",
            HTTP_X_REQUEST_ID="trace-audit-1",
        )
        entry = AdminAuditLog.objects.get(action="inventory.receive")
        self.assertEqual(entry.request_id, "trace-audit-1")


class AuditRedactionTests(TestCase):
    """Nothing sensitive reaches the audit log."""

    def test_secrets_are_replaced_with_a_presence_flag(self):
        from operations.audit import serialize_for_audit

        cleaned = serialize_for_audit(
            {
                "sku": "PN-1",
                "api_key": "sk_live_abc",
                "password": "hunter2",
                "empty_token": "",
                "publishable_key": "pk_live_visible",
            }
        )

        self.assertEqual(cleaned["sku"], "PN-1")
        self.assertEqual(cleaned["api_key"], "[set]")
        self.assertEqual(cleaned["password"], "[set]")
        self.assertEqual(cleaned["empty_token"], "[empty]")
        # A public key is not a secret and stays readable.
        self.assertEqual(cleaned["publishable_key"], "pk_live_visible")

    def test_only_changed_fields_are_stored(self):
        from operations.audit import diff

        changes = diff(
            {"price": Decimal("100"), "name": "Whey"},
            {"price": Decimal("120"), "name": "Whey"},
        )
        self.assertEqual(list(changes), ["price"])
        self.assertEqual(changes["price"], {"from": "100", "to": "120"})

    def test_a_failure_to_record_never_breaks_the_action(self):
        """Losing a log line is bad; losing the stock adjustment is worse."""
        from unittest.mock import patch

        from operations import audit

        variant = make_product(stock=5).variants.get()
        with patch.object(
            AdminAuditLog.objects, "create", side_effect=RuntimeError("log table gone")
        ):
            entry = audit.record(action="inventory.adjust", entity=variant)

        self.assertIsNone(entry)
