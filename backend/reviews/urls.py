from django.urls import path
from .views import ReviewDetailView, ReviewEligibilityView, ReviewListCreateView

urlpatterns = [
    path('reviews/eligibility/', ReviewEligibilityView.as_view(), name='review-eligibility'),
    path('reviews/', ReviewListCreateView.as_view(), name='review-list-create'),
    path('reviews/<int:pk>/', ReviewDetailView.as_view(), name='review-detail'),
]
