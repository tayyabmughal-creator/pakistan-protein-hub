"""Public storefront API.

Covers the three things a customer would notice if they broke — wrong price,
wrong availability, invented discount — plus the query counts, because a
listing page that works correctly but issues 80 queries is still broken.
"""

from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from inventory.models import InventoryBalance, InventoryLocation
from products.models import Brand, Category, Goal, Product, ProductMedia, ProductVariant


class StorefrontAPITestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        # A default location is created by migration; only one row may carry
        # is_default, so reuse it rather than racing the constraint.
        cls.location = InventoryLocation.get_default() or InventoryLocation.objects.create(
            name="Main", code="MAIN", is_default=True, is_active=True
        )
        cls.category = Category.objects.create(name="Protein", slug="protein")
        cls.other_category = Category.objects.create(name="Creatine", slug="creatine")
        cls.brand = Brand.objects.create(name="Optimum Nutrition", slug="optimum-nutrition")
        cls.other_brand = Brand.objects.create(name="Dymatize", slug="dymatize")
        cls.goal = Goal.objects.create(name="Muscle Gain", slug="muscle-gain")

    def setUp(self):
        self.client = APIClient()

    # -- helpers ---------------------------------------------------------

    def make_product(self, name, *, slug=None, category=None, brand=None,
                     status=Product.STATUS_PUBLISHED, is_active=True,
                     supplement_type="WHEY", goals=()):
        product = Product.objects.create(
            name=name,
            slug=slug or name.lower().replace(" ", "-"),
            category=category or self.category,
            brand_ref=brand or self.brand,
            description=f"{name} description",
            short_description=f"{name} short",
            supplement_type=supplement_type,
            publish_status=status,
            is_active=is_active,
        )
        # The post_save signal guarantees a default variant; drop it so each
        # test builds exactly the variants it means to assert on.
        product.variants.all().delete()
        if goals:
            product.goals.set(goals)
        return product

    def make_variant(self, product, *, sku, price, compare_at=None, stock=0,
                     flavor="", size="", is_active=True):
        variant = ProductVariant.objects.create(
            product=product,
            sku=sku,
            price=Decimal(price),
            compare_at_price=Decimal(compare_at) if compare_at else None,
            flavor=flavor,
            size_label=size,
            is_active=is_active,
        )
        InventoryBalance.objects.create(
            variant=variant, location=self.location, on_hand=stock, reserved=0
        )
        return variant

    def list_products(self, **params):
        return self.client.get(reverse("storefront_v2:product-list"), params)

    # -- visibility ------------------------------------------------------

    def test_only_published_active_products_are_listed(self):
        live = self.make_product("Gold Standard Whey")
        self.make_variant(live, sku="GSW-1", price="12000", stock=5)

        draft = self.make_product("Secret Launch", status=Product.STATUS_DRAFT)
        self.make_variant(draft, sku="SL-1", price="9000", stock=5)

        archived = self.make_product("Discontinued", is_active=False)
        self.make_variant(archived, sku="DC-1", price="5000", stock=5)

        response = self.list_products()
        self.assertEqual(response.status_code, 200)
        slugs = [item["slug"] for item in response.data["results"]]
        self.assertEqual(slugs, ["gold-standard-whey"])

    def test_draft_product_detail_is_404_not_visible(self):
        draft = self.make_product("Secret Launch", status=Product.STATUS_DRAFT)
        self.make_variant(draft, sku="SL-2", price="9000", stock=5)

        response = self.client.get(
            reverse("storefront_v2:product-detail", args=["secret-launch"])
        )
        self.assertEqual(response.status_code, 404)

    def test_out_of_stock_products_are_listed_not_hidden(self):
        """Sorted last, still present.

        Hiding them makes a product invisible everywhere — including search —
        while the admin shows it as published, which is impossible to diagnose
        from the admin side.
        """
        empty = self.make_product("Sold Out Whey", slug="sold-out")
        self.make_variant(empty, sku="SO-1", price="8000", stock=0)
        stocked = self.make_product("In Stock Whey", slug="in-stock")
        self.make_variant(stocked, sku="IS-1", price="9000", stock=10)

        response = self.list_products()
        slugs = [item["slug"] for item in response.data["results"]]
        self.assertEqual(slugs, ["in-stock", "sold-out"], "in-stock must sort first")

        by_slug = {item["slug"]: item for item in response.data["results"]}
        self.assertFalse(by_slug["sold-out"]["in_stock"])
        self.assertTrue(by_slug["in-stock"]["in_stock"])

    def test_in_stock_filter_excludes_unavailable(self):
        empty = self.make_product("Sold Out", slug="sold-out-2")
        self.make_variant(empty, sku="SO-2", price="8000", stock=0)
        stocked = self.make_product("Available", slug="available")
        self.make_variant(stocked, sku="AV-1", price="9000", stock=3)

        response = self.list_products(in_stock="true")
        slugs = [item["slug"] for item in response.data["results"]]
        self.assertEqual(slugs, ["available"])

    # -- availability ----------------------------------------------------

    def test_reserved_stock_is_not_available(self):
        """Ten on hand and ten reserved is sold out, not in stock.

        Every reserved unit belongs to a checkout in flight. Counting them as
        available oversells — two customers buy the last tub.
        """
        product = self.make_product("Reserved Whey", slug="reserved")
        variant = self.make_variant(product, sku="RV-1", price="9000", stock=10)
        InventoryBalance.objects.filter(variant=variant).update(reserved=10)

        response = self.client.get(
            reverse("storefront_v2:product-detail", args=["reserved"])
        )
        self.assertEqual(response.data["variants"][0]["available"], 0)
        self.assertFalse(response.data["variants"][0]["in_stock"])
        self.assertFalse(response.data["in_stock"])

    def test_partially_reserved_stock_reports_the_remainder(self):
        product = self.make_product("Partly Reserved", slug="partly")
        variant = self.make_variant(product, sku="PR-1", price="9000", stock=10)
        InventoryBalance.objects.filter(variant=variant).update(reserved=4)

        response = self.client.get(
            reverse("storefront_v2:product-detail", args=["partly"])
        )
        self.assertEqual(response.data["variants"][0]["available"], 6)
        self.assertTrue(response.data["variants"][0]["in_stock"])

    def test_variant_with_no_balance_row_reports_zero_not_error(self):
        product = self.make_product("No Ledger", slug="no-ledger")
        ProductVariant.objects.create(
            product=product, sku="NL-1", price=Decimal("5000")
        )  # deliberately no InventoryBalance

        response = self.client.get(
            reverse("storefront_v2:product-detail", args=["no-ledger"])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["variants"][0]["available"], 0)

    # -- pricing ---------------------------------------------------------

    def test_card_price_is_the_cheapest_sellable_variant(self):
        product = self.make_product("Multi Size Whey", slug="multi-size")
        self.make_variant(product, sku="MS-5LB", price="18000", stock=2, size="5lb")
        self.make_variant(product, sku="MS-2LB", price="9000", stock=2, size="2lb")

        response = self.list_products()
        card = response.data["results"][0]
        self.assertEqual(card["price"], "9000.00")
        self.assertEqual(card["variant_count"], 2)

    def test_inactive_variant_is_never_priced_or_sold(self):
        """A deactivated variant must not set the "from" price.

        Otherwise deactivating the cheap size leaves the grid advertising its
        price while the product page only offers the expensive one.
        """
        product = self.make_product("Mixed Variants", slug="mixed")
        self.make_variant(product, sku="MX-ON", price="15000", stock=2)
        self.make_variant(product, sku="MX-OFF", price="500", stock=2, is_active=False)

        card = self.list_products().data["results"][0]
        self.assertEqual(card["price"], "15000.00")
        self.assertEqual(card["variant_count"], 1)

        detail = self.client.get(
            reverse("storefront_v2:product-detail", args=["mixed"])
        )
        skus = [variant["sku"] for variant in detail.data["variants"]]
        self.assertEqual(skus, ["MX-ON"])

    def test_genuine_discount_is_shown_with_savings(self):
        product = self.make_product("On Sale", slug="on-sale")
        self.make_variant(product, sku="OS-1", price="8000", compare_at="10000", stock=5)

        detail = self.client.get(
            reverse("storefront_v2:product-detail", args=["on-sale"])
        )
        variant = detail.data["variants"][0]
        self.assertEqual(variant["compare_at_price"], "10000.00")
        self.assertEqual(variant["savings"], "2000.00")
        self.assertEqual(variant["discount_percentage"], 20)

    def test_fake_discount_is_suppressed(self):
        """A compare-at price at or below the selling price is not a discount.

        Displaying one is a deceptive-pricing claim, and in Pakistan it is the
        kind of thing that gets screenshotted.
        """
        product = self.make_product("Fake Sale", slug="fake-sale")
        variant = self.make_variant(product, sku="FS-1", price="8000", stock=5)
        # Bypass model validation the way a legacy row or a bad import would.
        ProductVariant.objects.filter(pk=variant.pk).update(
            compare_at_price=Decimal("8000")
        )

        detail = self.client.get(
            reverse("storefront_v2:product-detail", args=["fake-sale"])
        )
        payload = detail.data["variants"][0]
        self.assertIsNone(payload["compare_at_price"])
        self.assertIsNone(payload["savings"])
        self.assertEqual(payload["discount_percentage"], 0)

    # -- ratings ---------------------------------------------------------

    def test_unrated_product_returns_null_rating_not_zero(self):
        """No reviews is not a rating of zero.

        A zero renders as an empty five-star row, which reads as "rated badly",
        and an invented aggregateRating in JSON-LD is a structured-data penalty.
        """
        product = self.make_product("Brand New", slug="brand-new")
        self.make_variant(product, sku="BN-1", price="9000", stock=1)

        card = self.list_products().data["results"][0]
        self.assertIsNone(card["rating"])

    # -- filtering and search --------------------------------------------

    def test_filters_by_category_brand_goal_and_type(self):
        target = self.make_product(
            "Target Product", slug="target", goals=[self.goal]
        )
        self.make_variant(target, sku="TG-1", price="9000", stock=1)

        other = self.make_product(
            "Other Product", slug="other",
            category=self.other_category, brand=self.other_brand,
            supplement_type="CREATINE",
        )
        self.make_variant(other, sku="OT-1", price="4000", stock=1)

        for params in (
            {"category": "protein"},
            {"brand": "optimum-nutrition"},
            {"goal": "muscle-gain"},
            {"type": "WHEY"},
        ):
            with self.subTest(params=params):
                slugs = [
                    item["slug"] for item in self.list_products(**params).data["results"]
                ]
                self.assertEqual(slugs, ["target"])

    def test_multiple_brands_are_combined_with_or(self):
        first = self.make_product("First", slug="first")
        self.make_variant(first, sku="F-1", price="9000", stock=1)
        second = self.make_product("Second", slug="second", brand=self.other_brand)
        self.make_variant(second, sku="S-1", price="9000", stock=1)

        response = self.client.get(
            reverse("storefront_v2:product-list"),
            {"brand": ["optimum-nutrition", "dymatize"]},
        )
        self.assertEqual(len(response.data["results"]), 2)

    def test_search_matches_name_brand_and_sku(self):
        product = self.make_product("Gold Standard Whey", slug="gsw")
        self.make_variant(product, sku="ON-GSW-2LB", price="9000", stock=1)
        decoy = self.make_product(
            "Creatine Mono", slug="cm",
            category=self.other_category, brand=self.other_brand,
        )
        self.make_variant(decoy, sku="CM-1", price="4000", stock=1)

        for term in ("gold", "optimum", "ON-GSW"):
            with self.subTest(term=term):
                slugs = [
                    item["slug"] for item in self.list_products(q=term).data["results"]
                ]
                self.assertEqual(slugs, ["gsw"])

    def test_search_understands_supplement_synonyms(self):
        """"preworkout" and "pre-workout" are the same shelf to a customer."""
        product = self.make_product(
            "Pre-Workout Blast", slug="pwb", supplement_type="PRE_WORKOUT"
        )
        self.make_variant(product, sku="PW-1", price="6000", stock=1)

        slugs = [item["slug"] for item in self.list_products(q="preworkout").data["results"]]
        self.assertEqual(slugs, ["pwb"])

    def test_price_range_filter(self):
        cheap = self.make_product("Cheap", slug="cheap")
        self.make_variant(cheap, sku="CH-1", price="3000", stock=1)
        pricey = self.make_product("Pricey", slug="pricey")
        self.make_variant(pricey, sku="PY-1", price="20000", stock=1)

        slugs = [
            item["slug"]
            for item in self.list_products(min_price="5000").data["results"]
        ]
        self.assertEqual(slugs, ["pricey"])

    def test_sorting_by_price(self):
        cheap = self.make_product("Cheap", slug="cheap-2")
        self.make_variant(cheap, sku="CH-2", price="3000", stock=1)
        pricey = self.make_product("Pricey", slug="pricey-2")
        self.make_variant(pricey, sku="PY-2", price="20000", stock=1)

        low = [i["slug"] for i in self.list_products(sort="price_low").data["results"]]
        high = [i["slug"] for i in self.list_products(sort="price_high").data["results"]]
        self.assertEqual(low, ["cheap-2", "pricey-2"])
        self.assertEqual(high, ["pricey-2", "cheap-2"])

    def test_unknown_sort_falls_back_instead_of_erroring(self):
        product = self.make_product("Anything", slug="anything")
        self.make_variant(product, sku="AN-1", price="9000", stock=1)

        response = self.list_products(sort="; DROP TABLE products;")
        self.assertEqual(response.status_code, 200)

    # -- filters endpoint ------------------------------------------------

    def test_filters_endpoint_reports_real_options_with_counts(self):
        product = self.make_product("Whey One", slug="whey-one", goals=[self.goal])
        self.make_variant(product, sku="W1-A", price="9000", stock=1,
                          flavor="Chocolate", size="2lb")
        self.make_variant(product, sku="W1-B", price="18000", stock=1,
                          flavor="Vanilla", size="5lb")

        response = self.client.get(reverse("storefront_v2:filters"))
        self.assertEqual(response.status_code, 200)
        data = response.data

        self.assertEqual(
            data["brands"], [{"slug": "optimum-nutrition", "name": "Optimum Nutrition", "count": 1}]
        )
        self.assertEqual(data["flavors"], ["Chocolate", "Vanilla"])
        self.assertEqual(data["sizes"], ["2lb", "5lb"])
        self.assertEqual(data["price"], {"min": "9000.00", "max": "18000.00"})

    def test_filters_endpoint_excludes_draft_products(self):
        draft = self.make_product("Hidden", slug="hidden", status=Product.STATUS_DRAFT)
        self.make_variant(draft, sku="HD-1", price="9000", stock=1, flavor="Secret")

        data = self.client.get(reverse("storefront_v2:filters")).data
        self.assertEqual(data["flavors"], [])
        self.assertEqual(data["brands"], [])

    # -- related ---------------------------------------------------------

    def test_related_excludes_self_and_prefers_shared_goals(self):
        anchor = self.make_product("Anchor", slug="anchor", goals=[self.goal])
        self.make_variant(anchor, sku="AC-1", price="9000", stock=1)

        shares_goal = self.make_product(
            "Shares Goal", slug="shares-goal",
            category=self.other_category, goals=[self.goal],
        )
        self.make_variant(shares_goal, sku="SG-1", price="9000", stock=1)

        same_category = self.make_product("Same Category", slug="same-category")
        self.make_variant(same_category, sku="SC-1", price="9000", stock=1)

        response = self.client.get(
            reverse("storefront_v2:product-related", args=["anchor"])
        )
        slugs = [item["slug"] for item in response.data]
        self.assertNotIn("anchor", slugs)
        self.assertEqual(slugs[0], "shares-goal")
        self.assertIn("same-category", slugs)

    # -- sitemap ---------------------------------------------------------

    def test_sitemap_lists_only_indexable_products(self):
        live = self.make_product("Indexed", slug="indexed")
        self.make_variant(live, sku="IX-1", price="9000", stock=1)
        self.make_product("Not Indexed", slug="not-indexed", status=Product.STATUS_DRAFT)

        data = self.client.get(reverse("storefront_v2:sitemap")).data
        slugs = [entry["slug"] for entry in data["products"]]
        self.assertEqual(slugs, ["indexed"])
        self.assertIn("updated_at", data["products"][0])

    # -- performance -----------------------------------------------------

    def test_listing_query_count_does_not_grow_with_catalogue_size(self):
        """The N+1 guard.

        Twelve products with two variants each must cost the same number of
        queries as one. Without the prefetches and the single balances lookup
        this is ~50 queries, and every category page pays it.
        """
        def build(count, offset=0):
            for index in range(offset, offset + count):
                product = self.make_product(f"Product {index}", slug=f"product-{index}")
                self.make_variant(product, sku=f"P{index}-A", price="9000", stock=2)
                self.make_variant(product, sku=f"P{index}-B", price="18000", stock=2)
                ProductMedia.objects.create(
                    product=product, image="products/test.jpg", is_primary=True
                )

        build(1)
        # 1 stock location, 1 pagination count, 1 products, 3 prefetches
        # (variants, media, goals), 1 balances.
        with self.assertNumQueries(7):
            self.list_products()

        build(11, offset=1)
        # Twelve products with two variants and an image each must cost exactly
        # what one did. Any per-row query would show up here as a jump.
        with self.assertNumQueries(7):
            response = self.list_products()
        self.assertEqual(len(response.data["results"]), 12)

    def test_detail_query_count_is_bounded(self):
        product = self.make_product("Detailed", slug="detailed", goals=[self.goal])
        for index in range(5):
            self.make_variant(product, sku=f"DT-{index}", price="9000", stock=1)
        ProductMedia.objects.create(
            product=product, image="products/test.jpg", is_primary=True
        )

        # 1 stock location, 1 product, 3 prefetches, 1 balances.
        with self.assertNumQueries(6):
            response = self.client.get(
                reverse("storefront_v2:product-detail", args=["detailed"])
            )
        self.assertEqual(len(response.data["variants"]), 5)

    # -- contract --------------------------------------------------------

    def test_storefront_payload_leaks_no_internal_fields(self):
        """The public payload is an allowlist, not the model minus a few keys.

        Asserting on the exact key set means adding an internal field to the
        model can never silently publish it.
        """
        product = self.make_product("Contract", slug="contract")
        self.make_variant(product, sku="CT-1", price="9000", stock=1)

        detail = self.client.get(
            reverse("storefront_v2:product-detail", args=["contract"])
        ).data
        self.assertEqual(
            set(detail),
            {
                "id", "name", "slug", "short_description", "description",
                "brand", "category", "goals", "supplement_type",
                "benefits", "benefit_list", "ingredients", "usage_directions",
                "warnings", "allergens", "nutrition_facts",
                "seo_title", "seo_description",
                "variants", "media", "image",
                "price", "compare_at_price", "discount_percentage", "in_stock",
                "variant_count", "rating",
            },
        )
        self.assertEqual(
            set(detail["variants"][0]),
            {
                "id", "sku", "flavor", "size_label", "descriptor",
                "serving_count", "serving_size", "net_weight_grams",
                "price", "compare_at_price", "savings", "discount_percentage",
                "available", "in_stock",
            },
        )

    def test_storefront_endpoints_need_no_authentication(self):
        product = self.make_product("Public", slug="public")
        self.make_variant(product, sku="PB-1", price="9000", stock=1)

        for name, args in (
            ("storefront_v2:product-list", []),
            ("storefront_v2:product-detail", ["public"]),
            ("storefront_v2:filters", []),
            ("storefront_v2:brand-list", []),
            ("storefront_v2:category-list", []),
            ("storefront_v2:goal-list", []),
            ("storefront_v2:sitemap", []),
        ):
            with self.subTest(endpoint=name):
                response = APIClient().get(reverse(name, args=args))
                self.assertEqual(response.status_code, 200)

    def test_benefits_are_split_into_a_list_for_rendering(self):
        product = self.make_product("Benefits", slug="benefits")
        product.benefits = "24g protein\n\n5.5g BCAAs\n  Low sugar  "
        product.save()
        self.make_variant(product, sku="BF-1", price="9000", stock=1)

        detail = self.client.get(
            reverse("storefront_v2:product-detail", args=["benefits"])
        ).data
        self.assertEqual(
            detail["benefit_list"], ["24g protein", "5.5g BCAAs", "Low sugar"]
        )
