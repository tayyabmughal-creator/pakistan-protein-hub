"""The catalogue screens, and the guards that stop a broken product going live.

The central property: publishing has a precondition. A product with no image,
no price or no brand renders a page a customer cannot buy from, and the
checklist is what stops that reaching the storefront.
"""

from decimal import Decimal

from django.core.management import call_command
from rest_framework.test import APITestCase

from operations.models import AdminAuditLog
from products.models import Brand, Category, Product, ProductMedia, ProductVariant
from products.serializers_admin import completeness
from users.capabilities import ROLE_FULFILMENT, ROLE_MANAGER, ROLE_MARKETING
from users.test_capabilities import make_staff


def make_product(*, name="Whey Gold", slug="whey-gold", stock=20, price="10000.00", brand=True):
    category, _ = Category.objects.get_or_create(slug="protein", defaults={"name": "Protein"})
    product = Product.objects.create(
        name=name, slug=slug, category=category, brand="Optimum Nutrition",
        weight="2kg", description="x", price=Decimal(price), stock=stock,
    )
    if brand:
        brand_obj, _ = Brand.objects.get_or_create(name="Optimum Nutrition")
        product.brand_ref = brand_obj
        product.save(update_fields=["brand_ref"])
    return product


def make_complete(product):
    """Fill in everything the blocking checks require."""
    product.description = "A" * 60
    product.short_description = "Premium whey"
    product.save()
    ProductMedia.objects.create(
        product=product, image="products/x.png", alt_text="Tub of whey", is_primary=True
    )
    return product


class CatalogAuthorisationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.product = make_product()

    def test_fulfilment_can_look_but_not_touch(self):
        """Packers need to see the catalogue; they do not set prices."""
        self.client.force_authenticate(user=make_staff("packer@example.com", ROLE_FULFILMENT))

        self.assertEqual(self.client.get("/api/admin/v2/catalog/products/").status_code, 200)

        response = self.client.patch(
            f"/api/admin/v2/catalog/products/{self.product.id}/",
            {"short_description": "changed"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_marketing_can_edit_and_publish(self):
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))
        response = self.client.patch(
            f"/api/admin/v2/catalog/products/{self.product.id}/",
            {"short_description": "Premium whey isolate"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_an_anonymous_caller_is_refused(self):
        self.assertEqual(self.client.get("/api/admin/v2/catalog/products/").status_code, 401)


class CompletenessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))

    def test_a_migrated_product_is_not_publishable_as_is(self):
        """Honest about what the migration could not supply."""
        product = make_product()  # no image, one-line description

        report = completeness(product)

        self.assertFalse(report["can_publish"])
        self.assertIn("At least one image", report["blocking"])
        self.assertIn("Full description", report["blocking"])

    def test_publishing_an_incomplete_product_is_refused_with_the_reasons(self):
        product = make_product()

        response = self.client.post(
            f"/api/admin/v2/catalog/products/{product.id}/publish/",
            {"publish": True},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertIn("At least one image", body["missing"])
        product.refresh_from_db()
        self.assertNotEqual(product.publish_status, Product.STATUS_PUBLISHED)

    def test_a_complete_product_publishes(self):
        product = make_complete(make_product())

        response = self.client.post(
            f"/api/admin/v2/catalog/products/{product.id}/publish/",
            {"publish": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.publish_status, Product.STATUS_PUBLISHED)
        self.assertTrue(product.is_active)

    def test_unpublishing_needs_no_preconditions(self):
        """Taking something down is always allowed. Putting it up is not."""
        product = make_complete(make_product())
        self.client.post(
            f"/api/admin/v2/catalog/products/{product.id}/publish/", {"publish": True}, format="json"
        )

        response = self.client.post(
            f"/api/admin/v2/catalog/products/{product.id}/publish/",
            {"publish": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.publish_status, Product.STATUS_DRAFT)
        self.assertFalse(product.is_active)

    def test_a_product_without_a_brand_cannot_be_published(self):
        product = make_complete(make_product(brand=False))
        product.brand_ref = None
        product.save(update_fields=["brand_ref"])

        response = self.client.post(
            f"/api/admin/v2/catalog/products/{product.id}/publish/",
            {"publish": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Linked to a brand", response.json()["missing"])

    def test_the_checklist_explains_why_each_item_matters(self):
        report = completeness(make_product())
        for check in report["checks"]:
            self.assertTrue(check["why"], f"{check['key']} has no explanation")

    def test_publishing_is_audited(self):
        product = make_complete(make_product())
        self.client.post(
            f"/api/admin/v2/catalog/products/{product.id}/publish/", {"publish": True}, format="json"
        )
        self.assertTrue(AdminAuditLog.objects.filter(action="catalog.publish").exists())


class VariantTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))
        self.product = make_product()
        self.default_variant = self.product.variants.get()

    def test_adding_a_flavour_variant(self):
        response = self.client.post(
            "/api/admin/v2/catalog/variants/",
            {
                "product": self.product.id,
                "sku": "PN-WHEY-CHOC-2KG",
                "flavor": "Chocolate",
                "size_label": "2kg",
                "price": "11000.00",
                "serving_count": 60,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["descriptor"], "Chocolate, 2kg")
        self.assertEqual(self.product.variants.count(), 2)

    def test_a_compare_price_that_is_not_a_saving_is_refused(self):
        """Refuse it rather than silently not rendering it."""
        response = self.client.post(
            "/api/admin/v2/catalog/variants/",
            {
                "product": self.product.id,
                "sku": "PN-FAKE-DISCOUNT",
                "price": "1000.00",
                "compare_at_price": "900.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("higher than the selling price", str(response.json()))

    def test_a_genuine_discount_is_accepted_and_calculated(self):
        response = self.client.post(
            "/api/admin/v2/catalog/variants/",
            {
                "product": self.product.id,
                "sku": "PN-REAL-DISCOUNT",
                "price": "800.00",
                "compare_at_price": "1000.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["has_genuine_discount"])
        self.assertEqual(body["discount_percentage"], 20)

    def test_a_duplicate_sku_is_refused(self):
        response = self.client.post(
            "/api/admin/v2/catalog/variants/",
            {"product": self.product.id, "sku": self.default_variant.sku, "price": "100.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_the_variant_form_cannot_set_stock(self):
        """Stock moves through inventory operations, which record why."""
        response = self.client.patch(
            f"/api/admin/v2/catalog/variants/{self.default_variant.id}/",
            {"on_hand": 999, "available": 999},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        # Reported, not accepted.
        self.assertEqual(response.json()["on_hand"], 20)

    def test_a_variant_that_has_been_sold_cannot_be_deleted(self):
        from orders.models import Order, OrderItem

        order = Order.objects.create(
            guest_name="C", guest_email="c@example.com", guest_phone_number="0300",
            total_amount=Decimal("100.00"), shipping_address="addr", payment_method="COD",
        )
        OrderItem.objects.create(
            order=order, variant=self.default_variant, product_name="Whey",
            sku=self.default_variant.sku, quantity=1, price=Decimal("100.00"),
            line_total=Decimal("100.00"),
        )

        response = self.client.delete(
            f"/api/admin/v2/catalog/variants/{self.default_variant.id}/"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("past orders", str(response.json()))

    def test_the_last_default_variant_cannot_be_deleted_while_others_exist(self):
        ProductVariant.objects.create(
            product=self.product, sku="PN-SECOND", price=Decimal("100.00")
        )
        response = self.client.delete(
            f"/api/admin/v2/catalog/variants/{self.default_variant.id}/"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("default variant", str(response.json()))

    def test_editing_a_variant_price_updates_the_legacy_column(self):
        """The current storefront still reads Product.price."""
        self.client.patch(
            f"/api/admin/v2/catalog/variants/{self.default_variant.id}/",
            {"price": "12345.00"},
            format="json",
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, Decimal("12345.00"))


class MediaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))
        self.product = make_product()

    def test_an_image_without_a_description_is_refused(self):
        response = self.client.post(
            "/api/admin/v2/catalog/media/",
            {"product": self.product.id, "image": "products/x.png", "alt_text": "  "},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("alt_text", response.json())


class BrandTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("mk@example.com", ROLE_MARKETING))

    def test_creating_a_brand_generates_a_slug(self):
        response = self.client.post(
            "/api/admin/v2/catalog/brands/", {"name": "Dymatize Nutrition"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["slug"], "dymatize-nutrition")

    def test_a_brand_with_products_cannot_be_deleted(self):
        product = make_product()
        response = self.client.delete(
            f"/api/admin/v2/catalog/brands/{product.brand_ref_id}/"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("product(s)", str(response.json()))

    def test_the_list_reports_how_many_products_each_brand_has(self):
        make_product()
        response = self.client.get("/api/admin/v2/catalog/brands/")
        self.assertEqual(response.json()[0]["product_count"], 1)


class ProductListingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("sync_staff_roles", verbosity=0)

    def setUp(self):
        self.client.force_authenticate(user=make_staff("mgr@example.com", ROLE_MANAGER))
        self.complete = make_complete(make_product(name="Complete", slug="complete"))
        self.incomplete = make_product(name="Incomplete", slug="incomplete", brand=False)
        self.incomplete.brand_ref = None
        self.incomplete.save(update_fields=["brand_ref"])

    def test_incomplete_products_can_be_filtered(self):
        """So whoever is finishing the catalogue has a worklist."""
        response = self.client.get("/api/admin/v2/catalog/products/", {"incomplete": "true"})
        slugs = [row["slug"] for row in response.json()["results"]]

        self.assertIn("incomplete", slugs)
        self.assertNotIn("complete", slugs)

    def test_searching_by_sku_finds_the_product(self):
        sku = self.complete.variants.get().sku
        response = self.client.get("/api/admin/v2/catalog/products/", {"search": sku})
        self.assertEqual(response.json()["count"], 1)

    def test_the_detail_view_carries_variants_media_and_the_checklist(self):
        response = self.client.get(f"/api/admin/v2/catalog/products/{self.complete.id}/")
        body = response.json()

        self.assertEqual(len(body["variants"]), 1)
        self.assertEqual(len(body["media"]), 1)
        self.assertIn("completeness", body)
        self.assertTrue(body["completeness"]["can_publish"])

    def test_the_slug_cannot_be_changed_through_the_editor(self):
        """A slug is a live URL. Renaming one silently breaks every link to it."""
        response = self.client.patch(
            f"/api/admin/v2/catalog/products/{self.complete.id}/",
            {"slug": "something-else"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.complete.refresh_from_db()
        self.assertEqual(self.complete.slug, "complete")
