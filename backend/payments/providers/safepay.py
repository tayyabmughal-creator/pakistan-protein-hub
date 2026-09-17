"""Safepay adapter.

IMPORTANT — verify before go-live
--------------------------------
The webhook signature scheme below (header name, digest algorithm, and whether
the HMAC covers the raw body or a field subset) is configurable precisely
because it has **not** been confirmed against Safepay's live documentation or a
sandbox account in this engagement. The previous implementation guessed at six
different response shapes for the tracker, which suggests the integration was
built by trial and error.

Before taking real money:

1. Confirm ``SAFEPAY_WEBHOOK_SIGNATURE_HEADER`` and
   ``SAFEPAY_WEBHOOK_SIGNATURE_ALGORITHM`` against the Safepay dashboard.
2. Confirm the verification endpoint used by ``fetch_status``.
3. Run the sandbox end-to-end and confirm a real callback verifies.

Until then the adapter fails closed: an unconfigured secret means callbacks are
rejected, not accepted.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from decimal import ROUND_HALF_UP, Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

from ..models import PKR, PaymentTransaction
from .base import (
    CheckoutSession,
    PaymentProvider,
    PaymentProviderError,
    ProviderStatus,
    SignatureError,
)

logger = logging.getLogger(__name__)

#: Provider status strings mapped onto our own vocabulary. Anything not listed
#: is treated as non-final and will not settle an order.
_STATUS_MAP = {
    "paid": PaymentTransaction.STATUS_PAID,
    "completed": PaymentTransaction.STATUS_PAID,
    "succeeded": PaymentTransaction.STATUS_PAID,
    "success": PaymentTransaction.STATUS_PAID,
    "tracker_ended": PaymentTransaction.STATUS_PAID,
    "failed": PaymentTransaction.STATUS_FAILED,
    "declined": PaymentTransaction.STATUS_FAILED,
    "error": PaymentTransaction.STATUS_FAILED,
    "cancelled": PaymentTransaction.STATUS_CANCELLED,
    "canceled": PaymentTransaction.STATUS_CANCELLED,
    "voided": PaymentTransaction.STATUS_CANCELLED,
    "refunded": PaymentTransaction.STATUS_REFUNDED,
    "reversed": PaymentTransaction.STATUS_REFUNDED,
}

_DIGESTS = {"sha256": hashlib.sha256, "sha512": hashlib.sha512}


def _first(payload, *keys):
    """Pull the first present, non-empty value. Provider payloads vary by event."""
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            continue
        if value not in (None, ""):
            return value
    for container_key in ("data", "tracker", "paymentTracker", "transaction"):
        container = payload.get(container_key)
        if isinstance(container, dict):
            found = _first(container, *keys)
            if found not in (None, ""):
                return found
    return None


class SafepayProvider(PaymentProvider):
    key = PaymentTransaction.PROVIDER_SAFEPAY

    # -- configuration ----------------------------------------------------

    def is_configured(self) -> bool:
        return bool(
            getattr(settings, "SAFEPAY_ENABLED", False)
            and getattr(settings, "SAFEPAY_API_KEY", "")
        )

    @property
    def _webhook_secret(self) -> str:
        # Falls back to the shared secret so an existing deployment keeps working,
        # but a dedicated webhook secret is preferred.
        return getattr(settings, "SAFEPAY_WEBHOOK_SECRET", "") or getattr(
            settings, "SAFEPAY_SHARED_SECRET", ""
        )

    @staticmethod
    def _api_base() -> str:
        if settings.SAFEPAY_ENV == "production":
            return "https://api.getsafepay.com"
        return "https://sandbox.api.getsafepay.com"

    @staticmethod
    def _checkout_base() -> str:
        if settings.SAFEPAY_ENV == "production":
            return "https://www.getsafepay.com"
        return "https://sandbox.api.getsafepay.com"

    @staticmethod
    def to_subunits(amount) -> int:
        return int(
            (Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )

    @staticmethod
    def from_subunits(value) -> Decimal:
        return (Decimal(int(value)) / Decimal("100")).quantize(Decimal("0.01"))

    # -- HTTP -------------------------------------------------------------

    def _request(self, path, *, method="GET", body=None, timeout=20):
        headers = {"Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        api_key = getattr(settings, "SAFEPAY_API_KEY", "")
        if api_key:
            headers["X-SFPY-MERCHANT-SECRET"] = api_key

        request = Request(f"{self._api_base()}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")[:500]
            raise PaymentProviderError(
                f"Safepay rejected the request ({exc.code}). {detail}".strip(),
                code="provider_rejected",
            ) from exc
        except URLError as exc:
            raise PaymentProviderError(
                "Could not reach Safepay. Please try again shortly.",
                code="provider_unreachable",
            ) from exc
        except json.JSONDecodeError as exc:
            raise PaymentProviderError(
                "Safepay returned a response that could not be parsed.",
                code="provider_bad_response",
            ) from exc

    # -- 1. initiate ------------------------------------------------------

    def initiate(self, *, reference: str, amount: Decimal, currency: str) -> CheckoutSession:
        if not self.is_configured():
            raise PaymentProviderError(
                "Safepay is not configured.", code="provider_not_configured"
            )
        if currency != PKR:
            raise PaymentProviderError(
                f"Only {PKR} is supported.", code="unsupported_currency"
            )

        payload = self._request(
            "/order/v1/init",
            method="POST",
            body={
                "client": settings.SAFEPAY_API_KEY,
                "amount": self.to_subunits(amount),
                "currency": currency,
                "environment": settings.SAFEPAY_ENV,
                # Our own reference travels with the transaction so a callback
                # that omits the tracker can still be matched back.
                "order_id": reference,
            },
        )

        tracker = _first(payload, "token", "tracker", "trackerToken")
        if not tracker:
            raise PaymentProviderError(
                "Safepay did not return a payment tracker.", code="missing_tracker"
            )

        checkout_url = "{base}/components?{params}".format(
            base=self._checkout_base(),
            params=urlencode(
                {
                    "beacon": tracker,
                    "source": settings.SAFEPAY_SOURCE,
                    "order_id": reference,
                    "redirect_url": f"{settings.BACKEND_PUBLIC_URL}/api/payments/safepay/return/",
                    "cancel_url": f"{settings.BACKEND_PUBLIC_URL}/api/payments/safepay/cancel/",
                }
            ),
        )
        return CheckoutSession(tracker=str(tracker), checkout_url=checkout_url, raw_payload=payload)

    # -- 2. parse_webhook -------------------------------------------------

    def _verify_signature(self, *, raw_body: bytes, signature: str) -> None:
        secret = self._webhook_secret
        if not secret:
            # Fail closed. An unconfigured secret must never mean "accept all".
            raise SignatureError(
                "Safepay webhook secret is not configured; refusing to trust the callback.",
                code="webhook_secret_missing",
            )
        if not signature:
            raise SignatureError("Callback carried no signature.", code="signature_missing")

        algorithm = str(getattr(settings, "SAFEPAY_WEBHOOK_SIGNATURE_ALGORITHM", "sha512")).lower()
        digest = _DIGESTS.get(algorithm)
        if digest is None:
            raise PaymentProviderError(
                f"Unsupported signature algorithm {algorithm!r}.", code="bad_configuration"
            )

        expected = hmac.new(secret.encode("utf-8"), raw_body, digest).hexdigest()
        if not hmac.compare_digest(expected.lower(), signature.strip().lower()):
            raise SignatureError()

    def parse_webhook(self, request) -> ProviderStatus:
        raw_body = getattr(request, "body", b"") or b""
        header_name = getattr(
            settings, "SAFEPAY_WEBHOOK_SIGNATURE_HEADER", "HTTP_X_SFPY_SIGNATURE"
        )
        signature = request.META.get(header_name, "")

        self._verify_signature(raw_body=raw_body, signature=signature)

        try:
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise PaymentProviderError(
                "Callback body is not valid JSON.", code="bad_payload"
            ) from exc
        if not isinstance(payload, dict):
            raise PaymentProviderError("Callback body is not an object.", code="bad_payload")

        return self._to_status(payload, fallback_body=raw_body)

    # -- 3. fetch_status --------------------------------------------------

    def fetch_status(self, *, tracker: str) -> ProviderStatus:
        """Server-to-server verification. The browser is never consulted."""
        if not tracker:
            raise PaymentProviderError("No tracker supplied.", code="missing_tracker")
        if not self.is_configured():
            raise PaymentProviderError(
                "Safepay is not configured.", code="provider_not_configured"
            )
        payload = self._request(f"/order/v1/{tracker}")
        if not isinstance(payload, dict):
            raise PaymentProviderError(
                "Safepay returned an unexpected verification response.",
                code="provider_bad_response",
            )
        status = self._to_status(payload)
        if not status.tracker:
            status = ProviderStatus(
                status=status.status,
                provider_reference=status.provider_reference,
                tracker=tracker,
                amount=status.amount,
                currency=status.currency,
                event_id=status.event_id,
                raw_payload=status.raw_payload,
            )
        return status

    # -- translation ------------------------------------------------------

    def _to_status(self, payload: dict, *, fallback_body: bytes = b"") -> ProviderStatus:
        raw_state = str(_first(payload, "state", "status", "transaction_status") or "").strip().lower()
        mapped = _STATUS_MAP.get(raw_state, "")

        tracker = _first(payload, "tracker", "token", "beacon", "trackerToken") or ""
        provider_reference = (
            _first(payload, "reference", "reference_code", "referenceCode", "transaction_id", "transactionId")
            or tracker
        )
        if not provider_reference:
            raise PaymentProviderError(
                "Callback carried no provider reference.", code="missing_reference"
            )

        amount = None
        raw_amount = _first(payload, "amount", "net_amount", "charged_amount")
        if raw_amount is not None:
            try:
                # Safepay quotes minor units. A value carrying a decimal point is
                # already major units, so do not divide it twice.
                amount = (
                    Decimal(str(raw_amount)).quantize(Decimal("0.01"))
                    if "." in str(raw_amount)
                    else self.from_subunits(raw_amount)
                )
            except (ArithmeticError, ValueError, TypeError):
                logger.warning("Safepay sent an unparseable amount: %r", raw_amount)
                amount = None

        currency = str(_first(payload, "currency", "currency_code") or "").strip().upper()

        event_id = str(
            _first(payload, "event_id", "eventId", "id", "notification_id") or ""
        )
        if not event_id:
            body = fallback_body or json.dumps(payload, sort_keys=True).encode("utf-8")
            event_id = hashlib.sha256(body).hexdigest()

        return ProviderStatus(
            status=mapped or PaymentTransaction.STATUS_INITIATED,
            provider_reference=str(provider_reference),
            tracker=str(tracker),
            amount=amount,
            currency=currency,
            event_id=event_id,
            raw_payload=payload,
        )


def get_provider(key: str = PaymentTransaction.PROVIDER_SAFEPAY) -> PaymentProvider:
    if key == PaymentTransaction.PROVIDER_SAFEPAY:
        return SafepayProvider()
    raise PaymentProviderError(f"Unknown payment provider {key!r}.", code="unknown_provider")
