from rest_framework import generics, permissions, status
from rest_framework.response import Response
from .models import Order
from .serializers import OrderSerializer, AdminOrderSerializer

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
