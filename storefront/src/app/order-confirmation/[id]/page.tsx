import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const PAGE_METADATA: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

/**
 * Order confirmation.
 *
 * Deliberately shows only the order number, and fetches nothing.
 *
 * The obvious implementation — load the order by the id in the URL and render
 * the customer's name, address and phone — is an IDOR: order ids are
 * sequential, so anyone could walk /order-confirmation/1, /2, /3 and harvest
 * the personal details of every customer the shop has. The order detail API
 * requires authentication for exactly this reason, and guests have to prove
 * ownership with the email or phone the order was placed with.
 *
 * So this page confirms what the customer already knows — their order went
 * through, and its number — and sends them to the tracking page if they want
 * detail.
 */
/**
 * The id is validated here, not in the component body.
 *
 * generateMetadata runs before the response starts streaming. Once streaming
 * begins the headers are already sent and notFound() can only render the
 * not-found UI, leaving a 200 status — a soft 404.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // A non-numeric id is a malformed or tampered URL, not a real order.
  if (!/^\d+$/.test(id)) notFound();
  return PAGE_METADATA;
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A non-numeric id is a malformed or tampered URL, not a real order.
  if (!/^\d+$/.test(id)) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand">
        <svg viewBox="0 0 24 24" className="size-7 text-black" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="m5 13 4 4L19 7" />
        </svg>
      </div>

      <h1 className="mt-5 text-2xl">Order placed</h1>
      <p className="mt-2 text-ink-soft">
        Thank you. Your order number is{" "}
        <strong className="text-ink">#{id}</strong>.
      </p>

      <div className="mt-6 rounded-card border border-hairline p-5 text-left">
        <h2 className="text-base">What happens next</h2>
        <ol className="mt-3 space-y-2 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">1.</strong> A confirmation is on its
            way to the email address you gave us.
          </li>
          <li>
            <strong className="text-ink">2.</strong> We will call or message
            your mobile number to confirm the delivery address.
          </li>
          <li>
            <strong className="text-ink">3.</strong> Pay the courier in cash
            when your order arrives.
          </li>
        </ol>
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Keep your order number safe — you will need it, along with the email or
        mobile number you ordered with, to check your order status.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/track?order=${id}`}
          className="rounded-md bg-brand px-5 py-2.5 font-semibold text-black hover:bg-brand-strong"
        >
          Track this order
        </Link>
        <Link
          href="/products"
          className="rounded-md border border-hairline px-5 py-2.5 font-semibold hover:border-brand"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
