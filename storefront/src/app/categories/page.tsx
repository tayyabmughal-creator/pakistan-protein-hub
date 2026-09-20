import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getFilters, listCategories } from "@/lib/api";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Categories",
  description: `Browse ${SITE.name} by supplement category — whey protein, creatine, pre-workout, mass gainers and more.`,
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const [categories, filters] = await Promise.all([listCategories(), getFilters()]);

  // Counts come from the filters endpoint, which only counts published
  // products — so a category cannot advertise stock it has no live products for.
  const counts = new Map(filters.categories.map((c) => [c.slug, c.count]));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl sm:text-3xl">Shop by category</h1>
      <p className="mt-1 text-ink-soft">
        Find what fits your training goal.
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/products?category=${category.slug}`}
              className="group flex h-full overflow-hidden rounded-card border border-hairline transition-colors hover:border-brand"
            >
              <div className="relative size-28 shrink-0 bg-surface-raised">
                {category.image && (
                  <Image
                    src={category.image}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col justify-center p-4">
                <h2 className="text-base group-hover:text-brand">
                  {category.name}
                </h2>
                <p className="mt-0.5 text-sm text-ink-faint">
                  {counts.get(category.slug) ?? 0} products
                </p>
                {category.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                    {category.description}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
