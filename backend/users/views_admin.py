from django.contrib.auth import get_user_model
from django.db.models import Count, DecimalField, Max, Prefetch, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import filters, generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order
from .models import AdminDevice
from .serializers import (
    AdminDeviceDeactivateSerializer,
    AdminDeviceRegistrationSerializer,
    AdminDeviceSerializer,
    AdminUserDetailSerializer,
    AdminUserListSerializer,
    AdminUserUpdateSerializer,
)

User = get_user_model()


def get_admin_user_queryset():
    return (
        User.objects.annotate(
            order_count=Count("orders", distinct=True),
            total_spent=Coalesce(
                Sum("orders__total_amount", filter=~Q(orders__status="CANCELLED")),
                Value(0),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            last_order_at=Max("orders__created_at"),
        )
        .prefetch_related("addresses")
        .order_by("-date_joined")
    )


class AdminUserListView(generics.ListAPIView):
    queryset = get_admin_user_queryset()
    serializer_class = AdminUserListSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "email", "phone_number"]


class AdminUserDetailView(generics.RetrieveUpdateAPIView):
    queryset = get_admin_user_queryset().prefetch_related(
        Prefetch("orders", queryset=Order.objects.prefetch_related("items").order_by("-created_at"))
    )
    permission_classes = [permissions.IsAdminUser]

    def get_serializer_class(self):
        if self.request.method in permissions.SAFE_METHODS:
            return AdminUserDetailSerializer
        return AdminUserUpdateSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(AdminUserDetailSerializer(instance, context=self.get_serializer_context()).data)


class AdminDeviceRegisterView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        serializer = AdminDeviceRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        installation_id = data.get("installation_id", "").strip()
        token = data["expo_push_token"]
        device = None
        if installation_id:
            device = AdminDevice.objects.filter(installation_id=installation_id).first()
            if device:
                AdminDevice.objects.exclude(pk=device.pk).filter(expo_push_token=token).delete()
                device.user = request.user
                device.expo_push_token = token
                device.installation_id = installation_id
                device.device_name = data.get("device_name", "").strip()
                device.platform = data.get("platform", "unknown")
                device.app_version = data.get("app_version", "").strip()
                device.is_active = True
                device.last_seen_at = timezone.now()
                device.save()

        if device is None:
            device, _ = AdminDevice.objects.update_or_create(
                expo_push_token=token,
                defaults={
                    "user": request.user,
                    "installation_id": installation_id,
                    "device_name": data.get("device_name", "").strip(),
                    "platform": data.get("platform", "unknown"),
                    "app_version": data.get("app_version", "").strip(),
                    "is_active": True,
                    "last_seen_at": timezone.now(),
                },
            )

        return Response(AdminDeviceSerializer(device).data, status=status.HTTP_200_OK)


class AdminDeviceDeactivateView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        serializer = AdminDeviceDeactivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        queryset = AdminDevice.objects.filter(user=request.user)
        if data.get("installation_id"):
            queryset = queryset.filter(installation_id=data["installation_id"].strip())
        else:
            queryset = queryset.filter(expo_push_token=data["expo_push_token"].strip())

        updated = queryset.update(is_active=False, last_seen_at=timezone.now())
        return Response({"updated": updated}, status=status.HTTP_200_OK)
