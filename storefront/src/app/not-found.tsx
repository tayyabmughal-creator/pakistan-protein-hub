import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-heading text-6xl font-bold text-brand">404</p>
      <h1 className="mt-4 text-2xl">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-ink-soft">
        The product may have been discontinued, or the link may be out of date.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/products"
          className="rounded-md bg-brand px-5 py-2.5 font-semibold text-black hover:bg-brand-strong"
        >
          Browse all products
        </Link>
        <Link
          href="/"
          className="rounded-md border border-hairline px-5 py-2.5 font-semibold hover:border-brand"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
