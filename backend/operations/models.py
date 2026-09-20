"""The record of what staff did.

Separate from ``OrderHistory``, which is the customer-facing story of one order.
This is the internal record of privileged actions across the whole system: who
changed a price, who wrote off stock, who approved a payment the provider never
confirmed.

Append-only. Correcting a mistake means a new entry, never editing an old one —
an audit log that can be edited is not an audit log.
"""

from django.conf import settings
from django.db import models


class AdminAuditLog(models.Model):
    """One privileged action."""

    # Actions worth recording. Named for what happened, so the log reads as a
    # sentence rather than a diff of field names.
    ACTION_CHOICES = (
        ("inventory.receive", "Received stock"),
        ("inventory.adjust", "Adjusted stock"),
        ("inventory.stocktake", "Recorded a physical count"),
        ("order.transition", "Moved an order"),
        ("order.cancel", "Cancelled an order"),
        ("order.refund", "Refunded an order"),
        ("return.approve", "Approved a return"),
        ("return.reject", "Rejected a return"),
        ("return.receive", "Received returned goods"),
        ("payment.review", "Resolved a payment held for review"),
        ("catalog.create", "Created a catalogue record"),
        ("catalog.update", "Updated a catalogue record"),
        ("catalog.publish", "Published a product"),
        ("catalog.unpublish", "Unpublished a product"),
        ("catalog.delete", "Deleted a catalogue record"),
        ("promotion.create", "Created a promotion"),
        ("promotion.update", "Changed a promotion"),
        ("customer.update", "Edited a customer"),
        ("staff.update", "Changed staff access"),
    )

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="audit_entries",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Null when the system acted, or when the account was later deleted.",
    )
    #: The actor's email at the time. Kept because a deleted account must not
    #: erase who did something — the whole point of an audit log.
    actor_label = models.CharField(max_length=160, blank=True, default="")

    action = models.CharField(max_length=32, choices=ACTION_CHOICES, db_index=True)

    #: What was acted on, as app.Model plus its primary key. Deliberately not a
    #: generic foreign key: this must survive the row being deleted.
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    entity_label = models.CharField(
        max_length=200, blank=True, default="", help_text="Readable name at the time."
    )

    summary = models.CharField(max_length=255, blank=True, default="")
    reason = models.CharField(max_length=255, blank=True, default="")

    #: Field-level before and after, already redacted. Only what changed.
    changes = models.JSONField(default=dict, blank=True)

    #: Request context, when there was a request. No cookies, no auth headers.
    request_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Audit log entry"
        verbose_name_plural = "Audit log"
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "-created_at"]),
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self):
        who = self.actor_label or "system"
        return f"{who} {self.get_action_display().lower()} {self.entity_label or self.entity_id}"
