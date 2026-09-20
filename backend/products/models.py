"""Catalogue.

Why this lives in `products` and not a new `catalog` app
--------------------------------------------------------
`orders.OrderItem`, `cart.CartItem` and `reviews.Review` all hold foreign keys
to `products.Product`. Moving the model to a differently-named app means a table
rename and four cross-app foreign-key rewrites, against a live database, for no
behavioural gain. The domain boundary that matters — catalogue content is
separate from inventory, which is separate from orders — is enforced by the
`inventory` app owning stock and this module owning none of it.

The model in one line
---------------------
``Brand`` → ``Product`` (shared merchandising content) → ``ProductVariant``
(the sellable thing, owning SKU and price) → ``ProductMedia``.

Stock is **not here**. It belongs to `inventory.InventoryBalance`, keyed by
variant and location. Price belongs to the variant, never the product.

Backward compatibility
----------------------
``Product.price``, ``Product.discount_price``, ``Product.stock`` and
``Product.image`` still exist and still read correctly, because the existing
Vite storefront and the Expo admin app consume them. They are now **derived**:
kept in sync from the default variant and its inventory balance by
``products.services.sync_legacy_product_fields``. Writing to them directly no
longer determines what a customer pays or whether an item can be sold — the
variant and the ledger do. They come out once the Next.js storefront replaces
the SPA.
"""

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify


def unique_slug(model, value, *, instance=None, field="slug", max_length=None):
    """Slugify `value`, appending a counter until it is unique for `model`.

    The previous `Product.save` slugified blindly and relied on the unique
    constraint to raise, which turned "two products with similar names" into an
    IntegrityError in front of whoever was adding the second one.
    """
    base = slugify(value) or "item"
    if max_length:
        base = base[:max_length]
    candidate = base
    counter = 2
    while True:
        queryset = model.objects.filter(**{field: candidate})
        if instance is not None and instance.pk:
            queryset = queryset.exclude(pk=instance.pk)
        if not queryset.exists():
            return candidate
        suffix = f"-{counter}"
        candidate = (base[: max_length - len(suffix)] if max_length else base) + suffix
        counter += 1


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    image = models.ImageField(upload_to='categories/', null=True, blank=True)
    description = models.TextField(blank=True, default="")
    seo_title = models.CharField(max_length=70, blank=True, default="")
    seo_description = models.CharField(max_length=160, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Brand(models.Model):
    """A real entity, replacing the free-text `Product.brand` string.

    Brand is a primary navigation axis for supplements — customers shop by
    Optimum Nutrition or MuscleTech the way they shop by category — and a string
    field cannot carry a logo, a description or its own indexable page. It also
    meant "MuscleTech", "Muscletech" and "Muscle Tech" were three brands.
    """

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    logo = models.ImageField(upload_to="brands/", null=True, blank=True)
    description = models.TextField(blank=True, default="")
    country_of_origin = models.CharField(max_length=80, blank=True, default="")

    seo_title = models.CharField(max_length=70, blank=True, default="")
    seo_description = models.CharField(max_length=160, blank=True, default="")

    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [models.Index(fields=["is_active", "sort_order"])]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Brand, self.name, instance=self, max_length=140)
        super().save(*args, **kwargs)


class Goal(models.Model):
    """What a customer is trying to achieve: mass gain, cutting, endurance.

    A model rather than a choices list because these are a storefront filter and
    a landing-page axis, so staff need to add one without a deployment.
    """

    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    description = models.TextField(blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Goal, self.name, instance=self, max_length=100)
        super().save(*args, **kwargs)


class Product(models.Model):
    """Shared merchandising content. Owns no price and no stock."""

    SUPPLEMENT_TYPES = (
        ("WHEY", "Whey Protein"),
        ("ISOLATE", "Whey Isolate"),
        ("CASEIN", "Casein"),
        ("MASS_GAINER", "Mass Gainer"),
        ("PRE_WORKOUT", "Pre-Workout"),
        ("CREATINE", "Creatine"),
        ("BCAA", "BCAA / Amino"),
        ("VITAMINS", "Vitamins & Minerals"),
        ("FAT_BURNER", "Fat Burner"),
        ("ACCESSORY", "Accessory"),
        ("OTHER", "Other"),
    )

    STATUS_DRAFT = "DRAFT"
    STATUS_PUBLISHED = "PUBLISHED"
    STATUS_ARCHIVED = "ARCHIVED"
    PUBLISH_STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_ARCHIVED, "Archived"),
    )

    # -- identity ---------------------------------------------------------
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True)
    category = models.ForeignKey(Category, related_name='products', on_delete=models.PROTECT)
    brand_ref = models.ForeignKey(
        Brand, related_name="products", on_delete=models.PROTECT, null=True, blank=True
    )

    # -- content ----------------------------------------------------------
    short_description = models.CharField(max_length=300, blank=True, default="")
    description = models.TextField()
    benefits = models.TextField(blank=True, default="", help_text="One benefit per line.")
    ingredients = models.TextField(blank=True, default="")
    usage_directions = models.TextField(blank=True, default="")
    warnings = models.TextField(blank=True, default="", help_text="Safety warnings.")
    allergens = models.TextField(blank=True, default="")

    #: Structured panel: [{"label": "Protein", "amount": "24g", "daily_value": "48%"}].
    #: Structured rather than free text so the product page can render a real
    #: table and a feed can read individual values.
    nutrition_facts = models.JSONField(default=list, blank=True)

    supplement_type = models.CharField(
        max_length=20, choices=SUPPLEMENT_TYPES, default="OTHER", db_index=True
    )
    goals = models.ManyToManyField(Goal, related_name="products", blank=True)

    # -- SEO --------------------------------------------------------------
    seo_title = models.CharField(max_length=70, blank=True, default="")
    seo_description = models.CharField(max_length=160, blank=True, default="")

    # New products start as drafts. Defaulting to PUBLISHED meant a product
    # created through any path went live immediately — before it had an image,
    # a real price or a brand — which is exactly what the completeness
    # checklist exists to prevent. Existing products were set to PUBLISHED
    # explicitly by the catalogue migration, so this changes nothing for them.
    publish_status = models.CharField(
        max_length=12, choices=PUBLISH_STATUS_CHOICES, default=STATUS_DRAFT, db_index=True
    )

    # -- legacy, derived; see the module docstring ------------------------
    brand = models.CharField(max_length=100, blank=True, default="")
    weight = models.CharField(max_length=50, blank=True, default="", help_text="e.g. 2kg, 5lbs")
    price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    discount_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock = models.PositiveIntegerField(default=0)
    image = models.ImageField(upload_to='products/', null=True, blank=True)

    show_sale_badge = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["is_active", "publish_status"]),
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["brand_ref", "is_active"]),
            models.Index(fields=["supplement_type"]),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Product, self.name, instance=self)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    # -- sellable identity -------------------------------------------------

    @property
    def default_variant(self):
        """The variant a product page opens on."""
        variants = list(self.variants.all())
        if not variants:
            return None
        for variant in variants:
            if variant.is_default and variant.is_active:
                return variant
        active = [v for v in variants if v.is_active]
        return active[0] if active else variants[0]

    @property
    def is_purchasable(self):
        """Published, active, and with at least one sellable variant."""
        if not self.is_active or self.publish_status != self.STATUS_PUBLISHED:
            return False
        return any(variant.is_active for variant in self.variants.all())

    @property
    def primary_image(self):
        for media in self.media.all():
            if media.is_primary:
                return media
        return next(iter(self.media.all()), None)

    # -- legacy read API, preserved for the SPA and the Expo admin ---------

    @property
    def final_price(self):
        variant = self.default_variant
        if variant is not None:
            return variant.current_price
        return self.discount_price if self.discount_price else self.price

    @property
    def sale_percentage(self):
        variant = self.default_variant
        if variant is not None:
            return variant.discount_percentage
        if not self.discount_price or not self.price or self.discount_price >= self.price:
            return 0
        return int(((self.price - self.discount_price) / self.price) * 100)

    @property
    def should_show_sale_badge(self):
        return bool(self.show_sale_badge and self.sale_percentage > 0)

    @property
    def is_in_stock(self) -> bool:
        return self.stock > 0


class ProductVariant(models.Model):
    """The sellable identity. Owns SKU and price; stock lives in `inventory`.

    SKU is the canonical identifier used consistently across inventory, order
    lines, analytics events, Meta payloads, catalogue feeds and search. Product
    ids are internal; a SKU is what staff read off a tub in the shop.
    """

    product = models.ForeignKey(Product, related_name="variants", on_delete=models.CASCADE)

    sku = models.CharField(max_length=64, unique=True, db_index=True)
    barcode = models.CharField(max_length=64, blank=True, default="", db_index=True)

    # Supplements vary on flavour and pack size, so those are explicit columns
    # rather than a generic option/value table — Pakistan-only, supplements-only,
    # and a generic attribute system would buy nothing but indirection.
    flavor = models.CharField(max_length=80, blank=True, default="")
    size_label = models.CharField(max_length=60, blank=True, default="", help_text="e.g. 2kg, 5lb, 60 caps")
    net_weight_grams = models.PositiveIntegerField(
        null=True, blank=True, help_text="For shipping and sorting by size."
    )
    serving_count = models.PositiveIntegerField(null=True, blank=True)
    serving_size = models.CharField(max_length=60, blank=True, default="", help_text="e.g. 1 scoop (30g)")

    price = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    #: The "was" price. Shown struck through only when genuinely higher — a
    #: compare price below the selling price is a fake discount.
    compare_at_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    is_default = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price__gte=Decimal("0.00")),
                name="products_variant_price_not_negative",
            ),
            # One default per product, enforced in the database rather than by
            # whichever code path happened to set the flag last.
            models.UniqueConstraint(
                fields=["product"],
                condition=models.Q(is_default=True),
                name="products_one_default_variant_per_product",
            ),
        ]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["sku"]),
        ]

    def __str__(self):
        return f"{self.sku} — {self.descriptor or self.product.name}"

    @property
    def descriptor(self):
        """Human-readable variant description: "Chocolate, 2kg"."""
        parts = [part for part in (self.flavor, self.size_label) if part]
        return ", ".join(parts)

    @property
    def display_name(self):
        return f"{self.product.name} ({self.descriptor})" if self.descriptor else self.product.name

    @property
    def current_price(self):
        return self.price

    @property
    def has_genuine_discount(self):
        return bool(self.compare_at_price and self.compare_at_price > self.price)

    @property
    def discount_percentage(self):
        if not self.has_genuine_discount:
            return 0
        return int(((self.compare_at_price - self.price) / self.compare_at_price) * 100)

    @property
    def savings(self):
        if not self.has_genuine_discount:
            return Decimal("0.00")
        return (self.compare_at_price - self.price).quantize(Decimal("0.01"))


class ProductMedia(models.Model):
    """Images for a product, optionally scoped to one variant.

    `variant` null means the image applies to the whole product. Set it to show
    a different tub when the customer picks a different flavour.
    """

    product = models.ForeignKey(Product, related_name="media", on_delete=models.CASCADE)
    variant = models.ForeignKey(
        ProductVariant,
        related_name="media",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Leave empty to show this image for every variant.",
    )

    image = models.ImageField(upload_to="products/")
    #: Required for accessibility and for image search. Enforced at the
    #: publishing checklist rather than the database, so an import can land
    #: first and be completed afterwards.
    alt_text = models.CharField(max_length=160, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name_plural = "Product media"
        constraints = [
            models.UniqueConstraint(
                fields=["product"],
                condition=models.Q(is_primary=True),
                name="products_one_primary_image_per_product",
            ),
        ]
        indexes = [models.Index(fields=["product", "sort_order"])]

    def __str__(self):
        return f"{self.product.name} image {self.sort_order}"
