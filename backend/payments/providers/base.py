"""Provider adapter contract.

A provider adapter answers exactly three questions and nothing else:

1. ``initiate`` — start a checkout for this amount, return a tracker + redirect URL.
2. ``parse_webhook`` — is this callback genuine, and what does it say?
3. ``fetch_status`` — ask the provider directly what happened (server-to-server).

Adapters never touch orders, inventory or sessions. Settlement policy lives in
``payments.services`` so that adding a second Pakistani provider later cannot
fork the rules about what counts as paid.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


class PaymentProviderError(Exception):
    """Provider refused, misbehaved, or sent something unverifiable."""

    def __init__(self, message, *, code="provider_error"):
        super().__init__(message)
        self.code = code


class SignatureError(PaymentProviderError):
    """The callback did not carry a valid signature. Treat as hostile."""

    def __init__(self, message="Callback signature is invalid.", *, code="invalid_signature"):
        super().__init__(message, code=code)


@dataclass(frozen=True)
class CheckoutSession:
    """Result of initiating a hosted checkout."""

    tracker: str
    checkout_url: str
    raw_payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderStatus:
    """A provider's account of one transaction.

    ``amount`` and ``currency`` are what the *provider* says was charged. They
    are compared against the internal expectation before anything settles; an
    adapter that cannot report them must leave ``amount`` as ``None`` so
    settlement refuses rather than assumes.
    """

    #: One of PaymentTransaction.STATUS_* — PAID / FAILED / CANCELLED / REFUNDED.
    status: str
    provider_reference: str
    tracker: str = ""
    amount: Decimal | None = None
    currency: str = ""
    event_id: str = ""
    raw_payload: dict = field(default_factory=dict)


class PaymentProvider:
    """Base class. Subclasses implement the three questions above."""

    key: str = ""

    def is_configured(self) -> bool:
        raise NotImplementedError

    def initiate(self, *, reference: str, amount: Decimal, currency: str) -> CheckoutSession:
        raise NotImplementedError

    def parse_webhook(self, request) -> ProviderStatus:
        """Verify the signature and translate the body. Raise on anything off."""
        raise NotImplementedError

    def fetch_status(self, *, tracker: str) -> ProviderStatus:
        """Ask the provider directly. Used by the return page and reconciliation."""
        raise NotImplementedError
