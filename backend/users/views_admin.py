from django.contrib.auth import get_user_model
from django.db.models import Count, DecimalField, Max, Prefetch, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import filters, generics, permissions
from rest_framework.response import Response

from orders.models import Order
from .serializers import AdminUserDetailSerializer, AdminUserListSerializer, AdminUserUpdateSerializer

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
