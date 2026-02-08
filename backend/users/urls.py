from django.urls import path
from .views import RegisterView, UserProfileView, CustomTokenObtainPairView, AddressListCreateView, AddressDetailView
from .views_admin import AdminUserListView, AdminUserDetailView
from rest_framework_simplejwt.views import (
    TokenRefreshView,
)

urlpatterns = [
    path('users/register', RegisterView.as_view(), name='register'),
    path('users/login', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('users/token/refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('users/me', UserProfileView.as_view(), name='profile'),
    path('users/addresses', AddressListCreateView.as_view(), name='address-list'),
    path('users/addresses/<int:pk>', AddressDetailView.as_view(), name='address-detail'),

    # Admin URLs
    path('admin/users/', AdminUserListView.as_view(), name='admin-user-list'),
    path('admin/users/<int:pk>/', AdminUserDetailView.as_view(), name='admin-user-detail'),
]
