from django.urls import path

from .views import (
    PaymentSessionStatusView,
    SafepayCancelView,
    SafepayReturnView,
    SafepayWebhookView,
)

urlpatterns = [
    # Authoritative. Signature-verified, server-to-server.
    path("payments/safepay/webhook/", SafepayWebhookView.as_view(), name="safepay-webhook"),
    # Observational. The customer's browser coming back.
    path("payments/safepay/return/", SafepayReturnView.as_view(), name="safepay-return"),
    path("payments/safepay/cancel/", SafepayCancelView.as_view(), name="safepay-cancel"),
    # Read-only polling for the confirmation page.
    path(
        "payments/sessions/<uuid:public_id>/status/",
        PaymentSessionStatusView.as_view(),
        name="payment-session-status",
    ),
]
