import os
import django
import sys

# Add the project root to the python path
sys.path.append('c:/adeel ahmed/Github repositories/gym/pakistan-protein-hub/backend')

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from products.models import Product

products = Product.objects.all()
print(f"Total products: {products.count()}")
for p in products:
    print(f"ID: {p.id}, Name: {p.name}, Slug: '{p.slug}'")
