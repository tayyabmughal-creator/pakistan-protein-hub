# Pak Nutrition — storefront

The customer-facing store: Next.js App Router, server-rendered, reading the
read-only storefront API at `/api/v2/storefront/`.

## Running it

The Django API must be running first — this app renders nothing without it.

```bash
cp .env.example .env.local   # then edit if the API is not on :8000
npm install
npm run dev
```

## What this app is and is not

It serves the **public catalogue funnel**: home, collections, product pages and
the cart. It deliberately does not reimplement the authenticated account area
or the admin — those stay in the existing Vite SPA, which is still the app for
`/login`, `/orders`, `/profile` and `/admin/*`.

That split is the point of the hybrid migration: the pages that need SEO and
fast first paint get server rendering, and the pages behind a login, which need
neither, are left alone rather than rewritten for its own sake.

## Rules that are not style preferences

**Money is a string and the server owns it.** Prices arrive as decimal strings
and are parsed only to format them. The cart stores variant ids and quantities;
the server prices every line from the catalogue at checkout. A cart that could
set its own prices is the most exploitable thing a storefront can have.

**Discounts must be real.** A compare-at price is only rendered when it is
genuinely higher than the selling price. The API suppresses fake ones and
`<Price>` checks again.

**Ratings are never invented.** An unrated product returns `null`, not zero,
and `aggregateRating` is omitted from JSON-LD entirely rather than emitted as
`0` — which is invalid structured data and a manual-action risk.

**Out of stock is shown, not hidden.** Sold-out products stay listed and sort
last. Hiding them makes a published product invisible everywhere including
search while the admin shows it as live.

**Failed fetches throw.** They never return an empty list. An empty catalogue
page rendered from a failed fetch looks identical to a real empty catalogue,
gets cached, and gets indexed.

## URLs

`/products` and `/products/[slug]` match the existing SPA exactly, so the
product URLs that are already indexed do not change and need no redirects.
