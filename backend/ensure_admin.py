import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User

email = 'admin@example.com'
password = 'adminpassword'

try:
    if User.objects.filter(email=email).exists():
        u = User.objects.get(email=email)
        u.set_password(password)
        u.is_staff = True
        u.is_superuser = True
        u.save()
        print(f"Updated existing user {email} with password '{password}'")
    else:
        # USERNAME_FIELD is email, but REQUIRED_FIELDS includes 'username' and 'name'
        User.objects.create_superuser(username='admin', email=email, password=password, name='Admin User')
        print(f"Created new superuser {email} with password '{password}'")

except Exception as e:
    print(f"Error: {e}")

except Exception as e:
    print(f"Error: {e}")
