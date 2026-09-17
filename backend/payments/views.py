"""Payment HTTP surface.

Two kinds of endpoint, and the distinction is the whole point:

* **Webhook** — server-to-server, signature-verified, *authoritative*. This is
  the only inbound path that can mark a payment successful.
* **Return / cancel** — the customer's browser coming back from the hosted
  checkout. **Observational only.** These endpoints report state; they never
  decide it. They may ask this server to go and verify with the provider, but
  nothing in the query string is trusted.
"""

import logging

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponseRedirect
from rest_framework import permissions, status, views
from rest_framework.response import Response
from urllib.parse import urlencode

from orders.models import PaymentSession

from .models import PaymentTransaction
from .services import describe_session_state, handle_webhook, verify_session

logger = logging.getLogger(__name__)


class SafepayWebhookView(views.APIView):
    """POST /api/payments/safepay/webhook/ — authoritative settlement path.

    Always answers 200 for anything genuine, including replays and late
    deliveries, so the provider stops retrying. Only a failed signature or an
    unparseable body gets a 4xx.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "payment_webhook"

    def post(self, request):
        result = handle_webhook(PaymentTransaction.PROVIDER_SAFEPAY, request)

        if result.outcome == "rejected":
            return Response(
                {"status": "rejected", "detail": result.detail},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if result.outcome == "unmatched":
            # Genuine signature, unknown payment. Do not make the provider retry
            # forever; reconciliation will pick it up.
            return Response({"status": "unmatched"}, status=status.HTTP_200_OK)

        return Response(
            {
                "status": result.outcome,
                "order_id": result.order.id if result.order else None,
            },
            status=status.HTTP_200_OK,
        )


class _BrowserCallbackView(views.APIView):
    """Shared behaviour for the customer-facing return and cancel pages."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def _redirect(self, *, state, session=None, order_id=None):
        params = {"state": state}
        if session is not None:
            params["session"] = str(session.public_id)
        if order_id:
            params["order_id"] = str(order_id)
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/payment-status?{urlencode(params)}"
        )

    def _load_session(self, request):
        """The browser may name a session. It may not tell us its outcome."""
        public_id = (
            request.query_params.get("order_id")
            or request.query_params.get("orderId")
            or request.query_params.get("session")
            or ""
        )
        if not public_id:
            return None
        try:
            return PaymentSession.objects.select_related("order").get(public_id=public_id)
        except (PaymentSession.DoesNotExist, DjangoValidationError, ValueError, TypeError):
            # An unparseable or unknown id is not an error worth exposing — it
            # tells a prober nothing either way, and a malformed UUID from a
            # browser must not be a 500. Django raises its own ValidationError
            # for a bad UUID, which is why that is caught here explicitly.
            return None


class SafepayReturnView(_BrowserCallbackView):
    """GET/POST /api/payments/safepay/return/ — customer came back.

    This endpoint deliberately ignores every status, tracker and signature
    parameter in the request. It identifies the session, then asks *the
    provider* what happened. If the webhook already settled the payment, the
    verification call is a no-op and the customer sees the right answer anyway.
    """

    def get(self, request):
        return self._handle(request)

    def post(self, request):
        return self._handle(request)

    def _handle(self, request):
        session = self._load_session(request)
        if session is None:
            return self._redirect(state="unknown")

        if session.status == "COMPLETED" and session.order_id:
            return self._redirect(state="success", session=session, order_id=session.order_id)

        result = verify_session(session)

        if result.outcome in {"settled", "already_settled"} and result.order:
            return self._redirect(state="success", session=session, order_id=result.order.id)
        if result.outcome in {"mismatch", "paid_order_failed"}:
            return self._redirect(state="review", session=session)
        if result.outcome == "unverifiable":
            # We could not reach the provider. The payment may still be fine and
            # the webhook or reconciliation will resolve it — do not tell the
            # customer it failed.
            return self._redirect(state="pending", session=session)

        session.refresh_from_db()
        if session.status == "COMPLETED" and session.order_id:
            return self._redirect(state="success", session=session, order_id=session.order_id)
        if session.status in {"FAILED", "CANCELLED"}:
            return self._redirect(state="failed", session=session)
        return self._redirect(state="pending", session=session)


class SafepayCancelView(_BrowserCallbackView):
    """GET/POST /api/payments/safepay/cancel/ — customer abandoned checkout.

    A cancel callback can only move a session that is still pending. It can
    never touch a completed one, and it never touches a PaymentTransaction —
    only the provider gets to say a payment failed.
    """

    def get(self, request):
        return self._handle(request)

    def post(self, request):
        return self._handle(request)

    def _handle(self, request):
        session = self._load_session(request)
        if session is None:
            return self._redirect(state="cancelled")

        if session.status == "COMPLETED":
            return self._redirect(state="success", session=session, order_id=session.order_id)

        if session.status == "PENDING":
            # Verify first: the customer may have paid and then hit "back".
            result = verify_session(session)
            if result.outcome in {"settled", "already_settled"} and result.order:
                return self._redirect(
                    state="success", session=session, order_id=result.order.id
                )
            session.refresh_from_db()
            if session.status == "PENDING":
                session.status = "CANCELLED"
                session.save(update_fields=["status", "updated_at"])

        return self._redirect(state="cancelled", session=session)


class PaymentSessionStatusView(views.APIView):
    """GET /api/payments/sessions/<public_id>/status/ — safe polling endpoint.

    The confirmation page polls this while a webhook is in flight. It reports
    stored state only and never triggers settlement.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, public_id):
        try:
            session = PaymentSession.objects.select_related("order").get(public_id=public_id)
        except (PaymentSession.DoesNotExist, DjangoValidationError, ValueError, TypeError):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # A session belonging to an account is only visible to that account.
        if session.user_id and (
            not request.user.is_authenticated or request.user.id != session.user_id
        ):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(describe_session_state(session))
