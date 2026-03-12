export interface GuestCartProduct {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  price: string | number;
  final_price?: string | number | null;
  stock: number;
}

export interface GuestCartItem {
  product: GuestCartProduct;
  quantity: number;
}

const GUEST_CART_KEY = "guest_cart";
const GUEST_CART_EVENT = "guest-cart-updated";

const isBrowser = typeof window !== "undefined";

function emitGuestCartUpdate() {
  if (!isBrowser) return;
  window.dispatchEvent(new CustomEvent(GUEST_CART_EVENT));
}

export function getGuestCartItems(): GuestCartItem[] {
  if (!isBrowser) return [];

  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGuestCartItems(items: GuestCartItem[]) {
  if (!isBrowser) return;
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  emitGuestCartUpdate();
}

export function addGuestCartItem(product: GuestCartProduct, quantity: number) {
  const items = getGuestCartItems();
  const existing = items.find((item) => item.product.id === product.id);

  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, product.stock);
  } else {
    items.push({ product, quantity: Math.min(quantity, product.stock) });
  }

  saveGuestCartItems(items);
}

export function updateGuestCartItem(productId: number, quantity: number) {
  const items = getGuestCartItems()
    .map((item) => item.product.id === productId ? { ...item, quantity: Math.min(Math.max(quantity, 1), item.product.stock) } : item)
    .filter((item) => item.quantity > 0);

  saveGuestCartItems(items);
}

export function removeGuestCartItem(productId: number) {
  saveGuestCartItems(getGuestCartItems().filter((item) => item.product.id !== productId));
}

export function clearGuestCart() {
  if (!isBrowser) return;
  window.localStorage.removeItem(GUEST_CART_KEY);
  emitGuestCartUpdate();
}

export function getGuestCartCount() {
  return getGuestCartItems().reduce((total, item) => total + item.quantity, 0);
}

export function subscribeToGuestCartUpdates(callback: () => void) {
  if (!isBrowser) return () => {};

  window.addEventListener(GUEST_CART_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(GUEST_CART_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
