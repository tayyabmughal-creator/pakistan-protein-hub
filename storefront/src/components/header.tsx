"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useCart } from "@/lib/cart";
import { NAV_LINKS, SITE } from "@/lib/site";

import { CartDrawer } from "./cart-drawer";
import { ThemeToggle } from "./theme-toggle";

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");

  // Keep the field in step with the URL so a back navigation out of a search
  // does not leave the old term sitting in the box.
  useEffect(() => {
    setTerm(params.get("q") ?? "");
  }, [params]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = term.trim();
        router.push(query ? `/products?q=${encodeURIComponent(query)}` : "/products");
      }}
      className="relative flex-1"
    >
      <label htmlFor="site-search" className="sr-only">
        Search products
      </label>
      <input
        id="site-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search whey, creatine, pre-workout…"
        className="w-full rounded-md border border-hairline bg-surface-raised px-3 py-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />
    </form>
  );
}

export function Header() {
  const { itemCount, open, isReady } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu on navigation. Leaving it open over the new page is
  // a classic SPA bug that makes the site feel broken.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="rounded-md p-2 text-ink-soft hover:bg-surface-raised md:hidden"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/" className="shrink-0 font-heading text-xl font-bold tracking-tight">
            PAK<span className="text-brand">NUTRITION</span>
          </Link>

          <nav aria-label="Main" className="hidden md:flex md:items-center md:gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-raised ${
                  pathname === link.href ? "text-brand" : "text-ink-soft"
                }`}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden max-w-xs flex-1 sm:block">
            {/* useSearchParams needs a Suspense boundary or the whole route
                opts out of static rendering. */}
            <Suspense fallback={<div className="h-9" />}>
              <SearchBox />
            </Suspense>
          </div>

          <ThemeToggle />

          <button
            type="button"
            onClick={open}
            className="relative flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-surface-raised hover:text-ink"
            aria-label={`Open cart${isReady && itemCount > 0 ? `, ${itemCount} items` : ""}`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0" />
            </svg>
            {/* Only after hydration: rendering a count the server cannot know
                would mismatch, and a "0" badge flashing to "3" looks broken. */}
            {isReady && itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-black">
                {itemCount > 9 ? "9+" : itemCount}
              </span>
            )}
          </button>
        </div>

        {menuOpen && (
          <nav
            id="mobile-nav"
            aria-label="Mobile"
            className="border-t border-hairline px-4 py-2 md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-md px-2 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-raised"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="border-t border-hairline bg-surface-raised px-4 py-1.5 text-center text-xs text-ink-soft sm:hidden">
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>
        </div>
      </header>

      <p className="bg-ink px-4 py-1.5 text-center text-xs font-medium text-surface">
        Cash on delivery across {SITE.country === "PK" ? "Pakistan" : SITE.country}
      </p>

      <CartDrawer />
    </>
  );
}
