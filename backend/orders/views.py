from rest_framework import generics, permissions, status, views
from rest_framework.response import Response
from .models import Order
from .serializers import OrderSerializer, CreateOrderSerializer, GuestOrderLookupSerializer
from users.models import Address
from products.services import StockService
from django.db import transaction

class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        create_serializer = CreateOrderSerializer(data=request.data, context={'request': request})
        create_serializer.is_valid(raise_exception=True)
        data = create_serializer.validated_data

        from .services import OrderService
        try:
            if request.user.is_authenticated:
                if not Address.objects.filter(id=data['address_id'], user=request.user).exists():
                    return Response({'error': 'Invalid address'}, status=status.HTTP_400_BAD_REQUEST)
                order = OrderService.create_order(request.user, data['address_id'], data.get('payment_method', 'COD'))
            else:
                order = OrderService.create_guest_order(
                    guest_name=data['guest_name'],
                    guest_email=data['guest_email'],
                    guest_phone_number=data['guest_phone_number'],
                    city=data['city'],
                    area=data['area'],
                    street=data['street'],
                    items=data['items'],
                    payment_method=data.get('payment_method', 'COD'),
                )
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


class GuestOrderLookupView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = GuestOrderLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            order = Order.objects.get(pk=data['order_id'], user__isnull=True)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        email_matches = data.get('email') and order.guest_email.lower() == data['email'].lower()
        phone_matches = data.get('phone_number') and order.guest_phone_number == data['phone_number']

        if not email_matches and not phone_matches:
            return Response({'error': 'Order details did not match'}, status=status.HTTP_404_NOT_FOUND)

        return Response(OrderSerializer(order).data)
