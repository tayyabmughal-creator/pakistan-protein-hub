"""Celery application.

Used only where asynchronous processing is actually justified. Right now that is
one thing and one thing only: **outbound notifications**.

Placing an order sends a confirmation email over SMTP, an SMS through Twilio,
and a push through Expo — three network calls, each with a 10 second timeout.
Those ran inside the request, so a customer pressing "Place order" could wait
thirty seconds for a screen that had nothing to do with whether their order
succeeded, and a slow mail server looked to them like a broken checkout.

Payment reconciliation is scheduled here too, because a webhook that is never
delivered leaves a customer charged with no order, and nothing in the
request/response path can notice that.

Local money arithmetic, pricing and stock stay synchronous. They are fast, they
belong in the transaction, and making them asynchronous would buy nothing but
uncertainty about whether they had happened.
"""

import os

from celery import Celery
from celery.signals import setup_logging, task_failure
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("paknutrition")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@setup_logging.connect
def configure_celery_logging(**kwargs):
    """Use Django's logging config so worker logs are structured like everything else."""
    from logging.config import dictConfig

    from django.conf import settings

    dictConfig(settings.LOGGING)


@task_failure.connect
def log_task_failure(sender=None, task_id=None, exception=None, args=None, einfo=None, **kwargs):
    """A failed background task must not be invisible.

    Without this, a task that exhausts its retries disappears into the broker
    and the only symptom is a customer who never received an email.
    """
    import logging

    logging.getLogger("paknutrition.celery").error(
        "Background task failed: %s",
        getattr(sender, "name", "unknown"),
        extra={
            "task_name": getattr(sender, "name", "unknown"),
            "task_id": task_id,
            "exception_type": type(exception).__name__ if exception else "",
            # Arguments are not logged: task payloads carry order and customer
            # identifiers, and some carry provider payloads.
        },
        exc_info=einfo.exc_info if einfo else None,
    )


app.conf.beat_schedule = {
    # Catches payments the webhook never resolved. Money has been taken by this
    # point, so the cost of not running it is a charged customer with no order.
    "reconcile-pending-payments": {
        "task": "payments.tasks.reconcile_pending_payments",
        "schedule": crontab(minute="*/15"),
    },
}
