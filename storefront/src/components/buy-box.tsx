"use client";

import { useState } from "react";

import { useCart } from "@/lib/cart";
import type { Product, Variant } from "@/lib/types";

import { Price } from "./price";

/**
 * Variant selection and add-to-cart.
 *
 * Rules this enforces, in order of how badly each one hurts if broken:
 *
 * 1. The price shown is always the selected variant's price. Selecting a 5lb
 *    tub and seeing the 2lb price is how a customer ends up feeling deceived
 *    at checkout even though the server charged correctly.
 * 2. Out-of-stock variants stay visible and selectable-looking but cannot be
 *    added. Hiding them makes the size list change as stock moves, which is
 *    disorienting and hides the fact that the size exists at all.
 * 3. Quantity cannot exceed what is actually available. The server re-checks
 *    under a lock, so this is a courtesy, not a control — but being told "only
 *    3 left" before checkout is much better than being told after paying.
 *
 * Nothing here invents urgency. The stock line appears only when the number is
 * genuinely low and it states the real figure.
 */
export function BuyBox({ product }: { product: Product }) {
  const { add } = useCart();

  const sellable = product.variants;
  // Default to the first in-stock variant so the buy button is usable on
  // arrival; fall back to the first variant when everything is sold out.
  const [selectedId, setSelectedId] = useState<number | null>(
    sellable.find((variant) => variant.in_stock)?.id ?? sellable[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);

  const selected: Variant | undefined =
    sellable.find((variant) => variant.id === selectedId) ?? sellable[0];

  if (!selected) {
    return (
      <div className="rounded-card border border-hairline p-4 text-sm text-ink-soft">
        This product is not currently available to order.
      </div>
    );
  }

  const maxQuantity = Math.max(1, selected.available);
  const canAdd = selected.in_stock;

  function select(variant: Variant) {
    setSelectedId(variant.id);
    // Reset the quantity: carrying "5" from a variant with 10 in stock over to
    // one with 2 left would show an impossible quantity.
    setQuantity(1);
  }

  return (
    <div className="space-y-5">
      <Price
        amount={selected.price}
        compareAt={selected.compare_at_price}
        size="lg"
      />

      {sellable.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            Options
            <span className="sr-only"> — select a size or flavour</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {sellable.map((variant) => {
              const isSelected = variant.id === selected.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => select(variant)}
                  aria-pressed={isSelected}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "border-brand bg-brand-soft font-semibold"
                      : "border-hairline hover:border-ink-faint"
                  } ${variant.in_stock ? "" : "text-ink-faint"}`}
                >
                  {variant.descriptor || variant.sku}
                  {!variant.in_stock && (
                    <span className="ml-1.5 text-xs">(sold out)</span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Only when genuinely low, and with the real number. No countdown, no
          "12 people are viewing this" — the brief rules out manufactured
          urgency and it is not something to smuggle back in as a nicety. */}
      {canAdd && selected.available <= 5 && (
        <p className="text-sm font-medium text-warning">
          Only {selected.available} left in stock
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md border border-hairline">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            disabled={quantity <= 1}
            className="px-3 py-2.5 text-ink-soft disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="min-w-10 text-center font-medium" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
            disabled={quantity >= maxQuantity}
            className="px-3 py-2.5 text-ink-soft disabled:opacity-40"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          type="button"
          disabled={!canAdd}
          onClick={() => add(product, selected, quantity)}
          className="flex-1 rounded-md bg-brand px-6 py-3 font-heading font-semibold uppercase tracking-wide text-black transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-hairline disabled:text-ink-faint"
        >
          {canAdd ? "Add to cart" : "Out of stock"}
        </button>
      </div>

      <dl className="space-y-1 text-sm text-ink-soft">
        <div className="flex gap-2">
          <dt className="font-medium">SKU:</dt>
          <dd>{selected.sku}</dd>
        </div>
        {selected.serving_count && (
          <div className="flex gap-2">
            <dt className="font-medium">Servings:</dt>
            <dd>
              {selected.serving_count}
              {selected.serving_size && ` (${selected.serving_size})`}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
