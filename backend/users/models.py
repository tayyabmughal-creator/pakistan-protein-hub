from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

class User(AbstractUser):
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    # role field removed - using is_staff and is_superuser instead
    
    # We use email as the username
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'name'] # username is required by AbstractUser but we want to prompt for name too if creating superuser

    def __str__(self):
        return self.email

class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    full_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20)
    city = models.CharField(max_length=100)
    area = models.CharField(max_length=255)
    street = models.TextField()
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.pk:
            current = Address.objects.filter(pk=self.pk).first()
            if current and current.is_default and not self.is_default:
                 # If unsetting default, need to check if another default exists? 
                 # Usually we don't allow unsetting default without setting another. 
                 # But let's stick to requirement "One default".
                 pass
        
        if self.is_default:
            # Set all other addresses of this user to not default. 
            Address.objects.filter(user=self.user).exclude(pk=self.pk).update(is_default=False)
        elif not Address.objects.filter(user=self.user).exists():
             self.is_default = True # First address is always default
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} - {self.city}"


class AdminDevice(models.Model):
    PLATFORM_CHOICES = (
        ("ios", "iOS"),
        ("android", "Android"),
        ("unknown", "Unknown"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="admin_devices")
    installation_id = models.CharField(max_length=120, blank=True, default="")
    expo_push_token = models.CharField(max_length=255, unique=True)
    device_name = models.CharField(max_length=120, blank=True, default="")
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default="unknown")
    app_version = models.CharField(max_length=40, blank=True, default="")
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "is_active"]),
            models.Index(fields=["installation_id"]),
        ]

    def __str__(self):
        return f"{self.user.email} · {self.platform} · {self.device_name or self.expo_push_token}"
