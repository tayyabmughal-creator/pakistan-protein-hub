from django.urls import path

from .views_admin import (
    AdminAdjustStockView,
    AdminInventoryListView,
    AdminInventoryLocationListView,
    AdminReceiveStockView,
    AdminStockMovementListView,
    AdminStocktakeView,
)

urlpatterns = [
    path("admin/inventory/", AdminInventoryListView.as_view(), name="admin-inventory-list"),
    path("admin/inventory/movements/", AdminStockMovementListView.as_view(), name="admin-inventory-movements"),
    path("admin/inventory/locations/", AdminInventoryLocationListView.as_view(), name="admin-inventory-locations"),

    # Stock changes only through these. There is deliberately no endpoint that
    # sets on_hand directly.
    path("admin/inventory/receive/", AdminReceiveStockView.as_view(), name="admin-inventory-receive"),
    path("admin/inventory/adjust/", AdminAdjustStockView.as_view(), name="admin-inventory-adjust"),
    path("admin/inventory/count/", AdminStocktakeView.as_view(), name="admin-inventory-count"),
]
