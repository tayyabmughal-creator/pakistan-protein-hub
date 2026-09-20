import type { Metadata } from "next";
import Link from "next/link";

import { Bullets, PageShell, Section } from "@/components/page-shell";
import { OWNER_SET, RETURN_REASONS } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Returns",
  description: `How to return an order to ${SITE.name}, what can be returned, and how refunds work.`,
  alternates: { canonical: "/returns" },
};

/**
 * Describes the process that exists, not a nicer one.
 *
 * There is no customer-facing return endpoint — `AdminOrderReturnCreateView`
 * is capability-gated to staff, so a return is opened by a person at Pak
 * Nutrition after a customer contacts them. This page says "email us" because
 * that is genuinely how it works. A page with a "Start a return" button that
 * went nowhere would be worse than one that sets the right expectation.
 *
 * Supplements are also not ordinary goods: an opened tub cannot be resold, and
 * a shop that promises to take one back either breaks the promise or destroys
 * stock. The policy below draws that line explicitly rather than leaving it to
 * an argument at the door.
 */
export default function ReturnsPage() {
  return (
    <PageShell
      title="Returns"
      intro="If something is wrong with your order, tell us and we will put it right."
    >
      <Section heading="What we will take back">
        <p>
          Contact us within{" "}
          <strong className="text-ink">
            {OWNER_SET.returnWindowDays} days of delivery
          </strong>{" "}
          if:
        </p>
        <Bullets items={RETURN_REASONS.map((reason) => reason)} />
        <p>
          For anything damaged, wrong or not as described, we cover the cost of
          getting it back to us. That is our mistake, not yours.
        </p>
      </Section>

      <Section heading="What we cannot take back">
        <p>
          Supplements are consumables. Once a tub, pouch or sachet has been
          opened we cannot resell it, and we will not sell an opened product to
          somebody else. So:
        </p>
        <Bullets
          items={[
            "Opened or partly used products cannot be returned unless they arrived damaged, expired, or are not what you ordered.",
            "Products must be in their original packaging with the safety seal intact.",
            "If you simply changed your mind, the product must be unopened, and the return postage is yours to cover.",
          ]}
        />
        <p>
          If a product arrived sealed but you believe it is not genuine, do not
          open it — contact us straight away and we will deal with it.
        </p>
      </Section>

      <Section heading="How to start a return">
        <p>
          Email{" "}
          <a href={`mailto:${OWNER_SET.contact.email}`}>
            {OWNER_SET.contact.email}
          </a>{" "}
          with:
        </p>
        <Bullets
          items={[
            "Your order number.",
            "Which item, and what is wrong with it.",
            "A photograph, if it arrived damaged or looks wrong — it usually settles the question immediately.",
          ]}
        />
        <p>
          We will reply with whether it is approved and how to send it back.
          Please do not post anything to us before we have confirmed the
          return: parcels that arrive unannounced are difficult to match to an
          order, and we cannot refund what we cannot identify.
        </p>
      </Section>

      <Section heading="Refunds">
        <p>
          Once the returned goods reach us and we have checked them, we refund
          the amount you paid for those items.
        </p>
        <Bullets
          items={[
            "Cash-on-delivery orders are refunded by bank transfer to an account in your name.",
            "Delivery charges are refunded only when the return is our fault.",
            "We will tell you when the refund has been sent. Bank transfers can take a couple of working days to appear.",
          ]}
        />
      </Section>

      <Section heading="Cancelling before dispatch">
        <p>
          An order that has not yet been confirmed or packed can be cancelled —
          contact us with your order number and we will stop it. Once it is
          with the courier it has to be handled as a return instead.
        </p>
        <p>
          You can check where your order has reached on the{" "}
          <Link href="/track">tracking page</Link>.
        </p>
      </Section>
    </PageShell>
  );
}
