import os
import django
import shutil
from django.core.files import File
from django.conf import settings

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from products.models import Product, Category

# Define source images directory
FRONTEND_ASSETS_DIR = r"C:\New Protein\frontend\src\assets\products"
MEDIA_PRODUCTS_DIR = os.path.join(settings.MEDIA_ROOT, 'products')

# Ensure media directory exists
os.makedirs(MEDIA_PRODUCTS_DIR, exist_ok=True)

# Create a default category
category, created = Category.objects.get_or_create(
    name="Featured",
    defaults={'slug': 'featured'}
)
if created:
    print(f"Created category: {category.name}")
else:
    print(f"Using category: {category.name}")

# Product Data
products_data = [
  {
    "name": "Gold Standard 100% Whey Protein",
    "brand": "Optimum Nutrition",
    "price": 18999,
    "discount_price": None,
    "rating": 5,
    "image_filename": "whey-gold.png",
    "slug": "gold-standard-100-whey",
    "description": "Gold Standard 100% Whey Blend – 24g Blended Protein consisting of Whey Protein Isolate, Whey Protein Concentrate, and Whey Peptides to support lean muscle mass – they don't call it the Gold Standard of quality for nothing.",
    "weight": "5 lbs"
  },
  {
    "name": "Serious Mass Weight Gainer",
    "brand": "Optimum Nutrition",
    "price": 14999,
    "discount_price": None,
    "rating": 4,
    "image_filename": "mass-gainer.png",
    "slug": "serious-mass-gainer",
    "description": "Serious Mass is the ultimate weight gain formula. With 1,250 calories per serving and 50 grams of protein for muscle recovery support, this instantized powder makes the ideal post-workout and between-meals shake for sizing up your goals.",
    "weight": "6 lbs"
  },
  {
    "name": "C4 Original Pre-Workout",
    "brand": "Cellucor",
    "price": 8499,
    "discount_price": 6999,
    "rating": 5,
    "image_filename": "preworkout.png",
    "slug": "c4-pre-workout",
    "description": "C4 Original is the original explosive pre-workout. C4 Original is formulated with a classic energy, endurance, pumps, and focus blend to help deliver the advanced performance you need to crush your training.",
    "weight": "30 servings"
  },
  {
    "name": "BCAA Energy Amino Acids",
    "brand": "EVL Nutrition",
    "price": 5499,
    "discount_price": None,
    "rating": 4,
    "image_filename": "bcaa.png",
    "slug": "bcaa-energy",
    "description": "BCAA Energy offers all the benefits of BCAAs for recovery with additional energy components. Perfect for anytime energy, endurance, and recovery.",
    "weight": "30 servings"
  },
  {
    "name": "Creatine Monohydrate",
    "brand": "MuscleTech",
    "price": 3999,
    "discount_price": None,
    "rating": 5,
    "image_filename": "creatine.png",
    "slug": "creatine-monohydrate",
    "description": "Platinum 100% Creatine provides your muscles with the world's highest quality and most clinically researched form of micronized creatine. Creatine is shown to increase lean muscle and improve strength and endurance.",
    "weight": "400g"
  },
  {
    "name": "Nitro-Tech Whey Gold",
    "brand": "MuscleTech",
    "price": 19999,
    "discount_price": 16999,
    "rating": 5,
    "image_filename": "nitrotech.png",
    "slug": "nitro-tech-whey",
    "description": "Nitro-Tech 100% Whey Gold contains whey protein peptides and isolate for superior absorption, digestibility, and mixability. Each scoop serves up 24g of ultra-premium protein.",
    "weight": "5.5 lbs"
  },
  {
    "name": "ISO 100 Hydrolyzed Whey",
    "brand": "Dymatize",
    "price": 21999,
    "discount_price": None,
    "rating": 5,
    "image_filename": "iso100.png",
    "slug": "iso-100-whey",
    "description": "ISO 100 is simply muscle-building fuel. Each serving contains 25 grams of protein and 5.5g of BCAAs including 2.7g of L-Leucine.",
    "weight": "5 lbs"
  },
  {
    "name": "Animal Pak Multivitamin",
    "brand": "Universal Nutrition",
    "price": 7999,
    "discount_price": None,
    "rating": 4,
    "image_filename": "animalpak.png",
    "slug": "animal-pak",
    "description": "The True Original since 1983, the Animal Pak Training Packs has been the choice for hard-nosed gym rats worldwide. It is a complete all-in-one pack that provides you with everything you need.",
    "weight": "44 packs"
  },
]

for p_data in products_data:
    try:
        product, created = Product.objects.update_or_create(
            slug=p_data['slug'],
            defaults={
                'name': p_data['name'],
                'category': category,
                'brand': p_data['brand'],
                'price': p_data['price'],
                'discount_price': p_data['discount_price'],
                'description': p_data['description'],
                'weight': p_data['weight'],
                'stock': 100,
                'is_active': True
            }
        )
        
        # Handle Image
        image_filename = p_data['image_filename']
        src_path = os.path.join(FRONTEND_ASSETS_DIR, image_filename)
        
        if os.path.exists(src_path):
            with open(src_path, 'rb') as f:
                product.image.save(image_filename, File(f), save=True)
            print(f"Saved product with image: {product.name}")
        else:
            print(f"Warning: Image not found for {product.name} at {src_path}")
            product.save()
            print(f"Saved product (no image): {product.name}")

    except Exception as e:
        print(f"Error saving {p_data['name']}: {e}")

print("Seeding completed!")
