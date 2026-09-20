"""Platform foundation: health checks, config validation, logging, dispatch."""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from common import env
from common.dispatch import enqueue
from common.logging import JsonFormatter, mask_email, mask_phone, scrub
from orders.models import Order


class HealthEndpointTests(TestCase):
    def test_liveness_needs_no_dependencies(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_readiness_reports_each_dependency(self):
        response = self.client.get("/readyz")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(
            set(body["checks"]), {"database", "cache", "migrations"}
        )

    def test_readiness_returns_503_when_the_database_is_unreachable(self):
        """A load balancer must be told to stop sending traffic, not given a 200."""
        with patch("common.health._check_database", return_value=(False, "OperationalError")):
            response = self.client.get("/readyz")

        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["status"], "unavailable")
        self.assertFalse(body["checks"]["database"]["ok"])

    def test_liveness_still_passes_when_the_database_is_down(self):
        """Restarting the web process does not fix a database."""
        with patch("common.health._check_database", return_value=(False, "OperationalError")):
            self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_health_endpoints_do_not_leak_configuration(self):
        body = self.client.get("/readyz").content.decode()
        for leak in ("PASSWORD", "SECRET", "postgres://", "redis://"):
            self.assertNotIn(leak, body)


class RequestCorrelationTests(TestCase):
    def test_every_response_carries_a_request_id(self):
        response = self.client.get("/healthz")
        self.assertTrue(response["X-Request-ID"])

    def test_a_caller_supplied_id_is_honoured(self):
        response = self.client.get("/healthz", HTTP_X_REQUEST_ID="trace-abc-123")
        self.assertEqual(response["X-Request-ID"], "trace-abc-123")

    def test_a_hostile_id_is_replaced_rather_than_echoed(self):
        """Otherwise a client could inject newlines and forge log entries."""
        response = self.client.get("/healthz", HTTP_X_REQUEST_ID="bad\nid: injected")
        self.assertNotIn("\n", response["X-Request-ID"])
        self.assertNotEqual(response["X-Request-ID"], "bad\nid: injected")

    def test_an_overlong_id_is_replaced(self):
        response = self.client.get("/healthz", HTTP_X_REQUEST_ID="x" * 500)
        self.assertLessEqual(len(response["X-Request-ID"]), 64)


class LogScrubbingTests(TestCase):
    def test_sensitive_keys_are_redacted(self):
        cleaned = scrub(
            {
                "order_id": 7,
                "password": "hunter2",
                "api_key": "sk_live_abc",
                "authorization": "Bearer xyz",
                "card_number": "4111111111111111",
                "nested": {"secret": "s3cr3t", "quantity": 2},
            }
        )
        self.assertEqual(cleaned["order_id"], 7)
        self.assertEqual(cleaned["nested"]["quantity"], 2)
        for key in ("password", "api_key", "authorization", "card_number"):
            self.assertEqual(cleaned[key], "[redacted]")
        self.assertEqual(cleaned["nested"]["secret"], "[redacted]")

    def test_public_keys_are_not_treated_as_secrets(self):
        cleaned = scrub({"publishable_key": "pk_live_abc", "public_token": "pt_1"})
        self.assertEqual(cleaned["publishable_key"], "pk_live_abc")

    def test_identifiers_are_masked_not_dropped(self):
        self.assertEqual(mask_email("customer@example.com"), "c******r@example.com".replace("******", "***"))
        self.assertEqual(mask_phone("03001234567"), "***567")
        self.assertEqual(mask_email(""), "")
        self.assertEqual(mask_phone("12"), "***")

    def test_json_formatter_emits_one_parseable_object(self):
        record = logging.LogRecord(
            name="payments", level=logging.INFO, pathname=__file__, lineno=1,
            msg="Payment settled: %s", args=("ref-1",), exc_info=None,
        )
        record.order_id = 42
        record.api_key = "sk_live_should_not_appear"

        payload = json.loads(JsonFormatter().format(record))

        self.assertEqual(payload["level"], "INFO")
        self.assertEqual(payload["logger"], "payments")
        self.assertEqual(payload["message"], "Payment settled: ref-1")
        self.assertEqual(payload["order_id"], 42)
        self.assertEqual(payload["api_key"], "[redacted]")


class DispatchFallbackTests(TestCase):
    def test_work_runs_inline_when_the_broker_is_unreachable(self):
        """A Redis outage must degrade notifications to slow, not fail checkout."""
        calls = []

        def fake_task(value):
            calls.append(value)

        fake_task.name = "fake.task"
        fake_task.delay = lambda *a, **kw: (_ for _ in ()).throw(ConnectionError("broker down"))

        result = enqueue(fake_task, "order-7")

        self.assertEqual(result, "inline")
        self.assertEqual(calls, ["order-7"])

    def test_failure_on_both_paths_is_reported_not_raised(self):
        def fake_task(value):
            raise RuntimeError("provider exploded")

        fake_task.name = "fake.task"
        fake_task.delay = lambda *a, **kw: (_ for _ in ()).throw(ConnectionError("broker down"))

        self.assertEqual(enqueue(fake_task, "order-7"), "failed")


class EnvReaderTests(TestCase):
    def test_a_malformed_boolean_names_the_variable(self):
        with patch.dict("os.environ", {"SOME_FLAG": "maybe"}):
            with self.assertRaises(env.ImproperlyConfigured) as ctx:
                env.get_bool("SOME_FLAG")
        self.assertIn("SOME_FLAG", str(ctx.exception))

    def test_a_malformed_integer_names_the_variable(self):
        with patch.dict("os.environ", {"SOME_COUNT": "ten"}):
            with self.assertRaises(env.ImproperlyConfigured) as ctx:
                env.get_int("SOME_COUNT")
        self.assertIn("SOME_COUNT", str(ctx.exception))

    def test_a_required_missing_variable_is_refused(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(env.ImproperlyConfigured):
                env.get_str("DEFINITELY_NOT_SET", required=True)


class ProductionConfigValidationTests(TestCase):
    """The checks that stop a misconfigured box from booting."""

    def _settings(self, **overrides):
        base = dict(
            # repo-hygiene: allow — a synthetic value for the validator test.
            SECRET_KEY="x" * 60,
            ALLOWED_HOSTS=["shop.example.com"],
            DATABASES={"default": {"ENGINE": "django.db.backends.postgresql"}},
            CORS_ALLOW_ALL_ORIGINS=False,
            CORS_ALLOWED_ORIGINS=["https://shop.example.com"],
            CSRF_TRUSTED_ORIGINS=["https://shop.example.com"],
            SECURE_SSL_REDIRECT=True,
            SESSION_COOKIE_SECURE=True,
            CSRF_COOKIE_SECURE=True,
            SAFEPAY_ENABLED=False,
            ORDER_NOTIFICATION_EMAIL_ENABLED=False,
            ORDER_NOTIFICATION_SMS_ENABLED=False,
            CELERY_TASK_ALWAYS_EAGER=False,
            ADMIN_URL="secure-admin/",
        )
        base.update(overrides)
        return SimpleNamespace(**base)

    def test_a_good_configuration_reports_nothing(self):
        self.assertEqual(env.validate_production_settings(self._settings()), [])

    def test_default_admin_url_is_refused(self):
        """The nginx edge routes /admin/* to the staff SPA.

        Django admin is proxied at the ADMIN_URL prefix instead, so leaving the
        default both hides Django admin behind a route that no longer reaches
        it and parks it on the first path anyone scanning a Django site tries.
        """
        for value in ("admin/", "admin", "", None):
            with self.subTest(admin_url=value):
                problems = env.validate_production_settings(
                    self._settings(ADMIN_URL=value)
                )
                self.assertTrue(
                    any("ADMIN_URL" in problem for problem in problems),
                    f"{value!r} should have been refused",
                )

    def test_a_custom_admin_url_is_accepted(self):
        self.assertEqual(
            env.validate_production_settings(self._settings(ADMIN_URL="ops-console/")),
            [],
        )

    def test_sqlite_in_production_is_refused(self):
        problems = env.validate_production_settings(
            self._settings(DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3"}})
        )
        self.assertTrue(any("SQLite" in p for p in problems))
        self.assertTrue(any("select_for_update" in p for p in problems))

    def test_an_insecure_secret_key_is_refused(self):
        problems = env.validate_production_settings(
            # repo-hygiene: allow — the literal under test; asserting it is refused.
            self._settings(SECRET_KEY="django-insecure-abc")
        )
        self.assertTrue(any("django-insecure-" in p for p in problems))

    def test_wildcard_allowed_hosts_is_refused(self):
        problems = env.validate_production_settings(self._settings(ALLOWED_HOSTS=["*"]))
        self.assertTrue(any("'*'" in p for p in problems))

    def test_online_payment_without_a_webhook_secret_is_refused(self):
        problems = env.validate_production_settings(
            self._settings(
                SAFEPAY_ENABLED=True,
                SAFEPAY_API_KEY="key",
                SAFEPAY_WEBHOOK_SECRET="",
                SAFEPAY_SHARED_SECRET="",
                SAFEPAY_ENV="production",
                BACKEND_PUBLIC_URL="https://api.example.com",
            )
        )
        self.assertTrue(any("no webhook secret" in p for p in problems))

    def test_online_payment_pointed_at_the_sandbox_is_refused(self):
        problems = env.validate_production_settings(
            self._settings(
                SAFEPAY_ENABLED=True,
                SAFEPAY_API_KEY="key",
                SAFEPAY_WEBHOOK_SECRET="secret",
                SAFEPAY_ENV="sandbox",
                BACKEND_PUBLIC_URL="https://api.example.com",
            )
        )
        self.assertTrue(any("sandbox" in p for p in problems))

    def test_eager_celery_in_production_is_refused(self):
        problems = env.validate_production_settings(
            self._settings(CELERY_TASK_ALWAYS_EAGER=True)
        )
        self.assertTrue(any("ALWAYS_EAGER" in p for p in problems))

    def test_every_problem_is_reported_at_once(self):
        """So an operator fixes them in one pass, not one restart at a time."""
        problems = env.validate_production_settings(
            self._settings(
                SECRET_KEY="short",
                ALLOWED_HOSTS=[],
                DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3"}},
                SECURE_SSL_REDIRECT=False,
            )
        )
        self.assertGreaterEqual(len(problems), 4)


class BackupCommandTests(TestCase):
    """The drill seeding, which CI uses to prove a restore is non-empty."""

    def test_seed_refuses_to_run_where_orders_already_exist(self):
        Order.objects.create(
            total_amount=Decimal("100.00"),
            shipping_address="addr",
            payment_method="COD",
        )
        with self.assertRaises(CommandError) as ctx:
            call_command("seed_drill_data", verbosity=0)
        self.assertIn("already contains orders", str(ctx.exception))

    def test_seed_creates_data_worth_restoring(self):
        call_command("seed_drill_data", orders=3, verbosity=0)

        from payments.models import PaymentTransaction
        from products.models import Product

        self.assertEqual(Order.objects.count(), 3)
        self.assertEqual(PaymentTransaction.objects.count(), 3)
        self.assertTrue(Product.objects.exists())

    def test_backup_rejects_an_unsupported_engine(self):
        with override_settings(DATABASES={"default": {"ENGINE": "django.db.backends.oracle"}}):
            with self.assertRaises(CommandError):
                call_command("backup_database", verbosity=0)
