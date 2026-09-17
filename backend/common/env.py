"""Environment reading with validation.

Settings used to read environment variables with silent defaults, so a
misconfigured production box booted happily and failed later at the worst
possible moment — a missing `POSTGRES_DB` meant Django quietly fell back to a
SQLite file that deploys overwrite, and a malformed `SECURE_HSTS_SECONDS` raised
`ValueError` from inside settings import with no indication of which variable
was at fault.

Readers here fail loudly, naming the variable. ``validate_production_settings``
collects every problem at once rather than making an operator fix them one
restart at a time.
"""

from __future__ import annotations

import os

TRUTHY = {"1", "true", "yes", "on"}
FALSEY = {"0", "false", "no", "off", ""}


class ImproperlyConfigured(Exception):
    """Configuration is wrong. The process should not start."""


def get_str(name, default=None, *, required=False):
    value = os.environ.get(name)
    if value is None or value == "":
        if required:
            raise ImproperlyConfigured(f"{name} must be set in the environment.")
        return default
    return value


def get_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    lowered = raw.strip().lower()
    if lowered in TRUTHY:
        return True
    if lowered in FALSEY:
        return False
    raise ImproperlyConfigured(
        f"{name}={raw!r} is not a boolean. Use one of: {sorted(TRUTHY | {'0', 'false', 'no', 'off'})}."
    )


def get_int(name, default=0):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name}={raw!r} is not an integer.") from exc


def get_list(name, default=""):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def validate_production_settings(settings_module):
    """Check a production configuration and return every problem found.

    Called from settings at import time when DEBUG is off. Returns a list of
    human-readable problems; the caller decides whether to refuse to start.
    """
    problems = []
    s = settings_module

    secret = getattr(s, "SECRET_KEY", "") or ""
    if len(secret) < 50:
        problems.append(
            "SECRET_KEY is shorter than 50 characters. Generate one with: "
            "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )
    if secret.startswith("django-insecure-"):
        problems.append(
            "SECRET_KEY still carries the 'django-insecure-' prefix Django generates "
            "for new projects. Replace it."
        )

    if not getattr(s, "ALLOWED_HOSTS", None):
        problems.append("ALLOWED_HOSTS is empty. Set it to the hostnames this site serves.")
    elif "*" in s.ALLOWED_HOSTS:
        problems.append("ALLOWED_HOSTS contains '*', which accepts any Host header.")

    engine = s.DATABASES.get("default", {}).get("ENGINE", "")
    if "sqlite" in engine:
        problems.append(
            "Running on SQLite. Production needs PostgreSQL: set POSTGRES_DB, "
            "POSTGRES_USER and POSTGRES_PASSWORD. SQLite also makes "
            "select_for_update a silent no-op, so the checkout and inventory "
            "locking has no effect."
        )

    if getattr(s, "CORS_ALLOW_ALL_ORIGINS", False):
        problems.append("CORS_ALLOW_ALL_ORIGINS is on. Set CORS_ALLOWED_ORIGINS instead.")
    if not getattr(s, "CORS_ALLOWED_ORIGINS", None) and not getattr(s, "CORS_ALLOW_ALL_ORIGINS", False):
        problems.append("CORS_ALLOWED_ORIGINS is empty, so the storefront cannot call the API.")

    if not getattr(s, "CSRF_TRUSTED_ORIGINS", None):
        problems.append("CSRF_TRUSTED_ORIGINS is empty.")

    for flag in ("SECURE_SSL_REDIRECT", "SESSION_COOKIE_SECURE", "CSRF_COOKIE_SECURE"):
        if not getattr(s, flag, False):
            problems.append(f"{flag} is off. It should be on when serving over HTTPS.")

    # Online payment: if it is on, it must be fully configured, or customers
    # reach a checkout that cannot settle.
    if getattr(s, "SAFEPAY_ENABLED", False):
        if not getattr(s, "SAFEPAY_API_KEY", ""):
            problems.append("SAFEPAY_ENABLED is on but SAFEPAY_API_KEY is empty.")
        if not (getattr(s, "SAFEPAY_WEBHOOK_SECRET", "") or getattr(s, "SAFEPAY_SHARED_SECRET", "")):
            problems.append(
                "SAFEPAY_ENABLED is on but no webhook secret is set. Every callback "
                "will be rejected and no online payment will ever settle."
            )
        if getattr(s, "SAFEPAY_ENV", "") != "production":
            problems.append(
                f"SAFEPAY_ENABLED is on with SAFEPAY_ENV={getattr(s, 'SAFEPAY_ENV', '')!r}. "
                "Real customers would be sent to the sandbox."
            )
        if not str(getattr(s, "BACKEND_PUBLIC_URL", "")).startswith("https://"):
            problems.append(
                "SAFEPAY_ENABLED is on but BACKEND_PUBLIC_URL is not an https:// URL. "
                "The provider cannot reach the webhook."
            )

    if getattr(s, "ORDER_NOTIFICATION_EMAIL_ENABLED", False):
        if not getattr(s, "EMAIL_HOST", None):
            problems.append("Order emails are enabled but EMAIL_HOST is not set.")
        if not getattr(s, "DEFAULT_FROM_EMAIL", None):
            problems.append("Order emails are enabled but DEFAULT_FROM_EMAIL is not set.")

    if getattr(s, "ORDER_NOTIFICATION_SMS_ENABLED", False):
        missing = [
            name
            for name in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER")
            if not getattr(s, name, "")
        ]
        if missing:
            problems.append(f"Order SMS is enabled but {', '.join(missing)} not set.")

    if getattr(s, "CELERY_TASK_ALWAYS_EAGER", False):
        problems.append(
            "CELERY_TASK_ALWAYS_EAGER is on, which runs every background task "
            "inside the web request. That is a test-only setting."
        )

    return problems
