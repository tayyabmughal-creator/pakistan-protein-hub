"""Keep every product sellable.

A product created without a variant has no SKU, no price and cannot be added to
a cart — it becomes a silent, unsellable catalogue entry. Products are created
from the admin form, the DRF serializer, CSV imports, tests and shell sessions,
so guaranteeing this per-caller means guaranteeing it in five places and losing
one of them.

The signal is a thin trigger. All the logic is in
``products.services.ensure_default_variant``, so it can be called and tested
directly without going through a save.
"""

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Product

logger = logging.getLogger(__name__)

#: Guard against re-entry. ensure_default_variant can lead to the product being
#: saved again, which would re-enter this handler.
_running = set()


@receiver(post_save, sender=Product, dispatch_uid="products.ensure_default_variant")
def ensure_product_is_sellable(sender, instance, created, **kwargs):
    if instance.pk in _running:
        return

    from .services import (
        apply_legacy_product_edits,
        ensure_default_variant,
        sync_legacy_product_fields,
    )

    _running.add(instance.pk)
    try:
        # on_commit would be wrong here: a product created inside a transaction
        # that then adds a cart item needs its variant to exist immediately.
        variant = ensure_default_variant(instance)
        if variant is not None and created:
            logger.info(
                "Default variant created for new product",
                extra={"product_id": instance.pk, "sku": variant.sku},
            )
            return

        # An existing product was saved. The legacy price and stock columns are
        # still editable by the current admin, so treat a change to them as an
        # instruction to the variant and the ledger, then write the true values
        # back so the columns never drift from what they now derive from.
        instance.refresh_from_db(fields=["price", "discount_price", "stock"])
        changes = apply_legacy_product_edits(instance)
        if changes:
            logger.info(
                "Legacy product edit applied to variant and ledger",
                extra={"product_id": instance.pk, "changes": changes},
            )
        sync_legacy_product_fields(instance)
    except Exception:  # noqa: BLE001 — never let this fail a product save
        logger.exception(
            "Could not create a default variant; product is not sellable yet",
            extra={"product_id": instance.pk},
        )
    finally:
        _running.discard(instance.pk)
