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
 * ── Getting eBay's certificate, which is the cheap fast one ─────────────────────
 * eBay's Authenticity Guarantee add-on "is only available at checkout during purchase
 * — it cannot be added after the purchase has been completed."
 *
 * That constraint is satisfied as long as the customer elects the certificate BEFORE
 * we buy, because our eBay purchase IS that checkout. So the option belongs on the
 * product page as a line item, not as a question asked before shipping:
 *
 *     customer orders WITH the certificate option  ──►  we buy on eBay AND elect
 *     the $80 add-on at that checkout  ──►  authenticator inspects  ──►  us  ──►
 *     customer, with the certificate
 *
 * This is strictly better than sending it to an independent service afterwards:
 * $80 instead of ~$155, and no extra round trip because the authenticator already
 * sits in the eBay shipping path.
 *
 * ── When the independent route is still needed ──────────────────────────────────
 * STOCKED inventory (Mode A in docs/12). If we already own the watch, the eBay
 * checkout is behind us and the add-on can never be applied to it. Selling
 * authentication on a watch already in hand means an independent authenticator.
 *
 * ── On the eBay-branded tag ─────────────────────────────────────────────────────
 * An AG item arrives with an eBay-branded card or tag, so this route does reveal
 * that the watch passed through eBay. That is worth having rather than hiding:
 * "verified through eBay's Authenticity Guarantee" is a recognised, trusted marker,
 * and it is a stronger claim to a buyer than an unfamiliar independent service.
 * Choose the independent route when a neutral certificate genuinely matters more.
 *
 * ── The three ways to do it ─────────────────────────────────────────────────────
 *
 *   EBAY_AG_ELECTED   $80. Customer elects on the product page; we elect it at the
 *                     eBay checkout. Source $500–$1,999.99. Cheapest and fastest.
 *   EBAY_AG_FREE      $0. Automatic above a $2,000 source price. Give it away and
 *                     say so loudly.
 *   INDEPENDENT       ~$155 round trip. For STOCKED units, where the eBay checkout
 *                     is already behind us. Neutral certificate, ~5 extra days.
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
 * `sourcedToOrder` is the decisive input. When true (Mode B — we buy after the
 * customer orders, our default) the customer's election reaches us before the eBay
 * checkout, so we can use eBay's $80 add-on. When false (Mode A — stocked) the eBay
 * checkout is already behind us and only an independent authenticator remains.
 */
export function authenticationOffer(
  orderValueUsd: number,
  sourcePriceUsd: number,
  config: AuthenticationConfig = DEFAULT_AUTHENTICATION,
  sourcedToOrder = true,
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

  // The upsell band.
  const ebayEligible =
    sourcedToOrder &&
    sourcePriceUsd >= config.ebayMinimumUsd &&
    sourcePriceUsd < config.ebayFreeThresholdUsd;

  const method: AuthenticationMethod = ebayEligible ? 'EBAY_AG_ELECTED' : 'INDEPENDENT';
  const cost = authenticationCostFor(method, sourcePriceUsd, config);
  const addedDays = ebayEligible ? 3 : config.independentTurnaroundDays;

  if (ebayEligible) {
    notes.push(
      'customer elected it on the product page BEFORE we buy, so we elect the ' +
        `$${config.ebayAddonUsd} add-on at the eBay checkout — this is the cheap fast route`,
    );
    notes.push(
      'certificate and tag are eBay-branded: say "verified through eBay\'s ' +
        'Authenticity Guarantee" — a recognised marker, and true',
    );
  } else if (!sourcedToOrder) {
    notes.push(
      'STOCKED unit: the eBay checkout is behind us, so the add-on can never be ' +
        'applied. Independent authenticator is the only route.',
    );
    notes.push(`adds ~${config.independentTurnaroundDays} days — disclose that up front`);
  } else {
    notes.push(
      `source price $${sourcePriceUsd} is outside eBay's $${config.ebayMinimumUsd}` +
        `–$${config.ebayFreeThresholdUsd} add-on band; independent authenticator instead`,
    );
  }

  const customerCopy = ebayEligible
    ? `Add third-party authentication — $${config.upsellPriceUsd}. This watch will be ` +
      `inspected by a professional third-party authenticator before it reaches you, ` +
      `and ships with their certification. Adds about ${addedDays} business days.`
    : `Add independent authentication — $${config.upsellPriceUsd}. Before we ship, we ` +
      `send this specific watch to an independent third-party specialist for a ` +
      `professional multi-point authentication, and you receive their signed ` +
      `certificate with the watch. Adds about ${addedDays} business days.`;

  return {
    offer: true,
    includedFree: false,
    priceToCustomerUsd: config.upsellPriceUsd,
    method,
    costToUsUsd: cost,
    netContributionUsd: Math.round((config.upsellPriceUsd - cost) * 100) / 100,
    addedDays,
    customerCopy,
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
 * ── What actually has to be true ────────────────────────────────────────────────
 * Per-unit accuracy. Did THIS watch get authenticated, and by whom? That is the
 * claim a customer relies on, the one a dispute turns on, and the only one that can
 * really go wrong. Everything below exists to keep that single fact honest.
 *
 * ── On describing the relationship ──────────────────────────────────────────────
 * When we elect the $80 add-on we are buying eBay's authentication service: money
 * changes hands, their third-party authenticator physically examines that specific
 * watch, and we receive the certification. Saying we use, buy, or pay for eBay's
 * authentication service is accurate, and worth saying.
 *
 * What the guard below blocks is narrower: claims of a STATUS we don't hold —
 * "eBay-approved dealer", "authorised by eBay", "in partnership with eBay", "our
 * in-house authenticators". Those assert a standing relationship or a credential
 * rather than a purchase, and they are the phrases with specific meanings someone
 * could check.
 *
 * The practical case for the specific wording is that it is simply better copy.
 * "This watch was authenticated through eBay's Authenticity Guarantee programme"
 * beats any vaguer version: it names a programme buyers already recognise and trust,
 * it is verifiable, and it survives being quoted back at you.
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

  // Buying a service is not holding a status. Both of these stay off the table
  // regardless of the facts, because they assert a standing relationship or a
  // credential rather than a purchase.
  mustNotClaim.push(
    'any claim of being an approved, authorised, certified or partnered eBay ' +
      'dealer — we are a customer of the service, not a party to the programme',
  );
  mustNotClaim.push(
    'any reference to in-house or our own authenticators — the authentication is ' +
      'performed by a third party, and saying so is the stronger claim anyway',
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

/**
 * Claims of a STATUS we do not hold. These assert a standing relationship or a
 * credential rather than a purchase, and each has a specific meaning someone could
 * check.
 *
 * Note what is deliberately NOT here: using, buying or paying for eBay's
 * authentication service. That is an accurate description of a real transaction and
 * should be said plainly.
 */
const PROHIBITED_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bpartner(?:ed|ship)?\s+with\s+ebay\b/i,
  /\bin\s+partnership\s+with\s+ebay\b/i,
  /\bebay[-\s]?(?:approved|authoris|authoriz|affiliated|certified)\w*\s+(?:dealer|partner|seller|reseller)\b/i,
  /\b(?:authoris|authoriz)ed\s+by\s+ebay\b/i,
  /\bofficial\s+ebay\s+(?:partner|dealer)\b/i,
  /\bour\s+(?:own\s+|in-house\s+)?authenticators?\b/i,
  /\bwe\s+authenticate(?:d)?\s+(?:it|this|each|every)\b/i,
];

/**
 * Accurate ways to describe the arrangement. Kept here so the honest phrasing is as
 * easy to reach for as the vague one.
 */
export const ACCURATE_RELATIONSHIP_PHRASINGS = [
  "This watch was authenticated through eBay's Authenticity Guarantee programme by their third-party authenticator.",
  "We purchase professional third-party authentication through eBay's Authenticity Guarantee service.",
  "We pay for independent authentication on request — this watch was inspected by a professional authenticator before shipping.",
  "Authentication is carried out by a third-party specialist, not by us.",
] as const;

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

// ────────────────────── positioning that is strong AND true ─────────────────────

/**
 * Copy generated from the operation we actually run.
 *
 * Presenting real work in its best light is ordinary business and there is far more
 * room here than most dealers use. The engine screens hundreds of listings against
 * live market data, prices against sold comparables, logs serials, photographs under
 * controlled conditions and ships insured with signature. Every one of those is a
 * genuine process claim — and each is *stronger* than a vague one precisely because
 * it is specific enough to be checked.
 *
 * Nothing here is hedged. It is the operation, described well.
 */
export interface OperationFacts {
  listingsScreenedPerMonth: number;
  referencesTracked: number;
  compWindowDays: number;
  photosPerWatch: number;
  serialLogged: boolean;
  intakeVideoRecorded: boolean;
  thirdPartyAuthenticated: boolean;
  insuredSignatureShipping: boolean;
  returnWindowDays: number;
}

export const DEFAULT_OPERATION: OperationFacts = {
  listingsScreenedPerMonth: 2400,
  referencesTracked: 40,
  compWindowDays: 90,
  photosPerWatch: 20,
  serialLogged: true,
  intakeVideoRecorded: true,
  thirdPartyAuthenticated: false,
  insuredSignatureShipping: true,
  returnWindowDays: 30,
};

/**
 * Process claims, ordered strongest first. Each maps to something in this repo, so
 * every line is defensible if a customer or a forum asks how it works.
 */
export function positioningClaims(
  facts: OperationFacts = DEFAULT_OPERATION,
): string[] {
  const claims: string[] = [];

  if (facts.thirdPartyAuthenticated) {
    claims.push(
      'Authenticated by a third-party specialist through a multi-point physical ' +
        'inspection, and supplied with their certification.',
    );
  }
  if (facts.serialLogged) {
    claims.push(
      'Serial number recorded and matched at dispatch, so the watch you receive is ' +
        'provably the watch we documented.',
    );
  }
  if (facts.photosPerWatch >= 10) {
    claims.push(
      `${facts.photosPerWatch} photographs taken in hand under controlled lighting — ` +
        'including every flaw, photographed deliberately rather than avoided.',
    );
  }
  claims.push(
    `Priced against ${facts.compWindowDays} days of verified sold comparables, not ` +
      'against asking prices.',
  );
  claims.push(
    `Sourced from roughly ${facts.listingsScreenedPerMonth.toLocaleString()} listings ` +
      `screened each month across ${facts.referencesTracked} tracked references — ` +
      'you are seeing the few that cleared every check.',
  );
  if (facts.intakeVideoRecorded) {
    claims.push(
      'Unboxing and packing recorded end to end, and retained against your order.',
    );
  }
  if (facts.insuredSignatureShipping) {
    claims.push('Dispatched fully insured, signature required, in unbranded packaging.');
  }
  claims.push(
    `${facts.returnWindowDays}-day returns, no questions asked, from a named business ` +
      'with a phone number that reaches a person.',
  );

  return claims;
}

/**
 * Every generated claim passes findProhibitedClaims() — specificity and honesty are
 * not in tension here. The specific version is the one that sells.
 */
export function positioningBlock(facts: OperationFacts = DEFAULT_OPERATION): string {
  return positioningClaims(facts)
    .map((c) => `• ${c}`)
    .join('\n');
}
