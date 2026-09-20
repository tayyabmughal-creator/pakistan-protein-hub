import type { Metadata } from "next";
import Link from "next/link";

import { PageShell, Section } from "@/components/page-shell";
import { OWNER_SET, hasBusinessAddress } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: `How to reach ${SITE.name} about an order, a product, or a return.`,
  alternates: { canonical: "/contact" },
};

/**
 * No contact form.
 *
 * A form needs an endpoint that sends mail, which means a spam-handling
 * problem and a queue nobody is watching. A mailto link reaches the same
 * inbox, works without JavaScript, and gives the customer a copy of what they
 * sent — which matters when the thing they are writing about is money.
 *
 * Blank channels are omitted rather than rendered empty: a contact page
 * listing a phone number that is not there reads as an abandoned shop.
 */
export default function ContactPage() {
  const { contact, business } = OWNER_SET;

  return (
    <PageShell
      title="Contact us"
      intro="A person reads these. Include your order number and we can answer in one reply instead of three."
    >
      <Section heading="Email">
        <p>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
        </p>
        <p className="text-sm">
          Best for anything about an order, a return or a refund — it leaves a
          record for both of us.
        </p>
      </Section>

      {contact.whatsapp && (
        <Section heading="WhatsApp">
          <p>
            <a
              href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, "")}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {contact.whatsapp}
            </a>
          </p>
        </Section>
      )}

      {contact.phone && (
        <Section heading="Phone">
          <p>
            <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a>
          </p>
        </Section>
      )}

      <Section heading="When we reply">
        <p>{contact.hours}. Messages outside those hours are answered the next working day.</p>
      </Section>

      <Section heading="Before you write">
        <p>
          Checking where an order has reached is faster on the{" "}
          <Link href="/track">tracking page</Link> — you need your order number
          and the email or mobile you ordered with.
        </p>
        <p>
          Returns and refunds are explained on the{" "}
          <Link href="/returns">returns page</Link>, and the{" "}
          <Link href="/faq">FAQ</Link> covers most of what people ask.
        </p>
      </Section>

      {hasBusinessAddress && (
        <Section heading="Address">
          <address className="not-italic">
            {business.legalName}
            <br />
            {business.line1}
            <br />
            {business.city}, {business.country}
          </address>
          <p className="text-sm">
            This is not a shop counter — please do not send returns here
            without arranging it first.
          </p>
        </Section>
      )}
    </PageShell>
  );
}
