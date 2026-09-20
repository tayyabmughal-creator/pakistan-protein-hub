import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { listProducts } from "@/lib/api";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Deals",
  description: `Current discounts at ${SITE.name}. Every price shown is a genuine reduction from the regular selling price.`,
  alternates: { canonical: "/deals" },
};

/**
 * Deals are derived, not curated.
 *
 * A product appears here because its price is genuinely below its compare-at
 * price — the same test the API applies before it will show a struck-through
 * price anywhere. There is no "deals" flag that could mark a full-price
 * product as discounted, which is exactly the trick this avoids.
 */
export default async function DealsPage() {
  const page = await listProducts({ sort: "newest" });
  const discounted = page.results
    .filter((product) => product.discount_percentage > 0)
    .sort((a, b) => b.discount_percentage - a.discount_percentage);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl sm:text-3xl">Deals</h1>
      <p className="mt-1 text-ink-soft">
        Genuine reductions on current stock. No inflated &ldquo;was&rdquo; prices.
      </p>

      {discounted.length === 0 ? (
        <div className="mt-8 rounded-card border border-hairline p-10 text-center">
          <p className="font-medium">Nothing is on sale right now.</p>
          <p className="mt-1 text-sm text-ink-soft">
            We would rather show you an empty page than invent a discount.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-md bg-brand px-4 py-2 font-semibold text-black hover:bg-brand-strong"
          >
            Browse all products
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {discounted.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
