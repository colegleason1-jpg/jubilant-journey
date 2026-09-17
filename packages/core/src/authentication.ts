/**
 * Authentication as a customer-facing paid service.
 *
 * The pitch is honest and it should be: *"Before it ships, we can send this watch to
 * an independent third-party specialist for professional authentication and issue you
 * the certificate."* That is literally what happens. It is a real service, performed
 * by real professionals, on that specific watch.
 *
 * You are also under no obligation to disclose where you source from. Retailers don't
 * publish their suppliers. That part is ordinary commercial practice.
 *
 * ── Why this cannot use eBay's certificate ──────────────────────────────────────
 * Two hard mechanical problems, both verified:
 *
 *   1. TIMING. eBay's Authenticity Guarantee add-on "is only available at checkout
 *      during purchase — it cannot be added after the purchase has been completed."
 *      So the election happens when WE buy on eBay, which is before our customer has
 *      been asked. "Ask them before we ship" is structurally impossible with it.
 *
 *   2. BRANDING. An AG item arrives with an eBay-branded card or tag from eBay's
 *      authenticator. Handing that to the customer discloses the sourcing anyway,
 *      which defeats the point of the exercise.
 *
 * An INDEPENDENT authenticator solves both: we send it after the watch is in hand, on
 * our timetable, and the certificate is neutral.
 *
 * ── The three ways to do it ─────────────────────────────────────────────────────
 *
 *   EBAY_AG_ELECTED   $80, decided at OUR checkout so we can elect it at eBay's.
 *                     Only in the $500–$1,999.99 source band. eBay-branded tag.
 *   EBAY_AG_FREE      $0. Automatic above a $2,000 source price. Also eBay-branded,
 *                     but free — so give it away and say so loudly.
 *   INDEPENDENT       $50–$250 depending on the service. Post-receipt, any price
 *                     point, neutral certificate, our timetable. ← the one that
 *                     matches the pitch.
 */

export type AuthenticationMethod = 'NONE' | 'EBAY_AG_ELECTED' | 'EBAY_AG_FREE' | 'INDEPENDENT';

export interface AuthenticationConfig {
  /** eBay's buyer-elected add-on, $500–$1,999.99 source price. */
  ebayAddonUsd: number;
  /** Source price at or above which eBay's programme is automatic and free. */
  ebayFreeThresholdUsd: number;
  /** Source price below which eBay does not offer it at all. */
  ebayMinimumUsd: number;
  /** What an independent authenticator charges us, round trip. */
  independentCostUsd: number;
  /** Insured shipping to and from the authenticator. */
  independentShippingUsd: number;
  /** What we charge the customer for the service. */
  upsellPriceUsd: number;
  /** Below this order value we don't offer it — the fee dwarfs the watch. */
  offerAboveOrderValueUsd: number;
  /**
   * Include it free above this order value instead of charging.
   * eBay's programme is free to us there, so "free authentication over $2,000"
   * is a conversion asset that costs nothing. See shouldOfferAuthentication().
   */
  includeFreeAboveOrderValueUsd: number;
  /** Extra calendar days the authentication leg adds. */
  independentTurnaroundDays: number;
}

export const DEFAULT_AUTHENTICATION: AuthenticationConfig = {
  ebayAddonUsd: 80,
  ebayFreeThresholdUsd: 2000,
  ebayMinimumUsd: 500,
  // Independent services run $50–$300; Chrono24's own certification is $249 with
  // insured shipping included. $120 is a realistic mid-market round trip.
  independentCostUsd: 120,
  independentShippingUsd: 35,
  upsellPriceUsd: 179,
  offerAboveOrderValueUsd: 500,
  includeFreeAboveOrderValueUsd: 2500,
  independentTurnaroundDays: 5,
};

export function authenticationCostFor(
  method: AuthenticationMethod,
  sourcePriceUsd: number,
  config: AuthenticationConfig = DEFAULT_AUTHENTICATION,
): number {
  switch (method) {
    case 'EBAY_AG_ELECTED':
      return sourcePriceUsd >= config.ebayMinimumUsd &&
        sourcePriceUsd < config.ebayFreeThresholdUsd
        ? config.ebayAddonUsd
        : 0;
    case 'EBAY_AG_FREE':
      return 0;
    case 'INDEPENDENT':
      return config.independentCostUsd + config.independentShippingUsd;
    default:
      return 0;
  }
}

export interface AuthenticationOffer {
  /** Do we put this in front of the customer at all? */
  offer: boolean;
  /** Charge for it, or include it free as a differentiator? */
  includedFree: boolean;
  priceToCustomerUsd: number;
  method: AuthenticationMethod;
  costToUsUsd: number;
  /** Revenue minus cost. Negative when we include it free — that is the point. */
  netContributionUsd: number;
  addedDays: number;
  /** Customer-facing copy. Accurate, scoped, and it names who actually does it. */
  customerCopy: string;
  /** Notes for you, not the customer. */
  operatorNotes: string[];
}

/**
 * Decide what to offer on a given order.
 *
 * Three bands, and the logic is mostly about not being greedy in the one place where
 * generosity is obviously worth more than the fee.
 */
export function authenticationOffer(
  orderValueUsd: number,
  sourcePriceUsd: number,
  config: AuthenticationConfig = DEFAULT_AUTHENTICATION,
): AuthenticationOffer {
  const notes: string[] = [];

  if (orderValueUsd < config.offerAboveOrderValueUsd) {
    return {
      offer: false,
      includedFree: false,
      priceToCustomerUsd: 0,
      method: 'NONE',
      costToUsUsd: 0,
      netContributionUsd: 0,
      addedDays: 0,
      customerCopy: '',
      operatorNotes: [
        `order $${orderValueUsd} is below the $${config.offerAboveOrderValueUsd} ` +
          `threshold — the fee would be a large fraction of the watch`,
      ],
    };
  }

  // High value: eBay's programme is free to us here, so charging for it is the wrong
  // trade. "Free third-party authentication on every watch over $2,500" converts
  // better than the fee earns, and it costs nothing.
  if (orderValueUsd >= config.includeFreeAboveOrderValueUsd) {
    notes.push(
      'eBay Authenticity Guarantee is automatic and free above a $2,000 source ' +
        'price — include it, advertise it, do not charge for it',
    );
    notes.push(
      'the certificate and tag are eBay-branded; use an independent authenticator ' +
        'instead if you want a neutral certificate',
    );
    return {
      offer: true,
      includedFree: true,
      priceToCustomerUsd: 0,
      method: 'EBAY_AG_FREE',
      costToUsUsd: 0,
      netContributionUsd: 0,
      addedDays: 2,
      customerCopy:
        'Independently authenticated at no charge. Every watch we sell at this level ' +
        'is inspected by a professional third-party authenticator before it reaches ' +
        'you, and ships with their certification.',
      operatorNotes: notes,
    };
  }

  // The upsell band. Independent, because eBay's add-on cannot be elected after we
  // have already bought — and its tag would disclose sourcing.
  const cost = authenticationCostFor('INDEPENDENT', sourcePriceUsd, config);
  notes.push(
    'use an INDEPENDENT authenticator: eBay\'s add-on is checkout-only (cannot be ' +
      'added after purchase) and its tag is eBay-branded',
  );
  notes.push(`adds ~${config.independentTurnaroundDays} days — disclose that up front`);
  if (sourcePriceUsd >= config.ebayMinimumUsd && sourcePriceUsd < config.ebayFreeThresholdUsd) {
    notes.push(
      `cheaper alternative: elect eBay's $${config.ebayAddonUsd} add-on at purchase ` +
        `IF the customer opted in before you bought, and you accept the eBay-branded tag`,
    );
  }

  return {
    offer: true,
    includedFree: false,
    priceToCustomerUsd: config.upsellPriceUsd,
    method: 'INDEPENDENT',
    costToUsUsd: cost,
    netContributionUsd: Math.round((config.upsellPriceUsd - cost) * 100) / 100,
    addedDays: config.independentTurnaroundDays,
    customerCopy:
      `Add independent authentication — $${config.upsellPriceUsd}. Before we ship, we ` +
      `send this specific watch to an independent third-party specialist for a ` +
      `professional multi-point authentication, and you receive their signed ` +
      `certificate with the watch. Adds about ${config.independentTurnaroundDays} ` +
      `business days.`,
    operatorNotes: notes,
  };
}

/**
 * ── Keeping the claim honest ────────────────────────────────────────────────────
 *
 * The pitch is true, so there is nothing to soften. These are the four ways a true
 * pitch turns into a false one, and they are all avoidable:
 *
 *   1. SELL IT, THEN DO IT. Every single time, no exceptions. Charging for a service
 *      you skip on a quiet week is fraud, not a shortcut.
 *   2. SCOPE THE CLAIM. Authentication says "genuine". It does not say "mint", does
 *      not grade condition, and is not a valuation. Sell exactly that.
 *   3. NAME WHO DID IT. "An independent third-party specialist" is fine. "Certified
 *      by Gleason Timepiece" is not, unless you are the one holding the credential.
 *   4. STATE THE DELAY BEFORE THEY PAY. It adds ~5 days. A customer who learns that
 *      after checkout files a chargeback; one who agreed to it up front does not.
 *
 * Not disclosing your supplier is fine and normal. Misdescribing the service is not.
 * You already had this right — this list is just the version that survives contact
 * with a bad week.
 */
export const AUTHENTICATION_INTEGRITY_RULES = [
  'Sell it, then actually do it — every time',
  'Authenticity only: not condition, not grade, not valuation',
  'Name the third party, never imply we authenticated it ourselves',
  'Disclose the added days before they pay, not after',
] as const;

// ──────────────────── what we may actually claim, and why ───────────────────────

/**
 * Where a claim of authenticity comes from. Each one licences DIFFERENT wording, and
 * the wording is generated from the fact rather than chosen freely — because the
 * temptation to upgrade the claim is strongest exactly when the margin is thinnest.
 */
export type CertificateKind =
  /** Our own inspection. Real work, our opinion, our name on it. */
  | 'OPERATOR_INSPECTION'
  /** The watch genuinely passed through eBay's authenticator. */
  | 'EBAY_AUTHENTICITY_GUARANTEE'
  /** We paid an independent specialist to examine this specific watch. */
  | 'INDEPENDENT_THIRD_PARTY';

export interface ProvenanceFacts {
  /** We physically inspected it, logged the serial, photographed it. */
  operatorInspected: boolean;
  /** This unit actually went through eBay's Authenticity Guarantee. */
  passedEbayAuthenticityGuarantee: boolean;
  /** We actually sent it to, and got a certificate back from, an independent service. */
  independentlyAuthenticated: boolean;
  independentAuthenticatorName?: string;
  serialLogged: boolean;
}

export interface ProvenanceStatement {
  kinds: CertificateKind[];
  /** Copy that is true given the facts. Safe to publish verbatim. */
  customerCopy: string;
  /** What this specifically does NOT establish. Say it; it prevents disputes. */
  limitations: string[];
  /** Claims the facts do not support. Never publish these. */
  mustNotClaim: string[];
}

/**
 * Generate the strongest claim the facts actually support — and enumerate the ones
 * they don't.
 *
 * ── The claim to never make ─────────────────────────────────────────────────────
 * "We work with eBay's authentication staff."
 *
 * Buying an item that passed through eBay's authenticator does not create a
 * relationship with eBay's authenticators. There is no such arrangement to describe,
 * so the sentence is false, and saying it to justify a fee is a misrepresentation
 * you are charging for. Three concrete consequences, in order of how fast they
 * arrive:
 *
 *   • A disputed order where the customer quotes that claim is a chargeback you lose
 *     automatically. Misdescription is the one dispute category with no defence.
 *   • Claiming an affiliation with eBay's programme is grounds for eBay to close the
 *     buying account — which is the entire business (docs/10 risk #1).
 *   • In a market where reputation IS the moat, it lives forever as a forum
 *     screenshot.
 *
 * The honest version gets you most of the same value:
 *   • On a watch sourced at $2,000+, it DID go through eBay's authenticator. Say so
 *     plainly — that is a true, strong, free claim.
 *   • Below that, your own inspection report is real work and a genuine
 *     differentiator over a random eBay seller. Put your name on it.
 *   • If the customer wants independent verification, sell them the real thing.
 */
export function provenanceStatement(facts: ProvenanceFacts): ProvenanceStatement {
  const kinds: CertificateKind[] = [];
  const parts: string[] = [];
  const limitations: string[] = [];
  const mustNotClaim: string[] = [];

  if (facts.independentlyAuthenticated) {
    kinds.push('INDEPENDENT_THIRD_PARTY');
    const who = facts.independentAuthenticatorName ?? 'an independent specialist';
    parts.push(
      `This watch was examined by ${who}, an independent third-party authenticator, ` +
        `and ships with their certificate.`,
    );
  } else {
    mustNotClaim.push(
      'any claim of independent third-party authentication — we did not obtain one',
    );
  }

  if (facts.passedEbayAuthenticityGuarantee) {
    kinds.push('EBAY_AUTHENTICITY_GUARANTEE');
    parts.push(
      `It was verified through eBay's Authenticity Guarantee programme by their ` +
        `third-party authenticator, and arrives with that certification.`,
    );
  } else {
    mustNotClaim.push(
      "any reference to eBay's Authenticity Guarantee — this unit did not go through it",
    );
  }

  if (facts.operatorInspected) {
    kinds.push('OPERATOR_INSPECTION');
    parts.push(
      `We inspected it in hand${facts.serialLogged ? ', recorded its serial number,' : ','} ` +
        `and photographed it exactly as you see it.`,
    );
  }

  if (kinds.length === 0) {
    parts.push('Sold as described, with our standard 30-day return policy.');
  }

  // Always false, regardless of the facts. Listed explicitly so the guard below can
  // catch it rather than relying on anyone remembering.
  mustNotClaim.push(
    "any claim of working with, partnering with, or being affiliated with eBay's " +
      'authentication staff — no such relationship exists',
  );

  if (!facts.independentlyAuthenticated && !facts.passedEbayAuthenticityGuarantee) {
    limitations.push(
      'This is our own assessment, not a third-party authentication. ' +
        'Independent authentication is available on request.',
    );
  }
  limitations.push(
    'Authentication confirms the watch is genuine. It is not a condition grade and ' +
      'not a valuation.',
  );

  return { kinds, customerCopy: parts.join(' '), limitations, mustNotClaim };
}

/** Phrases that are false regardless of context. Checked, not merely documented. */
const PROHIBITED_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bwork(?:s|ing)?\s+with\s+ebay\b/i,
  /\bpartner(?:ed|ship)?\s+with\s+ebay\b/i,
  /\bebay\s+authentication\s+staff\b/i,
  /\bin\s+partnership\s+with\s+ebay\b/i,
  /\bebay[-\s]?(?:approved|affiliated|certified)\s+(?:dealer|partner)\b/i,
  /\bour\s+(?:in-house\s+)?authenticators?\b/i,
];

/**
 * Check customer-facing copy before it ships.
 *
 * Wire this into the listing generator so an unsupported claim cannot reach a product
 * page, an email or a certificate template. A rule nobody can forget beats a rule
 * everybody agreed to.
 */
export function findProhibitedClaims(copy: string): string[] {
  return PROHIBITED_CLAIM_PATTERNS.filter((re) => re.test(copy)).map(
    (re) => `matches prohibited claim pattern ${re}`,
  );
}
