"use server";

/**
 * Checkout server actions.
 *
 * Everything that touches money runs here, on the server, and the browser is
 * told the result. Two consequences, both deliberate:
 *
 * **The storefront never computes a total.** It sends the basket and renders
 * whatever the quote comes back with. The same Django code path prices the
 * quote and the order, so what the customer is shown is what they are charged.
 *
 * **The API base URL is never shipped to the browser.** Requests go from this
 * process to Django, so the API does not need to be publicly reachable or
 * CORS-configured for the storefront to work.
 */

import { z } from "zod";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export interface QuoteLine {
  variantId: number;
  productId: number;
  quantity: number;
}

export interface Quote {
  code: string;
  discount_percentage: number;
  subtotal_amount: string;
  discount_amount: string;
  shipping_fee: string;
  total_amount: string;
}

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; error: string };

function toItems(lines: QuoteLine[]) {
  return lines.map((line) => ({
    product_id: line.productId,
    variant_id: line.variantId,
    quantity: line.quantity,
  }));
}

/** Reads the error Django returned, without leaking anything structural. */
async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
    if (typeof body?.detail === "string") return body.detail;
    // DRF field errors: surface the first one, which is the actionable one.
    for (const value of Object.values(body ?? {})) {
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  } catch {
    // Non-JSON response — a proxy error page, most likely.
  }
  return fallback;
}

export async function getQuote(
  lines: QuoteLine[],
  promoCode = "",
): Promise<QuoteResult> {
  if (lines.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/orders/quote/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: toItems(lines), promo_code: promoCode }),
      cache: "no-store", // a total must never be served from a cache
    });
  } catch {
    return { ok: false, error: "We could not reach the store. Please try again." };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: await readError(response, "We could not price your cart."),
    };
  }

  return { ok: true, quote: (await response.json()) as Quote };
}

/**
 * Validated on the server, not only in the browser.
 *
 * Django validates all of this too — this exists to give the customer a
 * specific, immediate message per field rather than one generic API error.
 */
const CheckoutSchema = z.object({
  guest_name: z.string().trim().min(2, "Please enter your full name."),
  guest_email: z.string().trim().email("Please enter a valid email address."),
  guest_phone_number: z
    .string()
    .trim()
    // Pakistani mobile numbers: 03XXXXXXXXX, or +923XXXXXXXXX. Couriers
    // cannot deliver without a reachable number, so this is checked rather
    // than accepted loosely.
    .regex(
      /^(?:\+92|0)3\d{9}$/,
      "Enter a Pakistani mobile number, like 03001234567.",
    ),
  city: z.string().trim().min(2, "Please enter your city."),
  area: z.string().trim().min(2, "Please enter your area or sector."),
  street: z.string().trim().min(5, "Please enter your street address."),
  promo_code: z.string().trim().optional().default(""),
});

export type CheckoutFields = z.infer<typeof CheckoutSchema>;

export type PlaceOrderResult =
  | { ok: true; orderId: number; total: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function placeOrder(
  raw: Record<string, string>,
  lines: QuoteLine[],
): Promise<PlaceOrderResult> {
  if (lines.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  const parsed = CheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  const { promo_code, ...address } = parsed.data;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/orders/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...address,
        // Cash on delivery only for now. Safepay stays disabled until its
        // verification checklist passes — offering a payment method that
        // cannot settle would take real orders and strand them.
        payment_method: "COD",
        promo_code,
        items: toItems(lines),
      }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: "We could not reach the store. Your card was not charged and no order was placed.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: await readError(
        response,
        "We could not place your order. Please try again.",
      ),
    };
  }

  const order = await response.json();
  return { ok: true, orderId: order.id, total: order.total_amount };
}
