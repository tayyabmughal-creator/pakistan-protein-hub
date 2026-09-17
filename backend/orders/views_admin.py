from django.core.exceptions import ValidationError
from rest_framework import generics, permissions, status, views
from rest_framework.response import Response

from .models import Order, PaymentSession
from .serializers import (
    AdminOrderSerializer,
    AdminOrderTransitionSerializer,
    AdminPaymentSessionActionSerializer,
    AdminPaymentSessionSerializer,
    OrderSerializer,
)
from .services import OrderTransitionService, PaymentSessionService


class AdminOrderListView(generics.ListAPIView):
    queryset = (
        Order.objects.select_related('user', 'promotion')
        .prefetch_related('items__product')
        .order_by('-created_at')
    )
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAdminUser]


class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    """Read an order, and edit only the fields that are safe to assign.

    Everything financial — payment status, paid_at, amounts, discounts, promo
    code, provider references — is read-only here. Those used to be writable,
    which meant any staff account could PATCH an order to PAID. Movement between
    statuses goes through AdminOrderTransitionView.
    """

    queryset = Order.objects.select_related('user', 'promotion').prefetch_related('items__product').all()
    serializer_class = AdminOrderSerializer
    permission_classes = [permissions.IsAdminUser]


class AdminOrderTransitionView(views.APIView):
    """POST /api/admin/orders/<pk>/transition/ — the supported way to move an order."""

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        serializer = AdminOrderTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            order = OrderTransitionService.transition(
                order_id=pk,
                to_status=serializer.validated_data["status"],
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValidationError as exc:
            return Response(
                {"error": "; ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST
            )

        return Response(OrderSerializer(order).data)


class AdminPaymentSessionReviewListView(generics.ListAPIView):
    serializer_class = AdminPaymentSessionSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        status_filter = self.request.query_params.get("status", "REVIEW").upper()
        queryset = PaymentSession.objects.select_related("user", "promotion", "order").order_by(
            "-updated_at", "-created_at"
        )
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
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValidationError as exc:
            return Response(
                {"error": "; ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST
            )

        return Response(AdminPaymentSessionSerializer(session).data)
