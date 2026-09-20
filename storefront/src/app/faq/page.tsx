import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { getSettings } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { OWNER_SET } from "@/lib/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Common questions about ordering from ${SITE.name} — delivery, payment, returns and product authenticity.`,
  alternates: { canonical: "/faq" },
};

/**
 * Answers are plain text on purpose.
 *
 * They are rendered twice: once as the visible page, and once inside FAQPage
 * structured data. Google requires the two to match — markup carrying an
 * answer the page does not show is a manual-action risk — so keeping them as
 * strings makes it impossible for them to drift.
 */
export default async function FaqPage() {
  const settings = await getSettings();
  const threshold = formatMoney(settings.shipping.free_over);
  const fee = formatMoney(settings.shipping.standard_fee);
  const freeWording =
    settings.shipping.comparison === "greater_than"
      ? `over ${threshold}`
      : `of ${threshold} or more`;

  const { majorCities, elsewhere } = OWNER_SET.deliveryDays;

  const faqs: { question: string; answer: string }[] = [
    {
      question: "How do I pay?",
      answer:
        "Cash on delivery — you pay the courier when your order arrives. Please keep the exact amount ready, as couriers often cannot give change.",
    },
    {
      question: "How much is delivery?",
      answer: `Delivery is free on orders ${freeWording}, and ${fee} below that. The exact charge is shown at checkout before you place your order.`,
    },
    {
      question: "How long will my order take?",
      answer: `Usually ${majorCities.min}–${majorCities.max} working days to ${majorCities.examples}, and ${elsewhere.min}–${elsewhere.max} working days to ${elsewhere.examples}. These are estimates — courier networks slow down around Eid and public holidays.`,
    },
    {
      question: "Do you deliver to my city?",
      answer:
        "We deliver across Pakistan. If your area is hard to reach, we will call you to arrange it rather than sending a parcel that comes back.",
    },
    {
      question: "How do I check where my order is?",
      answer:
        "Use the order tracking page with your order number and the email or mobile number you ordered with. We ask for both so that an order number on its own cannot be used to look up somebody else's details.",
    },
    {
      question: "Can I cancel my order?",
      answer:
        "Yes, if it has not been packed and handed to the courier yet. Contact us with your order number and we will stop it. After dispatch it has to be handled as a return.",
    },
    {
      question: "Can I return a supplement I have opened?",
      answer:
        "No, unless it arrived damaged, expired, or is not what you ordered. Once a tub is opened it cannot be resold, and we will not sell an opened product to somebody else.",
    },
    {
      question: "Do I need an account to order?",
      answer:
        "No. You can order as a guest with just your name, mobile number, email and address.",
    },
    {
      question: "Is the price on the product page what I pay?",
      answer:
        "Yes. The price shown is the price charged, and the total at checkout includes delivery. Nothing is added afterwards.",
    },
    {
      question: "Should I take a supplement if I have a medical condition?",
      answer:
        "Speak to a doctor first. That applies particularly if you are pregnant, nursing, taking prescription medication, or managing a condition such as diabetes or high blood pressure. Supplements support a diet — they do not replace one, and they are not medicine.",
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageShell
        title="Frequently asked questions"
        intro="If your question is not here, email us — a person reads it."
      >
        <dl className="space-y-6">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="border-b border-hairline pb-6 last:border-0"
            >
              <dt className="font-heading text-base font-semibold uppercase tracking-tight">
                {faq.question}
              </dt>
              <dd className="mt-2 leading-relaxed text-ink-soft">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-sm text-ink-soft">
          Still stuck? Email{" "}
          <a href={`mailto:${OWNER_SET.contact.email}`} className="text-brand underline">
            {OWNER_SET.contact.email}
          </a>
          .
        </p>
      </PageShell>
    </>
  );
}
