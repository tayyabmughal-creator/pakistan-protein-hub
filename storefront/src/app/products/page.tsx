import type { Metadata } from "next";
import Link from "next/link";

import { FilterPanel } from "@/components/filter-panel";
import { ProductCard } from "@/components/product-card";
import { SortSelect } from "@/components/sort-select";
import { getFilters, listProducts, type ProductQuery } from "@/lib/api";
import { SITE } from "@/lib/site";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Multi-value filters arrive as repeated query keys; single ones as strings. */
function asArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function asString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function toQuery(params: Record<string, string | string[] | undefined>): ProductQuery {
  return {
    category: asString(params.category),
    brand: asArray(params.brand),
    goal: asArray(params.goal),
    type: asArray(params.type),
    flavor: asArray(params.flavor),
    size: asArray(params.size),
    min_price: asString(params.min_price),
    max_price: asString(params.max_price),
    q: asString(params.q),
    sort: asString(params.sort),
    in_stock: asString(params.in_stock),
    page: asString(params.page),
  };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const search = asString(params.q);
  const category = asString(params.category);

  const title = search
    ? `Search: ${search}`
    : category
      ? `${category.replace(/-/g, " ")} supplements`
      : "All supplements";

  return {
    title,
    description: `Browse ${SITE.name}'s range of imported supplements with nationwide delivery.`,
    // A filtered or searched listing is a near-duplicate of the unfiltered
    // one. Canonicalising to the clean URL stops dozens of parameter
    // permutations competing with each other in search results.
    alternates: { canonical: "/products" },
    robots: search ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = toQuery(params);

  const [page, filters] = await Promise.all([
    listProducts(query),
    getFilters(query.category),
  ]);

  const currentPage = Number(query.page ?? "1");
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(page.count / pageSize));

  const heading = query.q
    ? `Results for “${query.q}”`
    : query.category
      ? filters.categories.find((c) => c.slug === query.category)?.name ??
        "Supplements"
      : "All supplements";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl">{heading}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {page.count} {page.count === 1 ? "product" : "products"}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <FilterPanel filters={filters} />

        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <SortSelect />
          </div>

          {page.results.length === 0 ? (
            <div className="rounded-card border border-hairline p-10 text-center">
              <p className="font-medium">No products match those filters.</p>
              <p className="mt-1 text-sm text-ink-soft">
                Try removing a filter, or browse everything.
              </p>
              <Link
                href="/products"
                className="mt-4 inline-block rounded-md bg-brand px-4 py-2 font-semibold text-black hover:bg-brand-strong"
              >
                View all products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {page.results.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  /* Only the first row is LCP-critical. */
                  priority={index < 4}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-8 flex items-center justify-center gap-2"
            >
              {currentPage > 1 && (
                <Link
                  href={{ pathname: "/products", query: { ...params, page: currentPage - 1 } }}
                  rel="prev"
                  className="rounded-md border border-hairline px-4 py-2 text-sm hover:border-brand"
                >
                  Previous
                </Link>
              )}
              <span className="px-3 text-sm text-ink-soft">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages && (
                <Link
                  href={{ pathname: "/products", query: { ...params, page: currentPage + 1 } }}
                  rel="next"
                  className="rounded-md border border-hairline px-4 py-2 text-sm hover:border-brand"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
