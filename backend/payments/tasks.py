"""Scheduled payment reconciliation.

Runs every 15 minutes (see ``config/celery.py``). This is the safety net for the
case nothing else can catch: the provider took the customer's money, and the
webhook announcing it was never delivered — the server was restarting, the
network dropped it, the provider had an incident. The customer sees a failed
checkout; the money is gone; no request exists that could notice.
"""

from __future__ import annotations

import logging

from celery import shared_task

from .models import PaymentTransaction
from .services import reconcile_pending

logger = logging.getLogger(__name__)


@shared_task(name="payments.tasks.reconcile_pending_payments")
def reconcile_pending_payments(older_than_minutes=15, limit=200):
    summary = reconcile_pending(
        provider_key=PaymentTransaction.PROVIDER_SAFEPAY,
        older_than_minutes=older_than_minutes,
        limit=limit,
    )

    if summary["settled"]:
        # Each of these is a customer who paid and would otherwise have no order.
        logger.warning(
            "Reconciliation settled %s payment(s) the webhook never delivered",
            summary["settled"],
            extra=summary,
        )
    if summary["mismatch"]:
        logger.error(
            "Reconciliation found %s payment(s) whose amount or currency did not "
            "match the basket. These are held for review and must be investigated.",
            summary["mismatch"],
            extra=summary,
        )
    if summary["checked"]:
        logger.info("Payment reconciliation complete", extra=summary)

    return summary
