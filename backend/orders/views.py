from urllib.parse import urlencode

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import HttpResponseRedirect
from rest_framework import generics, permissions, status, views
from rest_framework.response import Response

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
    SafepayGateway,
)


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
            return Response(PaymentSessionSerializer(session).data, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


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


class SafepayReturnView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def _redirect(self, *, public_id="", state="failed", order_id=""):
        params = {"state": state}
        if public_id:
            params["session"] = public_id
        if order_id:
            params["order_id"] = str(order_id)
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/payment-status?{urlencode(params)}")

    def get(self, request):
        return self._handle_callback(request)

    def post(self, request):
        return self._handle_callback(request)

    def _handle_callback(self, request):
        payload = {}
        payload.update({key: value for key, value in request.query_params.items()})
        if hasattr(request, "data") and request.data:
            payload.update({key: value for key, value in request.data.items()})

        callback = SafepayGateway.extract_callback_payload(payload)
        public_id = callback.get("public_id", "")

        try:
            SafepayGateway.verify_signature(tracker=callback.get("tracker", ""), signature=callback.get("signature", ""))
        except ValidationError:
            if public_id:
                try:
                    PaymentSessionService.cancel_session(public_id=public_id, payload=callback.get("payload", {}), failed=True)
                except ValidationError:
                    pass
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/payment-status?{urlencode({'state': 'failed', 'session': public_id})}"
            )

        try:
            order = PaymentSessionService.complete_session(public_id=public_id, gateway_data=callback)
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/payment-status?{urlencode({'state': 'success', 'session': public_id, 'order_id': order.id})}"
            )
        except ValidationError:
            if public_id:
                try:
                    PaymentSessionService.mark_review_required(
                        public_id=public_id,
                        payload=callback.get("payload", {}),
                        reference=callback.get("reference", ""),
                        tracker=callback.get("tracker", ""),
                    )
                except ValidationError:
                    pass
            return HttpResponseRedirect(
                f"{settings.FRONTEND_URL}/payment-status?{urlencode({'state': 'review', 'session': public_id})}"
            )


class SafepayCancelView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return self._handle_cancel(request)

    def post(self, request):
        return self._handle_cancel(request)

    def _handle_cancel(self, request):
        payload = {}
        payload.update({key: value for key, value in request.query_params.items()})
        if hasattr(request, "data") and request.data:
            payload.update({key: value for key, value in request.data.items()})

        callback = SafepayGateway.extract_callback_payload(payload)
        public_id = callback.get("public_id", "")
        if public_id:
            try:
                PaymentSessionService.cancel_session(public_id=public_id, payload=callback.get("payload", {}), failed=False)
            except ValidationError:
                pass
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/payment-status?{urlencode({'state': 'cancelled', 'session': public_id})}"
        )
