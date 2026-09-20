from django.contrib import admin

from .models import InventoryBalance, InventoryLocation, StockMovement, StockReservation


@admin.register(InventoryLocation)
class InventoryLocationAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "city", "is_default", "is_fulfilment", "is_active")
    list_filter = ("is_active", "is_fulfilment", "is_pickup_point")


@admin.register(InventoryBalance)
class InventoryBalanceAdmin(admin.ModelAdmin):
    list_display = ("variant", "location", "on_hand", "reserved", "available", "last_counted_at")
    list_filter = ("location", "last_counted_at")
    search_fields = ("variant__sku", "variant__product__name")
    readonly_fields = ("on_hand", "reserved", "last_counted_at", "updated_at")

    @admin.display(description="Available")
    def available(self, obj):
        return obj.available

    # Read-only on purpose. Stock moves through inventory.services so that every
    # change carries a type, a reason and an actor. A form that edits on_hand
    # directly is precisely the hole in the audit trail the ledger closes.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("created_at", "variant", "quantity", "movement_type", "balance_after", "actor")
    list_filter = ("movement_type", "created_at", "location")
    search_fields = ("variant__sku", "reference", "reason")
    date_hierarchy = "created_at"

    # Append-only. A ledger that can be edited is not a ledger.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockReservation)
class StockReservationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "variant", "quantity", "reference", "status", "expires_at")
    list_filter = ("status", "created_at")
    search_fields = ("variant__sku", "reference")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
