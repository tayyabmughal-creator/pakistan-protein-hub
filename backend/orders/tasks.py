"""Order notification tasks.

These wrap the existing notification functions rather than reimplementing them.
What the task layer adds is the part that matters operationally: retries with
backoff, a bounded number of attempts, and a failure that is visible in the log
instead of silent.

Each channel is its own task. When SMTP is down, the customer should still get
their SMS, and the shop should still get its push — one failing provider must
not take the other two with it.
"""

from __future__ import annotations

import logging

from celery import shared_task

from common.logging import mask_email

from .models import Order, PaymentSession
from .notifications import (
    send_admin_new_order_push,
    send_admin_payment_review_push,
    send_order_confirmation_email,
    send_order_confirmation_sms,
)

logger = logging.getLogger(__name__)

#: Shared retry policy. Notifications are worth retrying — the failure is
#: almost always a transient provider problem — but not forever: an email about
#: an order from two days ago is noise, not service.
RETRY_KWARGS = {
    "autoretry_for": (Exception,),
    "retry_backoff": 30,
    "retry_backoff_max": 600,
    "retry_jitter": True,
    "max_retries": 5,
}


def _get_order(order_id):
    """Return the order, or None if it is gone.

    A deleted order is not a failure worth retrying — returning None lets the
    task succeed rather than burn five attempts on a row that no longer exists.
    """
    return Order.objects.select_related("user").prefetch_related("items").filter(pk=order_id).first()


@shared_task(name="orders.tasks.send_order_confirmation_email", **RETRY_KWARGS)
def send_order_confirmation_email_task(order_id):
    order = _get_order(order_id)
    if order is None:
        logger.warning("Order %s no longer exists; skipping confirmation email.", order_id)
        return "skipped"

    send_order_confirmation_email(order)
    logger.info(
        "Order confirmation email sent",
        extra={
            "order_id": order.id,
            "recipient": mask_email(order.user.email if order.user_id else order.guest_email),
        },
    )
    return "sent"


@shared_task(name="orders.tasks.send_order_confirmation_sms", **RETRY_KWARGS)
def send_order_confirmation_sms_task(order_id):
    order = _get_order(order_id)
    if order is None:
        logger.warning("Order %s no longer exists; skipping confirmation SMS.", order_id)
        return "skipped"

    send_order_confirmation_sms(order)
    logger.info("Order confirmation SMS sent", extra={"order_id": order.id})
    return "sent"


@shared_task(name="orders.tasks.send_admin_new_order_push", **RETRY_KWARGS)
def send_admin_new_order_push_task(order_id):
    order = _get_order(order_id)
    if order is None:
        logger.warning("Order %s no longer exists; skipping admin push.", order_id)
        return "skipped"

    send_admin_new_order_push(order)
    logger.info("Admin new-order push dispatched", extra={"order_id": order.id})
    return "sent"


@shared_task(name="orders.tasks.send_admin_payment_review_push", **RETRY_KWARGS)
def send_admin_payment_review_push_task(session_public_id):
    session = PaymentSession.objects.filter(public_id=session_public_id).first()
    if session is None:
        logger.warning(
            "Payment session %s no longer exists; skipping review push.", session_public_id
        )
        return "skipped"

    send_admin_payment_review_push(session)
    logger.info(
        "Admin payment-review push dispatched",
        extra={"session_public_id": str(session.public_id)},
    )
    return "sent"
