from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Address

class AddressInline(admin.TabularInline):
    model = Address
    extra = 0

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('email', 'name', 'role', 'is_staff')
    list_filter = ('role', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        (None, {'fields': ('role', 'phone_number')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (None, {'fields': ('name', 'role', 'phone_number')}),
    )
    inlines = [AddressInline]
