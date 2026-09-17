"""Authoritative record of money movement.

The previous design trusted the browser's return URL: it verified that a
*tracker* string was signed, then completed whatever internal session the caller
named in a separate query parameter. Nothing bound the two together, so a signed
tracker from a cheap order could settle an expensive one.

The models here exist to make that class of bug expressible only as a constraint
violation:

* ``PaymentTransaction`` is unique on ``(provider, provider_reference)``, so one
  provider transaction can never settle two internal payments.
* Every transaction records the amount and currency the *provider* reported
  alongside the amount and currency PakNutrition expected. Settlement compares
  them.
* ``WebhookEvent`` is unique on ``(provider, event_id)``, so a replayed delivery
  is detected at the database rather than by a best-effort code path.
"""

from decimal import Decimal

from django.db import models
from django.utils import timezone

PKR = "PKR"


class PaymentTransaction(models.Model):
    """One provider-side transaction, bound to one internal payment session."""

    PROVIDER_SAFEPAY = "SAFEPAY"
    PROVIDER_CHOICES = ((PROVIDER_SAFEPAY, "Safepay"),)

    STATUS_INITIATED = "INITIATED"
    STATUS_PAID = "PAID"
    STATUS_FAILED = "FAILED"
    STATUS_CANCELLED = "CANCELLED"
    STATUS_REFUNDED = "REFUNDED"
    STATUS_MISMATCH = "MISMATCH"

    STATUS_CHOICES = (
        (STATUS_INITIATED, "Initiated"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_REFUNDED, "Refunded"),
        (STATUS_MISMATCH, "Mismatch — held for review"),
    )

    #: Terminal states. A transaction in one of these is never re-processed.
    FINAL_STATUSES = frozenset(
        {STATUS_PAID, STATUS_FAILED, STATUS_CANCELLED, STATUS_REFUNDED, STATUS_MISMATCH}
    )

    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default=PROVIDER_SAFEPAY)

    #: The provider's own identifier for this transaction. Combined with
    #: ``provider`` this is the idempotency key for the whole settlement path.
    provider_reference = models.CharField(max_length=190)

    #: The provider-side handle created at checkout initialisation. This is what
    #: binds a callback back to one internal session — never a caller-supplied id.
    provider_tracker = models.CharField(max_length=190, blank=True, default="", db_index=True)

    session = models.ForeignKey(
        "orders.PaymentSession",
        on_delete=models.PROTECT,
        related_name="transactions",
        null=True,
        blank=True,
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        related_name="payment_transactions",
        null=True,
        blank=True,
    )

    #: What PakNutrition calculated and expects to be paid.
    expected_amount = models.DecimalField(max_digits=12, decimal_places=2)
    expected_currency = models.CharField(max_length=3, default=PKR)

    #: What the provider actually reported. Null until a verified callback or a
    #: server-to-server verification supplies it.
    verified_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    verified_currency = models.CharField(max_length=3, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_INITIATED)

    #: Why a transaction ended up MISMATCH/FAILED, in operator-readable terms.
    failure_reason = models.CharField(max_length=255, blank=True, default="")

    #: Redacted provider payload. Never store card data or provider secrets.
    raw_payload = models.JSONField(default=dict, blank=True)

    settled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "provider_reference"],
                name="payments_unique_provider_reference",
            ),
        ]
        indexes = [
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["settled_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.provider}:{self.provider_reference} {self.status}"

    @property
    def is_final(self):
        return self.status in self.FINAL_STATUSES

    def amount_matches(self, amount):
        """Exact decimal comparison. Payment amounts are never 'close enough'."""
        if amount is None:
            return False
        return Decimal(amount).quantize(Decimal("0.01")) == Decimal(self.expected_amount).quantize(
            Decimal("0.01")
        )

    def mark_settled(self):
        self.settled_at = timezone.now()


class WebhookEvent(models.Model):
    """Every inbound provider callback, stored before it is acted on.

    Insert-first gives replay detection a database guarantee: a duplicate
    delivery collides on ``(provider, event_id)`` instead of racing through a
    check-then-act window. Deliveries that fail signature verification are
    recorded too — a burst of them is the signal that someone is probing.
    """

    RESULT_PENDING = "PENDING"
    RESULT_PROCESSED = "PROCESSED"
    RESULT_REPLAY = "REPLAY"
    RESULT_REJECTED = "REJECTED"
    RESULT_IGNORED = "IGNORED"

    RESULT_CHOICES = (
        (RESULT_PENDING, "Pending"),
        (RESULT_PROCESSED, "Processed"),
        (RESULT_REPLAY, "Replay — ignored"),
        (RESULT_REJECTED, "Rejected"),
        (RESULT_IGNORED, "Ignored"),
    )

    provider = models.CharField(max_length=20, db_index=True)

    #: Provider event id when supplied, otherwise a digest of the raw body. Both
    #: make a byte-identical redelivery collide here.
    event_id = models.CharField(max_length=190)

    #: Digest of the raw request body, for spotting a resend under a new id.
    body_digest = models.CharField(max_length=64, blank=True, default="", db_index=True)

    transaction = models.ForeignKey(
        PaymentTransaction,
        on_delete=models.SET_NULL,
        related_name="webhook_events",
        null=True,
        blank=True,
    )

    signature_valid = models.BooleanField(default=False)
    result = models.CharField(max_length=20, choices=RESULT_CHOICES, default=RESULT_PENDING)
    detail = models.CharField(max_length=255, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "event_id"],
                name="payments_unique_webhook_event",
            ),
        ]
        indexes = [
            models.Index(fields=["provider", "received_at"]),
            models.Index(fields=["result"]),
        ]
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.provider} event {self.event_id} ({self.result})"
