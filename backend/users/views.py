from rest_framework import generics, permissions
from rest_framework import generics, permissions
from .serializers import UserSerializer, RegisterSerializer, CustomTokenObtainPairSerializer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views import TokenObtainPairView

User = get_user_model()

from rest_framework.throttling import ScopedRateThrottle

class AuthThrottle(ScopedRateThrottle):
    scope = 'auth_burst'

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [AuthThrottle]

User = get_user_model()

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthThrottle]

class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

from .models import Address
from .serializers import AddressSerializer

class AddressListCreateView(generics.ListCreateAPIView):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)
