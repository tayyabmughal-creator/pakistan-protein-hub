import type { NextConfig } from "next";

/**
 * Product images are served by Django from MEDIA_URL, on a different origin in
 * production. next/image refuses remote hosts unless they are allow-listed —
 * that is a deliberate protection against being used as an open image proxy
 * for arbitrary URLs, so the list stays explicit rather than a wildcard.
 */
const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST;

const nextConfig: NextConfig = {
  /*
   * Emits a self-contained server bundle with only the node_modules actually
   * imported. The production image is then ~180 MB instead of ~1.2 GB, which
   * matters on a single small VPS where image pulls compete with the database
   * for disk and bandwidth.
   */
  output: "standalone",

  // The Server header is a free hint to anyone scanning for known Next.js CVEs.
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/media/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/media/**" },
      ...(mediaHost
        ? [{ protocol: "https" as const, hostname: mediaHost, pathname: "/media/**" }]
        : []),
    ],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Defence in depth. The storefront renders product copy written by
          // staff, so these are cheap insurance against a stored-XSS mistake
          // in the admin becoming an exploit on the customer-facing site.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },

  // Fail the production build on a type or lint error rather than shipping it.
  // Next's defaults allow both to be skipped; a storefront that builds with
  // type errors is a storefront where the API contract has already drifted.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
