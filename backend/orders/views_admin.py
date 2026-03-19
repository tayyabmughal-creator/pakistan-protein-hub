from rest_framework import generics, permissions, status, views
from rest_framework.response import Response
from django.core.exceptions import ValidationError

from .models import Order, PaymentSession
from .serializers import (
    AdminOrderSerializer,
    AdminPaymentSessionActionSerializer,
    AdminPaymentSessionSerializer,
    OrderSerializer,
)
from .services import PaymentSessionService

class AdminOrderListView(generics.ListAPIView):
    queryset = Order.objects.select_related('user', 'promotion').prefetch_related('items__product').order_by('-created_at')
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAdminUser]

class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    queryset = Order.objects.select_related('user', 'promotion').prefetch_related('items__product').all()
    serializer_class = AdminOrderSerializer
    permission_classes = [permissions.IsAdminUser]

    def update(self, request, *args, **kwargs):
        # Allow updating status and payment_status
        return super().update(request, *args, **kwargs)


class AdminPaymentSessionReviewListView(generics.ListAPIView):
    serializer_class = AdminPaymentSessionSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        status_filter = self.request.query_params.get("status", "REVIEW").upper()
        queryset = PaymentSession.objects.select_related("user", "promotion", "order").order_by("-updated_at", "-created_at")
        if status_filter == "ALL":
            return queryset
        return queryset.filter(status=status_filter)


class AdminPaymentSessionReviewActionView(views.APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, public_id):
        serializer = AdminPaymentSessionActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = PaymentSessionService.resolve_review_session(
                public_id=public_id,
                action=serializer.validated_data["action"],
            )
        except ValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(AdminPaymentSessionSerializer(session).data)
