/**
 * Money display for a Pakistani storefront.
 *
 * Prices arrive as decimal strings and stay strings. They are parsed only to
 * format them, never to do arithmetic — every total a customer is charged is
 * computed on the server, and the brief is explicit that frontend totals are
 * not to be trusted.
 *
 * Pakistani supplement prices are whole rupees in practice (Rs 12,499, not
 * Rs 12,499.50), and a trailing ".00" on every price adds noise to a grid, so
 * whole amounts render without decimals and fractional ones keep them.
 */

const FORMATTER = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const FORMATTER_WITH_PAISA = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a decimal string as PKR.
 *
 * Returns null for null so callers must decide what an absent price means,
 * rather than getting "Rs 0" — a product with no sellable variant is not free.
 */
export function formatMoney(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;

  const hasPaisa = Math.round(amount * 100) % 100 !== 0;
  return (hasPaisa ? FORMATTER_WITH_PAISA : FORMATTER).format(amount);
}

/**
 * The numeric form for structured data.
 *
 * Schema.org `price` must be a plain number with a dot separator and no
 * grouping or symbol — "Rs 12,499" in a JSON-LD price field is invalid and
 * Google reports it as an error in Search Console.
 */
export function schemaPrice(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
}
