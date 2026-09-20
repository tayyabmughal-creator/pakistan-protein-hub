"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { getQuote, placeOrder, type Quote } from "@/lib/checkout";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/money";

/**
 * The checkout form.
 *
 * The totals panel shows **only** what the server quoted. There is no local
 * arithmetic anywhere in this component: no summing line totals, no applying a
 * percentage, no adding a shipping fee. If the quote has not arrived the panel
 * says so rather than showing a number this file made up, because the moment
 * the browser starts computing totals it can disagree with what is charged.
 *
 * The submit button stays disabled until a quote exists, so a customer can
 * never commit to an amount that was never confirmed.
 */

const FIELDS = [
  { name: "guest_name", label: "Full name", autoComplete: "name", type: "text" },
  { name: "guest_phone_number", label: "Mobile number", autoComplete: "tel", type: "tel", hint: "For delivery updates, e.g. 03001234567" },
  { name: "guest_email", label: "Email", autoComplete: "email", type: "email", hint: "Your order confirmation goes here" },
  { name: "city", label: "City", autoComplete: "address-level2", type: "text" },
  { name: "area", label: "Area / sector", autoComplete: "address-level3", type: "text" },
  { name: "street", label: "Street address", autoComplete: "street-address", type: "text" },
] as const;

export function CheckoutForm() {
  const router = useRouter();
  const { lines, isReady, clear } = useCart();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, startQuoting] = useTransition();

  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const refreshQuote = useCallback(
    (promoCode: string) => {
      if (lines.length === 0) {
        setQuote(null);
        return;
      }
      startQuoting(async () => {
        const result = await getQuote(
          lines.map((line) => ({
            variantId: line.variantId,
            productId: line.productId,
            quantity: line.quantity,
          })),
          promoCode,
        );
        if (result.ok) {
          setQuote(result.quote);
          setQuoteError(null);
        } else {
          // A failed quote must clear the old one. Leaving a stale total on
          // screen after the basket became unfulfillable is how a customer
          // commits to a number that is no longer true.
          setQuote(null);
          setQuoteError(result.error);
        }
      });
    },
    [lines],
  );

  useEffect(() => {
    if (!isReady) return;
    refreshQuote(appliedPromo);
  }, [isReady, refreshQuote, appliedPromo]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const raw = Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
    );

    const result = await placeOrder(
      { ...raw, promo_code: appliedPromo },
      lines.map((line) => ({
        variantId: line.variantId,
        productId: line.productId,
        quantity: line.quantity,
      })),
    );

    if (result.ok) {
      // Clear only after the server confirmed the order. Clearing optimistically
      // and then failing loses the customer's basket along with the sale.
      clear();
      router.push(`/order-confirmation/${result.orderId}`);
      return;
    }

    setSubmitting(false);
    setFormError(result.error);
    setFieldErrors(result.fieldErrors ?? {});
  }

  if (!isReady) {
    return (
      <div className="mt-8 h-64 animate-pulse rounded-card bg-surface-raised" />
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-hairline p-10 text-center">
        <p className="font-medium">Your cart is empty.</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-md bg-brand px-4 py-2 font-semibold text-black hover:bg-brand-strong"
        >
          Browse supplements
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <section>
          <h2 className="text-lg">Delivery details</h2>

          {formError && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {formError}
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div
                key={field.name}
                className={field.name === "street" ? "sm:col-span-2" : ""}
              >
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium"
                >
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  required
                  aria-invalid={Boolean(fieldErrors[field.name])}
                  aria-describedby={
                    fieldErrors[field.name]
                      ? `${field.name}-error`
                      : "hint" in field
                        ? `${field.name}-hint`
                        : undefined
                  }
                  className={`mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm focus:outline-none ${
                    fieldErrors[field.name]
                      ? "border-danger focus:border-danger"
                      : "border-hairline focus:border-brand"
                  }`}
                />
                {fieldErrors[field.name] ? (
                  <p
                    id={`${field.name}-error`}
                    role="alert"
                    className="mt-1 text-xs text-danger"
                  >
                    {fieldErrors[field.name]}
                  </p>
                ) : (
                  "hint" in field && (
                    <p id={`${field.name}-hint`} className="mt-1 text-xs text-ink-faint">
                      {field.hint}
                    </p>
                  )
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg">Payment</h2>
          <div className="mt-3 rounded-card border border-brand bg-brand-soft p-4">
            <p className="font-medium">Cash on delivery</p>
            <p className="mt-1 text-sm text-ink-soft">
              Pay the courier when your order arrives. Please have the exact
              amount ready.
            </p>
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-card border border-hairline p-4 lg:sticky lg:top-24">
        <h2 className="text-base">Order summary</h2>

        <ul className="mt-3 space-y-3 border-b border-hairline pb-3">
          {lines.map((line) => (
            <li key={line.variantId} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="line-clamp-2">{line.snapshot.productName}</span>
                <span className="text-ink-faint">
                  {line.snapshot.variantLabel && `${line.snapshot.variantLabel} · `}
                  Qty {line.quantity}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3">
          <label htmlFor="promo" className="block text-sm font-medium">
            Promo code
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="promo"
              value={promoInput}
              onChange={(event) => setPromoInput(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm uppercase focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setAppliedPromo(promoInput.trim().toUpperCase())}
              className="rounded-md border border-hairline px-3 py-1.5 text-sm font-medium hover:border-brand"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 text-sm" aria-live="polite">
          {quoteError && (
            <p role="alert" className="text-danger">
              {quoteError}
            </p>
          )}

          {quoting && !quote && <p className="text-ink-faint">Calculating…</p>}

          {quote && (
            <>
              <Row label="Subtotal" value={quote.subtotal_amount} />
              {Number(quote.discount_amount) > 0 && (
                <Row
                  label={`Discount${quote.code ? ` (${quote.code})` : ""}`}
                  value={`-${quote.discount_amount}`}
                  tone="success"
                />
              )}
              <Row
                label="Delivery"
                value={quote.shipping_fee}
                free={Number(quote.shipping_fee) === 0}
              />
              <div className="flex justify-between border-t border-hairline pt-2 font-heading text-lg font-semibold">
                <span>Total</span>
                <span>{formatMoney(quote.total_amount)}</span>
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={!quote || submitting || quoting}
          className="mt-4 w-full rounded-md bg-brand py-3 font-heading font-semibold uppercase tracking-wide text-black transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-hairline disabled:text-ink-faint"
        >
          {submitting ? "Placing order…" : "Place order"}
        </button>

        <p className="mt-2 text-center text-xs text-ink-faint">
          {quote
            ? "You pay the courier on delivery."
            : "A total will appear once your cart is confirmed."}
        </p>
      </aside>
    </form>
  );
}

function Row({
  label,
  value,
  tone,
  free,
}: {
  label: string;
  value: string;
  tone?: "success";
  free?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className={tone === "success" ? "text-success" : undefined}>
        {free ? "Free" : formatMoney(value)}
      </span>
    </div>
  );
}
