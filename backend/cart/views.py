from rest_framework import generics, status, views, permissions
from rest_framework.response import Response
from .models import Cart, CartItem
from products.models import Product
from .serializers import CartSerializer, CartItemSerializer
from django.shortcuts import get_object_or_404
from django.db import transaction

class CartView(generics.RetrieveAPIView):
    serializer_class = CartSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        cart, _ = Cart.objects.get_or_create(user=self.request.user)
        return cart

class CartItemAddView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        product_id = request.data.get('product_id')
        quantity = int(request.data.get('quantity', 1))

        if not product_id:
            return Response({'error': 'Product ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        product = get_object_or_404(Product, id=product_id)
        
        # Check stock logic simplistic - ideally should lock row but for add to cart basic check is ok.
        if product.stock < quantity:
             return Response({'error': f'Insufficient stock. Available: {product.stock}'}, status=status.HTTP_400_BAD_REQUEST)

        cart, _ = Cart.objects.get_or_create(user=request.user)
        
        cart_item, created = CartItem.objects.get_or_create(cart=cart, product=product)

        if not created:
            cart_item.quantity += quantity
        else:
            cart_item.quantity = quantity
            # price_snapshot is handled in save() method of model if null
        
        # Re-check stock for total quantity in cart
        if cart_item.quantity > product.stock:
             return Response({'error': f'Insufficient stock. You have {cart_item.quantity} in cart but only {product.stock} available.'}, status=status.HTTP_400_BAD_REQUEST)

        cart_item.save()
        
        serializer = CartSerializer(cart)
        return Response(serializer.data)

class CartItemUpdateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, pk):
        cart_item = get_object_or_404(CartItem, pk=pk, cart__user=request.user)
        quantity = int(request.data.get('quantity', 1))
        
        if quantity < 1:
            return Response({'error': 'Quantity must be at least 1'}, status=status.HTTP_400_BAD_REQUEST)

        if quantity > cart_item.product.stock:
             return Response({'error': f'Insufficient stock. Available: {cart_item.product.stock}'}, status=status.HTTP_400_BAD_REQUEST)

        cart_item.quantity = quantity
        cart_item.save()
        
        # Return full cart to update frontend state
        serializer = CartSerializer(cart_item.cart)
        return Response(serializer.data)

    def delete(self, request, pk):
        cart_item = get_object_or_404(CartItem, pk=pk, cart__user=request.user)
        cart = cart_item.cart
        cart_item.delete()
        serializer = CartSerializer(cart)
        return Response(serializer.data)

class SyncCartView(views.APIView):
    """
    Sync local cart (from frontend) to server cart on login.
    Expects list of {product_id, quantity}.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        items = request.data.get('items', [])
        cart, _ = Cart.objects.get_or_create(user=request.user)
        
        with transaction.atomic():
            for item in items:
                product_id = item.get('product_id')
                quantity = int(item.get('quantity', 1))
                
                try:
                    product = Product.objects.get(id=product_id)
                    cart_item, created = CartItem.objects.get_or_create(cart=cart, product=product)
                    
                    if created:
                        cart_item.quantity = quantity
                        # price_snapshot auto-set on save
                    else:
                        # Logic: Add local quantity to server quantity
                        cart_item.quantity += quantity
                    
                    # Cap at max stock
                    if cart_item.quantity > product.stock:
                        cart_item.quantity = product.stock
                    
                    cart_item.save()

                except Product.DoesNotExist:
                    continue 

        serializer = CartSerializer(cart)
        return Response(serializer.data)
