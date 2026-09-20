import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep crawlers out of anything personal or transactional. These pages
        // have no search value and crawling checkout wastes crawl budget on
        // URLs that can never rank.
        disallow: [
          "/cart",
          "/checkout",
          "/orders",
          "/profile",
          "/admin",
          "/payment-status",
          "/guest-orders",
          "/api/",
          // Filtered listings are near-duplicates of /products and would
          // otherwise consume the crawl budget in permutations.
          "/products?*",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
