from django.contrib import admin
from .models import Promotion

@admin.register(Promotion)
class PromotionAdmin(admin.ModelAdmin):
    list_display = ('code', 'discount_percentage', 'valid_from', 'valid_to', 'usage_limit', 'used_count', 'active')
    list_filter = ('active', 'valid_from', 'valid_to')
    search_fields = ('code',)
    readonly_fields = ('used_count',)
