import logging

from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework import generics, permissions, status, views
from rest_framework.response import Response

from payments.providers.base import PaymentProviderError
from payments.services import initiate_payment

from .models import Order, PaymentSession
from products.services import StockService
from .serializers import (
    CreateOrderSerializer,
    GuestOrderLookupSerializer,
    OrderSerializer,
    PaymentMethodSerializer,
    PaymentSessionSerializer,
    PromotionPreviewSerializer,
)
from .services import (
    OrderService,
    PaymentMethodService,
    PaymentSessionService,
)

logger = logging.getLogger(__name__)


class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        create_serializer = CreateOrderSerializer(data=request.data, context={"request": request})
        create_serializer.is_valid(raise_exception=True)
        data = create_serializer.validated_data

        try:
            if data.get("payment_method") == "SAFEPAY":
                return Response(
                    {"error": "Use the online payment session endpoint for Safepay checkouts."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if request.user.is_authenticated:
                order = OrderService.create_order(
                    request.user,
                    data["address_id"],
                    data.get("payment_method", "COD"),
                    data.get("promo_code", ""),
                    data.get("payment_reference", ""),
                    data.get("payment_note", ""),
                )
            else:
                order = OrderService.create_guest_order(
                    guest_name=data["guest_name"],
                    guest_email=data["guest_email"],
                    guest_phone_number=data["guest_phone_number"],
                    city=data["city"],
                    area=data["area"],
                    street=data["street"],
                    items=data["items"],
                    payment_method=data.get("payment_method", "COD"),
                    promo_code=data.get("promo_code", ""),
                    payment_reference=data.get("payment_reference", ""),
                    payment_note=data.get("payment_note", ""),
                )
            serializer = self.get_serializer(order)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PaymentMethodListView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        serializer = PaymentMethodSerializer(PaymentMethodService.get_available_methods(), many=True)
        return Response(serializer.data)


class PaymentSessionCreateView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data.get("payment_method") != "SAFEPAY":
            return Response({"error": "Unsupported payment method for online checkout."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if request.user.is_authenticated:
                session = PaymentSessionService.create_registered_session(
                    user=request.user,
                    address_id=data["address_id"],
                    payment_method=data["payment_method"],
                    promo_code=data.get("promo_code", ""),
                )
            else:
                session = PaymentSessionService.create_guest_session(
                    guest_name=data["guest_name"],
                    guest_email=data["guest_email"],
                    guest_phone_number=data["guest_phone_number"],
                    city=data["city"],
                    area=data["area"],
                    street=data["street"],
                    items=data["items"],
                    payment_method=data["payment_method"],
                    promo_code=data.get("promo_code", ""),
                )
            # Provider handoff happens in the payments app, which also records
            # the amount this session is expected to be paid — written before
            # the customer can pay, so settlement verifies against a figure
            # nothing in the payment flow can influence.
            session = initiate_payment(session)
            return Response(PaymentSessionSerializer(session).data, status=status.HTTP_201_CREATED)
        except (ValidationError, PaymentProviderError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Could not start an online payment session")
            return Response(
                {"error": "Could not start the payment. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class PaymentSessionDetailView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, public_id):
        try:
            session = PaymentSession.objects.select_related("order").get(public_id=public_id)
        except PaymentSession.DoesNotExist:
            return Response({"error": "Payment session not found"}, status=status.HTTP_404_NOT_FOUND)

        if session.user_id and (not request.user.is_authenticated or request.user != session.user):
            return Response({"error": "Payment session not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response(PaymentSessionSerializer(session).data)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user)


class OrderCancelView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        if order.payment_status == "PAID":
            return Response(
                {"error": "Paid orders cannot be self-cancelled. Please contact support for help."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if order.status not in ["PENDING", "CONFIRMED"]:
            return Response({"error": "Cannot cancel order in current status"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for item in order.items.exclude(product_id=None):
                StockService.restore_stock(item.product.id, item.quantity)

            order.status = "CANCELLED"
            order.save(update_fields=["status", "updated_at"])

        return Response({"status": "Order cancelled successfully"})


class GuestOrderLookupView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = GuestOrderLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            order = Order.objects.get(pk=data["order_id"], user__isnull=True)
        except Order.DoesNotExist:
            return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        email_matches = data.get("email") and order.guest_email.lower() == data["email"].lower()
        phone_matches = data.get("phone_number") and order.guest_phone_number == data["phone_number"]

        if not email_matches and not phone_matches:
            return Response({"error": "Order details did not match"}, status=status.HTTP_404_NOT_FOUND)

        return Response(OrderSerializer(order).data)


class PromotionPreviewView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PromotionPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            if request.user.is_authenticated:
                preview = OrderService.preview_discount(user=request.user, promo_code=data["promo_code"])
            else:
                preview = OrderService.preview_discount(items=data.get("items"), promo_code=data["promo_code"])
            return Response(preview)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
