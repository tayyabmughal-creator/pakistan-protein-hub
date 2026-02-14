import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from products.models import Product, Category

# 1. Remove "Potein Daddy" / "adeel_ahmed.jpg" product
try:
    p = Product.objects.filter(image__icontains='adeel').first()
    if p:
        print(f"Deleting product: {p.name}")
        p.delete()
    else:
        print("Product with 'adeel' image not found.")
except Exception as e:
    print(f"Error checking products: {e}")

# 2. Check for any Categories with 'adeel' image
try:
    c = Category.objects.filter(image__icontains='adeel').first()
    if c:
        print(f"Deleting category: {c.name}")
        c.delete()
    else:
        print("Category with 'adeel' image not found.")
except Exception as e:
    print(f"Error checking categories: {e}")

print("Cleanup complete.")
