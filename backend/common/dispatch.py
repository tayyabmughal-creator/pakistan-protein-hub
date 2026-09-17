"""Enqueueing work that must not take the caller down with it.

``enqueue`` sends a task to the broker, and if the broker is unreachable it runs
the work inline instead of raising.

That fallback is deliberate and narrow. It exists because the caller is always
something like "the customer's order was just created and paid for". Losing a
confirmation email is bad; failing the request — and, worse, doing so after the
money has been taken — is far worse. A Redis outage should degrade
notifications to slow, not turn a successful checkout into an error page.

Do not use this for work that must not run twice, or for work whose result the
caller needs. It is for fire-and-forget side effects only.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def enqueue(task, *args, **kwargs):
    """Queue ``task``. Fall back to running it inline if the broker is down.

    Returns the task id when queued, ``"inline"`` when run synchronously, and
    ``"failed"`` when neither worked — never raises.
    """
    task_name = getattr(task, "name", getattr(task, "__name__", "unknown"))

    try:
        result = task.delay(*args, **kwargs)
        return getattr(result, "id", "queued")
    except Exception:  # noqa: BLE001 — broker problems must not fail the caller
        logger.warning(
            "Could not queue %s; running it inline instead. The broker may be down.",
            task_name,
            extra={"task_name": task_name},
            exc_info=True,
        )

    try:
        task(*args, **kwargs)
        return "inline"
    except Exception:  # noqa: BLE001
        logger.exception(
            "Background work %s failed both queued and inline.",
            task_name,
            extra={"task_name": task_name},
        )
        return "failed"
