"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { trackOrder, type TrackedOrder } from "@/lib/track";
import { formatMoney } from "@/lib/money";

/** Customer-facing wording for the internal status codes. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Received — we will confirm shortly",
  CONFIRMED: "Confirmed",
  PROCESSING: "Being packed",
  PACKED: "Packed",
  SHIPPED: "With the courier",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
};

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: "Awaiting payment",
  COD_PENDING: "Pay the courier on delivery",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

export function TrackOrderForm() {
  const params = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await trackOrder(orderId, contact);
    setLoading(false);

    if (result.ok) {
      setOrder(result.order);
    } else {
      setOrder(null);
      setError(result.error);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="order" className="block text-sm font-medium">
            Order number
          </label>
          <input
            id="order"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            required
            inputMode="numeric"
            className="mt-1 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="contact" className="block text-sm font-medium">
            Email or mobile number
          </label>
          <input
            id="contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand py-2.5 font-semibold text-black hover:bg-brand-strong disabled:bg-hairline disabled:text-ink-faint"
        >
          {loading ? "Checking…" : "Check order"}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {order && (
        <section className="mt-6 rounded-card border border-hairline p-5">
          <h2 className="text-base">Order #{order.id}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Status</dt>
              <dd className="font-medium">
                {STATUS_LABELS[order.status] ?? order.status}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Payment</dt>
              <dd>{PAYMENT_LABELS[order.payment_status] ?? order.payment_status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Placed</dt>
              <dd>
                {new Date(order.created_at).toLocaleDateString("en-PK", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>

          <ul className="mt-4 space-y-2 border-t border-hairline pt-3 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {item.product_name}
                  <span className="text-ink-faint"> × {item.quantity}</span>
                </span>
                <span>{formatMoney(item.price)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-between border-t border-hairline pt-3 font-heading text-lg font-semibold">
            <span>Total</span>
            <span>{formatMoney(order.total_amount)}</span>
          </div>
        </section>
      )}
    </>
  );
}
