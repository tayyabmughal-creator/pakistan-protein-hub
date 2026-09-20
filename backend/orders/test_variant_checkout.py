"""Checkout must sell the variant the customer chose.

The catalogue (Phase 2) and the admin (Phase 4) both support multiple variants
per product — a 2lb and a 5lb tub at different prices and different stock. The
checkout pipeline did not: it took a `product_id`, priced from
`product.final_price`, checked the denormalised `product.stock`, and resolved
`variant = product.default_variant` in all three places that matter (pricing,
reservation, and order creation).

While every migrated product has exactly one variant this is invisible. The
moment a staff member adds a second size — which the admin invites them to do —
a customer who picks the 5lb tub is charged the 2lb price and the 2lb tub is
the one taken out of stock.

These tests pin the correct behaviour end to end.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from inventory import services as inventory_services
from inventory.models import InventoryBalance, InventoryLocation
from orders.models import Order
from products.models import Brand, Category, Product, ProductVariant

User = get_user_model()


class VariantCheckoutTestCase(TestCase):
    """A product with two genuinely different variants."""

    @classmethod
    def setUpTestData(cls):
        cls.location = InventoryLocation.get_default() or InventoryLocation.objects.create(
            name="Main", code="MAIN", is_default=True, is_active=True
        )
        cls.category = Category.objects.create(name="Protein", slug="protein")
        cls.brand = Brand.objects.create(name="Optimum", slug="optimum")

        cls.product = Product.objects.create(
            name="Gold Standard Whey",
            slug="gold-standard-whey",
            category=cls.category,
            brand_ref=cls.brand,
            description="Whey protein",
            publish_status=Product.STATUS_PUBLISHED,
            is_active=True,
        )
        cls.product.variants.all().delete()

        # The default, and the cheaper one.
        cls.small = ProductVariant.objects.create(
            product=cls.product,
            sku="GSW-2LB",
            size_label="2 lb",
            price=Decimal("9000.00"),
            is_default=True,
            sort_order=0,
        )
        # The one a customer would have to deliberately choose.
        cls.large = ProductVariant.objects.create(
            product=cls.product,
            sku="GSW-5LB",
            size_label="5 lb",
            price=Decimal("21000.00"),
            is_default=False,
            sort_order=1,
        )

    def setUp(self):
        self.client = APIClient()
        self.stock(self.small, 10)
        self.stock(self.large, 10)

    def stock(self, variant, quantity):
        balance, _ = InventoryBalance.objects.get_or_create(
            variant=variant,
            location=self.location,
            defaults={"on_hand": 0, "reserved": 0},
        )
        InventoryBalance.objects.filter(pk=balance.pk).update(
            on_hand=quantity, reserved=0
        )
        # Keep the legacy denormalised field in step, as the signals do.
        Product.objects.filter(pk=variant.product_id).update(
            stock=sum(
                b.on_hand
                for b in InventoryBalance.objects.filter(
                    variant__product_id=variant.product_id, location=self.location
                )
            )
        )

    def guest_payload(self, items, **overrides):
        payload = {
            "guest_name": "Ayesha Khan",
            "guest_email": "ayesha@example.com",
            "guest_phone_number": "03001234567",
            "city": "Lahore",
            "area": "DHA Phase 5",
            "street": "12 Main Boulevard",
            "payment_method": "COD",
            "items": items,
        }
        payload.update(overrides)
        return payload

    def post_order(self, items, **overrides):
        return self.client.post(
            reverse("order-list-create"),
            self.guest_payload(items, **overrides),
            format="json",
        )

    def available(self, variant):
        balance = InventoryBalance.objects.get(variant=variant, location=self.location)
        return balance.on_hand - balance.reserved

    # -- the bug ---------------------------------------------------------

    def test_choosing_the_expensive_variant_charges_the_expensive_price(self):
        """The whole point.

        Before the fix this charged 9,000 — the default variant's price —
        for a 21,000 tub, and recorded the order against the wrong SKU.
        """
        response = self.post_order(
            [{"product_id": self.product.id, "variant_id": self.large.id, "quantity": 1}]
        )
        self.assertEqual(response.status_code, 201, response.data)

        order = Order.objects.get(pk=response.data["id"])
        item = order.items.get()

        self.assertEqual(item.variant_id, self.large.id)
        self.assertEqual(item.sku, "GSW-5LB")
        self.assertEqual(item.price, Decimal("21000.00"))
        self.assertEqual(order.subtotal_amount, Decimal("21000.00"))

    def test_the_chosen_variant_is_the_one_taken_out_of_stock(self):
        """Deducting the default variant is how you oversell one size and
        accumulate phantom stock in another."""
        self.post_order(
            [{"product_id": self.product.id, "variant_id": self.large.id, "quantity": 3}]
        )

        self.assertEqual(self.available(self.large), 7)
        self.assertEqual(self.available(self.small), 10, "the 2lb tub was not sold")

    def test_availability_is_checked_against_the_chosen_variant(self):
        """Per-variant stock, not the product-wide total.

        The product has 12 units overall (10 small + 2 large), so a
        product-level check would happily accept 5 of the large one.
        """
        self.stock(self.large, 2)

        response = self.post_order(
            [{"product_id": self.product.id, "variant_id": self.large.id, "quantity": 5}]
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("2", str(response.data), "the error should state the real figure")
        self.assertEqual(self.available(self.large), 2, "nothing was deducted")

    def test_two_variants_of_one_product_are_separate_lines(self):
        """A basket with the 2lb and the 5lb is two lines, priced separately.

        The server-side Cart model cannot represent this at all — it is unique
        on (cart, product) — which is why the storefront posts an explicit
        items payload.
        """
        response = self.post_order(
            [
                {"product_id": self.product.id, "variant_id": self.small.id, "quantity": 1},
                {"product_id": self.product.id, "variant_id": self.large.id, "quantity": 2},
            ]
        )
        self.assertEqual(response.status_code, 201, response.data)

        order = Order.objects.get(pk=response.data["id"])
        by_sku = {item.sku: item for item in order.items.all()}

        self.assertEqual(set(by_sku), {"GSW-2LB", "GSW-5LB"})
        self.assertEqual(by_sku["GSW-2LB"].price, Decimal("9000.00"))
        self.assertEqual(by_sku["GSW-5LB"].price, Decimal("21000.00"))
        self.assertEqual(
            order.subtotal_amount,
            Decimal("9000.00") + Decimal("21000.00") * 2,
        )

    def test_a_variant_from_another_product_is_rejected(self):
        """Otherwise a crafted request buys a cheap variant under an
        expensive product's name, or vice versa."""
        other = Product.objects.create(
            name="Creatine", slug="creatine-x", category=self.category,
            description="Creatine", publish_status=Product.STATUS_PUBLISHED,
        )
        other_variant = other.variants.first()

        response = self.post_order(
            [{"product_id": self.product.id, "variant_id": other_variant.id, "quantity": 1}]
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_an_inactive_variant_cannot_be_purchased(self):
        ProductVariant.objects.filter(pk=self.large.pk).update(is_active=False)

        response = self.post_order(
            [{"product_id": self.product.id, "variant_id": self.large.id, "quantity": 1}]
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    # -- backward compatibility ------------------------------------------

    def test_omitting_variant_id_still_uses_the_default_variant(self):
        """The existing SPA and the Expo admin post product_id only.

        Their behaviour must not change: no variant means the default one,
        exactly as before.
        """
        response = self.post_order(
            [{"product_id": self.product.id, "quantity": 1}]
        )
        self.assertEqual(response.status_code, 201, response.data)

        item = Order.objects.get(pk=response.data["id"]).items.get()
        self.assertEqual(item.variant_id, self.small.id)
        self.assertEqual(item.price, Decimal("9000.00"))

    def test_reserved_stock_is_held_against_the_chosen_variant(self):
        """The payment-session hold must reserve what is being bought.

        Reserving the default variant while the customer pays for another
        means the wrong tub is held and the right one can be oversold by a
        second customer during the payment window.
        """
        from orders.services import PaymentSessionService

        session = PaymentSessionService.create_guest_session(
            guest_name="Ayesha Khan",
            guest_email="ayesha@example.com",
            guest_phone_number="03001234567",
            city="Lahore",
            area="DHA",
            street="12 Main",
            # The service takes serializer-validated items: model instances,
            # not raw ids. This is the shape CreateOrderSerializer produces.
            items=[
                {"product": self.product, "variant": self.large, "quantity": 2}
            ],
            payment_method="SAFEPAY",
            promo_code="",
        )
        self.assertIsNotNone(session)

        large_balance = InventoryBalance.objects.get(
            variant=self.large, location=self.location
        )
        small_balance = InventoryBalance.objects.get(
            variant=self.small, location=self.location
        )
        self.assertEqual(large_balance.reserved, 2)
        self.assertEqual(small_balance.reserved, 0)


class SingleVariantRegressionTestCase(TestCase):
    """The common case must keep working unchanged.

    Every product migrated in Phase 2 has exactly one variant, so this is what
    the live shop actually does today.
    """

    @classmethod
    def setUpTestData(cls):
        cls.location = InventoryLocation.get_default() or InventoryLocation.objects.create(
            name="Main", code="MAIN", is_default=True, is_active=True
        )
        cls.category = Category.objects.create(name="Creatine", slug="creatine")
        cls.product = Product.objects.create(
            name="Creatine Monohydrate",
            slug="creatine-mono",
            category=cls.category,
            description="Creatine",
            publish_status=Product.STATUS_PUBLISHED,
            is_active=True,
        )
        cls.variant = cls.product.variants.first()
        ProductVariant.objects.filter(pk=cls.variant.pk).update(price=Decimal("3999.00"))
        cls.variant.refresh_from_db()

    def setUp(self):
        self.client = APIClient()
        inventory_services.receive_stock(
            variant=self.variant,
            quantity=20,
            location=self.location,
            reason="Test setup",
        )

    def test_product_only_payload_behaves_exactly_as_before(self):
        response = self.client.post(
            reverse("order-list-create"),
            {
                "guest_name": "Bilal Ahmed",
                "guest_email": "bilal@example.com",
                "guest_phone_number": "03009876543",
                "city": "Karachi",
                "area": "Clifton",
                "street": "5 Beach Road",
                "payment_method": "COD",
                "items": [{"product_id": self.product.id, "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

        order = Order.objects.get(pk=response.data["id"])
        item = order.items.get()
        self.assertEqual(item.variant_id, self.variant.id)
        self.assertEqual(item.price, Decimal("3999.00"))
        self.assertEqual(order.subtotal_amount, Decimal("7998.00"))
