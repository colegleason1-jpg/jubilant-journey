/**
 * Order risk scoring — the application-side layer that sits on top of Stripe Radar.
 *
 * Radar handles card-network signals. This handles the things Radar can't know:
 * that we're shipping a $2,000 object to a stranger, and which of our own heuristics
 * say wait.
 *
 * Note what this does NOT try to do: stop "item not as described" chargebacks. Nothing
 * at checkout can. Those are fought with evidence — see docs/06 part 3.
 */

export type RiskDecision = 'ACCEPT' | 'REVIEW' | 'BLOCK';

/** 3DS outcome. `attempt_acknowledged` still carries liability shift — don't block it. */
export type ThreeDSResult =
  | 'authenticated'
  | 'attempt_acknowledged'
  | 'failed'
  | 'not_supported'
  | 'none';

export interface OrderRiskSignals {
  amountUsd: number;
  threeDSResult: ThreeDSResult;
  avsLine1Match: boolean;
  avsZipMatch: boolean;
  cvcMatch: boolean;
  billingCountry: string;
  shippingCountry: string;
  billingZip: string;
  shippingZip: string;
  cardCountry: string;
  ipCountry: string;
  isAnonymousIp: boolean;
  customerAccountAgeDays: number;
  priorSuccessfulOrders: number;
  /** Orders from this email in the last hour. */
  emailVelocity1h: number;
  /** Orders from this IP in the last 24h. */
  ipVelocity24h: number;
  /** Distinct card numbers tried by this email today. */
  cardsPerEmail24h: number;
  /** Shipping ZIP appears on our maintained freight-forwarder list. */
  isKnownReshipperZip: boolean;
  identityVerified: boolean;
}

export interface RiskAssessment {
  score: number; // 0..100, higher = riskier
  decision: RiskDecision;
  reasons: string[];
  /** Set when the order should be held pending Stripe Identity. */
  requiresIdentityVerification: boolean;
}

export interface RiskConfig {
  /** Above this, a new customer must verify identity. */
  identityThresholdUsd: number;
  reviewScore: number;
  blockScore: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  identityThresholdUsd: 1500,
  reviewScore: 35,
  blockScore: 65,
};

interface Rule {
  readonly name: string;
  readonly points: number;
  /** Hard block regardless of total score. */
  readonly fatal?: boolean;
  readonly test: (s: OrderRiskSignals) => boolean;
}

const RULES: readonly Rule[] = [
  // ── Fatal: no liability shift on a high-value physical good ──────────────────
  {
    name: 'NO_3DS_LIABILITY_SHIFT',
    points: 100,
    fatal: true,
    test: (s) =>
      s.threeDSResult !== 'authenticated' && s.threeDSResult !== 'attempt_acknowledged',
  },
  { name: 'CVC_MISMATCH', points: 100, fatal: true, test: (s) => !s.cvcMatch },
  {
    name: 'BILLING_SHIPPING_COUNTRY_MISMATCH',
    points: 100,
    fatal: true,
    test: (s) => s.billingCountry !== s.shippingCountry,
  },
  {
    name: 'CARD_IP_COUNTRY_MISMATCH',
    points: 100,
    fatal: true,
    test: (s) => s.cardCountry !== s.ipCountry,
  },
  { name: 'ANONYMOUS_IP', points: 100, fatal: true, test: (s) => s.isAnonymousIp },
  {
    name: 'CARD_TESTING_PATTERN',
    points: 100,
    fatal: true,
    test: (s) => s.cardsPerEmail24h > 2,
  },

  // ── Scored ───────────────────────────────────────────────────────────────────
  { name: 'AVS_ADDRESS_MISMATCH', points: 25, test: (s) => !s.avsLine1Match },
  { name: 'AVS_ZIP_MISMATCH', points: 30, test: (s) => !s.avsZipMatch },
  {
    name: 'BILLING_SHIPPING_ZIP_MISMATCH',
    points: 20,
    test: (s) => normaliseZip(s.billingZip) !== normaliseZip(s.shippingZip),
  },
  { name: 'KNOWN_RESHIPPER_ZIP', points: 35, test: (s) => s.isKnownReshipperZip },
  {
    name: 'BRAND_NEW_CUSTOMER_HIGH_VALUE',
    points: 20,
    test: (s) => s.priorSuccessfulOrders === 0 && s.amountUsd > 1500,
  },
  {
    name: 'FRESH_ACCOUNT',
    points: 15,
    test: (s) => s.customerAccountAgeDays < 1 && s.amountUsd > 1000,
  },
  { name: 'EMAIL_VELOCITY', points: 25, test: (s) => s.emailVelocity1h > 2 },
  { name: 'IP_VELOCITY', points: 20, test: (s) => s.ipVelocity24h > 3 },
  {
    name: 'ATTEMPT_ONLY_3DS_HIGH_VALUE',
    points: 15,
    test: (s) => s.threeDSResult === 'attempt_acknowledged' && s.amountUsd > 2000,
  },
  {
    name: 'HIGH_VALUE_UNVERIFIED',
    points: 20,
    test: (s) =>
      s.amountUsd > 2500 && !s.identityVerified && s.priorSuccessfulOrders === 0,
  },
];

export function scoreOrder(
  signals: OrderRiskSignals,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): RiskAssessment {
  const fired = RULES.filter((r) => r.test(signals));
  const fatal = fired.filter((r) => r.fatal);
  const reasons = fired.map((r) => r.name);

  const requiresIdentityVerification =
    signals.amountUsd >= config.identityThresholdUsd &&
    signals.priorSuccessfulOrders === 0 &&
    !signals.identityVerified;

  if (fatal.length > 0) {
    return { score: 100, decision: 'BLOCK', reasons, requiresIdentityVerification };
  }

  const score = Math.min(100, fired.reduce((sum, r) => sum + r.points, 0));

  // Established good customers earn a discount — repeat buyers are the whole point.
  const loyaltyDiscount = Math.min(20, signals.priorSuccessfulOrders * 7);
  const adjusted = Math.max(0, score - loyaltyDiscount);

  let decision: RiskDecision = 'ACCEPT';
  if (adjusted >= config.blockScore) decision = 'BLOCK';
  else if (adjusted >= config.reviewScore || requiresIdentityVerification) {
    decision = 'REVIEW';
  }

  return { score: adjusted, decision, reasons, requiresIdentityVerification };
}

function normaliseZip(zip: string): string {
  return zip.trim().split('-')[0]!.toUpperCase();
}
