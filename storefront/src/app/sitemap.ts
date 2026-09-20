import type { MetadataRoute } from "next";

import { getSitemap } from "@/lib/api";
import { SITE } from "@/lib/site";

/**
 * The sitemap is generated from what the API considers published, not from a
 * hand-maintained list. A static list drifts the moment someone unpublishes a
 * product, and submitting URLs that 404 is a direct signal of a low-quality
 * site.
 *
 * If the API is unreachable this throws rather than emitting a sitemap
 * containing only the static pages — telling Google the catalogue vanished is
 * far worse than briefly serving an error.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemap();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE.url}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE.url}/deals`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE.url}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE.url}/contact`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE.url}/shipping`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE.url}/returns`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE.url}/faq`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const products: MetadataRoute.Sitemap = data.products.map((entry) => ({
    url: `${SITE.url}/products/${entry.slug}`,
    lastModified: new Date(entry.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categories: MetadataRoute.Sitemap = data.categories.map((entry) => ({
    url: `${SITE.url}/products?category=${entry.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticPages, ...products, ...categories];
}
