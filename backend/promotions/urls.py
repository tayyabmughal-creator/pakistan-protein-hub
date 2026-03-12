from django.urls import path

from .views import PromotionListView

urlpatterns = [
    path('promotions/', PromotionListView.as_view(), name='promotion-list'),
]
