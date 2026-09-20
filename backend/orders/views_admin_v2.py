"""Admin order operations.

Every state change is a named command with its own capability, its own
validation and its own audit entry. There is no generic update endpoint,
because "update this order" is not an operation anyone performs — confirming,
packing, shipping, cancelling and refunding are, and each has different rules
and different consequences.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q, Sum
from rest_framework import generics, status, views
from rest_framework.response import Response

from common.permissions import HasCapability
from inventory.views_admin import AdminPagination
from operations import audit
from users.capabilities import (
    CAP_ORDER_CANCEL,
    CAP_ORDER_REFUND,
    CAP_ORDER_TRANSITION,
    CAP_ORDER_VIEW,
    CAP_RETURN_MANAGE,
    CAP_RETURN_VIEW,
)

from .models import Order, OrderHistory, ReturnRequest
from .serializers_admin import (
    AdminOrderDetailSerializer,
    AdminOrderListSerializer,
    AdminReturnSerializer,
    CreateReturnSerializer,
    OrderNoteSerializer,
    OrderTransitionCommandSerializer,
    ReceiveReturnSerializer,
    RefundSerializer,
    ReturnDecisionSerializer,
)
from .services import OrderTransitionService, ReturnService

logger = logging.getLogger(__name__)


class AdminOrderListV2View(generics.ListAPIView):
    """GET /api/admin/v2/orders/ — paginated, searchable, filterable."""

    serializer_class = AdminOrderListSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_ORDER_VIEW
    pagination_class = AdminPagination

    def get_queryset(self):
        queryset = (
            Order.objects.select_related("user")
            .annotate(items_count=Count("items"))
            .order_by("-created_at")
        )
        params = self.request.query_params

        search = (params.get("search") or "").strip()
        if search:
            # Phone first: it is what a customer gives on the call, and what
            # counter staff search by more than anything else.
            filters = (
                Q(guest_phone_number__icontains=search)
                | Q(user__phone_number__icontains=search)
                | Q(guest_name__icontains=search)
                | Q(user__name__icontains=search)
                | Q(guest_email__icontains=search)
                | Q(user__email__icontains=search)
                | Q(tracking_number__icontains=search)
                | Q(items__sku__icontains=search)
            )
            if search.isdigit():
                filters |= Q(id=int(search))
            queryset = queryset.filter(filters).distinct()

        for field in ("payment_status", "fulfilment_status", "payment_method", "sales_channel"):
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})

        if params.get("created_after"):
            queryset = queryset.filter(created_at__gte=params["created_after"])
        if params.get("created_before"):
            queryset = queryset.filter(created_at__lte=params["created_before"])

        if params.get("settled") == "true":
            queryset = queryset.filter(
                Q(payment_status__in=Order.SETTLED_PAYMENT_STATUSES)
                & ~Q(fulfilment_status=Order.FULFILMENT_CANCELLED)
                | Q(payment_method="COD", fulfilment_status=Order.FULFILMENT_DELIVERED)
            )

        return queryset


class AdminOrderDetailV2View(generics.RetrieveAPIView):
    """GET /api/admin/v2/orders/<pk>/ — read only. Changes go through commands."""

    serializer_class = AdminOrderDetailSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_ORDER_VIEW
    queryset = Order.objects.select_related("user").prefetch_related(
        "items__variant", "history__actor"
    )


class AdminOrderQueueView(views.APIView):
    """GET /api/admin/v2/orders/queues/ — what needs doing right now.

    The counts a shop opens the admin to see. Derived from fulfilment status,
    so they cannot disagree with the lists they link to.
    """

    permission_classes = [HasCapability]
    required_capability = CAP_ORDER_VIEW

    def get(self, request):
        counts = dict(
            Order.objects.exclude(
                fulfilment_status__in=[
                    Order.FULFILMENT_DELIVERED,
                    Order.FULFILMENT_CANCELLED,
                    Order.FULFILMENT_RETURNED,
                ]
            )
            .values_list("fulfilment_status")
            .annotate(n=Count("id"))
        )

        cod_outstanding = Order.objects.filter(
            payment_method="COD",
            payment_status=Order.PAYMENT_COD_PENDING,
        ).exclude(fulfilment_status=Order.FULFILMENT_CANCELLED).aggregate(
            total=Sum("total_amount"), n=Count("id")
        )

        return Response(
            {
                "awaiting_confirmation": counts.get(Order.FULFILMENT_PENDING_CONFIRMATION, 0),
                "confirmed": counts.get(Order.FULFILMENT_CONFIRMED, 0),
                "ready_to_pack": counts.get(Order.FULFILMENT_READY_TO_PACK, 0),
                "packed": counts.get(Order.FULFILMENT_PACKED, 0),
                "ready_for_pickup": counts.get(Order.FULFILMENT_READY_FOR_PICKUP, 0),
                "shipped": counts.get(Order.FULFILMENT_SHIPPED, 0),
                "open_returns": ReturnRequest.objects.exclude(
                    status__in=[
                        ReturnRequest.STATUS_COMPLETED,
                        ReturnRequest.STATUS_REJECTED,
                        ReturnRequest.STATUS_CANCELLED,
                    ]
                ).count(),
                "cod_cash_outstanding": str(cod_outstanding["total"] or "0.00"),
                "cod_orders_outstanding": cod_outstanding["n"],
                "definitions": {
                    "cod_cash_outstanding": (
                        "Total of COD orders not yet delivered and not cancelled. "
                        "Cash owed to the business, deliberately not counted as revenue."
                    ),
                },
            }
        )


class _OrderCommandView(views.APIView):
    """Base for a command against one order."""

    def get_order(self, pk):
        return Order.objects.filter(pk=pk).first()

    def not_found(self):
        return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    def refused(self, exc):
        return Response(
            {"error": "; ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST
        )

    def detail(self, order):
        order = (
            Order.objects.select_related("user")
            .prefetch_related("items__variant", "history__actor")
            .annotate(items_count=Count("items"))
            .get(pk=order.pk)
        )
        return Response(AdminOrderDetailSerializer(order).data)


class AdminOrderTransitionV2View(_OrderCommandView):
    """POST /api/admin/v2/orders/<pk>/transition/ — confirm, pack, ship, deliver."""

    permission_classes = [HasCapability]
    required_capability = CAP_ORDER_TRANSITION

    def post(self, request, pk):
        order = self.get_order(pk)
        if order is None:
            return self.not_found()

        serializer = OrderTransitionCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Cancelling returns stock and can close out money owed, so it is a
        # heavier act than moving a parcel along and needs its own capability.
        if data["status"] == Order.FULFILMENT_CANCELLED and not request.user.has_capability(
            CAP_ORDER_CANCEL
        ):
            return Response(
                {"error": "Your account cannot cancel orders."},
                status=status.HTTP_403_FORBIDDEN,
            )

        previous = order.fulfilment_status
        try:
            order = OrderTransitionService.transition_fulfilment(
                order_id=order.id,
                to_status=data["status"],
                actor=request.user,
                reason=data.get("reason", ""),
                courier_name=data.get("courier_name", ""),
                tracking_number=data.get("tracking_number", ""),
            )
        except DjangoValidationError as exc:
            return self.refused(exc)

        audit.record(
            action="order.cancel" if data["status"] == Order.FULFILMENT_CANCELLED else "order.transition",
            entity=order,
            actor=request.user,
            summary=f"Order #{order.id}: {previous} -> {data['status']}",
            reason=data.get("reason", ""),
            request=request,
            entity_label=f"Order #{order.id}",
        )
        return self.detail(order)


class AdminOrderNoteView(_OrderCommandView):
    """POST /api/admin/v2/orders/<pk>/note/ — an internal note."""

    permission_classes = [HasCapability]
    required_capability = CAP_ORDER_VIEW

    def post(self, request, pk):
        order = self.get_order(pk)
        if order is None:
            return self.not_found()

        serializer = OrderNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data["note"]

        OrderHistory.objects.create(
            order=order,
            kind=OrderHistory.KIND_NOTE,
            actor=request.user,
            note=note[:255],
            is_customer_visible=False,
        )
        return self.detail(order)


class AdminOrderReturnCreateView(_OrderCommandView):
    """POST /api/admin/v2/orders/<pk>/returns/ — open a return."""

    permission_classes = [HasCapability]
    required_capability = CAP_RETURN_MANAGE

    def post(self, request, pk):
        order = self.get_order(pk)
        if order is None:
            return self.not_found()

        serializer = CreateReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            return_request = ReturnService.request_return(
                order=order,
                lines=data["lines"],
                reason=data["reason"],
                customer_note=data.get("customer_note", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            return self.refused(exc)

        audit.record(
            action="return.approve",
            entity=return_request,
            actor=request.user,
            summary=f"Return {return_request.reference} opened for order #{order.id}",
            reason=data["reason"],
            request=request,
        )
        return Response(
            AdminReturnSerializer(return_request).data, status=status.HTTP_201_CREATED
        )


class AdminReturnListView(generics.ListAPIView):
    serializer_class = AdminReturnSerializer
    permission_classes = [HasCapability]
    required_capability = CAP_RETURN_VIEW
    pagination_class = AdminPagination

    def get_queryset(self):
        queryset = ReturnRequest.objects.select_related("order__user").prefetch_related(
            "items__order_item"
        )
        status_filter = self.request.query_params.get("status")
        if status_filter == "open":
            return queryset.exclude(
                status__in=[
                    ReturnRequest.STATUS_COMPLETED,
                    ReturnRequest.STATUS_REJECTED,
                    ReturnRequest.STATUS_CANCELLED,
                ]
            )
        if status_filter:
            return queryset.filter(status=status_filter)
        return queryset


class _ReturnCommandView(views.APIView):
    permission_classes = [HasCapability]
    required_capability = CAP_RETURN_MANAGE

    def get_return(self, pk):
        return (
            ReturnRequest.objects.select_related("order")
            .prefetch_related("items__order_item__variant")
            .filter(pk=pk)
            .first()
        )

    def not_found(self):
        return Response({"error": "Return not found."}, status=status.HTTP_404_NOT_FOUND)

    def refused(self, exc):
        return Response({"error": "; ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)


class AdminReturnDecisionView(_ReturnCommandView):
    """POST /api/admin/v2/returns/<pk>/decision/ — approve or reject."""

    def post(self, request, pk):
        return_request = self.get_return(pk)
        if return_request is None:
            return self.not_found()

        serializer = ReturnDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            if data["action"] == "approve":
                ReturnService.approve(
                    return_request=return_request,
                    actor=request.user,
                    note=data.get("reason", ""),
                )
            else:
                ReturnService.reject(
                    return_request=return_request,
                    actor=request.user,
                    reason=data["reason"],
                )
        except DjangoValidationError as exc:
            return self.refused(exc)

        audit.record(
            action=f"return.{data['action']}",
            entity=return_request,
            actor=request.user,
            summary=f"Return {return_request.reference} {data['action']}d",
            reason=data.get("reason", ""),
            request=request,
        )
        return_request.refresh_from_db()
        return Response(AdminReturnSerializer(return_request).data)


class AdminReturnReceiveView(_ReturnCommandView):
    """POST /api/admin/v2/returns/<pk>/receive/ — record what came back."""

    def post(self, request, pk):
        return_request = self.get_return(pk)
        if return_request is None:
            return self.not_found()

        serializer = ReceiveReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Keys arrive as strings over JSON; the service matches on integer pk.
        decisions = {
            int(key): bool(value)
            for key, value in serializer.validated_data["restock"].items()
        }

        try:
            ReturnService.receive_goods(
                return_request=return_request,
                restock_decisions=decisions,
                actor=request.user,
            )
        except DjangoValidationError as exc:
            return self.refused(exc)

        restocked = sum(1 for value in decisions.values() if value)
        audit.record(
            action="return.receive",
            entity=return_request,
            actor=request.user,
            summary=(
                f"Return {return_request.reference}: {restocked} of {len(decisions)} "
                "line(s) put back on the shelf"
            ),
            request=request,
        )
        return_request.refresh_from_db()
        return Response(AdminReturnSerializer(return_request).data)


class AdminReturnRefundView(_ReturnCommandView):
    """POST /api/admin/v2/returns/<pk>/refund/ — money back to the customer.

    Its own capability, and independent of whether the goods came back. They
    are different events, and conflating them is how a shop refunds for
    inventory it never received.
    """

    required_capability = CAP_ORDER_REFUND

    def post(self, request, pk):
        return_request = self.get_return(pk)
        if return_request is None:
            return self.not_found()

        serializer = RefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            ReturnService.record_refund(
                return_request=return_request,
                amount=data["amount"],
                actor=request.user,
                note=data.get("note", ""),
            )
        except DjangoValidationError as exc:
            return self.refused(exc)

        audit.record(
            action="order.refund",
            entity=return_request.order,
            actor=request.user,
            summary=(
                f"Refunded {data['amount']} on order #{return_request.order_id} "
                f"(return {return_request.reference})"
            ),
            reason=data.get("note", ""),
            request=request,
            entity_label=f"Order #{return_request.order_id}",
        )
        return_request.refresh_from_db()
        return Response(AdminReturnSerializer(return_request).data)
