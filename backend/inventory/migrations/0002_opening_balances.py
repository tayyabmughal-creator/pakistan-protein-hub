"""Create the shop location and open inventory from legacy Product.stock.

Two things happen here, and the second one is a claim that needs qualifying.

**The location.** One row: the Pak Nutrition shop, which is both the counter and
the fulfilment point.

**Opening balances.** Every legacy `Product.stock` becomes an `InventoryBalance`
for that product's default variant, with a matching opening movement so the
ledger sums to the balance from nothing.

That opening movement is posted as `MANUAL_ADJUSTMENT`, not `RECEIPT`, and that
is deliberate. A RECEIPT asserts goods arrived from a supplier and were counted.
Nothing of the sort happened: a number was copied out of a column that any code
path could previously write, that was never reconciled against a shelf, and that
the old `deduct_stock` could silently desynchronise. Calling it a receipt would
launder a guess into a fact.

`last_counted_at` is left null for the same reason. Every one of these balances
is unverified until someone counts the shelf, and the admin should say so.
"""

from django.db import migrations

OPENING_REASON = (
    "Opening balance migrated from legacy Product.stock. Not physically counted "
    "— reconcile against a stocktake before trusting it."
)


def forwards(apps, schema_editor):
    InventoryLocation = apps.get_model("inventory", "InventoryLocation")
    InventoryBalance = apps.get_model("inventory", "InventoryBalance")
    StockMovement = apps.get_model("inventory", "StockMovement")
    ProductVariant = apps.get_model("products", "ProductVariant")

    location, _ = InventoryLocation.objects.get_or_create(
        code="main-shop",
        defaults={
            "name": "Pak Nutrition Shop",
            "is_fulfilment": True,
            "is_pickup_point": True,
            "is_active": True,
            "is_default": True,
        },
    )

    # Guarantee exactly one default even if a location already existed.
    if not InventoryLocation.objects.filter(is_default=True).exists():
        location.is_default = True
        location.save(update_fields=["is_default"])

    variants = ProductVariant.objects.select_related("product").filter(is_default=True)

    for variant in variants.iterator():
        if InventoryBalance.objects.filter(variant=variant, location=location).exists():
            continue  # idempotent: already opened

        quantity = max(int(variant.product.stock or 0), 0)

        InventoryBalance.objects.create(
            variant=variant,
            location=location,
            on_hand=quantity,
            reserved=0,
            low_stock_threshold=5,
            last_counted_at=None,
        )

        if quantity:
            StockMovement.objects.create(
                variant=variant,
                location=location,
                quantity=quantity,
                movement_type="MANUAL_ADJUSTMENT",
                reference="migration:opening-balance",
                reason=OPENING_REASON,
                balance_after=quantity,
            )


def backwards(apps, schema_editor):
    InventoryBalance = apps.get_model("inventory", "InventoryBalance")
    StockMovement = apps.get_model("inventory", "StockMovement")

    StockMovement.objects.filter(reference="migration:opening-balance").delete()
    # Only balances this created, i.e. those never touched by a real movement.
    InventoryBalance.objects.filter(last_counted_at__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0001_initial"),
        ("products", "0005_backfill_catalog_v2"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
