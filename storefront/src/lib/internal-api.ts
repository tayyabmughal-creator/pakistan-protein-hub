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

export const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export const INTERNAL_HEADERS = { "X-Forwarded-Proto": "https" } as const;
