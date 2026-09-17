/**
 * Price tiers — the "fluid" cost and margin model.
 *
 * ── Why this file exists ────────────────────────────────────────────────────────
 * An earlier version of this engine used ONE shipping assumption (insured Priority
 * Express, ~$32 floor) and ONE margin floor (12%) at every price point. Both were
 * wrong, and together they produced a fake conclusion: that nothing under ~$800 was
 * tradeable.
 *
 * Reality is fluid in two directions at once:
 *
 *   • COSTS scale with value. A $30 watch ships in a padded envelope for $7.50, not
 *     insured Express for $40. Applying luxury logistics to a cheap watch invents a
 *     loss that does not exist.
 *
 *   • REQUIRED MARGIN % FALLS as value rises, because what actually has to be
 *     covered is an absolute number — your handling time and your risk — not a
 *     percentage. 35% of a $40 watch is $14. 1% of a $10,000 watch is $100. The
 *     second is the better trade, and the percentage says the opposite.
 *
 * So each tier carries its own shipping, packaging, margin floor, MINIMUM ABSOLUTE
 * GROSS, handling time and permitted payment rails. A deal must clear both the
 * percentage and the dollar floor for its tier.
 *
 * ── The rail is what makes the top end work ─────────────────────────────────────
 * Card processing is 2.9% + $0.30 — uncapped. On a $10,000 order that is $290.30,
 * which is three times a 1% gross margin. Stripe ACH Direct Debit is 0.8% CAPPED AT
 * $5 (the cap binds above $625). Same order: $5.
 *
 * Thin high-value margins are not merely allowed by the rail, they are CREATED by
 * it. That is why the top tiers require ACH or wire rather than merely preferring
 * it. It also cuts chargeback exposure, which is the other reason 1% is survivable
 * up there. See docs/12.
 */

export type PaymentRail = 'CARD' | 'ACH' | 'WIRE';

export interface PriceTier {
  label: string;
  /** Inclusive lower bound on ORDER VALUE (what the customer pays). */
  minOrderUsd: number;
  /** Exclusive upper bound. */
  maxOrderUsd: number;
  outboundShippingUsd: number;
  packagingUsd: number;
  /** Percentage floor. Falls as value rises. */
  minMarginPct: number;
  /** Absolute floor. This is what really gates the cheap end. */
  minGrossProfitUsd: number;
  /** Realistic intake + photography + packing time. Drives $/hour. */
  handlingMinutes: number;
  /**
   * Whether the customer pays shipping on top of the list price.
   *
   * At the cheap end this is decisive: $7.50 of postage on a $27 watch is 28% of the
   * sale, and absorbing it makes the tier look unviable when it simply isn't. Buyers
   * expect to pay postage on a cheap item and expect free shipping on an expensive
   * one, so the flag follows the convention rather than fighting it.
   */
  shippingChargedToCustomer: boolean;
  allowedRails: readonly PaymentRail[];
  preferredRail: PaymentRail;
  notes: string;
}

/**
 * Defaults. Every number here is a starting guess to be re-fitted from your own
 * closed sales — that is what `comp_snapshots` and the rejection log are for.
 */
export const PRICE_TIERS: readonly PriceTier[] = [
  {
    label: 'MICRO',
    minOrderUsd: 0,
    maxOrderUsd: 150,
    outboundShippingUsd: 7.5,
    packagingUsd: 1.5,
    minMarginPct: 0.3,
    minGrossProfitUsd: 10,
    handlingMinutes: 8,
    shippingChargedToCustomer: true,
    allowedRails: ['CARD'],
    preferredRail: 'CARD',
    notes:
      'USPS Ground Advantage, tracking + $100 insurance included. No authentication ' +
      'available or needed — a dispute costs less than the shipping. Skip the full ' +
      'intake SOP: 5 photos, no video. Gated on $/hour, not margin.',
  },
  {
    label: 'BUDGET',
    minOrderUsd: 150,
    maxOrderUsd: 400,
    outboundShippingUsd: 11,
    packagingUsd: 3,
    minMarginPct: 0.22,
    minGrossProfitUsd: 35,
    handlingMinutes: 15,
    shippingChargedToCustomer: true,
    allowedRails: ['CARD'],
    preferredRail: 'CARD',
    notes: 'Ground Advantage with added insurance. Signature optional. 10 photos.',
  },
  {
    label: 'ENTRY',
    minOrderUsd: 400,
    maxOrderUsd: 1000,
    outboundShippingUsd: 22,
    packagingUsd: 6,
    minMarginPct: 0.15,
    minGrossProfitUsd: 90,
    handlingMinutes: 30,
    shippingChargedToCustomer: false,
    allowedRails: ['CARD'],
    preferredRail: 'CARD',
    notes:
      'Priority Mail, signature required, insured. Authenticity Guarantee add-on ' +
      'available once the SOURCE price clears $500. Full intake SOP starts here.',
  },
  {
    label: 'CORE',
    minOrderUsd: 1000,
    maxOrderUsd: 2500,
    outboundShippingUsd: 40,
    packagingUsd: 9,
    minMarginPct: 0.12,
    minGrossProfitUsd: 120,
    handlingMinutes: 35,
    shippingChargedToCustomer: false,
    allowedRails: ['CARD', 'ACH'],
    preferredRail: 'CARD',
    notes:
      'Priority Express, adult signature, insured. The bread-and-butter band: ' +
      'deep enough spreads to work, small enough that one bad unit is survivable.',
  },
  {
    label: 'UPPER',
    minOrderUsd: 2500,
    maxOrderUsd: 7500,
    outboundShippingUsd: 55,
    packagingUsd: 12,
    minMarginPct: 0.06,
    minGrossProfitUsd: 300,
    handlingMinutes: 45,
    shippingChargedToCustomer: false,
    allowedRails: ['CARD', 'ACH'],
    preferredRail: 'ACH',
    notes:
      'Authenticity Guarantee is free at $2,000+. Card fees start to bite hard ' +
      '(~$220 on a $7,500 order) — offer an ACH discount and most buyers take it.',
  },
  {
    label: 'HIGH',
    minOrderUsd: 7500,
    maxOrderUsd: 25000,
    outboundShippingUsd: 110,
    packagingUsd: 20,
    minMarginPct: 0.01,
    minGrossProfitUsd: 100,
    handlingMinutes: 60,
    shippingChargedToCustomer: false,
    allowedRails: ['ACH', 'WIRE'],
    preferredRail: 'WIRE',
    notes:
      'Registered Mail or Parcel Pro. CARD IS NOT PERMITTED: 2.9% uncapped would ' +
      'exceed the entire gross margin. 1% of $10,000 is $100 and that is a real ' +
      'profit — it only works because the rail is cheap and hard to reverse.',
  },
  {
    label: 'ULTRA',
    minOrderUsd: 25000,
    maxOrderUsd: Number.POSITIVE_INFINITY,
    outboundShippingUsd: 200,
    packagingUsd: 30,
    minMarginPct: 0.01,
    minGrossProfitUsd: 250,
    handlingMinutes: 90,
    shippingChargedToCustomer: false,
    allowedRails: ['WIRE'],
    preferredRail: 'WIRE',
    notes:
      'Wire only, funds cleared before the watch moves. Parcel Pro or armoured ' +
      'courier. Every unit is a bespoke transaction with a phone call.',
  },
];

export function tierFor(orderValueUsd: number): PriceTier {
  const found = PRICE_TIERS.find(
    (t) => orderValueUsd >= t.minOrderUsd && orderValueUsd < t.maxOrderUsd,
  );
  // Only reachable for negative input; treat as the cheapest tier.
  return found ?? PRICE_TIERS[0]!;
}

/** Processing cost for an order value on a given rail. */
export function processingFeeUsd(
  orderValueUsd: number,
  rail: PaymentRail,
  opts: {
    cardPercent?: number;
    cardFixedUsd?: number;
    radarUsd?: number;
    achPercent?: number;
    achCapUsd?: number;
    wireFeeUsd?: number;
  } = {},
): number {
  const {
    cardPercent = 0.029,
    cardFixedUsd = 0.3,
    radarUsd = 0.07,
    achPercent = 0.008,
    achCapUsd = 5,
    wireFeeUsd = 0,
  } = opts;

  switch (rail) {
    case 'ACH':
      // 0.8%, capped at $5 — the cap binds above $625.
      return Math.min(orderValueUsd * achPercent, achCapUsd);
    case 'WIRE':
      return wireFeeUsd;
    case 'CARD':
    default:
      return orderValueUsd * cardPercent + cardFixedUsd + radarUsd;
  }
}

/**
 * The rail we should actually use: the tier's preference, unless the customer's
 * choice is permitted at this value. Returns null when the requested rail is banned
 * — which is a hard stop, not a warning.
 */
export function resolveRail(
  orderValueUsd: number,
  requested?: PaymentRail,
): PaymentRail | null {
  const tier = tierFor(orderValueUsd);
  if (!requested) return tier.preferredRail;
  return tier.allowedRails.includes(requested) ? requested : null;
}
