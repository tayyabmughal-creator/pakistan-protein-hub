import { formatMoney } from "@/lib/money";

/**
 * A price, and a struck-through original only when there is a real saving.
 *
 * `compareAt` is already suppressed by the API when it is not a genuine
 * discount, so this component renders whatever it is given — but it checks
 * again rather than trusting the caller, because a "was" price that is not
 * higher than the current one is a false claim wherever it comes from.
 */
export function Price({
  amount,
  compareAt,
  size = "base",
  className = "",
}: {
  amount: string | null;
  compareAt?: string | null;
  size?: "sm" | "base" | "lg";
  className?: string;
}) {
  const current = formatMoney(amount);
  if (!current) {
    // No sellable variant. Saying "Rs 0" would advertise a free product.
    return (
      <span className={`text-ink-faint ${className}`}>Price unavailable</span>
    );
  }

  const original =
    compareAt && Number(compareAt) > Number(amount) ? formatMoney(compareAt) : null;

  const sizes = {
    sm: "text-sm",
    base: "text-lg",
    lg: "text-3xl",
  } as const;

  return (
    <span className={`flex flex-wrap items-baseline gap-2 ${className}`}>
      <span className={`font-heading font-semibold ${sizes[size]}`}>
        {current}
      </span>
      {original && (
        <>
          <span
            className="text-sm text-ink-faint line-through"
            aria-hidden="true"
          >
            {original}
          </span>
          {/* Screen readers get the relationship spelled out; a line-through
              is a purely visual signal that conveys nothing to them. */}
          <span className="sr-only">, reduced from {original}</span>
        </>
      )}
    </span>
  );
}

/** The "-20%" chip. Renders nothing at zero rather than a "-0%" badge. */
export function DiscountBadge({ percentage }: { percentage: number }) {
  if (!percentage || percentage <= 0) return null;
  return (
    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-black">
      −{percentage}%
    </span>
  );
}
