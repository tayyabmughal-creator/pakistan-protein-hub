from rest_framework import generics, permissions

from .models import HomePageSettings
from .serializers import HomePageSettingsSerializer


class HomePageSettingsPublicView(generics.RetrieveAPIView):
    serializer_class = HomePageSettingsSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        return HomePageSettings.get_solo()
