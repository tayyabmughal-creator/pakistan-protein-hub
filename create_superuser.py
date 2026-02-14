import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User

email = 'admin@example.com'
password = 'adminpassword'

try:
    if not User.objects.filter(email=email).exists():
        User.objects.create_superuser(email=email, password=password)
        print(f"Superuser created successfully!")
        print(f"Email: {email}")
        print(f"Password: {password}")
    else:
        u = User.objects.get(email=email)
        if not u.is_staff or not u.is_superuser:
            u.is_staff = True
            u.is_superuser = True
            u.save()
            print(f"Existing user {email} promoted to admin.")
        else:
            print(f"User {email} is already an admin.")
            
        print(f"You can reset the password via Django shell if needed.")

except Exception as e:
    print(f"Error: {e}")
