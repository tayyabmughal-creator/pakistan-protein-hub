from rest_framework import generics, permissions, status
from rest_framework.response import Response
from .models import Order
from .serializers import OrderSerializer

class AdminOrderListView(generics.ListAPIView):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAdminUser]

class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAdminUser]

    def update(self, request, *args, **kwargs):
        # Allow updating status and payment_status
        return super().update(request, *args, **kwargs)
