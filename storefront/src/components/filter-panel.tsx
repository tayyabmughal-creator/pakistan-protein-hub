"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { Filters } from "@/lib/types";

/**
 * Collection filters.
 *
 * State lives in the URL, not in React. That makes a filtered view shareable,
 * bookmarkable and survivable across a refresh, and it means the back button
 * removes a filter instead of leaving the page — which is what users actually
 * expect from a filter panel and almost never get.
 *
 * Options and counts come from the API, so a filter can never offer a value
 * that matches nothing.
 */
export function FilterPanel({ filters }: { filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openOnMobile, setOpenOnMobile] = useState(false);

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    const current = next.getAll(key);

    next.delete(key);
    if (current.includes(value)) {
      for (const item of current) if (item !== value) next.append(key, item);
    } else {
      for (const item of current) next.append(key, item);
      next.append(key, value);
    }

    // Changing a filter must reset pagination: staying on page 3 of a result
    // set that now has one page shows an empty grid.
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function setSingle(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const activeCount = ["brand", "goal", "type", "flavor", "size", "category", "in_stock"]
    .reduce((total, key) => total + params.getAll(key).length, 0);

  const groups: { key: string; label: string; options: { value: string; label: string; count?: number }[] }[] = [
    {
      key: "category",
      label: "Category",
      options: filters.categories.map((c) => ({ value: c.slug, label: c.name, count: c.count })),
    },
    {
      key: "brand",
      label: "Brand",
      options: filters.brands.map((b) => ({ value: b.slug, label: b.name, count: b.count })),
    },
    {
      key: "goal",
      label: "Goal",
      options: filters.goals.map((g) => ({ value: g.slug, label: g.name, count: g.count })),
    },
    {
      key: "type",
      label: "Type",
      options: filters.supplement_types.map((t) => ({
        value: t.value,
        label: t.label,
        count: t.count,
      })),
    },
    {
      key: "flavor",
      label: "Flavour",
      options: filters.flavors.map((f) => ({ value: f, label: f })),
    },
    {
      key: "size",
      label: "Size",
      options: filters.sizes.map((s) => ({ value: s, label: s })),
    },
  ].filter((group) => group.options.length > 0);

  return (
    <aside aria-label="Filters">
      <button
        type="button"
        onClick={() => setOpenOnMobile((value) => !value)}
        className="mb-3 w-full rounded-md border border-hairline px-4 py-2 text-sm font-medium lg:hidden"
        aria-expanded={openOnMobile}
      >
        Filters{activeCount > 0 && ` (${activeCount})`}
      </button>

      <div className={`space-y-5 ${openOnMobile ? "block" : "hidden"} lg:block`}>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="text-sm text-brand underline"
          >
            Clear all filters
          </button>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={params.get("in_stock") === "true"}
            onChange={(event) =>
              setSingle("in_stock", event.target.checked ? "true" : null)
            }
            className="size-4 accent-[var(--color-brand)]"
          />
          In stock only
        </label>

        {groups.map((group) => (
          <fieldset key={group.key} className="border-t border-hairline pt-4">
            <legend className="text-sm font-semibold">{group.label}</legend>
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
              {group.options.map((option) => {
                const selected = params.getAll(group.key).includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-ink-soft"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(group.key, option.value)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    <span className="flex-1">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="text-xs text-ink-faint">{option.count}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </aside>
  );
}
