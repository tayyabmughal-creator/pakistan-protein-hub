import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from products.models import Product

print("Checking Product Slugs:")
for p in Product.objects.all():
    print(f"- {p.name}: '{p.slug}' (Active: {p.is_active})")
