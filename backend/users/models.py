from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    ROLE_CHOICES = (
        ('user', 'User'),
        ('admin', 'Admin'),
    )
    
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    
    # We use email as the username
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'name'] # username is required by AbstractUser but we want to prompt for name too if creating superuser

    def __str__(self):
        return self.email
