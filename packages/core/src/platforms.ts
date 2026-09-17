/**
 * Sourcing platforms: what each one gives you for free.
 *
 * Two things decide whether a platform is worth sourcing from, and they are not the
 * same thing:
 *
 *   1. AUTHENTICATION — will a third party physically verify the watch before it
 *      reaches us, at no cost to us?
 *   2. RECOURSE — if it turns out wrong, can we get our money back without a fight?
 *
 * A platform can be strong on one and useless on the other. Facebook Marketplace has
 * no authentication at all and no protection whatsoever on local pickup. Chrono24 has
 * no per-unit physical authentication on most listings but a free escrow that is
 * arguably better recourse than eBay's.
 *
 * The standout is **Bezel**: in-house authentication on every purchase, free, with
 * insured overnight shipping and no buyer's premium. For a watch-specialist
 * marketplace that is a genuinely different offer.
 *
 * Facebook Marketplace was removed. It had no authentication of any kind, and its
 * Purchase Protection covered only shipped orders under $2,000 paid through Facebook
 * Checkout — excluding local pickup, any payment outside Checkout, and exactly the
 * price band where the money is. Not worth a sourcing lane.
 */

export type PlatformId =
  | 'EBAY'
  | 'CHRONO24'
  | 'BEZEL'
  | 'POSHMARK'
  | 'MERCARI'
  | 'STOCKX';

export interface AuthenticationPolicy {
  /** Physical third-party inspection before it reaches us. */
  physicalInspection: boolean;
  /** Order value at or above which it is free to the buyer. null = never free. */
  freeAboveUsd: number | null;
  /** Cost to elect it below that threshold. null = not available. */
  optInCostUsd: number | null;
  /** A document or tag we can pass to our customer. */
  certificateIssued: boolean;
  notes: string;
}

export interface RecoursePolicy {
  /** Money-back cover on "not as described". */
  notAsDescribedCovered: boolean;
  /** Days to raise it. */
  windowDays: number | null;
  /** Funds held until we accept the watch. Strongest form of recourse. */
  escrow: boolean;
  /** Conditions that void cover entirely. */
  voidedBy: readonly string[];
  notes: string;
}

export interface Platform {
  id: PlatformId;
  label: string;
  /** Can we read live, buyable prices programmatically without breaking terms? */
  livePriceAccess: 'OFFICIAL_API' | 'DEALER_FEED' | 'MANUAL_ONLY' | 'NONE';
  authentication: AuthenticationPolicy;
  recourse: RecoursePolicy;
  /** How much the seller's own condition wording can be relied on, 0..1. */
  conditionReliability: number;
  sellerFeePct: number | null;
}

export const PLATFORMS: Readonly<Record<PlatformId, Platform>> = {
  EBAY: {
    id: 'EBAY',
    label: 'eBay',
    livePriceAccess: 'OFFICIAL_API',
    authentication: {
      physicalInspection: true,
      freeAboveUsd: 2000,
      optInCostUsd: 80,
      certificateIssued: true,
      notes:
        'Authenticity Guarantee: automatic and free at $2,000+, optional $80 buyer ' +
        'add-on from $500. Elected at checkout only — decide before you buy.',
    },
    recourse: {
      notAsDescribedCovered: true,
      windowDays: 30,
      escrow: false,
      voidedBy: [],
      notes:
        'Money Back Guarantee covers counterfeit and not-as-described for 30 days ' +
        "and overrides the seller's own return policy.",
    },
    conditionReliability: 0.6,
    sellerFeePct: 0.135,
  },

  CHRONO24: {
    id: 'CHRONO24',
    label: 'Chrono24',
    livePriceAccess: 'DEALER_FEED',
    authentication: {
      physicalInspection: false,
      freeAboveUsd: null,
      optInCostUsd: 249,
      certificateIssued: true,
      notes:
        'Listings are reviewed by internal watch experts, and private sellers must ' +
        'supply time-set proof-of-ownership photos before publication — but that is ' +
        'listing review, not per-unit physical authentication. "Certified by ' +
        'Chrono24" is $249.',
    },
    recourse: {
      notAsDescribedCovered: true,
      windowDays: 14,
      escrow: true,
      voidedBy: [],
      notes:
        'Trusted Checkout escrow is FREE to the buyer — funds held 14 days after ' +
        'delivery for dealer purchases, 7 for private sellers. Escrow beats a claims ' +
        'process: we inspect before the seller is paid.',
    },
    conditionReliability: 0.75,
    sellerFeePct: 0.065,
  },

  BEZEL: {
    id: 'BEZEL',
    label: 'Bezel',
    livePriceAccess: 'MANUAL_ONLY',
    authentication: {
      physicalInspection: true,
      freeAboveUsd: 0, // free on every purchase
      optInCostUsd: null,
      certificateIssued: true,
      notes:
        'In-house authentication on EVERY purchase, free, by a watch-specialist ' +
        'team. Insured overnight shipping included and no buyer\'s premium. The ' +
        'strongest free authentication of any platform here.',
    },
    recourse: {
      notAsDescribedCovered: true,
      windowDays: null,
      escrow: true,
      voidedBy: [],
      notes: 'Watch is routed through Bezel before it reaches the buyer.',
    },
    conditionReliability: 0.9,
    sellerFeePct: null,
  },

  POSHMARK: {
    id: 'POSHMARK',
    label: 'Poshmark',
    livePriceAccess: 'MANUAL_ONLY',
    authentication: {
      physicalInspection: true,
      freeAboveUsd: 500,
      optInCostUsd: null,
      certificateIssued: true,
      notes:
        'Posh Authenticate is FREE on qualifying items at $500+, with physical ' +
        'inspection taking 1-3 business days. Limited to select luxury brands and ' +
        'categories — confirm the reference qualifies before relying on it.',
    },
    recourse: {
      notAsDescribedCovered: true,
      windowDays: 3,
      escrow: true,
      voidedBy: [],
      notes: 'Order routed through Poshmark for authentication before release.',
    },
    conditionReliability: 0.55,
    sellerFeePct: 0.2,
  },

  MERCARI: {
    id: 'MERCARI',
    label: 'Mercari',
    livePriceAccess: 'MANUAL_ONLY',
    authentication: {
      physicalInspection: false,
      freeAboveUsd: null,
      optInCostUsd: 5,
      certificateIssued: false,
      notes:
        '$5 authentication is PHOTO-BASED, not physical — a third party reviews ' +
        'images of the logo, tag, materials and serial. Watches are explicitly NOT ' +
        'eligible for a certificate, so there is nothing to pass to our customer.',
    },
    recourse: {
      notAsDescribedCovered: true,
      windowDays: 3,
      escrow: true,
      voidedBy: [],
      notes: 'Funds held until the buyer rates the transaction.',
    },
    conditionReliability: 0.45,
    sellerFeePct: 0.1,
  },

  STOCKX: {
    id: 'STOCKX',
    label: 'StockX',
    livePriceAccess: 'MANUAL_ONLY',
    authentication: {
      physicalInspection: true,
      freeAboveUsd: null,
      optInCostUsd: null,
      certificateIssued: true,
      notes:
        'Inspected by master watchmakers for authenticity and condition — but the ' +
        'buyer pays a processing fee on top of the listed price, so it is not free ' +
        'and the true cost is not visible until checkout.',
    },
    recourse: {
      notAsDescribedCovered: true,
      windowDays: null,
      escrow: true,
      voidedBy: [],
      notes: 'Routed through StockX before release.',
    },
    conditionReliability: 0.85,
    sellerFeePct: 0.125,
  },

};

export interface SourcingAssessment {
  platform: Platform;
  /** Third-party physical authentication at no cost to us on this order. */
  freeAuthentication: boolean;
  /** Recourse applies to this order. */
  protected: boolean;
  authenticationCostUsd: number | null;
  /** 0..1 — combines authentication, recourse and condition reliability. */
  confidence: number;
  warnings: string[];
}

/** What this platform gives us on an order of this size. */
export function assessSourcing(
  platformId: PlatformId,
  orderValueUsd: number,
): SourcingAssessment {
  const platform = PLATFORMS[platformId];
  const warnings: string[] = [];
  const { authentication, recourse } = platform;

  const freeAuthentication =
    authentication.physicalInspection &&
    authentication.freeAboveUsd !== null &&
    orderValueUsd >= authentication.freeAboveUsd;

  const authenticationCostUsd = freeAuthentication ? 0 : authentication.optInCostUsd;

  const isProtected = recourse.notAsDescribedCovered;

  if (!authentication.physicalInspection) {
    warnings.push(
      `${platform.label} does not physically authenticate — our own inspection is ` +
        'the only check before it reaches a customer',
    );
  }
  if (!authentication.certificateIssued) {
    warnings.push('no certificate to pass to our customer');
  }
  if (recourse.escrow) {
    warnings.push('escrow: we can inspect before the seller is paid — use that window');
  }

  const confidence =
    0.4 * (freeAuthentication ? 1 : authentication.physicalInspection ? 0.6 : 0) +
    0.35 * (isProtected ? (recourse.escrow ? 1 : 0.7) : 0) +
    0.25 * platform.conditionReliability;

  return {
    platform,
    freeAuthentication,
    protected: isProtected,
    authenticationCostUsd,
    confidence: Math.round(confidence * 1000) / 1000,
    warnings,
  };
}

/** Platforms ranked by how safe an order of this size is, best first. */
export function rankPlatforms(orderValueUsd: number): SourcingAssessment[] {
  return (Object.keys(PLATFORMS) as PlatformId[])
    .map((id) => assessSourcing(id, orderValueUsd))
    .sort((a, b) => b.confidence - a.confidence);
}
