"""Request correlation.

Every request gets an id, echoed back in the ``X-Request-ID`` response header
and attached to every log line the request produces. When a customer reports a
failed checkout, that header is the whole investigation: one grep, the entire
request including the payment call and any exception.

An id supplied by the caller is honoured so a trace survives the Nginx hop, but
only if it looks like an id — otherwise a hostile client could inject newlines
into log lines and forge entries.
"""

from __future__ import annotations

import logging
import time

from .logging import mask_email, new_request_id, set_request_id

logger = logging.getLogger("paknutrition.request")

INBOUND_HEADER = "HTTP_X_REQUEST_ID"
OUTBOUND_HEADER = "X-Request-ID"

MAX_INBOUND_LENGTH = 64
_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")

#: Requests worth a log line each. Health checks and static assets would drown
#: the log without telling anyone anything.
_QUIET_PREFIXES = ("/healthz", "/readyz", "/static/", "/media/", "/favicon")


def _clean_inbound(value: str) -> str:
    if not value or len(value) > MAX_INBOUND_LENGTH:
        return ""
    if not set(value) <= _ALLOWED:
        return ""
    return value


class RequestIDMiddleware:
    """Assign a correlation id and log the request's outcome."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = _clean_inbound(request.META.get(INBOUND_HEADER, "")) or new_request_id()
        set_request_id(request_id)
        request.request_id = request_id

        started = time.monotonic()
        response = self.get_response(request)
        duration_ms = round((time.monotonic() - started) * 1000, 1)

        response[OUTBOUND_HEADER] = request_id

        path = request.path
        if not path.startswith(_QUIET_PREFIXES):
            user = getattr(request, "user", None)
            level = logging.WARNING if response.status_code >= 500 else logging.INFO
            logger.log(
                level,
                "%s %s %s",
                request.method,
                path,
                response.status_code,
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    # Identify the actor without writing an address into the log.
                    "user": mask_email(getattr(user, "email", "")) if getattr(user, "is_authenticated", False) else "anonymous",
                },
            )

        return response
