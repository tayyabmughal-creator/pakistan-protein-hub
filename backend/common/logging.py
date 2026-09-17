"""Structured logging.

Logs were a bare console handler emitting unparseable free text, so answering
"what happened to order 412 last Tuesday" meant grepping and guessing. These
emit one JSON object per line with a request id attached, so a customer's whole
journey through the system can be pulled out with one query.

Nothing here logs a password, token, card number or full customer record.
``scrub`` is applied to every structured extra, and the payment payloads that
reach the database are separately redacted in ``payments.services.redact_payload``.
"""

from __future__ import annotations

import json
import logging
import uuid
from contextvars import ContextVar

#: The current request's correlation id. A ContextVar rather than thread-local
#: so it survives async views and does not leak between concurrent requests.
_request_id: ContextVar[str] = ContextVar("request_id", default="")

#: Substrings that mark a value as not-for-logging.
_SENSITIVE = (
    "password", "passwd", "secret", "token", "authorization", "auth",
    "api_key", "apikey", "signature", "hmac", "cvv", "cvc", "card",
    "pan", "otp", "session_key", "csrf",
)

#: Attributes LogRecord always carries; anything else is a caller-supplied extra.
_STANDARD_ATTRS = frozenset(
    """args asctime created exc_info exc_text filename funcName levelname levelno
    lineno module msecs message msg name pathname process processName
    relativeCreated stack_info thread threadName taskName""".split()
)


def get_request_id() -> str:
    return _request_id.get()


def set_request_id(value: str) -> None:
    _request_id.set(value)


def new_request_id() -> str:
    return uuid.uuid4().hex


def is_sensitive(key) -> bool:
    lowered = str(key).lower()
    if "publishable" in lowered or "public" in lowered:
        return False
    return any(hint in lowered for hint in _SENSITIVE)


def scrub(value, _depth=0):
    """Replace sensitive values, and keep the structure loggable."""
    if _depth > 6:
        return "[too deep]"
    if isinstance(value, dict):
        return {
            str(k): ("[redacted]" if is_sensitive(k) else scrub(v, _depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [scrub(v, _depth + 1) for v in list(value)[:50]]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def mask_email(email: str) -> str:
    """`customer@example.com` -> `c***r@example.com`. Enough to correlate, not to spam."""
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[0]}***{local[-1]}@{domain}"


def mask_phone(phone: str) -> str:
    """Keep the last three digits, which is all support needs to match a record."""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) <= 3:
        return "***"
    return f"***{digits[-3:]}"


class JsonFormatter(logging.Formatter):
    """One JSON object per line, with the request id folded in."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = getattr(record, "request_id", "") or get_request_id()
        if request_id:
            payload["request_id"] = request_id

        for key, value in record.__dict__.items():
            if key in _STANDARD_ATTRS or key.startswith("_") or key == "request_id":
                continue
            # The extra's own name is checked too, not just the keys inside it.
            # scrub() only inspects dict keys, so `extra={"api_key": ...}` would
            # otherwise have written the secret straight into the log.
            payload[key] = "[redacted]" if is_sensitive(key) else scrub(value)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        return json.dumps(payload, default=str, ensure_ascii=False)


class RequestIdFilter(logging.Filter):
    """Attach the current request id to records that do not carry one."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", ""):
            record.request_id = get_request_id()
        return True
