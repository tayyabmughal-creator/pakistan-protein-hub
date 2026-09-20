"use server";

/**
 * Guest order lookup.
 *
 * Requires the order number **and** the email or phone it was placed with.
 * An order number alone is guessable — they are sequential — so accepting one
 * would expose every customer's name, address and phone to anyone who counts.
 *
 * The failure message is identical whether the order does not exist or the
 * contact detail does not match. Distinguishing them turns this into an
 * oracle for "does order 812 exist" and "was it placed with this email".
 */

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export interface TrackedOrder {
  id: number;
  status: string;
  payment_status: string;
  total_amount: string;
  created_at: string;
  items: { id: number; product_name: string; quantity: number; price: string }[];
}

export type TrackResult =
  | { ok: true; order: TrackedOrder }
  | { ok: false; error: string };

const GENERIC_FAILURE =
  "We could not find an order with those details. Check the order number and the email or mobile number you used.";

export async function trackOrder(
  orderId: string,
  contact: string,
): Promise<TrackResult> {
  const id = Number(orderId.replace(/^#/, "").trim());
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Please enter a valid order number." };
  }

  const value = contact.trim();
  if (!value) {
    return { ok: false, error: "Please enter your email or mobile number." };
  }

  // The API takes one or the other, so pick based on shape.
  const body: Record<string, unknown> = { order_id: id };
  if (value.includes("@")) body.email = value;
  else body.phone_number = value;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/orders/guest-lookup/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "We could not reach the store. Please try again." };
  }

  if (!response.ok) {
    return { ok: false, error: GENERIC_FAILURE };
  }

  return { ok: true, order: (await response.json()) as TrackedOrder };
}
