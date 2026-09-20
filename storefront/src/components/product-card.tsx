import Image from "next/image";
import Link from "next/link";

import type { ProductCard as ProductCardType } from "@/lib/types";

import { DiscountBadge, Price } from "./price";

/**
 * One product in a grid.
 *
 * Out of stock is shown, not hidden — the card stays clickable so the product
 * page can offer other sizes or flavours that may still be available. Only the
 * buy action is withheld, and that happens on the product page where there is
 * room to explain why.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardType;
  /**
   * Marks the image as LCP-critical. Set it only for the first row: applying
   * it to every card makes the browser fetch twenty images at once and the
   * one that actually matters arrives later, not sooner.
   */
  priority?: boolean;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-hairline bg-surface-raised transition-shadow hover:shadow-lg">
      <div className="relative aspect-square overflow-hidden bg-surface">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt}
            fill
            /* Tells the browser which resolution it needs before layout, so a
               phone never downloads a 1200px image for a 180px slot. */
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
              product.in_stock ? "" : "opacity-60 grayscale"
            }`}
            priority={priority}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-faint">
            No image
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <DiscountBadge percentage={product.discount_percentage} />
        </div>

        {!product.in_stock && (
          <div className="absolute right-2 top-2 rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-surface">
            Out of stock
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand && (
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {product.brand.name}
          </p>
        )}

        <h3 className="text-sm font-semibold leading-snug">
          {/* The whole card is the hit target via this overlay, which keeps a
              single link in the accessibility tree instead of nesting one
              inside another. */}
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto pt-2">
          <Price
            amount={product.price}
            compareAt={product.compare_at_price}
            size="base"
          />
          {product.variant_count > 1 && (
            <p className="mt-0.5 text-xs text-ink-faint">
              {product.variant_count} options
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
