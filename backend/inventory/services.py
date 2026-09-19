"""The only sanctioned way to move stock.

Every function here holds three properties, and the tests in
``inventory/tests/`` exist to prove each one:

**Transactional.** The balance and the ledger row are written together or not at
all. A ledger that disagrees with the balance is worse than no ledger.

**Concurrency-safe.** Balances are locked with ``select_for_update`` before being
read, so two checkouts for the last tub serialise instead of both succeeding.
This is why production must be PostgreSQL — on SQLite ``select_for_update`` is a
silent no-op, which the production config check now refuses to allow.

**Idempotent where it matters.** Reserving twice for the same checkout holds
stock once; committing twice sells once; releasing twice frees once. Retries and
duplicate webhook deliveries are normal, not exceptional.

The invariant underneath all of it: ``available = on_hand - reserved`` and it is
never negative. The database enforces that with check constraints, so a mistake
here surfaces as an IntegrityError rather than as overselling.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, OperationalError, transaction
from django.db.models import F, Sum
from django.utils import timezone

from .models import InventoryBalance, InventoryLocation, StockMovement, StockReservation

logger = logging.getLogger(__name__)

#: How long a checkout may hold stock before a sweeper can release it. Long
#: enough for a customer to finish at a bank's OTP page, short enough that an
#: abandoned attempt does not keep the last tub out of the catalogue.
RESERVATION_TTL = timedelta(minutes=30)


#: How many times to re-run a transaction that PostgreSQL aborted for deadlock.
MAX_DEADLOCK_RETRIES = 4


def retry_on_deadlock(func):
    """Re-run a transaction that PostgreSQL aborted to break a deadlock.

    A deadlock here is not a correctness failure — it is PostgreSQL doing its
    job. Stock operations touch a balance row, a reservation row, a movement
    row and, through foreign keys, the shared location row. PostgreSQL takes a
    ``FOR KEY SHARE`` lock on the parent of every foreign key it writes, so a
    handful of concurrent operations against the *same location* can acquire
    those locks in different orders and form a cycle. One transaction is
    aborted; the invariants are never violated.

    What is not acceptable is the customer seeing that. A deadlock means "try
    again", so this retries with a short escalating backoff and a little jitter,
    and only re-raises if contention genuinely does not clear.

    Only retries when this is the outermost transaction. Inside a caller's
    ``atomic`` block the whole transaction is already doomed, so retrying here
    would re-run against a connection that can only error — the outer caller has
    to handle it.
    """
    import functools
    import random
    import time

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        if transaction.get_connection().in_atomic_block:
            return func(*args, **kwargs)

        for attempt in range(MAX_DEADLOCK_RETRIES):
            try:
                return func(*args, **kwargs)
            except OperationalError as exc:
                if "deadlock detected" not in str(exc).lower():
                    raise
                if attempt == MAX_DEADLOCK_RETRIES - 1:
                    logger.error(
                        "Stock operation still deadlocking after %s attempts",
                        MAX_DEADLOCK_RETRIES,
                        extra={"operation": func.__name__},
                    )
                    raise
                delay = (0.05 * (2**attempt)) + random.uniform(0, 0.05)
                logger.info(
                    "Deadlock on stock operation; retrying",
                    extra={"operation": func.__name__, "attempt": attempt + 1},
                )
                time.sleep(delay)

    return wrapper


class InsufficientStock(ValidationError):
    """Not enough available to satisfy the request."""

    def __init__(self, variant, requested, available):
        self.variant = variant
        self.requested = requested
        self.available = available
        label = getattr(variant, "display_name", None) or getattr(variant, "sku", str(variant))
        if available <= 0:
            message = f"{label} is out of stock."
        else:
            message = f"Only {available} left of {label}. Please update your cart."
        super().__init__(message)


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------


def get_location(location=None):
    location = location or InventoryLocation.get_default()
    if location is None:
        raise ValidationError(
            "No active inventory location is configured. Run: "
            "python manage.py ensure_inventory_location"
        )
    return location


def _balance_for_update(variant, location):
    """Fetch and lock the balance, creating it only if it genuinely does not exist.

    Locking first and creating second is deliberate, and was arrived at by
    watching a real deadlock.

    The obvious version — ``get_or_create`` then ``select_for_update`` — puts an
    INSERT attempt in the path of *every* call. Under concurrency, two
    transactions inserting the same ``(variant, location)`` both take a lock on
    the unique index, and each ends up waiting on the other's transaction to
    finish rather than on a row. Combine that with a third transaction already
    holding the balance row and PostgreSQL reports a deadlock, which is exactly
    what ``test_concurrent_sell_and_adjust_never_produces_negative_stock``
    caught.

    Balances almost always exist — ``ensure_default_variant`` opens one when the
    product is created. So take the row lock directly, and treat creation as the
    rare path, with the unique constraint as the arbiter if two callers race it.
    """
    try:
        return InventoryBalance.objects.select_for_update().get(
            variant=variant, location=location
        )
    except InventoryBalance.DoesNotExist:
        pass

    try:
        # A nested atomic block so that losing this race does not mark the
        # outer transaction as broken.
        with transaction.atomic():
            InventoryBalance.objects.create(
                variant=variant, location=location, on_hand=0, reserved=0
            )
    except IntegrityError:
        # Another transaction created it first, which is fine — that is what the
        # unique constraint is for.
        pass

    return InventoryBalance.objects.select_for_update().get(variant=variant, location=location)


def get_available(variant, location=None):
    location = get_location(location)
    balance = InventoryBalance.objects.filter(variant=variant, location=location).first()
    return balance.available if balance else 0


def available_map(variants, location=None):
    """``{variant_id: available}`` for a set of variants, in one query."""
    location = get_location(location)
    rows = InventoryBalance.objects.filter(
        variant__in=variants, location=location
    ).values("variant_id", "on_hand", "reserved")
    return {row["variant_id"]: row["on_hand"] - row["reserved"] for row in rows}


# ---------------------------------------------------------------------------
# Writing — the ledger
# ---------------------------------------------------------------------------


def _post_movement(
    *, variant, location, quantity, movement_type, balance_after, reference="", order=None,
    actor=None, reason="",
):
    return StockMovement.objects.create(
        variant=variant,
        location=location,
        quantity=quantity,
        movement_type=movement_type,
        reference=reference,
        order=order,
        actor=actor,
        reason=reason[:255],
        balance_after=balance_after,
    )


@retry_on_deadlock
@transaction.atomic
def receive_stock(*, variant, quantity, location=None, actor=None, reason="", reference=""):
    """Stock arrived from a supplier."""
    if quantity <= 0:
        raise ValidationError("Received quantity must be positive.")

    location = get_location(location)
    balance = _balance_for_update(variant, location)
    balance.on_hand = F("on_hand") + quantity
    balance.save(update_fields=["on_hand", "updated_at"])
    balance.refresh_from_db()

    _post_movement(
        variant=variant, location=location, quantity=quantity,
        movement_type=StockMovement.RECEIPT, balance_after=balance.on_hand,
        reference=reference, actor=actor, reason=reason,
    )
    logger.info(
        "Stock received", extra={"sku": variant.sku, "quantity": quantity, "on_hand": balance.on_hand}
    )
    return balance


@retry_on_deadlock
@transaction.atomic
def adjust_stock(*, variant, delta, movement_type, location=None, actor=None, reason="", reference=""):
    """Correct a balance by hand: damage, write-off, stocktake.

    A reason is required. "Why is on_hand different from yesterday" must always
    have an answer, and an adjustment without one is indistinguishable from
    theft or a bug.
    """
    if delta == 0:
        raise ValidationError("An adjustment must change the quantity.")
    if movement_type in StockMovement.OPERATOR_TYPES and not reason.strip():
        raise ValidationError("A reason is required for a manual stock adjustment.")

    location = get_location(location)
    balance = _balance_for_update(variant, location)

    new_on_hand = balance.on_hand + delta
    if new_on_hand < 0:
        raise ValidationError(
            f"That would leave {variant.sku} at {new_on_hand} on hand. "
            f"Only {balance.on_hand} is recorded as present."
        )
    if new_on_hand < balance.reserved:
        raise ValidationError(
            f"{balance.reserved} of {variant.sku} is reserved for orders that have not "
            f"shipped. Reducing on hand to {new_on_hand} would leave those unfulfillable. "
            "Cancel or ship those orders first."
        )

    balance.on_hand = new_on_hand
    if movement_type == StockMovement.STOCKTAKE:
        balance.last_counted_at = timezone.now()
        balance.save(update_fields=["on_hand", "last_counted_at", "updated_at"])
    else:
        balance.save(update_fields=["on_hand", "updated_at"])

    _post_movement(
        variant=variant, location=location, quantity=delta, movement_type=movement_type,
        balance_after=balance.on_hand, reference=reference, actor=actor, reason=reason,
    )
    logger.info(
        "Stock adjusted",
        extra={
            "sku": variant.sku, "delta": delta, "movement_type": movement_type,
            "on_hand": balance.on_hand, "actor": getattr(actor, "email", "system"),
        },
    )
    return balance


def set_counted_quantity(*, variant, counted, location=None, actor=None, reason=""):
    """Record a physical count, posting the difference as a STOCKTAKE movement."""
    location = get_location(location)
    with transaction.atomic():
        balance = _balance_for_update(variant, location)
        delta = counted - balance.on_hand
        if delta == 0:
            balance.last_counted_at = timezone.now()
            balance.save(update_fields=["last_counted_at", "updated_at"])
            return balance
        return adjust_stock(
            variant=variant, delta=delta, movement_type=StockMovement.STOCKTAKE,
            location=location, actor=actor,
            reason=reason or f"Physical count: {balance.on_hand} recorded, {counted} counted.",
        )


# ---------------------------------------------------------------------------
# Writing — reserve / commit / release
# ---------------------------------------------------------------------------


@retry_on_deadlock
@transaction.atomic
def reserve(*, variant, quantity, reference, location=None, order=None, ttl=RESERVATION_TTL):
    """Hold stock for a checkout. Idempotent per (reference, variant).

    Reserving does not reduce ``on_hand`` — the goods are still on the shelf.
    It reduces what anyone else can buy.
    """
    if quantity <= 0:
        raise ValidationError("Reserved quantity must be positive.")

    location = get_location(location)

    existing = (
        StockReservation.objects.select_for_update()
        .filter(reference=reference, variant=variant, status=StockReservation.ACTIVE)
        .first()
    )
    if existing is not None:
        # A retried checkout must not hold the stock twice.
        if existing.quantity == quantity:
            return existing
        raise ValidationError(
            f"{reference} already holds {existing.quantity} of {variant.sku}; "
            f"cannot also hold {quantity}. Release it first."
        )

    balance = _balance_for_update(variant, location)
    if balance.available < quantity:
        raise InsufficientStock(variant, quantity, balance.available)

    balance.reserved = F("reserved") + quantity
    balance.save(update_fields=["reserved", "updated_at"])

    reservation = StockReservation.objects.create(
        variant=variant, location=location, quantity=quantity, reference=reference,
        order=order, status=StockReservation.ACTIVE,
        expires_at=timezone.now() + ttl if ttl else None,
    )
    logger.info(
        "Stock reserved",
        extra={"sku": variant.sku, "quantity": quantity, "reference": reference},
    )
    return reservation


@retry_on_deadlock
@transaction.atomic
def commit(*, reference, order=None, actor=None):
    """Convert every active reservation for `reference` into a sale.

    Called after a payment is verified, or when a COD order is accepted.
    Idempotent: a duplicate webhook finds nothing active and sells nothing.
    """
    reservations = list(
        StockReservation.objects.select_for_update(of=("self",))
        .filter(reference=reference, status=StockReservation.ACTIVE)
        .select_related("variant", "location")
        # Deterministic order, so two transactions touching overlapping sets of
        # variants always take the balance locks in the same sequence and cannot
        # build a cycle between them.
        .order_by("variant_id")
    )
    if not reservations:
        return []

    committed = []
    for reservation in reservations:
        balance = _balance_for_update(reservation.variant, reservation.location)

        # Clamp against what is actually there. A stocktake between reserving
        # and committing could have reduced it, and a negative balance is worse
        # than a short commit that shows up in the ledger.
        quantity = min(reservation.quantity, balance.on_hand, balance.reserved)
        if quantity <= 0:
            logger.error(
                "Reservation could not be committed — nothing left to draw on",
                extra={
                    "sku": reservation.variant.sku, "reference": reference,
                    "reserved": balance.reserved, "on_hand": balance.on_hand,
                },
            )
        else:
            balance.on_hand = F("on_hand") - quantity
            balance.reserved = F("reserved") - quantity
            balance.save(update_fields=["on_hand", "reserved", "updated_at"])
            balance.refresh_from_db()

            _post_movement(
                variant=reservation.variant, location=reservation.location,
                quantity=-quantity, movement_type=StockMovement.SALE,
                balance_after=balance.on_hand, reference=reference,
                order=order or reservation.order, actor=actor,
            )

        reservation.status = StockReservation.COMMITTED
        reservation.resolved_at = timezone.now()
        if order is not None and reservation.order_id is None:
            reservation.order = order
            reservation.save(update_fields=["status", "resolved_at", "order"])
        else:
            reservation.save(update_fields=["status", "resolved_at"])
        committed.append(reservation)

    logger.info(
        "Reservations committed", extra={"reference": reference, "count": len(committed)}
    )
    return committed


@retry_on_deadlock
@transaction.atomic
def release(*, reference, reason="", status=StockReservation.RELEASED):
    """Give back stock held for `reference`. Idempotent."""
    reservations = list(
        StockReservation.objects.select_for_update(of=("self",))
        .filter(reference=reference, status=StockReservation.ACTIVE)
        .select_related("variant", "location")
        .order_by("variant_id")
    )
    if not reservations:
        return []

    for reservation in reservations:
        balance = _balance_for_update(reservation.variant, reservation.location)
        # Never drive reserved below zero, whatever else has happened.
        quantity = min(reservation.quantity, balance.reserved)
        if quantity > 0:
            balance.reserved = F("reserved") - quantity
            balance.save(update_fields=["reserved", "updated_at"])

        reservation.status = status
        reservation.resolved_at = timezone.now()
        reservation.save(update_fields=["status", "resolved_at"])

    logger.info(
        "Reservations released",
        extra={"reference": reference, "count": len(reservations), "reason": reason},
    )
    return reservations


@retry_on_deadlock
@transaction.atomic
def return_to_stock(*, variant, quantity, location=None, order=None, actor=None, reason="", reference=""):
    """A customer sent goods back and they are sellable again.

    Separate from a refund on purpose: money and goods move independently, and
    treating them as one thing is how a business refunds for stock it never got
    back. See `orders.services.ReturnService`.
    """
    if quantity <= 0:
        raise ValidationError("Returned quantity must be positive.")

    location = get_location(location)
    balance = _balance_for_update(variant, location)
    balance.on_hand = F("on_hand") + quantity
    balance.save(update_fields=["on_hand", "updated_at"])
    balance.refresh_from_db()

    _post_movement(
        variant=variant, location=location, quantity=quantity,
        movement_type=StockMovement.RETURN, balance_after=balance.on_hand,
        reference=reference, order=order, actor=actor, reason=reason,
    )
    return balance


@retry_on_deadlock
@transaction.atomic
def restock_cancelled(*, variant, quantity, location=None, order=None, actor=None, reference=""):
    """An order that had already been committed is cancelled. Put it back."""
    if quantity <= 0:
        raise ValidationError("Cancelled quantity must be positive.")

    location = get_location(location)
    balance = _balance_for_update(variant, location)
    balance.on_hand = F("on_hand") + quantity
    balance.save(update_fields=["on_hand", "updated_at"])
    balance.refresh_from_db()

    _post_movement(
        variant=variant, location=location, quantity=quantity,
        movement_type=StockMovement.CANCELLATION, balance_after=balance.on_hand,
        reference=reference, order=order, actor=actor,
    )
    return balance


# ---------------------------------------------------------------------------
# Housekeeping
# ---------------------------------------------------------------------------


def release_expired_reservations(*, limit=500):
    """Free stock held by checkouts that were abandoned.

    Without this, every abandoned payment permanently removes stock from sale.
    Run on a schedule.
    """
    now = timezone.now()
    stale = (
        StockReservation.objects.filter(
            status=StockReservation.ACTIVE, expires_at__isnull=False, expires_at__lt=now
        )
        .values_list("reference", flat=True)
        .distinct()[:limit]
    )

    released = 0
    for reference in list(stale):
        released += len(
            release(
                reference=reference,
                reason="Reservation expired",
                status=StockReservation.EXPIRED,
            )
        )

    if released:
        logger.info("Expired reservations released", extra={"count": released})
    return released


def verify_ledger_matches_balances(*, location=None):
    """Check every balance against the sum of its ledger.

    The balance is a cache of the ledger. If they disagree, one of them is
    wrong, and silently trusting the fast one is how stock discrepancies become
    permanent. Returns a list of mismatches; empty means they agree.

    Movements that predate a balance's opening figure are accounted for by the
    opening RECEIPT/MANUAL_ADJUSTMENT the migration posts, so the ledger sums to
    on_hand from nothing.
    """
    location = get_location(location)
    ledger = {
        row["variant_id"]: row["total"] or 0
        for row in StockMovement.objects.filter(location=location)
        .values("variant_id")
        .annotate(total=Sum("quantity"))
    }

    mismatches = []
    for balance in InventoryBalance.objects.filter(location=location).select_related("variant"):
        expected = ledger.get(balance.variant_id, 0)
        if expected != balance.on_hand:
            mismatches.append(
                {
                    "sku": balance.variant.sku,
                    "variant_id": balance.variant_id,
                    "on_hand": balance.on_hand,
                    "ledger_total": expected,
                    "difference": balance.on_hand - expected,
                }
            )
    return mismatches
