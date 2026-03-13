from django.urls import path
from .views import OrderListCreateView, OrderDetailView, OrderCancelView, GuestOrderLookupView, PromotionPreviewView
from .views_admin import AdminOrderListView, AdminOrderDetailView

urlpatterns = [
    path('orders/', OrderListCreateView.as_view(), name='order-list-create'),
    path('orders/promo-preview/', PromotionPreviewView.as_view(), name='order-promo-preview'),
    path('orders/guest-lookup/', GuestOrderLookupView.as_view(), name='guest-order-lookup'),
    path('orders/<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('orders/<int:pk>/cancel/', OrderCancelView.as_view(), name='order-cancel'),
    
    # Admin URLs
    path('admin/orders/', AdminOrderListView.as_view(), name='admin-order-list'),
    path('admin/orders/<int:pk>/', AdminOrderDetailView.as_view(), name='admin-order-detail'),
]
