from django.urls import path

# The Safepay browser callbacks now live in the payments app, where they are
# observational only. The legacy paths below are kept pointing at the new views
# because the provider dashboard may still have them configured as the redirect
# and cancel URLs — changing behaviour must not depend on someone remembering to
# update a setting in a third-party console.
from payments.views import SafepayCancelView, SafepayReturnView

from .views import (
    GuestOrderLookupView,
    OrderCancelView,
    OrderDetailView,
    OrderListCreateView,
    PaymentMethodListView,
    PaymentSessionCreateView,
    PaymentSessionDetailView,
    PromotionPreviewView,
)
from .views_admin import (
    AdminOrderDetailView,
    AdminOrderListView,
    AdminOrderTransitionView,
    AdminPaymentSessionReviewActionView,
    AdminPaymentSessionReviewListView,
)

urlpatterns = [
    path('payment-methods/', PaymentMethodListView.as_view(), name='payment-method-list'),
    path('orders/', OrderListCreateView.as_view(), name='order-list-create'),
    path('orders/promo-preview/', PromotionPreviewView.as_view(), name='order-promo-preview'),
    path('orders/payment-sessions/', PaymentSessionCreateView.as_view(), name='order-payment-session-create'),
    path('orders/payment-sessions/<uuid:public_id>/', PaymentSessionDetailView.as_view(), name='order-payment-session-detail'),

    # Legacy callback paths — same observational views as /api/payments/safepay/*.
    path('orders/payments/safepay/return/', SafepayReturnView.as_view(), name='safepay-return-legacy'),
    path('orders/payments/safepay/cancel/', SafepayCancelView.as_view(), name='safepay-cancel-legacy'),

    path('orders/guest-lookup/', GuestOrderLookupView.as_view(), name='guest-order-lookup'),
    path('orders/<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('orders/<int:pk>/cancel/', OrderCancelView.as_view(), name='order-cancel'),

    # Admin URLs
    path('admin/orders/', AdminOrderListView.as_view(), name='admin-order-list'),
    path('admin/orders/<int:pk>/', AdminOrderDetailView.as_view(), name='admin-order-detail'),
    path('admin/orders/<int:pk>/transition/', AdminOrderTransitionView.as_view(), name='admin-order-transition'),
    path('admin/payment-sessions/', AdminPaymentSessionReviewListView.as_view(), name='admin-payment-session-list'),
    path('admin/payment-sessions/<uuid:public_id>/action/', AdminPaymentSessionReviewActionView.as_view(), name='admin-payment-session-action'),
]
