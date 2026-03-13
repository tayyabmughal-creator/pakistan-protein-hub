from rest_framework import generics, permissions
from django.db.models import F
from django.utils import timezone

from .models import Promotion
from .serializers import PromotionSerializer


class PromotionListView(generics.ListAPIView):
    serializer_class = PromotionSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        now = timezone.now()
        return Promotion.objects.filter(
            active=True,
            valid_from__lte=now,
            valid_to__gte=now,
            used_count__lt=F('usage_limit'),
        ).order_by('valid_to')


class AdminPromotionListCreateView(generics.ListCreateAPIView):
    serializer_class = PromotionSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = Promotion.objects.all().order_by("-valid_to", "-id")


class AdminPromotionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PromotionSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = Promotion.objects.all()
