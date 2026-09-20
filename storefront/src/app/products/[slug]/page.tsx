import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuyBox } from "@/components/buy-box";
import { ProductCard } from "@/components/product-card";
import { getProduct, getRelatedProducts, NotFoundError } from "@/lib/api";
import { productJsonLd } from "@/lib/structured-data";
import { SITE } from "@/lib/site";
import type { Product } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Fetches once per request, shared between generateMetadata and the page.
 *
 * Next dedupes identical fetches within a render pass, so both callers hit the
 * cache rather than the API twice — but only if the request is identical,
 * which is why both go through the same function.
 */
async function loadProduct(slug: string): Promise<Product> {
  try {
    return await getProduct(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let product: Product;
  try {
    product = await getProduct(slug);
  } catch (error) {
    // Belt and braces with the notFound() in the page body.
    //
    // A missing product has to answer 404, not 200-with-404-content: Google
    // treats a soft 404 as a real page and indexes it. This broke once
    // already — a loading.tsx at the app root put every route behind a
    // Suspense boundary, so headers were flushed before the component ran and
    // notFound() could no longer set the status. generateMetadata runs before
    // streaming starts, so this guard holds even if someone reintroduces one.
    if (error instanceof NotFoundError) notFound();
    // Any other failure: no metadata rather than a 500. The page render will
    // surface the problem properly if it persists.
    return {};
  }

  const title = product.seo_title || product.name;
  const description =
    product.seo_description ||
    product.short_description ||
    `Buy ${product.name} in Pakistan from ${SITE.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/products/${product.slug}`,
      images: product.image ? [{ url: product.image.url, alt: product.image.alt }] : [],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await loadProduct(slug);

  // Related products are decoration: if that call fails the product page must
  // still sell the product.
  const related = await getRelatedProducts(slug).catch(() => []);

  const gallery = product.media.length
    ? product.media
    : product.image
      ? [{ id: 0, image: product.image.url, alt_text: product.image.alt, sort_order: 0, is_primary: true, variant: null }]
      : [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd(product)),
        }}
      />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-brand">Home</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/products" className="hover:text-brand">Products</Link>
            </li>
            {product.category && (
              <>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    href={`/products?category=${product.category.slug}`}
                    className="hover:text-brand"
                  >
                    {product.category.name}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true">/</li>
            <li className="text-ink" aria-current="page">{product.name}</li>
          </ol>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-card border border-hairline bg-surface-raised">
              {gallery[0] ? (
                <Image
                  src={gallery[0].image}
                  alt={gallery[0].alt_text || product.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-faint">
                  No image available
                </div>
              )}
            </div>

            {gallery.length > 1 && (
              <ul className="grid grid-cols-5 gap-2">
                {gallery.slice(0, 5).map((media) => (
                  <li
                    key={media.id}
                    className="relative aspect-square overflow-hidden rounded-md border border-hairline"
                  >
                    <Image
                      src={media.image}
                      alt={media.alt_text || ""}
                      fill
                      sizes="20vw"
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-6">
            <div>
              {product.brand && (
                <Link
                  href={`/products?brand=${product.brand.slug}`}
                  className="text-sm font-medium uppercase tracking-wide text-ink-faint hover:text-brand"
                >
                  {product.brand.name}
                </Link>
              )}
              <h1 className="mt-1 text-2xl sm:text-3xl">{product.name}</h1>
              {product.short_description && (
                <p className="mt-2 text-ink-soft">{product.short_description}</p>
              )}
            </div>

            <BuyBox product={product} />

            {product.benefit_list.length > 0 && (
              <section>
                <h2 className="text-base">Key benefits</h2>
                <ul className="mt-2 space-y-1.5">
                  {product.benefit_list.map((benefit) => (
                    <li key={benefit} className="flex gap-2 text-sm text-ink-soft">
                      <span className="text-brand" aria-hidden="true">✓</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {product.description && (
              <section>
                <h2 className="text-lg">Description</h2>
                <div className="mt-2 whitespace-pre-line text-ink-soft">
                  {product.description}
                </div>
              </section>
            )}

            {product.usage_directions && (
              <section>
                <h2 className="text-lg">How to use</h2>
                <p className="mt-2 whitespace-pre-line text-ink-soft">
                  {product.usage_directions}
                </p>
              </section>
            )}

            {product.ingredients && (
              <section>
                <h2 className="text-lg">Ingredients</h2>
                <p className="mt-2 whitespace-pre-line text-ink-soft">
                  {product.ingredients}
                </p>
              </section>
            )}

            {/* Warnings and allergens are rendered prominently and never
                collapsed behind a tab. Someone with a dairy allergy should not
                have to hunt for this. */}
            {(product.warnings || product.allergens) && (
              <section className="rounded-card border border-warning/40 bg-warning/5 p-4">
                <h2 className="text-base text-warning">Safety information</h2>
                {product.allergens && (
                  <p className="mt-2 text-sm">
                    <strong>Allergens:</strong> {product.allergens}
                  </p>
                )}
                {product.warnings && (
                  <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">
                    {product.warnings}
                  </p>
                )}
              </section>
            )}
          </div>

          {product.nutrition_facts.length > 0 && (
            <section className="lg:col-span-1">
              <h2 className="text-lg">Nutrition</h2>
              <div className="mt-2 overflow-x-auto rounded-card border border-hairline">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Nutritional information per serving
                  </caption>
                  <thead className="bg-surface-raised">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">Nutrient</th>
                      <th scope="col" className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {product.nutrition_facts.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          {row.label}
                        </th>
                        <td className="px-3 py-2 text-right">{row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl">You might also like</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.slice(0, 4).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
