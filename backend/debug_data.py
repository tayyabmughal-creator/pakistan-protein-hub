import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User
from products.models import Category

print("\n=== USERS ===")
print(f"{'ID':<5} {'Email':<30} {'Is Staff':<10} {'Is Superuser':<15}")
print("-" * 65)
for u in User.objects.all():
    print(f"{u.id:<5} {u.email:<30} {str(u.is_staff):<10} {str(u.is_superuser):<15}")

print("\n=== CATEGORIES ===")
print(f"{'ID':<5} {'Name':<30} {'Slug':<30}")
print("-" * 65)
for c in Category.objects.all():
    print(f"{c.id:<5} {c.name:<30} {c.slug:<30}")
