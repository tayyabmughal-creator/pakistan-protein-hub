"""Derive the new order fields from what existing orders already say.

Historical orders keep a single combined ``status`` that conflated "has the
money arrived" with "where are the goods". This reconstructs the two separate
facts from it, and fills in the line snapshots that order items were missing.

Nothing existing is rewritten. ``status``, ``total_amount``, ``price`` and
every other figure already on these rows is left exactly as it is — they are a
financial record, and a migration that edits one is a migration that rewrites
history. Only the new columns are populated.

The one judgement call is COD payment status. A delivered COD order was paid in
cash at the door, so it becomes PAID with ``paid_at`` set to its delivery time.
An undelivered one becomes COD_PENDING: cash that is owed, not cash received.
That is the distinction the old single field could not express and the reason
unpaid parcels were being counted as revenue.
"""

from django.db import migrations

#: Legacy combined status -> fulfilment status.
FULFILMENT_FROM_STATUS = {
    "PENDING": "PENDING_CONFIRMATION",
    "CONFIRMED": "CONFIRMED",
    "SHIPPED": "SHIPPED",
    "DELIVERED": "DELIVERED",
    "CANCELLED": "CANCELLED",
}


def forwards(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    OrderItem = apps.get_model("orders", "OrderItem")

    for order in Order.objects.all().iterator():
        updates = {}

        # -- fulfilment ---------------------------------------------------
        fulfilment = FULFILMENT_FROM_STATUS.get(order.status, "PENDING_CONFIRMATION")
        if order.fulfilment_status != fulfilment:
            updates["fulfilment_status"] = fulfilment

        # -- payment ------------------------------------------------------
        if order.payment_method == "COD" and order.payment_status == "PENDING":
            if order.status == "DELIVERED":
                # The rider collected the cash. This is real revenue, and it was
                # previously indistinguishable from a parcel still in transit.
                updates["payment_status"] = "PAID"
                if order.paid_at is None:
                    updates["paid_at"] = order.updated_at
            elif order.status != "CANCELLED":
                updates["payment_status"] = "COD_PENDING"

        # -- milestone timestamps -----------------------------------------
        # Reconstructed from what is knowable. `updated_at` is the last time the
        # row changed, which for a terminal order is when it reached that state.
        if fulfilment == "DELIVERED" and order.delivered_at is None:
            updates["delivered_at"] = order.updated_at
        elif fulfilment == "SHIPPED" and order.shipped_at is None:
            updates["shipped_at"] = order.updated_at
        elif fulfilment == "CANCELLED" and order.cancelled_at is None:
            updates["cancelled_at"] = order.updated_at
        if fulfilment in {"CONFIRMED", "SHIPPED", "DELIVERED"} and order.confirmed_at is None:
            updates["confirmed_at"] = order.created_at

        # -- inventory ------------------------------------------------------
        # Every pre-existing order deducted stock at creation time, so anything
        # not cancelled has already taken its goods out of inventory. Marking
        # them committed stops a later cancellation restocking units twice.
        if fulfilment != "CANCELLED":
            updates["inventory_committed"] = True

        if updates:
            for field, value in updates.items():
                setattr(order, field, value)
            Order.objects.filter(pk=order.pk).update(**updates)

    # -- line snapshots ----------------------------------------------------
    for item in OrderItem.objects.select_related("product").iterator():
        updates = {}

        if not item.line_total:
            updates["line_total"] = item.price * item.quantity

        if not item.sku and item.product_id:
            variant = (
                item.product.variants.filter(is_default=True).first()
                or item.product.variants.first()
            )
            if variant is not None:
                updates["sku"] = variant.sku
                updates["variant"] = variant
                descriptor = ", ".join(
                    part for part in (variant.flavor, variant.size_label) if part
                )
                if descriptor:
                    updates["variant_description"] = descriptor[:160]

        if not item.brand_name and item.product_id:
            brand = item.product.brand or ""
            if brand:
                updates["brand_name"] = brand[:120]

        if updates:
            OrderItem.objects.filter(pk=item.pk).update(**updates)


def backwards(apps, schema_editor):
    """No-op. The new columns go away with the schema migration, and nothing
    that existed before this ran was modified."""


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0007_alter_order_options_order_cancelled_at_and_more"),
        ("products", "0005_backfill_catalog_v2"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
