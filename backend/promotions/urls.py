from django.urls import path

from .views import PromotionListView, AdminPromotionListCreateView, AdminPromotionDetailView

urlpatterns = [
    path('promotions/', PromotionListView.as_view(), name='promotion-list'),
    path("admin/promotions/", AdminPromotionListCreateView.as_view(), name="admin-promotion-list-create"),
    path("admin/promotions/<int:pk>/", AdminPromotionDetailView.as_view(), name="admin-promotion-detail"),
]
