import type { Metadata } from "next";
import Link from "next/link";

import { PageShell, Section } from "@/components/page-shell";
import { OWNER_SET } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description: `${SITE.name} imports and delivers sports nutrition across Pakistan, with cash on delivery nationwide.`,
  alternates: { canonical: "/about" },
};

/**
 * Deliberately modest.
 *
 * No "100% original, lab tested, authorised distributor" — those are claims
 * with legal weight, and a supplement shop that makes one it cannot evidence
 * is the first thing a competitor reports. What is here is what is true:
 * where we ship from, how we sell, and what we will not do.
 */
export default function AboutPage() {
  return (
    <PageShell
      title="About us"
      intro={`${SITE.name} sells imported sports nutrition to people training in Pakistan.`}
    >
      <Section heading="What we do">
        <p>
          We stock protein, creatine, pre-workout and the rest of the things
          people actually use — from brands that are recognised rather than
          invented for a marketplace listing. Orders go out from{" "}
          {OWNER_SET.business.city} to anywhere in Pakistan, and you can pay
          the courier when it arrives.
        </p>
        <p>
          We have been trading since {OWNER_SET.tradingSince}.
        </p>
      </Section>

      <Section heading="How we price">
        <p>
          The price on the product page is the price you pay. Delivery is
          calculated at checkout and shown before you commit, and nothing is
          added after that.
        </p>
        <p>
          When something is on sale, the crossed-out price is a price the
          product was genuinely sold at. We do not inflate a &ldquo;was&rdquo;
          figure to manufacture a discount, and the site will not display one:
          a reduction that is not a reduction is suppressed before it reaches
          the page.
        </p>
      </Section>

      <Section heading="What we will not do">
        <p>
          We will not tell you a supplement treats, prevents or cures anything.
          It does not. Protein powder is food, creatine is a well-studied
          training aid, and neither is medicine.
        </p>
        <p>
          We do not run countdown timers, invent &ldquo;only 2 left&rdquo;
          warnings, or publish reviews we wrote ourselves. When a stock warning
          appears on a product page it is the real number, straight from
          inventory.
        </p>
      </Section>

      <Section heading="Questions">
        <p>
          Email{" "}
          <a href={`mailto:${OWNER_SET.contact.email}`}>
            {OWNER_SET.contact.email}
          </a>
          , or see the <Link href="/faq">FAQ</Link>. If you want to know
          whether something suits your training, ask — we would rather talk you
          out of a purchase than have it returned.
        </p>
      </Section>
    </PageShell>
  );
}
