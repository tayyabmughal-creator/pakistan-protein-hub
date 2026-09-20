/**
 * Shapes the API actually returns.
 *
 * Mirrors the DRF serializers under `backend/`. Written out rather
 * than inferred so that a field being renamed on the server becomes a compile
 * error here instead of `undefined` at runtime.
 *
 * Money is `string`. DRF serialises DecimalField as a string by default, and
 * parsing it to a JS number loses precision on large PKR totals — format it for
 * display, do not do arithmetic on it in the browser. The server is the only
 * thing that prices an order.
 */

export type Money = string;
export type IsoDateTime = string;

// --------------------------------------------------------------------------
// Catalogue
// --------------------------------------------------------------------------

export interface Category {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  products_count?: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  category: Category | null;
  brand: string;
  weight: string;
  description: string;
  price: Money;
  discount_price: Money | null;
  final_price: Money;
  show_sale_badge: boolean;
  sale_percentage: number;
  should_show_sale_badge: boolean;
  stock: number;
  image: string | null;
  is_in_stock: boolean;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// --------------------------------------------------------------------------
// Cart
// --------------------------------------------------------------------------

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
  price_snapshot: Money | null;
  total_price: Money;
}

export interface Cart {
  id: number;
  user: number;
  items: CartItem[];
  total_price: Money;
  updated_at: IsoDateTime;
}

// --------------------------------------------------------------------------
// Orders
// --------------------------------------------------------------------------

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

export type PaymentMethod =
  | "COD"
  | "EASYPAISA"
  | "JAZZCASH"
  | "BANK_TRANSFER"
  | "SAFEPAY";

export interface OrderItem {
  id: number;
  product: number | null;
  product_name: string;
  quantity: number;
  price: Money;
  product_image: string | null;
}

export interface Order {
  id: number;
  user: number | null;
  guest_name: string;
  guest_email: string;
  guest_phone_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone_number: string;
  customer_type: "Registered" | "Guest";
  items: OrderItem[];
  items_count: number;
  subtotal_amount: Money;
  discount_amount: Money;
  shipping_fee: Money;
  applied_promo_code: string;
  total_amount: Money;
  shipping_address: string;
  payment_method: PaymentMethod;
  payment_provider: string;
  payment_reference: string;
  payment_tracker: string;
  payment_note: string;
  payment_status: PaymentStatus;
  paid_at: IsoDateTime | null;
  status: OrderStatus;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// --------------------------------------------------------------------------
// Payments
// --------------------------------------------------------------------------

export interface PaymentMethodOption {
  code: PaymentMethod;
  label: string;
  description: string;
  provider: string;
  is_online: boolean;
  requires_reference: boolean;
  reference_label: string;
  details: string[];
}

export type PaymentSessionStatus =
  | "PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED"
  | "REVIEW";

export interface PaymentSession {
  public_id: string;
  payment_method: PaymentMethod;
  provider: string;
  status: PaymentSessionStatus;
  checkout_url: string;
  gateway_tracker: string;
  gateway_reference: string;
  subtotal_amount: Money;
  discount_amount: Money;
  shipping_fee: Money;
  total_amount: Money;
  applied_promo_code: string;
  shipping_address: string;
  items_snapshot: OrderItemSnapshot[];
  customer_name: string;
  customer_email: string;
  customer_phone_number: string;
  customer_type: string;
  /** Nested OrderSerializer, not a primary key — see PaymentSessionSerializer. */
  order: Order | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface OrderItemSnapshot {
  product_id: number;
  product_name: string;
  quantity: number;
  price: Money;
  line_total?: Money;
}

// --------------------------------------------------------------------------
// Promotions
// --------------------------------------------------------------------------

export interface Promotion {
  id: number;
  code: string;
  description: string;
  discount_percentage: number;
  valid_from: IsoDateTime;
  valid_to: IsoDateTime;
  active: boolean;
  usage_limit: number;
  used_count: number;
  is_valid: boolean;
}

export interface PromoPreview {
  code: string;
  discount_percentage: number;
  subtotal_amount: Money;
  discount_amount: Money;
  shipping_fee: Money;
  total_amount: Money;
}

// --------------------------------------------------------------------------
// Identity
// --------------------------------------------------------------------------

export interface User {
  id: number;
  name: string;
  email: string;
  phone_number: string | null;
  is_staff: boolean;
  date_joined: IsoDateTime;
}

export interface Address {
  id: number;
  full_name: string;
  phone_number: string;
  city: string;
  area: string;
  street: string;
  is_default: boolean;
  created_at?: IsoDateTime;
}

/** One line of a customer's order history, as the admin customer view returns it. */
export interface AdminCustomerOrderSummary {
  id: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_amount: Money;
  applied_promo_code: string;
  created_at: IsoDateTime;
  items_count: number;
}

/** AdminUserListSerializer. The detail endpoint adds the optional fields. */
export interface AdminCustomer extends User {
  is_superuser: boolean;
  is_active: boolean;
  account_type: "Superuser" | "Staff" | "Customer";
  last_login: IsoDateTime | null;
  order_count: number;
  total_spent: Money;
  last_order_at: IsoDateTime | null;
  address_count: number;
  // Present only on AdminUserDetailSerializer.
  addresses?: Address[];
  default_address?: Address | null;
  recent_orders?: AdminCustomerOrderSummary[];
}

// --------------------------------------------------------------------------
// Admin catalogue summary
// --------------------------------------------------------------------------

export interface AdminCatalogCategory {
  id: number;
  name: string;
  slug: string;
  product_count: number;
}

export interface AdminCatalogReview {
  product_name: string;
  review_count: number;
}

export interface AdminCatalogSummary {
  categories: AdminCatalogCategory[];
  reviews: AdminCatalogReview[];
}

// --------------------------------------------------------------------------
// Storefront content
// --------------------------------------------------------------------------

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
  deal_target_date: IsoDateTime;
  featured_promotion: Promotion | null;
  featured_promotion_id?: number | null;
  effective_deal_code: string;
  effective_deal_target_date: IsoDateTime | null;
  deal_is_live: boolean;
  deal_is_expired: boolean;
  support_email: string;
  support_phone: string;
  announcement_text: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
}

// --------------------------------------------------------------------------
// Admin dashboard
// --------------------------------------------------------------------------

export interface DashboardOverview {
  /** Settled revenue — see backend/storefront/metrics.py for the definition. */
  total_revenue: Money;
  monthly_revenue: Money;
  settled_orders: number;
  /** COD sold but not yet collected. Deliberately not counted as revenue. */
  pending_cod_value: Money;
  online_revenue: Money;
  cod_revenue: Money;
  total_orders: number;
  pending_orders: number;
  total_customers: number;
  guest_orders: number;
  active_products: number;
  low_stock_products: number;
  avg_order_value: Money;
}

export interface RevenueTrendPoint {
  month: string;
  revenue: number;
  orders: number;
}

export interface CustomerGrowthPoint {
  month: string;
  customers: number;
}

export interface OrderStatusCount {
  status: OrderStatus;
  count: number;
}

export interface TopProduct {
  name: string;
  units_sold: number;
  revenue: number;
}

export interface LowStockProduct {
  id: number;
  name: string;
  stock: number;
  brand: string;
}

export interface RecentOrder {
  id: number;
  customer_name: string;
  customer_type: string;
  total_amount: Money;
  status: OrderStatus;
  created_at: IsoDateTime;
}

export interface DashboardSummary {
  overview: DashboardOverview;
  revenue_trend: RevenueTrendPoint[];
  customer_growth: CustomerGrowthPoint[];
  order_status_breakdown: OrderStatusCount[];
  top_products: TopProduct[];
  low_stock_products: LowStockProduct[];
  recent_orders: RecentOrder[];
  /** Exact definition of each figure above, published by the API. */
  metric_definitions: Record<string, string>;
}

// --------------------------------------------------------------------------
// Admin: inventory
// --------------------------------------------------------------------------

/** Capability strings. Mirrors backend/users/capabilities.py. */
export const CAP = {
  DASHBOARD_VIEW: "dashboard.view",
  REPORTS_VIEW: "reports.view",
  ORDER_VIEW: "order.view",
  ORDER_TRANSITION: "order.transition",
  ORDER_CANCEL: "order.cancel",
  ORDER_REFUND: "order.refund",
  RETURN_VIEW: "return.view",
  RETURN_MANAGE: "return.manage",
  PAYMENT_VIEW: "payment.view",
  PAYMENT_REVIEW: "payment.review",
  CATALOG_VIEW: "catalog.view",
  CATALOG_EDIT: "catalog.edit",
  CATALOG_PUBLISH: "catalog.publish",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_RECEIVE: "inventory.receive",
  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_EDIT: "customer.edit",
  MARKETING_MANAGE: "marketing.manage",
  AUDIT_VIEW: "audit.view",
  STAFF_MANAGE: "staff.manage",
} as const;

export type Capability = (typeof CAP)[keyof typeof CAP];

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface InventoryBalance {
  id: number;
  variant: number;
  sku: string;
  product_name: string;
  variant_description: string;
  brand: string;
  location: number;
  location_code: string;
  on_hand: number;
  reserved: number;
  /** on_hand - reserved. Derived server-side; never computed here. */
  available: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  last_counted_at: IsoDateTime | null;
  /** True for every balance migrated from the old stock column. */
  never_counted: boolean;
  updated_at: IsoDateTime;
}

export type StockMovementType =
  | "RECEIPT" | "SALE" | "RETURN" | "CANCELLATION"
  | "DAMAGE" | "MANUAL_ADJUSTMENT" | "STOCKTAKE";

export interface StockMovement {
  id: number;
  variant: number;
  sku: string;
  product_name: string;
  quantity: number;
  movement_type: StockMovementType;
  movement_label: string;
  reference: string;
  order: number | null;
  actor: number | null;
  actor_email: string;
  reason: string;
  balance_after: number | null;
  created_at: IsoDateTime;
}

// --------------------------------------------------------------------------
// Admin: orders (v2)
// --------------------------------------------------------------------------

export type FulfilmentStatus =
  | "PENDING_CONFIRMATION" | "CONFIRMED" | "READY_TO_PACK" | "PACKED"
  | "READY_FOR_PICKUP" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "RETURNED";

export type PaymentStatusV2 =
  | "PENDING" | "COD_PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export type SalesChannel = "ONLINE" | "PHONE" | "WHATSAPP" | "IN_STORE";

export interface AdminOrderRow {
  id: number;
  customer_name: string;
  customer_phone: string;
  total_amount: Money;
  refunded_amount: Money;
  payment_method: PaymentMethod;
  payment_status: PaymentStatusV2;
  payment_label: string;
  fulfilment_status: FulfilmentStatus;
  fulfilment_label: string;
  sales_channel: SalesChannel;
  is_settled: boolean;
  items_count: number;
  courier_name: string;
  tracking_number: string;
  created_at: IsoDateTime;
  confirmed_at: IsoDateTime | null;
  shipped_at: IsoDateTime | null;
  delivered_at: IsoDateTime | null;
}

export interface AdminOrderLine {
  id: number;
  product: number | null;
  variant: number | null;
  product_name: string;
  sku: string;
  variant_description: string;
  brand_name: string;
  quantity: number;
  price: Money;
  compare_at_price: Money | null;
  line_discount: Money;
  line_total: Money;
}

export interface AdminOrderHistoryEntry {
  id: number;
  kind: "PAYMENT" | "FULFILMENT" | "NOTE" | "REFUND" | "RETURN";
  kind_label: string;
  from_status: string;
  to_status: string;
  actor: number | null;
  actor_email: string;
  note: string;
  is_customer_visible: boolean;
  created_at: IsoDateTime;
}

export interface TransitionOption {
  value: FulfilmentStatus;
  label: string;
}

export interface AdminOrderDetail extends AdminOrderRow {
  user: number | null;
  guest_name: string;
  guest_email: string;
  guest_phone_number: string;
  customer_email: string;
  shipping_address: string;
  subtotal_amount: Money;
  discount_amount: Money;
  shipping_fee: Money;
  applied_promo_code: string;
  payment_reference: string;
  payment_tracker: string;
  staff_note: string;
  inventory_committed: boolean;
  paid_at: IsoDateTime | null;
  cancelled_at: IsoDateTime | null;
  packed_at: IsoDateTime | null;
  items: AdminOrderLine[];
  history: AdminOrderHistoryEntry[];
  /** Only moves the API will accept, so the UI cannot offer a refused button. */
  available_transitions: TransitionOption[];
}

export interface OrderQueues {
  awaiting_confirmation: number;
  confirmed: number;
  ready_to_pack: number;
  packed: number;
  ready_for_pickup: number;
  shipped: number;
  open_returns: number;
  /** COD sold but not collected. Owed, not earned. */
  cod_cash_outstanding: Money;
  cod_orders_outstanding: number;
  definitions: Record<string, string>;
}

// --------------------------------------------------------------------------
// Admin: returns
// --------------------------------------------------------------------------

export type ReturnStatus =
  | "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "COMPLETED" | "CANCELLED";

export interface AdminReturnLine {
  id: number;
  order_item: number;
  product_name: string;
  sku: string;
  quantity: number;
  /** Null until someone inspects the goods. Not the same as "decided not to". */
  restock: boolean | null;
  restocked_at: IsoDateTime | null;
  condition_note: string;
}

export interface AdminReturn {
  id: number;
  reference: string;
  order: number;
  customer_name: string;
  status: ReturnStatus;
  status_label: string;
  reason: string;
  reason_label: string;
  customer_note: string;
  staff_note: string;
  refund_amount: Money;
  refunded_at: IsoDateTime | null;
  requested_at: IsoDateTime;
  resolved_at: IsoDateTime | null;
  is_open: boolean;
  items: AdminReturnLine[];
}
