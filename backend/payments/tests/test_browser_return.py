"""The browser return page: ordering against the webhook, and what it may do.

The customer's browser and the provider's webhook race. Either can arrive first,
or the webhook can fail to arrive at all. The customer must see the right answer
in every ordering, and in none of them may the browser be what decided it.
"""

from decimal import Decimal
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.test import TestCase, override_settings

from orders.models import Order
from payments.models import PKR, PaymentTransaction
from payments.providers.base import PaymentProviderError, ProviderStatus

from .factories import (
    WEBHOOK_SECRET,
    make_product,
    make_session,
    make_transaction,
    sign,
    webhook_body,
)

RETURN_URL = "/api/payments/safepay/return/"
WEBHOOK_URL = "/api/payments/safepay/webhook/"


def redirect_state(response):
    query = parse_qs(urlparse(response["Location"]).query)
    return query.get("state", [""])[0]


@override_settings(
    SAFEPAY_ENABLED=True,
    # repo-hygiene: allow — override_settings literals for the test run only.
    SAFEPAY_API_KEY="test-key",
    SAFEPAY_WEBHOOK_SECRET=WEBHOOK_SECRET,
)
class BrowserReturnTests(TestCase):
    def setUp(self):
        self.product = make_product(stock=5)
        self.session = make_session(product=self.product, tracker="tracker-xyz")
        self.txn = make_transaction(self.session, tracker="tracker-xyz")

    def paid_status(self, *, amount=None, reference="sfpy-return"):
        return ProviderStatus(
            status=PaymentTransaction.STATUS_PAID,
            provider_reference=reference,
            tracker="tracker-xyz",
            amount=Decimal(amount) if amount is not None else self.session.total_amount,
            currency=PKR,
            event_id="evt-verify",
            raw_payload={"state": "paid"},
        )

    def send_webhook(self, *, event_id="evt-hook", reference="sfpy-hook"):
        body = webhook_body(
            tracker="tracker-xyz",
            amount=self.session.total_amount,
            reference=reference,
            event_id=event_id,
        )
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                WEBHOOK_URL,
                data=body,
                content_type="application/json",
                HTTP_X_SFPY_SIGNATURE=sign(body),
            )

    # -- ordering --------------------------------------------------------

    def test_return_before_webhook_settles_via_server_verification(self):
        """No webhook yet: the server asks the provider itself and settles."""
        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status",
            return_value=self.paid_status(),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.get(
                    RETURN_URL, {"order_id": str(self.session.public_id)}
                )

        self.assertEqual(redirect_state(response), "success")
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, "COMPLETED")
        self.assertEqual(Order.objects.count(), 1)

        # The webhook then arrives late and changes nothing.
        self.send_webhook()
        self.assertEqual(Order.objects.count(), 1)

    def test_return_after_webhook_reports_the_existing_order(self):
        self.send_webhook()
        self.assertEqual(Order.objects.count(), 1)
        order_id = Order.objects.get().id

        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status"
        ) as mock_fetch:
            response = self.client.get(
                RETURN_URL, {"order_id": str(self.session.public_id)}
            )

        self.assertEqual(redirect_state(response), "success")
        # Already settled — no need to bother the provider again.
        mock_fetch.assert_not_called()
        self.assertEqual(Order.objects.count(), 1)
        query = parse_qs(urlparse(response["Location"]).query)
        self.assertEqual(query["order_id"][0], str(order_id))

    def test_unreachable_provider_reports_pending_not_failed(self):
        """A network problem is not evidence the customer's payment failed."""
        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status",
            side_effect=PaymentProviderError("timeout"),
        ):
            response = self.client.get(
                RETURN_URL, {"order_id": str(self.session.public_id)}
            )

        self.assertEqual(redirect_state(response), "pending")
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, "PENDING")
        self.assertEqual(Order.objects.count(), 0)

    def test_verification_reporting_a_wrong_amount_sends_the_customer_to_review(self):
        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status",
            return_value=self.paid_status(amount="1.00"),
        ):
            response = self.client.get(
                RETURN_URL, {"order_id": str(self.session.public_id)}
            )

        self.assertEqual(redirect_state(response), "review")
        self.assertEqual(Order.objects.count(), 0)

    def test_unknown_session_id_reveals_nothing(self):
        response = self.client.get(
            RETURN_URL, {"order_id": "00000000-0000-0000-0000-000000000000"}
        )
        self.assertEqual(redirect_state(response), "unknown")

    def test_malformed_session_id_does_not_error(self):
        response = self.client.get(RETURN_URL, {"order_id": "not-a-uuid"})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(redirect_state(response), "unknown")

    # -- cancel ----------------------------------------------------------

    def test_cancel_verifies_before_giving_up(self):
        """A customer who paid and then hit Back must still get their order."""
        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status",
            return_value=self.paid_status(),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.get(
                    "/api/payments/safepay/cancel/",
                    {"order_id": str(self.session.public_id)},
                )

        self.assertEqual(redirect_state(response), "success")
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, "COMPLETED")

    def test_cancel_marks_an_unpaid_session_cancelled(self):
        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status",
            side_effect=PaymentProviderError("unreachable"),
        ):
            response = self.client.get(
                "/api/payments/safepay/cancel/",
                {"order_id": str(self.session.public_id)},
            )

        self.assertEqual(redirect_state(response), "cancelled")
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, "CANCELLED")

    # -- polling ---------------------------------------------------------

    def test_status_endpoint_reports_without_settling(self):
        with patch(
            "payments.providers.safepay.SafepayProvider.fetch_status"
        ) as mock_fetch:
            response = self.client.get(
                f"/api/payments/sessions/{self.session.public_id}/status/"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["session_status"], "PENDING")
        self.assertEqual(response.json()["currency"], PKR)
        mock_fetch.assert_not_called()
        self.assertEqual(Order.objects.count(), 0)
