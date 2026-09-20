import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { listCategories, listProducts } from "@/lib/api";
import { FREE_DELIVERY_OVER, SITE } from "@/lib/site";
import { formatMoney } from "@/lib/money";
import { organizationJsonLd } from "@/lib/structured-data";

export const metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // In parallel: three sequential awaits would make the homepage as slow as
  // the sum of all three round trips.
  const [newest, deals, categories] = await Promise.all([
    listProducts({ sort: "newest", in_stock: "true" }),
    listProducts({ sort: "newest" }),
    listCategories(),
  ]);

  // Genuine discounts only. There is no "featured deals" flag being faked here
  // — if nothing is on sale, the section does not render.
  const discounted = deals.results.filter((p) => p.discount_percentage > 0);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />

      <section className="border-b border-hairline bg-surface-raised">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:py-20">
          <div className="max-w-2xl">
            <h1 className="text-3xl leading-tight sm:text-5xl">
              Serious supplements,
              <span className="block text-brand">delivered nationwide</span>
            </h1>
            <p className="mt-4 text-lg text-ink-soft">
              Imported protein, creatine and pre-workout — with cash on delivery
              anywhere in Pakistan and free shipping over{" "}
              {formatMoney(String(FREE_DELIVERY_OVER))}.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-md bg-brand px-6 py-3 font-heading font-semibold uppercase tracking-wide text-black hover:bg-brand-strong"
              >
                Shop all
              </Link>
              <Link
                href="/categories"
                className="rounded-md border border-hairline px-6 py-3 font-heading font-semibold uppercase tracking-wide hover:border-brand"
              >
                Browse categories
              </Link>
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-xl">Shop by category</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/products?category=${category.slug}`}
                  className="flex h-full items-center justify-center rounded-card border border-hairline p-4 text-center text-sm font-medium transition-colors hover:border-brand hover:text-brand"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {discounted.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl">On sale now</h2>
            <Link href="/deals" className="text-sm text-brand hover:underline">
              All deals
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {discounted.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {newest.results.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl">New arrivals</h2>
            <Link href="/products" className="text-sm text-brand hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {newest.results.slice(0, 8).map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={index < 4}
              />
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-hairline bg-surface-raised">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-3">
          {[
            {
              title: "Cash on delivery",
              body: `Pay when your order arrives, anywhere in Pakistan.`,
            },
            {
              title: "Free delivery",
              body: `On orders over ${formatMoney(String(FREE_DELIVERY_OVER))}.`,
            },
            {
              title: "Real support",
              body: `Questions about a product or an order? Email ${SITE.supportEmail}.`,
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="text-base">{item.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
