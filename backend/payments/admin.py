from django.contrib import admin

from .models import PaymentTransaction, WebhookEvent


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "provider_reference",
        "provider",
        "status",
        "expected_amount",
        "verified_amount",
        "order",
        "settled_at",
        "created_at",
    )
    list_filter = ("provider", "status", "created_at")
    search_fields = ("provider_reference", "provider_tracker", "order__id")
    date_hierarchy = "created_at"

    # Money records are written by the settlement service, never by hand.
    # Editing them in the admin would bypass every invariant in payments/services.py.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ("provider", "event_id", "result", "signature_valid", "received_at")
    list_filter = ("provider", "result", "signature_valid", "received_at")
    search_fields = ("event_id", "body_digest", "detail")
    date_hierarchy = "received_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
