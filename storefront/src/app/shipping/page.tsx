import type { Metadata } from "next";
import Link from "next/link";

import { Bullets, PageShell, Section } from "@/components/page-shell";
import { getSettings } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { OWNER_SET } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Shipping & delivery",
  description: `How ${SITE.name} delivers across Pakistan, what it costs, and when to expect your order.`,
  alternates: { canonical: "/shipping" },
};

export default async function ShippingPage() {
  // The threshold, the fee and — critically — which comparison the server
  // applies. Hardcoding these would let this page promise free delivery on an
  // order that checkout then charges for.
  const settings = await getSettings();
  const threshold = formatMoney(settings.shipping.free_over);
  const fee = formatMoney(settings.shipping.standard_fee);

  // `greater_than` means an order of *exactly* the threshold still pays
  // delivery. "Over" says that; "and above" would not.
  const freeWording =
    settings.shipping.comparison === "greater_than"
      ? `over ${threshold}`
      : `of ${threshold} or more`;

  const { majorCities, elsewhere } = OWNER_SET.deliveryDays;

  return (
    <PageShell
      title="Shipping & delivery"
      intro="We deliver nationwide, and you can pay the courier when your order arrives."
    >
      <Section heading="What delivery costs">
        <Bullets
          items={[
            <>
              <strong className="text-ink">Free</strong> on orders {freeWording}.
            </>,
            <>
              <strong className="text-ink">{fee}</strong> on everything below
              that.
            </>,
          ]}
        />
        <p>
          The delivery charge is calculated at checkout and shown before you
          place your order. The total on the checkout page is the total you
          pay.
        </p>
      </Section>

      <Section heading="How long it takes">
        <Bullets
          items={[
            <>
              <strong className="text-ink">
                {majorCities.min}–{majorCities.max} working days
              </strong>{" "}
              to {majorCities.examples}.
            </>,
            <>
              <strong className="text-ink">
                {elsewhere.min}–{elsewhere.max} working days
              </strong>{" "}
              to {elsewhere.examples}.
            </>,
          ]}
        />
        <p>
          These are estimates, not guarantees. Orders placed after hours,
          on Sundays or during public holidays start moving the next working
          day, and courier networks slow down around Eid.
        </p>
      </Section>

      <Section heading="Paying on delivery">
        <p>
          Cash on delivery is available across Pakistan. Please keep the exact
          amount ready — couriers often cannot give change.
        </p>
        <p>
          We call or message the number on your order before dispatch to
          confirm the address. If we cannot reach you, the order waits rather
          than being sent to an address we are unsure about.
        </p>
      </Section>

      <Section heading="Tracking your order">
        <p>
          Use your order number and the email or mobile number you ordered
          with on the{" "}
          <Link href="/track">order tracking page</Link>. We ask for both so
          that an order number on its own cannot be used to look up someone
          else&apos;s details.
        </p>
      </Section>

      <Section heading="If something goes wrong">
        <p>
          If your order has not arrived in the time above, or it arrives
          damaged, contact us at{" "}
          <a href={`mailto:${OWNER_SET.contact.email}`}>
            {OWNER_SET.contact.email}
          </a>{" "}
          with your order number. See{" "}
          <Link href="/returns">returns</Link> for what happens next.
        </p>
      </Section>
    </PageShell>
  );
}
