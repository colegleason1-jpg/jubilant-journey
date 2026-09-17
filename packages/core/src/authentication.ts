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
 * Customer-facing process copy, generated from what the operation actually does.
 *
 * ── The rule: describe what we do TO the watch, never where it came from ────────
 * An earlier version of this listed "sourced from roughly 2,400 listings screened
 * each month across 40 tracked references". That is true, and it is exactly the
 * sentence no retailer writes, because it explains the business model to the
 * customer. Nobody advertises their acquisition funnel.
 *
 * Everything below is about inspection, documentation, pricing discipline, packaging
 * and service — the things a serious dealer talks about. The sourcing engine stays
 * internal where it belongs.
 */
export interface UnitFacts {
  orderValueUsd: number;
  /** Direct-ship means the watch never passes through our hands. */
  fulfilmentRoute: 'VIA_OPERATOR' | 'DIRECT_TO_CUSTOMER';
  thirdPartyAuthenticated: boolean;
  /** How many photographs WE actually took. Zero on a direct ship. */
  photosTaken: number;
  serialLogged: boolean;
  intakeVideoRecorded: boolean;
  conditionReportIncluded: boolean;
  insuredSignatureShipping: boolean;
  /** null means no returns offered. */
  returnWindowDays: number | null;
  compWindowDays: number;
}

/**
 * Order value at or above which we run the full intake SOP — photographs, serial
 * log, condition report, packing video. Below it the handling budget is minutes, not
 * half an hour, and the copy must not promise otherwise.
 */
export const FULL_SERVICE_THRESHOLD_USD = 500;

export const DEFAULT_UNIT: UnitFacts = {
  orderValueUsd: 1035,
  fulfilmentRoute: 'VIA_OPERATOR',
  thirdPartyAuthenticated: false,
  photosTaken: 20,
  serialLogged: true,
  intakeVideoRecorded: true,
  conditionReportIncluded: true,
  insuredSignatureShipping: true,
  returnWindowDays: null,
  compWindowDays: 90,
};

/**
 * Claims true of THIS unit — not a static block.
 *
 * Two facts silently invalidate most of the list, so they are enforced rather than
 * remembered:
 *
 *   • DIRECT SHIP. The watch never reaches us, so we cannot have photographed it,
 *     logged its serial, or filmed the packing. Claiming any of that would be false
 *     on exactly the orders where we have the least visibility.
 *   • BELOW THE FULL-SERVICE THRESHOLD. A $60 watch gets minutes of handling, not a
 *     20-shot session under controlled lighting.
 */
export function positioningClaims(unit: UnitFacts = DEFAULT_UNIT): string[] {
  const claims: string[] = [];
  const inHand = unit.fulfilmentRoute === 'VIA_OPERATOR';
  const fullService = unit.orderValueUsd >= FULL_SERVICE_THRESHOLD_USD;

  if (unit.thirdPartyAuthenticated) {
    claims.push(
      'Authenticated by a third-party specialist through a multi-point physical ' +
        'inspection, and supplied with their certification.',
    );
  }
  if (inHand && unit.serialLogged) {
    claims.push(
      'Serial number recorded and matched at dispatch, so the watch you receive is ' +
        'provably the watch we documented.',
    );
  }
  if (inHand && fullService && unit.photosTaken >= 10) {
    claims.push(
      `${unit.photosTaken} photographs taken in hand under controlled lighting — ` +
        'including every flaw, photographed deliberately rather than avoided.',
    );
  } else if (inHand && unit.photosTaken > 0) {
    claims.push(`Photographed in hand before dispatch — ${unit.photosTaken} images.`);
  }
  if (inHand && fullService && unit.conditionReportIncluded) {
    claims.push(
      'A written condition report covering dial, case, bracelet, crystal and ' +
        'timekeeping, assessed to the same standard on every watch.',
    );
  }
  claims.push(
    `Priced against ${unit.compWindowDays} days of verified market data, so the ` +
      'number in front of you is defensible.',
  );
  if (inHand && fullService && unit.intakeVideoRecorded) {
    claims.push(
      'Unboxing and packing recorded end to end, and retained against your order.',
    );
  }
  if (unit.insuredSignatureShipping) {
    claims.push('Dispatched fully insured, signature required, in unbranded packaging.');
  }
  if (unit.returnWindowDays !== null) {
    claims.push(
      `${unit.returnWindowDays}-day returns, no questions asked, from a named ` +
        'business with a phone number that reaches a person.',
    );
  } else {
    // With no return window the trust burden moves entirely onto disclosure, so say
    // that plainly rather than leaving a silence where the guarantee used to be.
    claims.push(
      'Every watch is described exactly as it is, flaws included — so there are no ' +
        'surprises to return. Questions before you buy reach a named person.',
    );
  }

  return claims;
}

/**
 * How defensible is this unit's story?
 *
 * A direct-shipped, sub-threshold, no-returns order has almost nothing true to say
 * about it, and that is where conversion and disputes both go wrong. The warning is
 * a signal about the configuration, not about the copy.
 */
export function positioningStrength(unit: UnitFacts = DEFAULT_UNIT): {
  claimCount: number;
  thin: boolean;
  warnings: string[];
} {
  const claims = positioningClaims(unit);
  const warnings: string[] = [];

  if (unit.fulfilmentRoute === 'DIRECT_TO_CUSTOMER') {
    warnings.push(
      'direct ship: no photos, no serial log, no packing video — the three things ' +
        'that win an "item not as described" dispute (docs/13)',
    );
  }
  if (unit.orderValueUsd < FULL_SERVICE_THRESHOLD_USD) {
    warnings.push(
      `below the $${FULL_SERVICE_THRESHOLD_USD} full-service threshold: light intake, ` +
        'so the copy stays light too',
    );
  }
  if (unit.returnWindowDays === null && unit.orderValueUsd >= 1000) {
    warnings.push(
      'no returns on a four-figure order: a customer who cannot return files a ' +
        'chargeback instead, and a dispute costs more than a return',
    );
  }

  return { claimCount: claims.length, thin: claims.length <= 3, warnings };
}

export function positioningBlock(unit: UnitFacts = DEFAULT_UNIT): string {
  return positioningClaims(unit)
    .map((c) => `• ${c}`)
    .join('\n');
}

/**
 * Copy that explains the business model to the customer.
 *
 * Distinct from findProhibitedClaims(): nothing here is dishonest, it is simply
 * commercially foolish. Describing the acquisition funnel invites the obvious
 * question — "so why don't I just buy it there?" — and no retailer answers it
 * voluntarily.
 *
 * Note that "eBay" alone is NOT flagged: citing eBay's Authenticity Guarantee is a
 * genuine trust asset. What gets flagged is language about ACQUISITION.
 */
const SOURCING_DISCLOSURE_PATTERNS: readonly RegExp[] = [
  /\barbitrage\b/i,
  /\bwe\s+(?:source|buy|purchase|acquire|find|scan|search)\s+(?:them|these|it|our|from|across)\b/i,
  /\bsourced\s+from\b/i,
  /\blistings?\s+(?:screened|scanned|reviewed|monitored)\b/i,
  /\b(?:screened?|scan(?:ned)?|monitor(?:ed)?)\s+[\d,]+\s+listings?\b/i,
  /\bmarketplace\s+listings?\b/i,
  /\bbought\s+(?:on|from)\s+(?:ebay|chrono24|another\s+(?:site|marketplace))\b/i,
  /\bresell(?:er|ing)?\b/i,
  /\bdrop[-\s]?ship/i,
  /\btracked\s+references\b/i,
];

/**
 * Check copy for anything that explains where the watch came from.
 *
 * Run this alongside findProhibitedClaims() in the listing generator. One catches
 * claims that are untrue; this one catches claims that are true and should stay
 * internal.
 */
export function findSourcingDisclosures(copy: string): string[] {
  return SOURCING_DISCLOSURE_PATTERNS.filter((re) => re.test(copy)).map(
    (re) => `reveals the acquisition model: ${re}`,
  );
}

/** Both guards in one call, for the listing generator. */
export function reviewCustomerCopy(copy: string): {
  ok: boolean;
  untrueClaims: string[];
  sourcingDisclosures: string[];
} {
  const untrueClaims = findProhibitedClaims(copy);
  const sourcingDisclosures = findSourcingDisclosures(copy);
  return {
    ok: untrueClaims.length === 0 && sourcingDisclosures.length === 0,
    untrueClaims,
    sourcingDisclosures,
  };
}

// ──────────────────── listing price, with the authentication toggle ─────────────

/**
 * How authentication appears on a listing.
 *
 * Two regimes, split at the point where eBay stops charging us:
 *
 *   BELOW $2,000 source — the certificate is a paid option. The displayed price does
 *   NOT include it, so we stay price-competitive on the number buyers compare. A
 *   toggle at checkout adds it, and the customer's election reaches us before we buy,
 *   which is what lets us elect eBay's add-on at their checkout (see above).
 *
 *   $2,000 AND ABOVE — eBay's programme is automatic and free to us, so it is
 *   included, stated affirmatively, and not charged for.
 */
export interface ListingPrice {
  displayPriceUsd: number;
  authenticationIncluded: boolean;
  authenticationOptional: boolean;
  authenticationUsd: number;
  totalIfToggledUsd: number;
  /** The provenance line shown on every listing in this regime. */
  disclosure: string;
  /** Label for the checkout toggle. Empty when authentication is included. */
  toggleLabel: string;
}

export function buildListingPrice(
  displayPriceUsd: number,
  sourcePriceUsd: number,
  config: AuthenticationConfig = DEFAULT_AUTHENTICATION,
): ListingPrice {
  const includedFree = sourcePriceUsd >= config.ebayFreeThresholdUsd;

  if (includedFree) {
    return {
      displayPriceUsd,
      authenticationIncluded: true,
      authenticationOptional: false,
      authenticationUsd: 0,
      totalIfToggledUsd: displayPriceUsd,
      disclosure:
        'Third-party authenticated. This watch is inspected by a professional ' +
        'authenticator before it reaches you, and ships with their certification — ' +
        'included at no charge.',
      toggleLabel: '',
    };
  }

  return {
    displayPriceUsd,
    authenticationIncluded: false,
    authenticationOptional: true,
    authenticationUsd: config.upsellPriceUsd,
    totalIfToggledUsd: displayPriceUsd + config.upsellPriceUsd,
    // Honest about what we did and didn't do. It also sells the toggle, because it
    // names the gap it closes.
    disclosure:
      'Acquired from an established seller with verified transaction history, and ' +
      'inspected by us on arrival. This watch has not been independently ' +
      'authenticated — you can add third-party authentication below.',
    toggleLabel:
      `Add third-party authentication — $${config.upsellPriceUsd}. Inspected by an ` +
      'independent professional authenticator before dispatch, and supplied with ' +
      'their certificate.',
  };
}

/**
 * Wording for the people who do the authenticating.
 *
 * "Our third-party staff" reads as a contradiction — staff are employees, third
 * parties are not — and the ambiguity is the only thing anyone could object to. The
 * fix costs nothing: name them as what they are, which is also the stronger claim,
 * because "independent" is precisely the thing a customer is paying for.
 */
export const AUTHENTICATOR_PHRASINGS = {
  good: [
    'the independent authenticator we use',
    'an independent third-party authenticator',
    'the third-party specialists we work with',
    'a professional authentication service',
  ],
  avoid: [
    'our third-party staff — staff implies employees, which undercuts "independent"',
    'our authenticators — implies in-house capability we do not have',
  ],
} as const;
