"""Settlement policy — the single place that decides what counts as paid.

Invariants enforced here, each with a test in ``payments/tests``:

1. Only a server-to-server source settles a payment: a signature-verified
   webhook, or a verification call this server makes to the provider. The
   browser return URL is observational and cannot settle anything.
2. A callback is matched to an internal session by the **provider tracker**
   issued at initiation — never by an identifier the caller supplies.
3. The provider-reported amount and currency must equal what PakNutrition
   expects, exactly. A mismatch parks the payment for review; it never settles.
4. Settlement is idempotent. A duplicate or late delivery is a no-op.
5. A replayed delivery is caught by a unique constraint, not a race-prone check.
6. Cancellation and failure can never overwrite a paid transaction.
"""

from __future__ import annotations

import hashlib
import json
import logging
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from orders.models import Order, PaymentSession

from .models import PKR, PaymentTransaction, WebhookEvent
from .providers.base import PaymentProviderError, ProviderStatus, SignatureError
from .providers.safepay import get_provider

logger = logging.getLogger(__name__)

#: Keys that must never reach the database from a provider payload.
_REDACT_KEYS = (
    "card", "pan", "cvv", "cvc", "card_number", "cardnumber",
    "secret", "api_key", "apikey", "password", "token_secret",
    "authorization", "auth_token", "client_secret",
)


def redact_payload(value):
    """Strip card data and credentials before persisting a provider payload."""
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if any(hint in str(key).lower() for hint in _REDACT_KEYS):
                cleaned[str(key)] = "[redacted]"
            else:
                cleaned[str(key)] = redact_payload(item)
        return cleaned
    if isinstance(value, (list, tuple)):
        return [redact_payload(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    return value


class SettlementResult:
    """What a settlement attempt did, for the caller to log or return."""

    def __init__(self, *, outcome, transaction=None, order=None, detail=""):
        self.outcome = outcome
        self.transaction = transaction
        self.order = order
        self.detail = detail

    def __repr__(self):
        return f"<SettlementResult {self.outcome}: {self.detail}>"


# ---------------------------------------------------------------------------
# Initiation
# ---------------------------------------------------------------------------


def initiate_payment(session: PaymentSession) -> PaymentSession:
    """Start a hosted checkout and record the expectation we will verify against."""
    provider = get_provider(session.provider)
    checkout = provider.initiate(
        reference=str(session.public_id),
        amount=session.total_amount,
        currency=PKR,
    )

    with transaction.atomic():
        session.gateway_tracker = checkout.tracker
        session.checkout_url = checkout.checkout_url
        session.gateway_payload = redact_payload(checkout.raw_payload)
        session.save(
            update_fields=["gateway_tracker", "checkout_url", "gateway_payload", "updated_at"]
        )

        # The expectation is written now, before the customer can pay, so the
        # amount we verify against cannot be influenced by anything that
        # happens during the payment.
        PaymentTransaction.objects.update_or_create(
            provider=session.provider,
            provider_reference=checkout.tracker,
            defaults={
                "provider_tracker": checkout.tracker,
                "session": session,
                "expected_amount": session.total_amount,
                "expected_currency": PKR,
                "status": PaymentTransaction.STATUS_INITIATED,
                "raw_payload": redact_payload(checkout.raw_payload),
            },
        )
    return session


# ---------------------------------------------------------------------------
# Webhook intake
# ---------------------------------------------------------------------------


def _record_event(*, provider_key, event_id, body_digest, signature_valid, payload, result, detail=""):
    """Insert-first replay detection.

    Returns ``(event, created)``. ``created=False`` means this delivery has been
    seen before and must not be acted on again.
    """
    try:
        with transaction.atomic():
            event = WebhookEvent.objects.create(
                provider=provider_key,
                event_id=event_id,
                body_digest=body_digest,
                signature_valid=signature_valid,
                payload=redact_payload(payload),
                result=result,
                detail=detail[:255],
            )
        return event, True
    except IntegrityError:
        existing = WebhookEvent.objects.filter(
            provider=provider_key, event_id=event_id
        ).first()
        return existing, False


def handle_webhook(provider_key: str, request) -> SettlementResult:
    """Entry point for provider callbacks. Signature-verified, replay-safe."""
    provider = get_provider(provider_key)
    raw_body = getattr(request, "body", b"") or b""
    body_digest = hashlib.sha256(raw_body).hexdigest()

    try:
        status = provider.parse_webhook(request)
    except SignatureError as exc:
        # Record the rejection so a burst of probes is visible, but under a
        # digest-derived id — an attacker must not be able to pick the event id
        # and thereby block a genuine delivery.
        _record_event(
            provider_key=provider_key,
            event_id=f"rejected:{body_digest}",
            body_digest=body_digest,
            signature_valid=False,
            payload={},
            result=WebhookEvent.RESULT_REJECTED,
            detail=str(exc),
        )
        logger.warning("%s webhook rejected: %s (%s)", provider_key, exc, exc.code)
        return SettlementResult(outcome="rejected", detail=str(exc))
    except PaymentProviderError as exc:
        _record_event(
            provider_key=provider_key,
            event_id=f"unparsed:{body_digest}",
            body_digest=body_digest,
            signature_valid=True,
            payload={},
            result=WebhookEvent.RESULT_REJECTED,
            detail=str(exc),
        )
        logger.warning("%s webhook unparseable: %s (%s)", provider_key, exc, exc.code)
        return SettlementResult(outcome="rejected", detail=str(exc))

    event, created = _record_event(
        provider_key=provider_key,
        event_id=status.event_id,
        body_digest=body_digest,
        signature_valid=True,
        payload=status.raw_payload,
        result=WebhookEvent.RESULT_PENDING,
    )
    if not created:
        logger.info("%s webhook replay ignored: event=%s", provider_key, status.event_id)
        return SettlementResult(outcome="replay", detail="Event already received.")

    result = apply_provider_status(provider_key, status, source="webhook")

    event.transaction = result.transaction
    event.result = {
        "settled": WebhookEvent.RESULT_PROCESSED,
        "already_settled": WebhookEvent.RESULT_PROCESSED,
        "recorded": WebhookEvent.RESULT_PROCESSED,
    }.get(result.outcome, WebhookEvent.RESULT_IGNORED)
    event.detail = result.detail[:255]
    event.save(update_fields=["transaction", "result", "detail"])
    return result


# ---------------------------------------------------------------------------
# Settlement
# ---------------------------------------------------------------------------


def apply_provider_status(provider_key: str, status: ProviderStatus, *, source: str) -> SettlementResult:
    """Apply one verified provider account of a transaction.

    ``source`` is ``"webhook"`` or ``"verification"``. Both are server-to-server;
    the browser never reaches this function.
    """
    with transaction.atomic():
        txn = _lock_transaction(provider_key, status)
        if txn is None:
            logger.error(
                "%s callback could not be matched to a payment: tracker=%r reference=%r",
                provider_key,
                status.tracker,
                status.provider_reference,
            )
            return SettlementResult(
                outcome="unmatched",
                detail="Callback did not match any known payment.",
            )

        if txn.is_final:
            # Late or duplicate delivery for something already decided.
            logger.info(
                "%s callback for already-final transaction %s (%s) ignored.",
                provider_key,
                txn.provider_reference,
                txn.status,
            )
            return SettlementResult(
                outcome="already_settled",
                transaction=txn,
                order=txn.order,
                detail=f"Transaction already {txn.status}.",
            )

        txn.raw_payload = redact_payload(status.raw_payload)
        txn.verified_amount = status.amount
        txn.verified_currency = status.currency or ""
        if status.tracker and not txn.provider_tracker:
            txn.provider_tracker = status.tracker

        if status.status != PaymentTransaction.STATUS_PAID:
            return _apply_non_paid(txn, status, source=source)

        mismatch = _amount_currency_mismatch(txn, status)
        if mismatch:
            txn.status = PaymentTransaction.STATUS_MISMATCH
            txn.failure_reason = mismatch
            txn.save()
            _park_session_for_review(txn, reason=mismatch)
            logger.error(
                "%s payment held for review — %s (reference=%s)",
                provider_key,
                mismatch,
                txn.provider_reference,
            )
            return SettlementResult(outcome="mismatch", transaction=txn, detail=mismatch)

        return _settle_paid(txn, source=source)


def _lock_transaction(provider_key, status: ProviderStatus):
    """Find the transaction this callback belongs to, and lock it.

    Lookup is by provider reference first, then by the tracker issued at
    initiation. A caller-supplied identifier is never consulted — that is the
    precise hole this replaces.
    """
    # of=("self",): select_related on a nullable FK becomes a LEFT OUTER JOIN,
    # and PostgreSQL refuses FOR UPDATE on the nullable side of one. Locking
    # only the transaction row is also the correct scope — the joined rows are
    # read here, not modified.
    queryset = PaymentTransaction.objects.select_for_update(of=("self",)).select_related(
        "session", "order"
    )

    txn = queryset.filter(
        provider=provider_key, provider_reference=status.provider_reference
    ).first()
    if txn is not None:
        return txn

    if status.tracker:
        txn = queryset.filter(provider=provider_key, provider_tracker=status.tracker).first()
        if txn is not None:
            # First callback for this tracker: adopt the provider's reference,
            # keeping the unique constraint as the idempotency key from here on.
            txn.provider_reference = status.provider_reference
            return txn
    return None


def _amount_currency_mismatch(txn: PaymentTransaction, status: ProviderStatus) -> str:
    if status.amount is None:
        return "Provider did not report a paid amount; cannot verify."
    if not txn.amount_matches(status.amount):
        return (
            f"Amount mismatch: provider reported {status.amount}, expected {txn.expected_amount}."
        )
    currency = (status.currency or "").upper()
    if currency and currency != (txn.expected_currency or PKR).upper():
        return f"Currency mismatch: provider reported {currency}, expected {txn.expected_currency}."
    if not currency:
        return "Provider did not report a currency; cannot verify."
    return ""


def _apply_non_paid(txn: PaymentTransaction, status: ProviderStatus, *, source: str) -> SettlementResult:
    """Failure, cancellation and refund. Never applied over a paid transaction."""
    if status.status == PaymentTransaction.STATUS_INITIATED:
        txn.save()
        return SettlementResult(
            outcome="recorded",
            transaction=txn,
            detail="Provider reported a non-final state; nothing settled.",
        )

    txn.status = status.status
    txn.failure_reason = f"Provider reported {status.status.lower()} via {source}."
    txn.save()

    session = txn.session
    if session and session.status not in {"COMPLETED"}:
        session.status = (
            "CANCELLED" if status.status == PaymentTransaction.STATUS_CANCELLED else "FAILED"
        )
        session.gateway_reference = txn.provider_reference
        session.gateway_payload = txn.raw_payload
        session.save(
            update_fields=["status", "gateway_reference", "gateway_payload", "updated_at"]
        )

        # The customer is not buying it, so stop holding it for them. Without
        # this, every failed payment permanently removes stock from sale until
        # the reservation expires.
        from inventory import services as inventory_services
        from orders.services import PaymentSessionService

        inventory_services.release(
            reference=PaymentSessionService.reservation_reference(session),
            reason=f"Payment {status.status.lower()}",
        )

    return SettlementResult(
        outcome="recorded",
        transaction=txn,
        order=txn.order,
        detail=f"Recorded {status.status}.",
    )


def _settle_paid(txn: PaymentTransaction, *, source: str) -> SettlementResult:
    """Verified payment: create the order, or park it if the basket cannot ship."""
    from orders.services import OrderService  # local import keeps payments → orders one-way

    session = txn.session
    if session is None:
        txn.status = PaymentTransaction.STATUS_MISMATCH
        txn.failure_reason = "Verified payment has no checkout session attached."
        txn.save()
        return SettlementResult(outcome="mismatch", transaction=txn, detail=txn.failure_reason)

    session = (
        PaymentSession.objects.select_for_update(of=("self",))
        .select_related("promotion", "user", "order")
        .get(pk=session.pk)
    )

    if session.status == "COMPLETED" and session.order_id:
        txn.status = PaymentTransaction.STATUS_PAID
        txn.order = session.order
        txn.mark_settled()
        txn.save()
        return SettlementResult(
            outcome="already_settled",
            transaction=txn,
            order=session.order,
            detail="Session was already completed.",
        )

    gateway_data = {
        "reference": txn.provider_reference,
        "tracker": txn.provider_tracker,
        "payload": txn.raw_payload,
    }

    try:
        order = OrderService.create_paid_order_from_session(session, gateway_data)
    except Exception as exc:  # noqa: BLE001 — money is already taken; never lose it
        # The customer has paid. Do not fail the payment because the basket can
        # no longer be fulfilled — record it as paid-but-blocked so staff resolve
        # it, rather than silently dropping a settled transaction.
        txn.status = PaymentTransaction.STATUS_PAID
        txn.failure_reason = f"Paid, but order creation failed: {exc}"[:255]
        txn.mark_settled()
        txn.save()
        _park_session_for_review(txn, reason=txn.failure_reason)
        logger.exception(
            "Payment %s verified but order creation failed for session %s",
            txn.provider_reference,
            session.public_id,
        )
        return SettlementResult(
            outcome="paid_order_failed", transaction=txn, detail=txn.failure_reason
        )

    txn.status = PaymentTransaction.STATUS_PAID
    txn.order = order
    txn.failure_reason = ""
    txn.mark_settled()
    txn.save()

    session.status = "COMPLETED"
    session.order = order
    session.gateway_reference = txn.provider_reference
    session.gateway_payload = txn.raw_payload
    session.save(
        update_fields=["status", "order", "gateway_reference", "gateway_payload", "updated_at"]
    )

    logger.info(
        "Payment settled via %s: reference=%s order=%s amount=%s %s",
        source,
        txn.provider_reference,
        order.id,
        txn.verified_amount,
        txn.verified_currency,
    )
    return SettlementResult(outcome="settled", transaction=txn, order=order, detail="Settled.")


def _park_session_for_review(txn: PaymentTransaction, *, reason: str):
    from orders.services import PaymentSessionService

    if not txn.session_id:
        return
    try:
        PaymentSessionService.mark_review_required(
            public_id=txn.session.public_id,
            payload=txn.raw_payload,
            reference=txn.provider_reference,
            tracker=txn.provider_tracker,
            reason=reason,
        )
    except Exception:  # noqa: BLE001 — review parking must not mask the real problem
        logger.exception("Could not park session %s for review", txn.session_id)


# ---------------------------------------------------------------------------
# Server-initiated verification (used by the return page and reconciliation)
# ---------------------------------------------------------------------------


def verify_session(session: PaymentSession) -> SettlementResult:
    """Ask the provider directly what happened to this session.

    This is what makes the browser return page safe: the page supplies only
    *which* session to look at, and this server then asks the provider. Nothing
    the browser says about the outcome is used.
    """
    if not session.gateway_tracker:
        return SettlementResult(outcome="unverifiable", detail="Session has no provider tracker.")

    provider = get_provider(session.provider)
    try:
        status = provider.fetch_status(tracker=session.gateway_tracker)
    except PaymentProviderError as exc:
        logger.warning(
            "Verification call failed for session %s: %s (%s)",
            session.public_id,
            exc,
            exc.code,
        )
        return SettlementResult(outcome="unverifiable", detail=str(exc))

    return apply_provider_status(session.provider, status, source="verification")


def reconcile_pending(*, provider_key=PaymentTransaction.PROVIDER_SAFEPAY, older_than_minutes=15, limit=200):
    """Re-verify transactions that never reached a final state.

    A webhook that was never delivered, or was delivered while the server was
    down, leaves money taken and an order uncreated. This closes that gap and is
    the routine that should run on a schedule.
    """
    cutoff = timezone.now() - timezone.timedelta(minutes=older_than_minutes)
    stale = (
        PaymentTransaction.objects.filter(
            provider=provider_key,
            status=PaymentTransaction.STATUS_INITIATED,
            created_at__lt=cutoff,
        )
        .select_related("session")
        .order_by("created_at")[:limit]
    )

    summary = {"checked": 0, "settled": 0, "failed": 0, "unverifiable": 0, "mismatch": 0}
    for txn in stale:
        summary["checked"] += 1
        if txn.session is None:
            summary["unverifiable"] += 1
            continue
        result = verify_session(txn.session)
        if result.outcome == "settled":
            summary["settled"] += 1
        elif result.outcome == "mismatch":
            summary["mismatch"] += 1
        elif result.outcome == "unverifiable":
            summary["unverifiable"] += 1
        else:
            summary["failed"] += 1
    return summary


def describe_session_state(session: PaymentSession) -> dict:
    """Read-only view for the browser return page. Reports, never decides."""
    txn = (
        PaymentTransaction.objects.filter(session=session)
        .order_by("-created_at")
        .first()
    )
    return {
        "session_public_id": str(session.public_id),
        "session_status": session.status,
        "payment_status": txn.status if txn else PaymentTransaction.STATUS_INITIATED,
        "order_id": session.order_id,
        "total_amount": str(session.total_amount),
        "currency": PKR,
    }
