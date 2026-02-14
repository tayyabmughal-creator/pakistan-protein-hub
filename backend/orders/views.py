from rest_framework import generics, permissions, status, views
from rest_framework.response import Response
from .models import Order
from .serializers import OrderSerializer
from users.models import Address
from products.services import StockService
from django.db import transaction

class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        # Manual creation via service logic
        address_id = request.data.get('address_id')
        payment_method = request.data.get('payment_method', 'COD')

        if not address_id:
             return Response({'error': 'Address ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Basic validation of address ownership
        if not Address.objects.filter(id=address_id, user=request.user).exists():
             return Response({'error': 'Invalid address'}, status=status.HTTP_400_BAD_REQUEST)

        from .services import OrderService
        try:
            order = OrderService.create_order(request.user, address_id, payment_method)
            serializer = self.get_serializer(order)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

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
             return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status not in ['PENDING', 'CONFIRMED']:
             return Response({'error': 'Cannot cancel order in current status'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Restore stock
            for item in order.items.all():
                StockService.restore_stock(item.product.id, item.quantity)
            
            order.status = 'CANCELLED'
            order.save()
        
        return Response({'status': 'Order cancelled successfully'})
