import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User

print(f"{'ID':<5} {'Email':<30} {'Is Staff':<10} {'Is Superuser':<15}")
print("-" * 60)

for u in User.objects.all():
    print(f"{u.id:<5} {u.email:<30} {str(u.is_staff):<10} {str(u.is_superuser):<15}")
