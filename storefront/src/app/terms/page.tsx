import type { Metadata } from "next";
import Link from "next/link";

import { Bullets, PageShell, Section } from "@/components/page-shell";
import { OWNER_SET, hasBusinessAddress } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description: `The terms you agree to when you order from ${SITE.name}.`,
  alternates: { canonical: "/terms" },
};

/**
 * ⚠️  Written to describe how the shop actually operates. It is not legal
 * advice and has not been reviewed by a lawyer. Have someone qualified read it
 * before launch, particularly the liability section — that is the part that
 * matters if anything goes wrong.
 *
 * The health section is not boilerplate. Selling supplements in Pakistan
 * without a clear "this is not medicine, ask a doctor" statement is a genuine
 * exposure, and it is also simply true.
 */
export default function TermsPage() {
  const { contact, business } = OWNER_SET;

  return (
    <PageShell
      title="Terms of service"
      intro={`These terms apply when you buy from ${SITE.name}.`}
      updated="2026-09-21"
    >
      <Section heading="Who you are buying from">
        <p>
          This site is operated by {business.legalName}
          {business.city ? `, ${business.city}, ${business.country}` : ""}.
          {business.taxId ? ` Registration: ${business.taxId}.` : ""}
        </p>
      </Section>

      <Section heading="Orders">
        <p>
          Placing an order is an offer to buy. The sale is made when we confirm
          the order and dispatch it — not at the moment you press the button.
          Until then either side can step away.
        </p>
        <p>
          We may decline or cancel an order if the item turns out to be out of
          stock, if the price shown was wrong, or if we cannot confirm the
          delivery address. If you have already paid for an order we cancel, we
          refund it in full.
        </p>
      </Section>

      <Section heading="Prices">
        <p>
          Prices are in Pakistani Rupees. The price shown on a product page is
          the price charged, and delivery is calculated and shown at checkout
          before you commit.
        </p>
        <p>
          Prices change. The price that applies to your order is the one shown
          at the moment you place it, which is the figure our server calculates
          — not one carried over from an older page left open in a tab.
        </p>
        <p>
          If a price is listed wrongly — a decimal in the wrong place, say — we
          will contact you before dispatching rather than quietly charging the
          corrected amount or shipping at a price that was obviously a mistake.
        </p>
      </Section>

      <Section heading="Stock">
        <p>
          Stock figures on the site come from our inventory and are accurate at
          the time the page loads. Very occasionally two people reach the last
          unit at the same time; if that happens we will tell you and refund or
          cancel rather than leave the order sitting.
        </p>
      </Section>

      <Section heading="Delivery">
        <p>
          Delivery times shown on the{" "}
          <Link href="/shipping">shipping page</Link> are estimates based on
          courier performance, not guarantees. Risk in the goods passes to you
          on delivery.
        </p>
        <p>
          If nobody is available to accept a cash-on-delivery parcel after the
          courier has tried to reach you, it comes back to us and the order is
          cancelled.
        </p>
      </Section>

      <Section heading="Returns">
        <p>
          Set out in full on the <Link href="/returns">returns page</Link>,
          which forms part of these terms. In short: contact us within{" "}
          {OWNER_SET.returnWindowDays} days of delivery, and unopened products
          in their original sealed packaging can be returned.
        </p>
      </Section>

      <Section heading="Health and your responsibility">
        <p>
          Supplements sold here are food products, not medicines. Nothing on
          this site is medical advice, and nothing we sell is intended to
          diagnose, treat, cure or prevent any disease.
        </p>
        <Bullets
          items={[
            "Speak to a doctor before starting a supplement if you are pregnant, nursing, under 18, taking prescription medication, or managing a medical condition.",
            "Read the label. Follow the directions on the product, not a figure you read somewhere else.",
            "Check the ingredients if you have allergies. If a product page does not list what you need to know, ask us before ordering rather than guessing.",
            "Stop taking a product and seek medical advice if you react badly to it.",
          ]}
        />
      </Section>

      <Section heading="Product information">
        <p>
          We take product descriptions, ingredients and nutritional information
          from the manufacturer. Manufacturers reformulate, and packaging
          changes. The label on the product you receive is authoritative — if
          it differs from what the page said in a way that matters to you, that
          is grounds for a return and we will treat it as our error.
        </p>
        <p>
          Product photographs are illustrative. Packaging design changes more
          often than we can reshoot it.
        </p>
      </Section>

      <Section heading="Our liability">
        <p>
          We are responsible for delivering what you ordered, in the condition
          it should arrive in. If we fail at that, we will replace it or refund
          you.
        </p>
        <p>
          We are not responsible for how a product affects you if it is used
          contrary to its label or to medical advice you have been given.
          Nothing in these terms limits any liability that cannot lawfully be
          limited.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          If you create an account, keep the password to yourself. Tell us
          straight away if you think somebody else has access to it.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We may update these terms. The version that applies to your order is
          the one published when you placed it, and the date at the top of this
          page tells you when it last changed.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>These terms are governed by the laws of Pakistan.</p>
      </Section>

      <Section heading="Contact">
        <p>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
        </p>
        {hasBusinessAddress && (
          <address className="not-italic text-sm">
            {business.legalName}
            <br />
            {business.line1}
            <br />
            {business.city}, {business.country}
          </address>
        )}
      </Section>
    </PageShell>
  );
}
