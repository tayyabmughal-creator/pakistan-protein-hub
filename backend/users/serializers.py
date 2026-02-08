from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        # Add extra responses here
        data['id'] = self.user.id
        data['name'] = self.user.name
        data['email'] = self.user.email
        data['role'] = self.user.role
        return data

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'name', 'email', 'phone_number', 'role')
        read_only_fields = ('email', 'role')

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

from .models import Address

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ['id', 'full_name', 'phone_number', 'city', 'area', 'street', 'is_default']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
