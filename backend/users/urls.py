from django.urls import path
from .views import RegisterView, UserProfileView, CustomTokenObtainPairView
from rest_framework_simplejwt.views import (
    TokenRefreshView,
)

urlpatterns = [
    path('users/register', RegisterView.as_view(), name='register'),
    path('users/login', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('users/token/refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('users/me', UserProfileView.as_view(), name='profile'),
]
