export type OrderStatus = "PENDING" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  is_staff: boolean;
}

export interface StoredAuthSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  id: number;
  name: string;
  email: string;
  is_staff: boolean;
}

export interface DashboardOverview {
  total_revenue: string;
  monthly_revenue: string;
  total_orders: number;
  pending_orders: number;
  total_customers: number;
  guest_orders: number;
  active_products: number;
  low_stock_products: number;
  avg_order_value: string;
}

export interface DashboardTrendPoint {
  month: string;
  revenue?: number;
  orders?: number;
  customers?: number;
}

export interface DashboardRecentOrder {
  id: number;
  customer_name: string;
  customer_type: string;
  total_amount: string;
  status: OrderStatus;
  created_at: string;
}

export interface DashboardTopProduct {
  name: string;
  units_sold: number;
  revenue: number;
}

export interface DashboardLowStockProduct {
  id: number;
  name: string;
  stock: number;
  brand: string;
}

export interface DashboardData {
  overview: DashboardOverview;
  revenue_trend: DashboardTrendPoint[];
  customer_growth: DashboardTrendPoint[];
  order_status_breakdown: Array<{ status: string; count: number }>;
  top_products: DashboardTopProduct[];
  low_stock_products: DashboardLowStockProduct[];
  recent_orders: DashboardRecentOrder[];
}

export interface OrderItem {
  id: number;
  product: number | null;
  product_name: string;
  quantity: number;
  price: string;
  product_image?: string | null;
}

export interface AdminOrder {
  id: number;
  guest_name: string;
  guest_email: string;
  guest_phone_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone_number: string;
  customer_type: string;
  items_count: number;
  items: OrderItem[];
  subtotal_amount: string;
  discount_amount: string;
  shipping_fee: string;
  applied_promo_code: string;
  total_amount: string;
  shipping_address: string;
  payment_method: string;
  payment_provider: string;
  payment_reference: string;
  payment_tracker: string;
  payment_note?: string;
  payment_status: PaymentStatus;
  paid_at?: string | null;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  image?: string | null;
  products_count?: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  category?: Category;
  category_id?: number;
  brand: string;
  weight: string;
  description: string;
  price: string;
  discount_price?: string | null;
  final_price: string;
  show_sale_badge: boolean;
  sale_percentage: number;
  should_show_sale_badge: boolean;
  stock: number;
  image?: string | null;
  is_in_stock: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Promotion {
  id: number;
  code: string;
  description: string;
  discount_percentage: number;
  valid_from: string;
  valid_to: string;
  active: boolean;
  usage_limit: number;
  used_count: number;
  is_valid: boolean;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone_number?: string | null;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  account_type: string;
  date_joined: string;
  last_login?: string | null;
  order_count: number;
  total_spent: string;
  last_order_at?: string | null;
  address_count: number;
}

export interface Address {
  id: number;
  full_name: string;
  phone_number: string;
  city: string;
  area: string;
  street: string;
  is_default: boolean;
  created_at?: string;
}

export interface AdminUserDetail extends AdminUser {
  addresses: Address[];
  default_address?: Address | null;
  recent_orders: Array<{
    id: number;
    status: OrderStatus;
    payment_method: string;
    payment_status: PaymentStatus;
    total_amount: string;
    applied_promo_code: string;
    created_at: string;
    items_count: number;
  }>;
}

export interface CatalogSummary {
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    product_count: number;
  }>;
  reviews: Array<{
    product_name: string;
    review_count: number;
  }>;
}

export interface PaymentReview {
  public_id: string;
  payment_method: string;
  provider: string;
  status: string;
  checkout_url?: string;
  gateway_tracker?: string;
  gateway_reference?: string;
  subtotal_amount: string;
  discount_amount: string;
  shipping_fee: string;
  total_amount: string;
  applied_promo_code: string;
  shipping_address: string;
  items_snapshot: Array<{
    product_id?: number;
    product_name: string;
    quantity: number;
    price: string;
  }>;
  customer_name: string;
  customer_email: string;
  customer_phone_number: string;
  customer_type: string;
  order?: Pick<AdminOrder, "id" | "status" | "payment_status" | "total_amount"> | null;
  created_at: string;
  updated_at: string;
}

export interface HomePageSettings {
  hero_badge: string;
  hero_title_line_one: string;
  hero_title_line_two: string;
  hero_description: string;
  hero_stat_one_label: string;
  hero_stat_one_value: string;
  hero_stat_two_label: string;
  hero_stat_two_value: string;
  hero_stat_three_label: string;
  hero_stat_three_value: string;
  deal_badge: string;
  deal_title: string;
  deal_subtitle: string;
  deal_code: string;
  deal_enabled: boolean;
  deal_target_date: string;
  featured_promotion_id?: number | null;
  featured_promotion?: Promotion | null;
  effective_deal_code?: string;
  effective_deal_target_date?: string;
  deal_is_live?: boolean;
  deal_is_expired?: boolean;
  support_email: string;
  support_phone: string;
  announcement_text: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  updated_at: string;
}

export type PushStateStatus = "idle" | "syncing" | "ready" | "denied" | "unsupported" | "error";

export interface PushRegistrationState {
  status: PushStateStatus;
  token: string | null;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface PickedImageAsset {
  uri: string;
  name: string;
  type: string;
}
