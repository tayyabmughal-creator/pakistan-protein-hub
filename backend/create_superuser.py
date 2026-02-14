import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

email = 'admin@example.com'
password = 'admin123'
name = 'Admin User'
username = 'admin'

if not User.objects.filter(email=email).exists():
    print(f"Creating superuser {email}...")
    try:
        User.objects.create_superuser(
            email=email,
            password=password,
            username=username,
            name=name
        )
        print("Superuser created successfully!")
    except Exception as e:
        print(f"Error creating superuser: {e}")
else:
    print(f"Superuser {email} already exists. Resetting password...")
    user = User.objects.get(email=email)
    user.set_password(password)
    user.save()
    print("Password reset successfully!")
