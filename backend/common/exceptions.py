"""DRF exception handling.

Adds a status code and error type to every handled error, and makes sure an
unhandled one does not leak a stack trace to the caller.
"""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        # Something DRF does not recognise. Log it fully, tell the caller
        # nothing — a stack trace in an API response is an information leak.
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return Response(
            {
                "status_code": 500,
                "error_type": "ServerError",
                "detail": "Internal Server Error. Please contact support.",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # DRF's error payload is a dict for field errors but a **list** when the
    # error was raised with a plain string, e.g.
    # `raise ValidationError("This cannot be deleted")`. Assigning a key into
    # that list raised TypeError *inside the exception handler*, turning every
    # such validation error into a 500 — the opposite of what it was.
    if isinstance(response.data, dict):
        response.data["status_code"] = response.status_code
        response.data["error_type"] = exc.__class__.__name__
    elif isinstance(response.data, list):
        # Keep the messages, and put them under a key the frontend already
        # reads so a string-raised error displays like every other one.
        response.data = {
            "error": " ".join(str(item) for item in response.data),
            "detail": response.data,
            "status_code": response.status_code,
            "error_type": exc.__class__.__name__,
        }
    else:
        response.data = {
            "error": str(response.data),
            "status_code": response.status_code,
            "error_type": exc.__class__.__name__,
        }

    view = context.get("view")
    logger.warning(
        "Handled exception: %s in %s",
        exc.__class__.__name__,
        view.__class__.__name__ if view else "unknown view",
        extra={"status": response.status_code, "error_type": exc.__class__.__name__},
    )
    return response
