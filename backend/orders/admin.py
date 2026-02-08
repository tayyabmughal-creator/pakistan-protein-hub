from django.contrib import admin
from .models import Order, OrderItem

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    readonly_fields = ('product', 'product_name', 'quantity', 'price')
    extra = 0

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'total_amount', 'status', 'payment_status', 'created_at')
    list_filter = ('status', 'payment_status', 'created_at', 'payment_method')
    search_fields = ('user__email', 'id')
    inlines = [OrderItemInline]
    readonly_fields = ('total_amount', 'shipping_address', 'created_at')
