from django.contrib.auth import get_user_model
from django.db.models import Sum
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from orders.models import Order
from .models import Address, AdminDevice

User = get_user_model()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        # Add extra responses here
        data['id'] = self.user.id
        data['name'] = self.user.name
        data['email'] = self.user.email
        data['is_staff'] = self.user.is_staff
        return data

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'name', 'email', 'phone_number', 'is_staff', 'date_joined')
        read_only_fields = ('email', 'is_staff', 'date_joined')


class AdminAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ("id", "full_name", "phone_number", "city", "area", "street", "is_default", "created_at")


class AdminUserOrderSummarySerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "status",
            "payment_method",
            "payment_status",
            "total_amount",
            "applied_promo_code",
            "created_at",
            "items_count",
        )

    def get_items_count(self, obj):
        prefetched_items = getattr(obj, "_prefetched_objects_cache", {}).get("items")
        if prefetched_items is not None:
            return sum(item.quantity for item in prefetched_items)
        return obj.items.aggregate(total_quantity=Sum("quantity"))["total_quantity"] or 0


class AdminUserListSerializer(serializers.ModelSerializer):
    account_type = serializers.SerializerMethodField()
    order_count = serializers.IntegerField(read_only=True, default=0)
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=0)
    last_order_at = serializers.DateTimeField(read_only=True)
    address_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "name",
            "email",
            "phone_number",
            "is_staff",
            "is_superuser",
            "is_active",
            "account_type",
            "date_joined",
            "last_login",
            "order_count",
            "total_spent",
            "last_order_at",
            "address_count",
        )
        read_only_fields = fields

    def get_account_type(self, obj):
        if obj.is_superuser:
            return "Superuser"
        if obj.is_staff:
            return "Staff"
        return "Customer"

    def get_address_count(self, obj):
        prefetched_addresses = getattr(obj, "_prefetched_objects_cache", {}).get("addresses")
        if prefetched_addresses is not None:
            return len(prefetched_addresses)
        return obj.addresses.count()


class AdminUserDetailSerializer(AdminUserListSerializer):
    addresses = AdminAddressSerializer(many=True, read_only=True)
    default_address = serializers.SerializerMethodField()
    recent_orders = serializers.SerializerMethodField()

    class Meta(AdminUserListSerializer.Meta):
        fields = AdminUserListSerializer.Meta.fields + (
            "addresses",
            "default_address",
            "recent_orders",
        )

    def get_default_address(self, obj):
        prefetched_addresses = getattr(obj, "_prefetched_objects_cache", {}).get("addresses")
        if prefetched_addresses is not None:
            default_address = next((address for address in prefetched_addresses if address.is_default), None)
        else:
            default_address = obj.addresses.filter(is_default=True).order_by("id").first()

        if not default_address:
            return None
        return AdminAddressSerializer(default_address).data

    def get_recent_orders(self, obj):
        prefetched_orders = getattr(obj, "_prefetched_objects_cache", {}).get("orders")
        if prefetched_orders is not None:
            orders = list(prefetched_orders)[:6]
        else:
            orders = obj.orders.prefetch_related("items").order_by("-created_at")[:6]
        return AdminUserOrderSummarySerializer(orders, many=True).data


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("name", "phone_number", "is_staff", "is_active")

    def validate(self, attrs):
        request = self.context.get("request")
        if self.instance and request and request.user == self.instance:
            if attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})
            if attrs.get("is_staff") is False:
                raise serializers.ValidationError({"is_staff": "You cannot remove your own staff access."})
        return attrs


class AdminDeviceRegistrationSerializer(serializers.Serializer):
    installation_id = serializers.CharField(max_length=120, required=False, allow_blank=True)
    expo_push_token = serializers.CharField(max_length=255)
    device_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    platform = serializers.ChoiceField(choices=["ios", "android", "unknown"], required=False, default="unknown")
    app_version = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate_expo_push_token(self, value):
        token = value.strip()
        if not token:
            raise serializers.ValidationError("Push token is required.")
        return token


class AdminDeviceDeactivateSerializer(serializers.Serializer):
    installation_id = serializers.CharField(max_length=120, required=False, allow_blank=True)
    expo_push_token = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("installation_id") and not attrs.get("expo_push_token"):
            raise serializers.ValidationError("Provide installation_id or expo_push_token.")
        return attrs


class AdminDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminDevice
        fields = (
            "id",
            "installation_id",
            "expo_push_token",
            "device_name",
            "platform",
            "app_version",
            "is_active",
            "last_seen_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'name', 'email', 'phone_number', 'password')
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['email'], # Use email as username
            email=validated_data['email'],
            name=validated_data['name'],
            password=validated_data['password'],
            phone_number=validated_data.get('phone_number'),
        )
        return user

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ['id', 'full_name', 'phone_number', 'city', 'area', 'street', 'is_default']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        # We don't want to reveal if a user exists or not, so we just return the value.
        # The view will handle the logic of sending (or not sending) the email.
        return value

class PasswordResetConfirmSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)
    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs
