"""Catalogue services.

``StockService`` is kept as a thin shim over `inventory.services` so that
existing callers keep working while the inventory ledger becomes the real
source of truth. It is deprecated; new code calls `inventory.services` directly.

``sync_legacy_product_fields`` keeps ``Product.price``/``stock``/``image``
readable for the Vite storefront and the Expo admin, which still consume them.
They are outputs now, not inputs: the variant sets the price and the ledger sets
the stock.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import Product

logger = logging.getLogger(__name__)


def build_sku(product, *, flavor="", size_label=""):
    """A readable, stable SKU. Staff read these off a tub; ids mean nothing."""
    from django.utils.text import slugify

    from .models import ProductVariant

    parts = [slugify(product.slug or product.name).upper()]
    for extra in (flavor, size_label):
        token = slugify(extra).upper() if extra else ""
        if token and token not in parts[0]:
            parts.append(token)
    base = "PN-" + "-".join(part for part in parts if part)
    base = base[:64]

    candidate = base
    counter = 2
    while ProductVariant.objects.filter(sku=candidate).exists():
        suffix = f"-{counter}"
        candidate = base[: 64 - len(suffix)] + suffix
        counter += 1
    return candidate


def ensure_default_variant(product):
    """Guarantee the product has one sellable variant, and a balance to sell from.

    Every path that creates a product must produce something sellable. The admin
    product form, the DRF serializer, CSV imports and tests all create a
    ``Product`` with a price and a stock number and no concept of variants — and
    a product without a variant has no SKU, no price and cannot be added to a
    cart, so it would silently become an unsellable catalogue entry.

    Called from a ``post_save`` signal rather than from each caller, precisely
    because there are many callers and missing one produces that silent failure.
    The logic itself lives here, not in the signal, so it can be called directly
    and tested directly.

    Idempotent: does nothing when a variant already exists.
    """
    from inventory.models import InventoryBalance, InventoryLocation, StockMovement
    from .models import ProductVariant

    if ProductVariant.objects.filter(product=product).exists():
        return None

    legacy_price = product.price or Decimal("0.00")
    legacy_discount = product.discount_price
    if legacy_discount and legacy_discount < legacy_price:
        selling_price, compare_at = legacy_discount, legacy_price
    else:
        selling_price, compare_at = legacy_price, None

    variant = ProductVariant.objects.create(
        product=product,
        sku=build_sku(product, size_label=product.weight or ""),
        size_label=product.weight or "",
        price=selling_price,
        compare_at_price=compare_at,
        is_active=product.is_active,
        is_default=True,
    )

    # Open the balance from the legacy stock figure, with a movement so the
    # ledger still sums to the balance. Same reasoning as the migration: this is
    # a migrated number, not a counted one, so it is an adjustment rather than a
    # receipt and last_counted_at stays null.
    location = InventoryLocation.get_default()
    if location is not None:
        quantity = max(int(product.stock or 0), 0)
        balance, created = InventoryBalance.objects.get_or_create(
            variant=variant, location=location, defaults={"on_hand": quantity}
        )
        if created and quantity:
            StockMovement.objects.create(
                variant=variant,
                location=location,
                quantity=quantity,
                movement_type=StockMovement.MANUAL_ADJUSTMENT,
                reference="product:created",
                reason="Opening balance from the product's initial stock figure. Not counted.",
                balance_after=quantity,
            )
    return variant


def apply_legacy_product_edits(product, *, actor=None):
    """Push an edit made to the legacy columns down into the variant and ledger.

    Transitional, and it exists for one reason: the admin product form and the
    Expo admin app both still edit ``Product.price``, ``discount_price`` and
    ``stock``. If those became read-only outputs the moment variants arrived,
    staff would lose the ability to change a price on a live shop.

    So the legacy columns remain writable and are treated as an *instruction*:

    * a price edit is pushed to the default variant, which is what checkout
      actually charges;
    * a stock edit becomes a real ledger movement with a reason, not a silent
      overwrite — otherwise the audit trail would have a hole in it exactly
      where someone changed a number by hand.

    Removed once the admin edits variants directly, in Phase 4.

    Returns a list of what it changed, for logging.
    """
    from inventory import services as inventory_services
    from inventory.models import InventoryBalance, InventoryLocation, StockMovement

    variant = product.default_variant
    if variant is None:
        return []

    changes = []

    # -- price ------------------------------------------------------------
    # What the legacy columns *would* read if derived from the variant. A
    # difference means somebody edited them.
    if variant.has_genuine_discount:
        derived = (variant.compare_at_price, variant.price)
    else:
        derived = (variant.price, None)

    current = (product.price, product.discount_price)
    if current != derived:
        if product.discount_price and product.price and product.discount_price < product.price:
            variant.price = product.discount_price
            variant.compare_at_price = product.price
        else:
            variant.price = product.price or Decimal("0.00")
            variant.compare_at_price = None
        variant.save(update_fields=["price", "compare_at_price", "updated_at"])
        changes.append(f"price -> {variant.price}")

    # -- stock ------------------------------------------------------------
    location = InventoryLocation.get_default()
    if location is not None:
        balance = InventoryBalance.objects.filter(variant=variant, location=location).first()
        if balance is not None:
            requested = max(int(product.stock or 0), 0)
            # Compare against `available`, because that is what the legacy
            # column is derived from — otherwise reserved units would look like
            # a discrepancy and get "corrected" on every save.
            if requested != balance.available:
                delta = requested - balance.available
                try:
                    inventory_services.adjust_stock(
                        variant=variant,
                        delta=delta,
                        movement_type=StockMovement.MANUAL_ADJUSTMENT,
                        location=location,
                        actor=actor,
                        reason=(
                            f"Set to {requested} via the product form "
                            f"(was {balance.available} available)."
                        ),
                        reference=f"product:{product.pk}",
                    )
                    changes.append(f"stock {delta:+d} -> {requested}")
                except ValidationError as exc:
                    # Refusing is correct — e.g. reducing below what is reserved
                    # for unshipped orders. Log it rather than failing the save,
                    # and let the sync below restore the true figure.
                    logger.warning(
                        "Legacy stock edit refused",
                        extra={
                            "product_id": product.pk,
                            "sku": variant.sku,
                            "requested": requested,
                            "detail": "; ".join(exc.messages),
                        },
                    )

    return changes


def sync_legacy_product_fields(product, *, save=True):
    """Refresh the legacy columns from the variant and the inventory balance.

    Called after anything that changes a default variant's price or a balance's
    quantity. Without it the SPA would keep showing the pre-migration price.
    """
    from inventory.models import InventoryBalance, InventoryLocation

    variant = product.default_variant
    if variant is None:
        return product

    updates = {}

    # The legacy pair is (price, discount_price) where discount_price is what
    # the customer pays. Map back the way the migration mapped forwards.
    if variant.has_genuine_discount:
        updates["price"] = variant.compare_at_price
        updates["discount_price"] = variant.price
    else:
        updates["price"] = variant.price
        updates["discount_price"] = None

    if variant.size_label and variant.size_label != product.weight:
        updates["weight"] = variant.size_label

    if product.brand_ref_id and product.brand != product.brand_ref.name:
        updates["brand"] = product.brand_ref.name

    location = InventoryLocation.get_default()
    if location is not None:
        balance = InventoryBalance.objects.filter(variant=variant, location=location).first()
        # `available`, not `on_hand`: legacy `stock` is read as "can I buy this",
        # and reserved units cannot be bought.
        updates["stock"] = max(balance.available, 0) if balance else 0

    primary = product.primary_image
    if primary is not None and primary.image and product.image != primary.image:
        updates["image"] = primary.image

    changed = [field for field, value in updates.items() if getattr(product, field) != value]
    if not changed:
        return product

    for field in changed:
        setattr(product, field, updates[field])
    if save:
        product.save(update_fields=[*changed, "updated_at"])
    return product


def sync_variant_products(variants):
    """Resync the legacy columns for the products owning these variants."""
    product_ids = {variant.product_id for variant in variants}
    for product in Product.objects.filter(id__in=product_ids).prefetch_related(
        "variants", "media"
    ):
        sync_legacy_product_fields(product)


class StockService:
    """Deprecated shim. Use `inventory.services`.

    Retained because `orders.views.OrderCancelView` and the older order paths
    still call it. It now routes to the ledger rather than mutating
    ``Product.stock``, so a legacy caller cannot bypass the audit trail.
    """

    @staticmethod
    def _default_variant_or_raise(product_id):
        product = (
            Product.objects.filter(id=product_id).prefetch_related("variants").first()
        )
        if product is None:
            raise ValidationError(f"Product with id {product_id} does not exist")
        variant = product.default_variant
        if variant is None:
            raise ValidationError(f"{product.name} has no sellable variant.")
        return product, variant

    @staticmethod
    @transaction.atomic
    def deduct_stock(product_id: int, quantity: int, *, reference="", order=None):
        """Sell stock immediately, with no prior reservation.

        Reserve-then-commit is the correct path for checkout; this exists only
        for callers that have not been converted to it yet.
        """
        from inventory import services as inventory_services
        from inventory.models import StockMovement

        product, variant = StockService._default_variant_or_raise(product_id)
        location = inventory_services.get_location()
        balance = inventory_services._balance_for_update(variant, location)

        if balance.available < quantity:
            raise inventory_services.InsufficientStock(variant, quantity, balance.available)

        balance.on_hand -= quantity
        balance.save(update_fields=["on_hand", "updated_at"])
        inventory_services._post_movement(
            variant=variant, location=location, quantity=-quantity,
            movement_type=StockMovement.SALE, balance_after=balance.on_hand,
            reference=reference, order=order,
        )
        sync_legacy_product_fields(product)
        return balance.available

    @staticmethod
    @transaction.atomic
    def restore_stock(product_id: int, quantity: int, *, reference="", order=None, actor=None):
        from inventory import services as inventory_services

        product, variant = StockService._default_variant_or_raise(product_id)
        inventory_services.restock_cancelled(
            variant=variant, quantity=quantity, order=order, actor=actor, reference=reference
        )
        sync_legacy_product_fields(product)
        return inventory_services.get_available(variant)
