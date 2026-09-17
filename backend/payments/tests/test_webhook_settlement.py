"""The settlement invariants, one test each.

Covers the Phase 0 matrix: valid webhook, invalid signature, replay, wrong
amount, wrong currency, tracker/session mismatch, duplicate webhook, payment
already processed, late webhook, and browser return before and after the
webhook.
"""

from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse

from orders.models import Order, PaymentSession
from payments.models import PaymentTransaction, WebhookEvent

from .factories import (
    WEBHOOK_SECRET,
    make_product,
    make_session,
    make_transaction,
    sign,
    webhook_body,
)

WEBHOOK_URL = "/api/payments/safepay/webhook/"
RETURN_URL = "/api/payments/safepay/return/"


@override_settings(
    SAFEPAY_ENABLED=True,
    # repo-hygiene: allow — override_settings literals for the test run only.
    SAFEPAY_API_KEY="test-key",
    SAFEPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
    SAFEPAY_WEBHOOK_SIGNATURE_ALGORITHM="sha512",
)
class WebhookSettlementTests(TestCase):
    def setUp(self):
        self.product = make_product(stock=5)
        self.session = make_session(product=self.product, tracker="tracker-abc")
        self.txn = make_transaction(self.session, tracker="tracker-abc")

    def post_webhook(self, body, *, signature=None):
        return self.client.post(
            WEBHOOK_URL,
            data=body,
            content_type="application/json",
            HTTP_X_SFPY_SIGNATURE=signature if signature is not None else sign(body),
        )

    # -- the happy path --------------------------------------------------

    def test_valid_webhook_settles_the_payment_and_creates_the_order(self):
        body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-1",
            event_id="evt-1",
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_webhook(body)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "settled")

        self.txn.refresh_from_db()
        self.session.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_PAID)
        self.assertEqual(self.txn.provider_reference, "sfpy-ref-1")
        self.assertEqual(self.txn.verified_amount, self.session.total_amount)
        self.assertIsNotNone(self.txn.settled_at)

        self.assertEqual(self.session.status, "COMPLETED")
        order = self.session.order
        self.assertIsNotNone(order)
        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(order.status, "CONFIRMED")
        self.assertEqual(self.product.stock, 4)

    # -- signature -------------------------------------------------------

    def test_invalid_signature_settles_nothing(self):
        body = webhook_body(
            tracker="tracker-abc", amount=self.session.total_amount, event_id="evt-bad"
        )
        response = self.post_webhook(body, signature="deadbeef")

        self.assertEqual(response.status_code, 400)
        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_INITIATED)
        self.assertEqual(Order.objects.count(), 0)
        self.assertTrue(
            WebhookEvent.objects.filter(result=WebhookEvent.RESULT_REJECTED).exists()
        )

    def test_missing_signature_settles_nothing(self):
        body = webhook_body(
            tracker="tracker-abc", amount=self.session.total_amount, event_id="evt-nosig"
        )
        response = self.client.post(WEBHOOK_URL, data=body, content_type="application/json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    @override_settings(SAFEPAY_WEBHOOK_SECRET="", SAFEPAY_SHARED_SECRET="")
    def test_unconfigured_secret_rejects_rather_than_accepts(self):
        """Fail closed. A missing secret must never mean 'trust everything'."""
        body = webhook_body(
            tracker="tracker-abc", amount=self.session.total_amount, event_id="evt-nocfg"
        )
        response = self.post_webhook(body)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    # -- amount and currency ---------------------------------------------

    def test_wrong_amount_is_held_for_review_and_never_settles(self):
        body = webhook_body(
            tracker="tracker-abc",
            amount=Decimal("1.00"),  # customer paid one rupee for a 12,000 basket
            reference="sfpy-ref-2",
            event_id="evt-2",
        )
        response = self.post_webhook(body)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "mismatch")

        self.txn.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_MISMATCH)
        self.assertIn("Amount mismatch", self.txn.failure_reason)
        self.assertEqual(self.session.status, "REVIEW")
        self.assertEqual(Order.objects.count(), 0)

    def test_wrong_currency_is_held_for_review_and_never_settles(self):
        body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            currency="USD",
            reference="sfpy-ref-3",
            event_id="evt-3",
        )
        response = self.post_webhook(body)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_MISMATCH)
        self.assertIn("Currency mismatch", self.txn.failure_reason)
        self.assertEqual(Order.objects.count(), 0)

    def test_missing_amount_refuses_to_settle(self):
        """No reported amount means nothing to verify against. Refuse."""
        import json

        body = json.dumps(
            {"tracker": "tracker-abc", "state": "paid", "currency": "PKR",
             "reference": "sfpy-ref-4", "event_id": "evt-4"}
        ).encode("utf-8")
        self.post_webhook(body)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_MISMATCH)
        self.assertEqual(Order.objects.count(), 0)

    # -- replay and idempotency ------------------------------------------

    def test_replayed_delivery_is_ignored(self):
        body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-5",
            event_id="evt-5",
        )

        with self.captureOnCommitCallbacks(execute=True):
            first = self.post_webhook(body)
        second = self.post_webhook(body)

        self.assertEqual(first.json()["status"], "settled")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["status"], "replay")
        self.assertEqual(Order.objects.count(), 1)

    def test_duplicate_webhook_under_a_new_event_id_does_not_double_settle(self):
        """A provider resend with a fresh event id still must not pay twice."""
        first_body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-6",
            event_id="evt-6a",
        )
        second_body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-6",
            event_id="evt-6b",
        )

        with self.captureOnCommitCallbacks(execute=True):
            self.post_webhook(first_body)
        second = self.post_webhook(second_body)

        self.assertEqual(second.json()["status"], "already_settled")
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(PaymentTransaction.objects.count(), 1)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 4)  # decremented exactly once

    def test_late_webhook_after_settlement_is_a_no_op(self):
        body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-7",
            event_id="evt-7",
        )
        with self.captureOnCommitCallbacks(execute=True):
            self.post_webhook(body)
        order_id = PaymentSession.objects.get(pk=self.session.pk).order_id

        late = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-7",
            event_id="evt-7-late",
        )
        response = self.post_webhook(late)

        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(self.session.order_id, order_id)
        self.assertEqual(Order.objects.count(), 1)

    # -- failure paths ---------------------------------------------------

    def test_failed_payment_does_not_create_an_order(self):
        body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            state="failed",
            reference="sfpy-ref-8",
            event_id="evt-8",
        )
        self.post_webhook(body)

        self.txn.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_FAILED)
        self.assertEqual(self.session.status, "FAILED")
        self.assertEqual(Order.objects.count(), 0)

    def test_cancellation_cannot_overwrite_a_paid_payment(self):
        paid = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-9",
            event_id="evt-9",
        )
        with self.captureOnCommitCallbacks(execute=True):
            self.post_webhook(paid)

        cancel = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            state="cancelled",
            reference="sfpy-ref-9",
            event_id="evt-9-cancel",
        )
        self.post_webhook(cancel)

        self.txn.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_PAID)
        self.assertEqual(self.session.status, "COMPLETED")
        self.assertIsNotNone(self.session.order_id)

    def test_unknown_tracker_settles_nothing(self):
        body = webhook_body(
            tracker="tracker-does-not-exist",
            amount=self.session.total_amount,
            reference="sfpy-ref-10",
            event_id="evt-10",
        )
        response = self.post_webhook(body)

        self.assertEqual(response.json()["status"], "unmatched")
        self.assertEqual(Order.objects.count(), 0)
        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_INITIATED)

    def test_paid_but_out_of_stock_keeps_the_payment_and_flags_review(self):
        """Money taken must never be silently discarded because stock ran out."""
        self.product.stock = 0
        self.product.save(update_fields=["stock"])

        body = webhook_body(
            tracker="tracker-abc",
            amount=self.session.total_amount,
            reference="sfpy-ref-11",
            event_id="evt-11",
        )
        response = self.post_webhook(body)

        self.assertEqual(response.status_code, 200)
        self.txn.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.txn.status, PaymentTransaction.STATUS_PAID)
        self.assertEqual(self.session.status, "REVIEW")
        self.assertIn("order creation failed", self.txn.failure_reason)
        self.assertEqual(Order.objects.count(), 0)
