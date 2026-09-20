import Link from "next/link";

/**
 * Shell for the informational pages.
 *
 * `max-w-2xl` is not arbitrary: it lands around 70 characters per line at the
 * body size, which is the range where people stop losing their place between
 * lines. Policy text is exactly the content nobody wants to re-read.
 */
export function PageShell({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  /** ISO date. Shown on policy pages, where "when did this change" matters. */
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
        <Link href="/" className="hover:text-brand">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{title}</span>
      </nav>

      <h1 className="text-2xl sm:text-3xl">{title}</h1>
      {intro && <p className="mt-3 text-lg text-ink-soft">{intro}</p>}
      {updated && (
        <p className="mt-2 text-sm text-ink-faint">
          Last updated{" "}
          <time dateTime={updated}>
            {new Date(updated).toLocaleDateString("en-PK", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </p>
      )}

      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg">{heading}</h2>
      <div className="space-y-3 text-ink-soft [&_a]:text-brand [&_a]:underline [&_li]:leading-relaxed [&_p]:leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
