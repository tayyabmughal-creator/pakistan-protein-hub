/**
 * Where the storefront's server reaches the Django API, and how.
 *
 * In production this is gunicorn on loopback, bypassing nginx. Django runs
 * with SECURE_SSL_REDIRECT, so a plain-HTTP request would be answered with a
 * 301 to https://127.0.0.1:8000, which nothing serves. nginx normally tells
 * Django the original scheme via X-Forwarded-Proto; on this hop there is no
 * nginx, so the storefront says it itself.
 *
 * That is safe only because gunicorn listens on 127.0.0.1 alone, and nginx
 * overwrites X-Forwarded-Proto on everything it proxies, so no outside client
 * can reach Django with a header it chose.
 */

import { headers } from "next/headers";

export const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export const INTERNAL_HEADERS = { "X-Forwarded-Proto": "https" } as const;

/**
 * Headers for a request made on behalf of a customer: checkout and tracking.
 *
 * Django exempts loopback calls without X-Forwarded-For from its anonymous
 * rate limit, because catalogue renders are the storefront's own traffic, not
 * a customer's (backend/common/throttling.py). Customer actions pass on the
 * X-Forwarded-For nginx set on the incoming request, so they are rate-limited
 * per customer rather than exempt — or all sharing one budget.
 *
 * Only for server actions: reading request headers in a cached catalogue
 * fetch would make every page dynamic.
 */
export async function customerHeaders(): Promise<Record<string, string>> {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  return forwardedFor
    ? { ...INTERNAL_HEADERS, "X-Forwarded-For": forwardedFor }
    : { ...INTERNAL_HEADERS };
}
