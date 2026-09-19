"""Turn every legacy product into a branded product with a sellable variant.

Each legacy row carried its brand as a string, its price and discount on the
product, its stock as a single integer, and one image. This creates the
structures that replace them:

    Product.brand string  ->  Brand row, linked via brand_ref
    Product.price/discount ->  a default ProductVariant holding the real price
    Product.image          ->  a primary ProductMedia row

Inventory is deliberately **not** created here — `inventory/migrations/0002`
does that, after this has produced the variants for it to hang balances on.

Idempotent: re-running creates nothing new. Reversible: the reverse drops the
generated variants and media but leaves the legacy columns alone, because those
are what the current storefront still reads.

Self-contained by design. Data migrations must not import application code —
`Product.save()` today is not `Product.save()` when someone replays this
migration in a year.
"""

from decimal import Decimal

from django.db import migrations
from django.utils.text import slugify


def _unique(model, field, value, fallback, max_length):
    """A unique value for `field`, derived from `value`."""
    base = (value or fallback)[:max_length]
    candidate = base
    counter = 2
    while model.objects.filter(**{field: candidate}).exists():
        suffix = f"-{counter}"
        candidate = base[: max_length - len(suffix)] + suffix
        counter += 1
    return candidate


def build_sku(ProductVariant, product):
    """A readable, stable SKU. Staff read these off a tub; ids mean nothing.

    `PN-WHEY-GOLD-2KG`, not `PN-1047`.
    """
    parts = [slugify(product.slug or product.name).upper().replace("-", "-")]
    if product.weight:
        weight = slugify(product.weight).upper()
        if weight and weight not in parts[0]:
            parts.append(weight)
    base = "PN-" + "-".join(part for part in parts if part)
    return _unique(ProductVariant, "sku", base, "PN-ITEM", 64)


def forwards(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Brand = apps.get_model("products", "Brand")
    ProductVariant = apps.get_model("products", "ProductVariant")
    ProductMedia = apps.get_model("products", "ProductMedia")

    brands_by_name = {}

    for product in Product.objects.all().iterator():
        # -- brand --------------------------------------------------------
        raw_brand = (product.brand or "").strip()
        if raw_brand and product.brand_ref_id is None:
            key = raw_brand.casefold()
            brand = brands_by_name.get(key)
            if brand is None:
                # Match case-insensitively so "MuscleTech" and "Muscletech"
                # become one brand rather than two.
                brand = Brand.objects.filter(name__iexact=raw_brand).first()
                if brand is None:
                    brand = Brand.objects.create(
                        name=raw_brand,
                        slug=_unique(Brand, "slug", slugify(raw_brand), "brand", 140),
                        is_active=True,
                    )
                brands_by_name[key] = brand
            product.brand_ref = brand
            product.save(update_fields=["brand_ref"])

        # -- default variant ----------------------------------------------
        if not ProductVariant.objects.filter(product=product).exists():
            legacy_price = product.price or Decimal("0.00")
            legacy_discount = product.discount_price

            # The legacy pair is (price, discount_price) where discount_price is
            # what the customer actually paid. The variant pair is
            # (price, compare_at_price) where price is what they pay. Mapping
            # them the other way round would silently raise every discounted
            # product to its pre-discount price.
            if legacy_discount and legacy_discount < legacy_price:
                selling_price = legacy_discount
                compare_at = legacy_price
            else:
                selling_price = legacy_price
                compare_at = None

            ProductVariant.objects.create(
                product=product,
                sku=build_sku(ProductVariant, product),
                flavor="",
                size_label=product.weight or "",
                price=selling_price,
                compare_at_price=compare_at,
                is_active=product.is_active,
                is_default=True,
                sort_order=0,
            )

        # -- media ----------------------------------------------------------
        if product.image and not ProductMedia.objects.filter(product=product).exists():
            ProductMedia.objects.create(
                product=product,
                variant=None,
                image=product.image,
                # Deliberately the product name, not empty: a missing alt text
                # is an accessibility failure on every page it appears, and the
                # name is a truthful description until someone writes better.
                alt_text=product.name[:160],
                sort_order=0,
                is_primary=True,
            )

        # -- publish status mirrors the legacy active flag -------------------
        if product.is_active and product.publish_status != "PUBLISHED":
            product.publish_status = "PUBLISHED"
            product.save(update_fields=["publish_status"])
        elif not product.is_active and product.publish_status == "PUBLISHED":
            product.publish_status = "DRAFT"
            product.save(update_fields=["publish_status"])


def backwards(apps, schema_editor):
    """Remove what this created. The legacy columns are untouched.

    Variants and media generated here are dropped; brands are left, because a
    brand may have been edited by hand since and deleting it would lose that.
    """
    ProductVariant = apps.get_model("products", "ProductVariant")
    ProductMedia = apps.get_model("products", "ProductMedia")

    ProductMedia.objects.filter(variant__isnull=True, is_primary=True).delete()
    ProductVariant.objects.filter(is_default=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0004_goal_productmedia_productvariant_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
