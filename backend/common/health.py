"""Health endpoints.

Two, because they answer different questions and conflating them causes outages:

``/healthz`` — *liveness*. Is this process alive? No dependency checks. A
restart supervisor uses this, so it must not fail because the database is
briefly unreachable: restarting the web process does not fix a database, and a
liveness check that depends on one turns a database blip into a restart loop.

``/readyz`` — *readiness*. Can this process serve traffic right now? Checks the
database, the cache, and whether migrations are applied. A load balancer or a
deploy script uses this to decide whether to send traffic, and the deploy
workflow gates on it before considering a release good.

Neither endpoint reveals anything useful to an anonymous caller — versions,
hostnames and connection strings are deliberately absent.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache
from django.db import connections
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)


@csrf_exempt
@never_cache
def liveness(request):
    """Cheap, dependency-free proof the process is up."""
    return JsonResponse({"status": "ok"})


def _check_database():
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True, ""
    except Exception as exc:  # noqa: BLE001 — report, never raise, from a health check
        logger.warning("Readiness: database check failed", exc_info=True)
        return False, type(exc).__name__


def _check_cache():
    if settings.CACHES["default"]["BACKEND"].endswith("DummyCache"):
        return True, "not configured"
    try:
        cache.set("healthcheck", "ok", 10)
        if cache.get("healthcheck") != "ok":
            return False, "value did not survive a round trip"
        return True, ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("Readiness: cache check failed", exc_info=True)
        return False, type(exc).__name__


def _check_migrations():
    """Unapplied migrations mean the code and the schema disagree."""
    try:
        executor = MigrationExecutor(connections["default"])
        # migration_plan yields (Migration, backwards) pairs.
        plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
        if plan:
            names = ", ".join(
                f"{migration.app_label}.{migration.name}" for migration, _ in plan[:5]
            )
            suffix = ", …" if len(plan) > 5 else ""
            return False, f"{len(plan)} unapplied: {names}{suffix}"
        return True, ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("Readiness: migration check failed", exc_info=True)
        return False, type(exc).__name__


@csrf_exempt
@never_cache
def readiness(request):
    """Can this process serve traffic? 200 if yes, 503 if not."""
    checks = {}
    ok = True

    for name, check in (
        ("database", _check_database),
        ("cache", _check_cache),
        ("migrations", _check_migrations),
    ):
        passed, detail = check()
        checks[name] = {"ok": passed}
        if detail:
            checks[name]["detail"] = detail
        ok = ok and passed

    return JsonResponse(
        {"status": "ok" if ok else "unavailable", "checks": checks},
        status=200 if ok else 503,
    )
