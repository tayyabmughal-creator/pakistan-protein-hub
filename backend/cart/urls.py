from django.urls import path
from .views import CartView, CartItemAddView, CartItemUpdateView, SyncCartView

urlpatterns = [
    path('cart/', CartView.as_view(), name='cart-detail'),
    path('cart/items/', CartItemAddView.as_view(), name='cart-add'),
    path('cart/items/<int:pk>/', CartItemUpdateView.as_view(), name='cart-update'),
    path('cart/sync/', SyncCartView.as_view(), name='cart-sync'),
]
