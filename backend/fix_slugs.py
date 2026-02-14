import os
import django
import sys

# Add the project root to the python path
sys.path.append('c:/adeel ahmed/Github repositories/gym/pakistan-protein-hub/backend')

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from products.models import Product
from django.utils.text import slugify

products = Product.objects.all()
print(f"Total products: {products.count()}")
for p in products:
    if not p.slug:
        print(f"Fixing slug for: {p.name}")
        p.slug = slugify(p.name)
        p.save()
        print(f"New slug: {p.slug}")
    else:
        print(f"Product {p.name} already has slug: {p.slug}")
