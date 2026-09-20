/**
 * Server-side data access for the storefront.
 *
 * Every function here runs on the server (React Server Components or route
 * handlers). Nothing in this module may be imported into a client component —
 * the API base URL for internal traffic is not something to hand to a browser,
 * and these responses are large enough that serialising them into the client
 * bundle would undo the point of server rendering.
 *
 * ## Caching
 *
 * Product content is revalidated on a timer rather than cached forever. The
 * number that matters is stock: a page cached for an hour will advertise a
 * product as in stock an hour after it sold out, and the customer discovers
 * this at checkout. So catalogue content gets a comfortable TTL, and anything
 * stock-sensitive is either short-lived or fetched fresh at request time.
 *
 * ## Failure
 *
 * A failed upstream call throws. It does not return an empty list. An empty
 * catalogue page rendered from a failed fetch looks exactly like a catalogue
 * with nothing in it, gets cached, and is indexed by Google as a real empty
 * page — silent, and far worse than an error.
 */

import type {
  Brand,
  Category,
  Filters,
  Goal,
  Paginated,
  Product,
  ProductCard,
  Sitemap,
} from "./types";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

/** Catalogue content changes when staff edit it, which is rarely. */
const CONTENT_TTL = 300;
/** Listings carry stock badges, so they go stale faster. */
const LISTING_TTL = 60;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

/** Thrown for 404s so pages can call notFound() instead of a 500. */
export class NotFoundError extends ApiError {
  constructor(path: string) {
    super(404, path, `Not found: ${path}`);
    this.name = "NotFoundError";
  }
}

interface FetchOptions {
  revalidate?: number;
  tags?: string[];
}

async function get<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE}/api/v2/storefront${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: {
        revalidate: options.revalidate ?? CONTENT_TTL,
        tags: options.tags,
      },
    });
  } catch (cause) {
    // Network-level failure: the API is down or unreachable. Surface the path
    // but not the internal base URL, which would leak infrastructure detail
    // into an error page.
    throw new ApiError(0, path, `Storefront API unreachable for ${path}`, {
      cause,
    });
  }

  if (response.status === 404) throw new NotFoundError(path);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      path,
      `Storefront API returned ${response.status} for ${path}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Builds a query string, dropping empty values and expanding arrays into
 * repeated keys, which is what the API reads via `getlist`.
 */
export function toQuery(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item) search.append(key, item);
    } else if (value !== "") {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ProductQuery = {
  category?: string;
  brand?: string[];
  goal?: string[];
  type?: string[];
  flavor?: string[];
  size?: string[];
  min_price?: string;
  max_price?: string;
  q?: string;
  sort?: string;
  in_stock?: string;
  page?: string;
};

export function listProducts(query: ProductQuery = {}) {
  return get<Paginated<ProductCard>>(`/products/${toQuery(query)}`, {
    revalidate: LISTING_TTL,
    tags: ["products"],
  });
}

export function getProduct(slug: string) {
  return get<Product>(`/products/${slug}/`, {
    revalidate: LISTING_TTL,
    tags: ["products", `product:${slug}`],
  });
}

export function getRelatedProducts(slug: string) {
  return get<ProductCard[]>(`/products/${slug}/related/`, {
    tags: ["products"],
  });
}

export function getFilters(category?: string) {
  return get<Filters>(`/filters/${toQuery({ category })}`, {
    tags: ["products"],
  });
}

export function listBrands() {
  return get<Brand[]>("/brands/", { tags: ["taxonomy"] });
}

export function listCategories() {
  return get<Category[]>("/categories/", { tags: ["taxonomy"] });
}

export function listGoals() {
  return get<Goal[]>("/goals/", { tags: ["taxonomy"] });
}

export function getSitemap() {
  return get<Sitemap>("/sitemap/", { revalidate: 3600, tags: ["products"] });
}
