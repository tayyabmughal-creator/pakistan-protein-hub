"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/money";

/**
 * The cart drawer.
 *
 * Shows an **estimated** subtotal and says so. Delivery, discounts and the
 * final total are computed by the server at checkout; presenting a confident
 * total here that later changes is how a customer decides a store is being
 * dishonest with them.
 */
export function CartDrawer() {
  const { lines, isOpen, close, setQuantity, remove, estimatedSubtotal } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and the page behind must not scroll while the drawer is
  // open — on iOS a scrolling background under a fixed overlay is a well known
  // way to lose your place in a long list.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-hairline p-4">
          <h2 className="text-lg">Your cart</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="rounded-md p-2 text-ink-soft hover:bg-surface-raised hover:text-ink"
            aria-label="Close cart"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-ink-soft">Your cart is empty.</p>
            <Link
              href="/products"
              onClick={close}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-black hover:bg-brand-strong"
            >
              Browse supplements
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-hairline overflow-y-auto">
              {lines.map((line) => (
                <li key={line.variantId} className="flex gap-3 p-4">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-surface-raised">
                    {line.snapshot.image && (
                      <Image
                        src={line.snapshot.image}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${line.snapshot.productSlug}`}
                      onClick={close}
                      className="line-clamp-2 text-sm font-medium hover:text-brand"
                    >
                      {line.snapshot.productName}
                    </Link>
                    {line.snapshot.variantLabel && (
                      <p className="text-xs text-ink-faint">
                        {line.snapshot.variantLabel}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-md border border-hairline">
                        <button
                          type="button"
                          onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                          className="px-2 py-1 text-ink-soft hover:text-ink"
                          aria-label={`Decrease quantity of ${line.snapshot.productName}`}
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-sm" aria-live="polite">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                          className="px-2 py-1 text-ink-soft hover:text-ink"
                          aria-label={`Increase quantity of ${line.snapshot.productName}`}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => remove(line.variantId)}
                        className="text-xs text-ink-faint underline hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <p className="text-sm font-semibold">
                    {formatMoney(String(Number(line.snapshot.price) * line.quantity))}
                  </p>
                </li>
              ))}
            </ul>

            <footer className="border-t border-hairline p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Estimated subtotal</span>
                <span className="font-heading text-xl font-semibold">
                  {formatMoney(String(estimatedSubtotal))}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                Delivery and any discount are calculated at checkout.
              </p>
              <Link
                href="/checkout"
                onClick={close}
                className="mt-3 block rounded-md bg-brand py-3 text-center font-semibold text-black hover:bg-brand-strong"
              >
                Checkout
              </Link>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
