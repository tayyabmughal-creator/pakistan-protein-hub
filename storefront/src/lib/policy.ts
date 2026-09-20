/**
 * Business facts the code cannot know.
 *
 * ⚠️  EVERY VALUE IN `OWNER_SET` IS A COMMITMENT TO CUSTOMERS.
 *
 * A published returns window, a delivery estimate and a contact address are
 * promises — in Pakistan they are also what a customer will screenshot and
 * send you when you fail to meet them. They are gathered here, rather than
 * scattered through seven pages, so they can be checked in one sitting before
 * launch and corrected in one place afterwards.
 *
 * These are **starting values, not researched facts.** Confirm each one
 * against how the business actually operates before the storefront goes live.
 * See deploy/STOREFRONT_SETUP.md.
 *
 * Anything that *can* be derived is not here:
 *
 *   - shipping threshold and fee  →  GET /api/v2/storefront/settings/
 *   - what a return can be for    →  ReturnRequest.REASON_CHOICES
 *   - who may start a return      →  staff only; there is no customer endpoint
 *
 * Deriving those means the page cannot contradict the system. Restating them
 * here would let the two drift.
 */

/**
 * Typed explicitly rather than inferred.
 *
 * With `as const` alone, a field left empty infers the literal type `""`, so
 * TypeScript narrows it to `never` inside a truthiness check and refuses to
 * compile the branch that renders it. That is backwards: those branches exist
 * precisely so the page works once the value is filled in. Declaring them as
 * `string` keeps the optional-field pattern compiling whether or not anyone
 * has filled it in yet.
 */
interface OwnerSet {
  returnWindowDays: number;
  deliveryDays: {
    majorCities: { min: number; max: number; examples: string };
    elsewhere: { min: number; max: number; examples: string };
  };
  contact: {
    email: string;
    whatsapp: string;
    phone: string;
    hours: string;
  };
  business: {
    legalName: string;
    line1: string;
    city: string;
    country: string;
    taxId: string;
  };
  tradingSince: number;
}

export const OWNER_SET: OwnerSet = {
  /**
   * Days after delivery a customer may raise a return.
   *
   * ⚠️  Nothing in the backend enforces this. `ReturnRequest` has no deadline
   * field and no check against `delivered_at`, so this number is a promise the
   * staff keep by hand. Publishing a window the system does not enforce is
   * fine — publishing one nobody honours is not.
   */
  returnWindowDays: 7,

  /**
   * Delivery estimates, in working days. Shown as a range.
   *
   * ⚠️  Not measured. Replace with what the courier actually achieves — an
   * optimistic estimate generates support messages on day three.
   */
  deliveryDays: {
    majorCities: { min: 2, max: 3, examples: "Lahore, Karachi, Islamabad, Rawalpindi" },
    elsewhere: { min: 3, max: 5, examples: "other cities and towns" },
  },

  /** ⚠️  Confirm these reach a human who answers. */
  contact: {
    email: "support@paknutrition.com",
    /** Empty hides the WhatsApp row entirely rather than linking nowhere. */
    whatsapp: "",
    phone: "",
    hours: "Monday to Saturday, 11am to 7pm",
  },

  /**
   * ⚠️  A registered business address, if you have one.
   *
   * Left deliberately incomplete: a fabricated address on a terms page is
   * worse than no address. The pages omit the block entirely when `line1` is
   * empty rather than printing a placeholder.
   */
  business: {
    legalName: "Pak Nutrition",
    line1: "",
    city: "Lahore",
    country: "Pakistan",
    /** NTN / STRN, if registered. Shown on the terms page when present. */
    taxId: "",
  },

  /** ⚠️  Roughly when the shop started trading. Used on the about page. */
  tradingSince: 2023,
};

/** A return may be raised for any of these — mirrors ReturnRequest.REASON_CHOICES. */
export const RETURN_REASONS = [
  "Arrived damaged",
  "Wrong item sent",
  "Not as described",
  "Expired or near expiry",
  "Changed your mind",
] as const;

/**
 * True when a policy page has enough real information to publish.
 *
 * Used to hide a section rather than print an empty field. A contact page
 * listing a blank phone number tells a customer the shop is abandoned.
 */
export const hasContactChannel =
  Boolean(OWNER_SET.contact.email) ||
  Boolean(OWNER_SET.contact.whatsapp) ||
  Boolean(OWNER_SET.contact.phone);

export const hasBusinessAddress = Boolean(OWNER_SET.business.line1);
