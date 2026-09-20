import Link from "next/link";

import { FREE_DELIVERY_OVER, SITE } from "@/lib/site";
import { formatMoney } from "@/lib/money";

/**
 * Footer.
 *
 * Deliberately free of trust badges the business cannot substantiate. No
 * "100% authentic guaranteed", no lab-test seals, no certification logos —
 * those are claims, and an unsupported authenticity claim on a supplement
 * store is both a legal exposure and the fastest way to lose the customers who
 * check. What is here is what is verifiable: where orders ship from, how to
 * reach a human, and the actual policies.
 */
export function Footer() {
  const columns = [
    {
      title: "Shop",
      links: [
        { href: "/products", label: "All products" },
        { href: "/categories", label: "Categories" },
        { href: "/deals", label: "Deals" },
      ],
    },
    {
      title: "Help",
      links: [
        { href: "/shipping", label: "Shipping & delivery" },
        { href: "/returns", label: "Returns" },
        { href: "/faq", label: "FAQ" },
        { href: "/contact", label: "Contact us" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/about", label: "About us" },
        { href: "/privacy", label: "Privacy policy" },
        { href: "/terms", label: "Terms of service" },
      ],
    },
  ];

  return (
    <footer className="mt-16 border-t border-hairline bg-surface-raised">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-heading text-lg font-bold">
              PAK<span className="text-brand">NUTRITION</span>
            </p>
            <p className="mt-2 text-sm text-ink-soft">{SITE.description}</p>
            <p className="mt-3 text-sm text-ink-soft">
              Free delivery on orders over {formatMoney(String(FREE_DELIVERY_OVER))}.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-labelledby={`footer-${column.title}`}>
              <h2
                id={`footer-${column.title}`}
                className="text-sm font-semibold tracking-wide"
              >
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-soft hover:text-brand"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}. Ships from {SITE.city},
            Pakistan.
          </p>
          <p>
            Supplements are not a substitute for a varied diet. Consult a
            doctor before use if you are pregnant, nursing, or taking
            medication.
          </p>
        </div>
      </div>
    </footer>
  );
}
