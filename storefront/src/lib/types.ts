/**
 * Mirrors the storefront API payloads.
 *
 * Source of truth: `backend/products/serializers_storefront.py`. The contract
 * test there asserts the exact key set of both payloads, so if a field is
 * added or removed on the server without updating this file, that test fails
 * first and names the field.
 *
 * Money arrives as a decimal string, never a number. Prices in PKR run to five
 * figures and JavaScript floats cannot represent 0.1 exactly; formatting and
 * comparison happen on the string or in minor units, and arithmetic on money
 * happens on the server.
 */

export type Money = string;

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  description: string;
  country_of_origin: string;
}

export interface BrandRef {
  name: string;
  slug: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  description: string;
}

export interface Goal {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface ProductImage {
  url: string;
  alt: string;
}

export interface Media {
  id: number;
  image: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  variant: number | null;
}

export interface Variant {
  id: number;
  sku: string;
  flavor: string;
  size_label: string;
  descriptor: string;
  serving_count: number | null;
  serving_size: string;
  net_weight_grams: number | null;
  price: Money;
  /** Null unless the discount is genuine — the server suppresses fake ones. */
  compare_at_price: Money | null;
  savings: Money | null;
  discount_percentage: number;
  /** On hand minus reserved. Reserved units belong to checkouts in flight. */
  available: number;
  in_stock: boolean;
}

export interface Rating {
  average: number;
  count: number;
}

export interface ProductCard {
  id: number;
  name: string;
  slug: string;
  short_description: string;
  brand: BrandRef | null;
  category_slug: string;
  supplement_type: string;
  image: ProductImage | null;
  /** The cheapest sellable variant. Null only if nothing is sellable. */
  price: Money | null;
  compare_at_price: Money | null;
  discount_percentage: number;
  in_stock: boolean;
  variant_count: number;
  /** Null means not yet rated — never render this as zero stars. */
  rating: Rating | null;
}

export interface Product extends Omit<ProductCard, "brand" | "category_slug"> {
  description: string;
  brand: Brand | null;
  category: Category;
  goals: Goal[];
  benefits: string;
  benefit_list: string[];
  ingredients: string;
  usage_directions: string;
  warnings: string;
  allergens: string;
  nutrition_facts: NutritionRow[];
  seo_title: string;
  seo_description: string;
  variants: Variant[];
  media: Media[];
}

export interface NutritionRow {
  label: string;
  amount: string;
  daily_value?: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface FilterOption {
  slug: string;
  name: string;
  count: number;
}

export interface TypeOption {
  value: string;
  label: string;
  count: number;
}

export interface Filters {
  brands: FilterOption[];
  categories: FilterOption[];
  goals: FilterOption[];
  supplement_types: TypeOption[];
  flavors: string[];
  sizes: string[];
  price: { min: Money; max: Money };
}

export interface SitemapEntry {
  slug: string;
  updated_at?: string;
}

export interface Sitemap {
  products: Required<SitemapEntry>[];
  categories: SitemapEntry[];
  brands: SitemapEntry[];
  goals: SitemapEntry[];
}

/**
 * Shop policy the server owns.
 *
 * `comparison` is not decoration: the server charges delivery unless the
 * subtotal is *strictly* greater than `free_over`, so an order of exactly
 * Rs 5,000 pays it. Copy that reads "free on orders of 5,000 and above" is a
 * promise checkout breaks, which is why the rule is published rather than
 * restated in the frontend.
 */
export interface ShopSettings {
  currency: string;
  shipping: {
    free_over: Money;
    comparison: "greater_than" | "greater_or_equal";
    standard_fee: Money;
  };
  cod_available: boolean;
}
