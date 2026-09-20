/**
 * Site-wide constants.
 *
 * Contact details and claims live here rather than being scattered through
 * components, so there is one place to check that what the site asserts is
 * true. Nothing in this file may state a certification, authenticity
 * guarantee or medical benefit the business cannot substantiate — the brief
 * rules those out explicitly, and in Pakistan an unsupported "100% original,
 * lab tested" claim on a supplement site is a real legal exposure, not a
 * marketing flourish.
 */

export const SITE = {
  name: "Pak Nutrition",
  // paknutrition.com — the .pk domain does not resolve. This default only
  // applies when NEXT_PUBLIC_SITE_URL is unset, and it is baked into the
  // bundle at build time, so a wrong value here puts the wrong host in every
  // canonical tag and sitemap entry.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://paknutrition.com",
  description:
    "Imported sports nutrition and supplements, delivered across Pakistan. Cash on delivery available nationwide.",
  /** Shown in the footer and on the contact page. */
  supportEmail: "support@paknutrition.com",
  whatsapp: "",
  city: "Lahore",
  country: "PK",
} as const;

/**
 * Free-delivery threshold in rupees, for the shipping notice.
 *
 * Display only. The server computes the actual shipping charge at checkout,
 * and if these two ever disagree the server wins — a customer must never be
 * charged shipping the page told them they would not pay, nor the reverse.
 */
export const FREE_DELIVERY_OVER = 5000;

export const NAV_LINKS = [
  { href: "/products", label: "All Products" },
  { href: "/categories", label: "Categories" },
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
] as const;
