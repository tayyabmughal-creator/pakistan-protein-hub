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
FRONTEND_ASSETS_DIR_PRODUCTS = r"C:\New Protein\frontend\src\assets\products"
FRONTEND_ASSETS_DIR_CATEGORIES = r"C:\New Protein\frontend\src\assets\categories"

# Ensure media directories exist
MEDIA_PRODUCTS_DIR = os.path.join(settings.MEDIA_ROOT, 'products')
MEDIA_CATEGORIES_DIR = os.path.join(settings.MEDIA_ROOT, 'categories')
os.makedirs(MEDIA_PRODUCTS_DIR, exist_ok=True)
os.makedirs(MEDIA_CATEGORIES_DIR, exist_ok=True)

# Categories Data
categories_data = [
  {
    "name": "Whey Protein",
    "slug": "whey-protein",
    "image_filename": "whey.png"
  },
  {
    "name": "Mass Gainers",
    "slug": "mass-gainers",
    "image_filename": "mass.png"
  },
  {
    "name": "Pre-Workout",
    "slug": "pre-workout",
    "image_filename": "preworkout.png"
  },
  {
    "name": "BCAAs & Aminos",
    "slug": "bcaas-aminos",
    "image_filename": "bcaa.png"
  },
  {
    "name": "Creatine",
    "slug": "creatine",
    "image_filename": "creatine.png"
  },
  {
    "name": "Vitamins",
    "slug": "vitamins",
    "image_filename": "vitamins.png"
  },
]

print("Seeding Categories...")
categories_map = {}

for cat_data in categories_data:
    category, created = Category.objects.get_or_create(
        slug=cat_data['slug'],
        defaults={'name': cat_data['name']}
    )
    categories_map[cat_data['slug']] = category
    
    # Handle Category Image
    if cat_data.get('image_filename'):
        image_filename = cat_data['image_filename']
        src_path = os.path.join(FRONTEND_ASSETS_DIR_CATEGORIES, image_filename)
        
        if os.path.exists(src_path):
            with open(src_path, 'rb') as f:
                category.image.save(image_filename, File(f), save=True)
            print(f"  Updated image for category: {category.name}")
        else:
            print(f"  Warning: Image not found for category {category.name} at {src_path}")

# Product Data (Updated to link to specific categories)
products_data = [
  {
    "name": "Gold Standard 100% Whey Protein",
    "brand": "Optimum Nutrition",
    "price": 18999,
    "discount_price": None,
    "rating": 5,
    "image_filename": "whey-gold.png",
    "slug": "gold-standard-100-whey",
    "category_slug": "whey-protein",
    "weight": "5 lbs",
    "description": "Gold Standard 100% Whey Blend – 24g Blended Protein consisting of Whey Protein Isolate, Whey Protein Concentrate, and Whey Peptides."
  },
  {
    "name": "Serious Mass Weight Gainer",
    "brand": "Optimum Nutrition",
    "price": 14999,
    "discount_price": None,
    "rating": 4,
    "image_filename": "mass-gainer.png",
    "slug": "serious-mass-gainer",
    "category_slug": "mass-gainers",
    "weight": "6 lbs",
    "description": "Serious Mass is the ultimate weight gain formula. With 1,250 calories per serving and 50 grams of protein."
  },
  {
    "name": "C4 Original Pre-Workout",
    "brand": "Cellucor",
    "price": 8499,
    "discount_price": 6999,
    "rating": 5,
    "image_filename": "preworkout.png",
    "slug": "c4-pre-workout",
    "category_slug": "pre-workout",
    "weight": "30 servings",
    "description": "C4 Original is the original explosive pre-workout. Formulated with a classic energy, endurance, pumps, and focus blend."
  },
  {
    "name": "BCAA Energy Amino Acids",
    "brand": "EVL Nutrition",
    "price": 5499,
    "discount_price": None,
    "rating": 4,
    "image_filename": "bcaa.png",
    "slug": "bcaa-energy",
    "category_slug": "bcaas-aminos",
    "weight": "30 servings",
    "description": "BCAA Energy offers all the benefits of BCAAs for recovery with additional energy components."
  },
  {
    "name": "Creatine Monohydrate",
    "brand": "MuscleTech",
    "price": 3999,
    "discount_price": None,
    "rating": 5,
    "image_filename": "creatine.png",
    "slug": "creatine-monohydrate",
    "category_slug": "creatine",
    "weight": "400g",
    "description": "Platinum 100% Creatine provides your muscles with the world's highest quality micronized creatine."
  },
  {
    "name": "Nitro-Tech Whey Gold",
    "brand": "MuscleTech",
    "price": 19999,
    "discount_price": 16999,
    "rating": 5,
    "image_filename": "nitrotech.png",
    "slug": "nitro-tech-whey",
    "category_slug": "whey-protein",
    "weight": "5.5 lbs",
    "description": "Nitro-Tech 100% Whey Gold contains whey protein peptides and isolate for superior absorption."
  },
  {
    "name": "ISO 100 Hydrolyzed Whey",
    "brand": "Dymatize",
    "price": 21999,
    "discount_price": None,
    "rating": 5,
    "image_filename": "iso100.png",
    "slug": "iso-100-whey",
    "category_slug": "whey-protein",
    "weight": "5 lbs",
    "description": "ISO 100 is simply muscle-building fuel. Each serving contains 25 grams of protein and 5.5g of BCAAs."
  },
  {
    "name": "Animal Pak Multivitamin",
    "brand": "Universal Nutrition",
    "price": 7999,
    "discount_price": None,
    "rating": 4,
    "image_filename": "animalpak.png",
    "slug": "animal-pak",
    "category_slug": "vitamins",
    "weight": "44 packs",
    "description": "The True Original since 1983, the Animal Pak Training Packs has been the choice for hard-nosed gym rats worldwide."
  },
]

print("Seeding Products...")
for p_data in products_data:
    try:
        cat_slug = p_data.get('category_slug')
        category = categories_map.get(cat_slug)
        
        if not category:
            # Fallback to 'Featured' or first available if specific cat not found?
            # Or just create it?
            category, _ = Category.objects.get_or_create(slug='featured', defaults={'name': 'Featured'})

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
        src_path = os.path.join(FRONTEND_ASSETS_DIR_PRODUCTS, image_filename)
        
        if os.path.exists(src_path):
            with open(src_path, 'rb') as f:
                product.image.save(image_filename, File(f), save=True)
            print(f"  Saved product with image: {product.name} ({category.name})")
        else:
            product.save()
            print(f"  Saved product (no image): {product.name} ({category.name})")

    except Exception as e:
        print(f"Error saving {p_data['name']}: {e}")

print("Seeding completed!")
