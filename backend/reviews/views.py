from rest_framework import generics, permissions, views, status
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Review
from .serializers import ReviewSerializer
from orders.models import OrderItem

class ReviewListCreateView(generics.ListCreateAPIView):
    # Only allow authenticated users to post, anyone to read (maybe? Usually reviews are public)
    # Requirement: "Only verified purchasers can review" handled in serializer.
    queryset = Review.objects.all().order_by('-created_at')
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        # Allow filtering by product_id
        product_id = self.request.query_params.get('product_id')
        if product_id:
            return Review.objects.select_related("user").filter(product_id=product_id).order_by('-created_at')
        return super().get_queryset()

class ReviewDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # Only allow author to update/delete
        obj = super().get_object()
        if obj.user != self.request.user and not self.request.user.is_staff:
            self.permission_denied(self.request)
        return obj


class ReviewEligibilityView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        product_id = request.query_params.get("product_id")
        if not product_id:
            return Response({"error": "product_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        existing_review = Review.objects.filter(user=request.user, product_id=product_id).first()
        has_delivered_purchase = OrderItem.objects.filter(
            order__user=request.user,
            order__status="DELIVERED",
            product_id=product_id,
        ).exists()

        if existing_review:
            reason = "You already reviewed this product. You can update or delete your review."
        elif has_delivered_purchase:
            reason = "You can leave a review for this delivered purchase."
        else:
            reason = "You can review this product after your order is marked delivered."

        return Response(
            {
                "can_review": has_delivered_purchase and existing_review is None,
                "has_delivered_purchase": has_delivered_purchase,
                "already_reviewed": existing_review is not None,
                "reason": reason,
                "review": ReviewSerializer(existing_review, context={"request": request}).data if existing_review else None,
            }
        )
