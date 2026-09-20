import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
  // Checkout pages have no search value and must never be indexed — a crawler
  // walking them wastes budget on URLs that can never rank.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl sm:text-3xl">Checkout</h1>
      <CheckoutForm />
    </div>
  );
}
