/**
 * Schema.org JSON-LD.
 *
 * Structured data is a set of machine-readable claims about the business, and
 * Google treats a false one as a reason to distrust the whole site. Two rules
 * follow from that, and both are enforced here rather than left to callers:
 *
 * **Never emit an aggregateRating that does not exist.** The single most
 * common storefront mistake is `"ratingValue": 0, "reviewCount": 0` on every
 * unrated product, which is an invalid rating and a manual-action risk. The
 * API returns null for unrated products precisely so this file can omit the
 * property entirely.
 *
 * **Availability must match the page.** If the buy button says out of stock
 * and the markup says InStock, Google shows the product as purchasable in
 * results and the customer arrives to a dead end.
 */

import { schemaPrice } from "./money";
import { SITE } from "./site";
import type { Product } from "./types";

const SCHEMA = "https://schema.org";

export function productJsonLd(product: Product) {
  const url = `${SITE.url}/products/${product.slug}`;

  // One Offer per variant. A single offer with a "from" price misrepresents
  // every variant except the cheapest, and Google will surface that price for
  // a search that matched a different size.
  const offers = product.variants.map((variant) => ({
    "@type": "Offer",
    url,
    sku: variant.sku,
    price: schemaPrice(variant.price),
    priceCurrency: "PKR",
    availability: variant.in_stock
      ? `${SCHEMA}/InStock`
      : `${SCHEMA}/OutOfStock`,
    itemCondition: `${SCHEMA}/NewCondition`,
    seller: { "@type": "Organization", name: SITE.name },
  }));

  const data: Record<string, unknown> = {
    "@context": SCHEMA,
    "@type": "Product",
    name: product.name,
    description:
      product.seo_description || product.short_description || product.description,
    sku: product.variants[0]?.sku,
    url,
    ...(product.image ? { image: [product.image.url] } : {}),
    ...(product.brand
      ? { brand: { "@type": "Brand", name: product.brand.name } }
      : {}),
    ...(product.category ? { category: product.category.name } : {}),
  };

  if (offers.length === 1) {
    data.offers = offers[0];
  } else if (offers.length > 1) {
    const prices = product.variants
      .map((variant) => Number(variant.price))
      .filter(Number.isFinite);
    data.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "PKR",
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: offers.length,
      offers,
    };
  }

  // Only when real. Omitted entirely otherwise — not zeroed.
  if (product.rating && product.rating.count > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating.average,
      reviewCount: product.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return data;
}

export function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
) {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE.url}${crumb.path}`,
    })),
  };
}

export function organizationJsonLd() {
  return {
    "@context": SCHEMA,
    "@type": "OnlineStore",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    areaServed: { "@type": "Country", name: "Pakistan" },
    currenciesAccepted: "PKR",
    // No aggregateRating, no award, no certification. Nothing the business
    // cannot evidence goes in here.
  };
}
