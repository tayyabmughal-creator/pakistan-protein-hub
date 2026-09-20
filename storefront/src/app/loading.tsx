/**
 * Skeleton shown while a server component streams.
 *
 * Matches the product grid's shape so the page does not jump when real content
 * replaces it — a spinner would reserve no space and cause a layout shift.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="h-8 w-48 animate-pulse rounded bg-surface-raised" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-card border border-hairline">
            <div className="aspect-square animate-pulse bg-surface-raised" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
              <div className="h-4 w-full animate-pulse rounded bg-surface-raised" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-surface-raised" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">Loading products</span>
    </div>
  );
}
