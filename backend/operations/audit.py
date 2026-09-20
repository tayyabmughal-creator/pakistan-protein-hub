"""Recording privileged actions.

One function, ``record``, called explicitly from the service that performs the
action. Not a signal: a signal fires on every save and cannot tell a staff
member repricing a product from a nightly job touching the same row, so it
would produce an audit log full of noise with the real events buried in it.

What is never written here: passwords, tokens, provider secrets, card data, or
a customer's full record. ``serialize_for_audit`` redacts by key name, and the
redaction list deliberately exempts anything named public or publishable.

Borrowed from Enfant: the redaction-by-key-hint approach in
`backend/store/services/admin_audit.py`, and its exemption for public keys.
Rewritten rather than copied — PN needs neither its model registry nor its
multi-region fields.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from django.db.models.fields.files import FieldFile

from common.logging import get_request_id

from .models import AdminAuditLog

logger = logging.getLogger(__name__)

#: Substrings marking a key as holding a secret. A match is replaced with a
#: presence flag, so the log can still show that a value was set without
#: showing what it was.
_SENSITIVE_HINTS = (
    "secret", "password", "passwd", "token", "api_key", "apikey",
    "hmac", "signature", "private", "auth", "cvv", "cvc", "card", "pan",
)


def _is_sensitive(key) -> bool:
    lowered = str(key).lower()
    if "publishable" in lowered or "public" in lowered:
        return False
    return any(hint in lowered for hint in _SENSITIVE_HINTS)


def serialize_for_audit(value, _depth=0):
    """Make a value JSON-storable, redacting anything sensitive."""
    if _depth > 6:
        return "[too deep]"
    if isinstance(value, dict):
        return {
            str(key): ("[set]" if value.get(key) not in (None, "", b"") else "[empty]")
            if _is_sensitive(key)
            else serialize_for_audit(item, _depth + 1)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [serialize_for_audit(item, _depth + 1) for item in list(value)[:50]]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, FieldFile):
        try:
            return value.name or ""
        except ValueError:
            return ""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def diff(before: dict | None, after: dict | None) -> dict:
    """Only what changed, as ``{field: {"from": x, "to": y}}``.

    Storing the whole record twice makes "what did they actually change" a
    reading exercise, and doubles the amount of customer data sitting in the log.
    """
    before = before or {}
    after = after or {}
    changes = {}
    for field in sorted(set(before) | set(after)):
        old = serialize_for_audit(before.get(field))
        new = serialize_for_audit(after.get(field))
        if old != new:
            changes[field] = {"from": old, "to": new}
    return changes


def snapshot(instance, fields=None) -> dict:
    """Capture an instance's fields, for taking a before and after."""
    if instance is None:
        return {}
    names = fields or [
        field.name
        for field in instance._meta.concrete_fields
        if field.name not in {"created_at", "updated_at"}
    ]
    return {name: getattr(instance, name, None) for name in names}


def record(
    *,
    action,
    entity,
    actor=None,
    summary="",
    reason="",
    before=None,
    after=None,
    request=None,
    entity_label=None,
):
    """Write one audit entry.

    Never raises. A failure to record must not roll back the action it was
    describing — losing the log line is bad, losing the stock adjustment that
    the line described is worse. The failure is logged loudly instead.
    """
    try:
        entity_type = f"{entity._meta.app_label}.{entity._meta.object_name}"
        entity_id = str(getattr(entity, "pk", "") or "")
        label = entity_label if entity_label is not None else str(entity)[:200]

        ip = None
        request_id = get_request_id()
        if request is not None:
            request_id = getattr(request, "request_id", request_id)
            # Only the immediate peer. X-Forwarded-For is caller-controlled and
            # trusting it writes whatever the client claims into the audit log.
            ip = request.META.get("REMOTE_ADDR") or None

        return AdminAuditLog.objects.create(
            actor=actor if getattr(actor, "pk", None) else None,
            actor_label=(getattr(actor, "email", "") or "system")[:160],
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=label,
            summary=summary[:255],
            reason=(reason or "")[:255],
            changes=diff(before, after) if (before or after) else {},
            request_id=request_id or "",
            ip_address=ip,
        )
    except Exception:  # noqa: BLE001 — see the docstring
        logger.exception(
            "Could not write an audit entry",
            extra={"action": action, "entity": str(entity)[:100]},
        )
        return None
