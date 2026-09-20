import type { Metadata } from "next";
import { Suspense } from "react";

import { TrackOrderForm } from "@/components/track-order-form";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of a Pak Nutrition order.",
  robots: { index: false, follow: false },
};

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl">Track your order</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Enter your order number and the email or mobile number you ordered
        with. We ask for both so that an order number on its own cannot be used
        to look up someone else&apos;s details.
      </p>
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-card bg-surface-raised" />}>
        <TrackOrderForm />
      </Suspense>
    </div>
  );
}
