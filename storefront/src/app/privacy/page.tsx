import type { Metadata } from "next";
import Link from "next/link";

import { Bullets, PageShell, Section } from "@/components/page-shell";
import { OWNER_SET, hasBusinessAddress } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${SITE.name} does with your personal information, and what it does not do.`,
  alternates: { canonical: "/privacy" },
};

/**
 * Describes what the system actually does, verified against the code.
 *
 *   - Guest orders store name, email, phone and a snapshot of the address
 *     (`Order.guest_name` … `Order.shipping_address`).
 *   - Card details never reach this server. Online payment is a hosted
 *     provider checkout, and `payments.services._REDACT_KEYS` strips card,
 *     PAN, CVV and credential fields from any provider payload before it is
 *     persisted.
 *   - Logs scrub sensitive keys and mask emails and phone numbers
 *     (`common.logging.scrub`, `mask_email`, `mask_phone`).
 *   - The cart and the theme preference live in the browser's localStorage,
 *     not in a cookie sent to us.
 *
 * ⚠️  NO ANALYTICS OR ADVERTISING TAGS ARE WIRED UP TODAY, and this page says
 * so. If Phase 5 adds any — Google Analytics, a Meta pixel, anything that
 * reports a visitor's behaviour to a third party — the "What we do not do"
 * section below becomes false and must be rewritten in the same change. A
 * privacy policy that describes a previous version of the site is worse than
 * none, because customers rely on it.
 */
export default function PrivacyPage() {
  const { contact, business } = OWNER_SET;

  return (
    <PageShell
      title="Privacy policy"
      intro="What we collect, why, and what we will not do with it."
      updated="2026-09-21"
    >
      <Section heading="What we collect">
        <p>When you place an order we ask for:</p>
        <Bullets
          items={[
            "Your name — so the courier knows who to hand the parcel to.",
            "Your mobile number — couriers call before delivering, and we use it to confirm the address.",
            "Your email address — for the order confirmation and anything we need to tell you about the order.",
            "Your delivery address.",
          ]}
        />
        <p>
          That is the whole list, and each item is there because the order
          cannot be delivered without it. If you create an account, we also
          keep the addresses you save so you do not have to retype them.
        </p>
      </Section>

      <Section heading="Payment information">
        <p>
          For cash on delivery we hold no payment details at all — you pay the
          courier.
        </p>
        <p>
          If you pay online, the card details are entered on the payment
          provider&apos;s own page and never reach our servers. We receive
          confirmation that a payment succeeded and a reference for it. Card
          numbers, CVV codes and similar fields are stripped from anything the
          provider sends us before it is stored, so they cannot end up in our
          database by accident.
        </p>
      </Section>

      <Section heading="What we do with it">
        <Bullets
          items={[
            "Deliver your order, and contact you about it.",
            "Handle returns and refunds.",
            "Keep a record of the sale, which we are required to do for tax and accounting.",
          ]}
        />
        <p>
          We share your name, address and phone number with the courier
          carrying your parcel. That is the only routine sharing we do, and it
          is the minimum the delivery needs.
        </p>
      </Section>

      <Section heading="What we do not do">
        <Bullets
          items={[
            "We do not sell, rent or trade your details to anyone.",
            "We do not run advertising or analytics trackers on this site. There is no Google Analytics tag, no Meta pixel, and no third-party script watching what you browse.",
            "We do not email you marketing you did not ask for.",
          ]}
        />
      </Section>

      <Section heading="Cookies and what is stored in your browser">
        <p>
          Your cart and your light/dark preference are kept in your own
          browser&apos;s storage. They stay on your device and are not sent to
          us — your cart only reaches our server at the moment you place the
          order.
        </p>
        <p>
          If you sign in, a session cookie keeps you signed in. That is
          necessary for the account area to work and is not used for tracking.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Order records are kept for as long as we are required to keep
          business records, and because a refund or a warranty question can
          arrive long after a sale. Account details are kept until you ask us
          to delete the account.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          Email{" "}
          <a href={`mailto:${contact.email}`}>{contact.email}</a> to ask for a
          copy of what we hold about you, to correct something wrong, or to
          have your account deleted.
        </p>
        <p>
          Deleting an account does not erase the order records attached to it —
          those are accounting records, and removing them would leave the books
          wrong. We will tell you plainly what was removed and what was kept.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          The site is served over HTTPS. Passwords are stored hashed, not as
          text. Our internal logs mask email addresses and phone numbers so a
          log file is not a second copy of the customer list.
        </p>
        <p>
          No system is perfect. If we ever discover a breach affecting your
          information, we will tell you what happened rather than hope you do
          not find out.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about this policy:{" "}
          <a href={`mailto:${contact.email}`}>{contact.email}</a>.
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
        <p className="text-sm">
          See also our <Link href="/terms">terms of service</Link>.
        </p>
      </Section>
    </PageShell>
  );
}
