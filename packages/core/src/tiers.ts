/**
 * Operational profiles — how an order is HANDLED, by value.
 *
 * ── What this file no longer does ───────────────────────────────────────────────
 * It used to declare a margin floor per band (30% down low, 12% in the middle, 1% up
 * high). That was an assumption imposed by hand, not derived from anything, and it
 * rejected genuinely profitable deals: on a $2,600 watch it demanded a 27% discount
 * and $280 of gross, throwing away a real +$46 trade and the customer attached to it.
 *
 * Margin floors are gone. Costs are now a CURVE over value (economics.ts), the only
 * hard floor is positive contribution, and whether a thin deal is worth doing is a
 * capacity question. What remains here is genuinely operational and genuinely
 * stepped, because carriers, packaging and payment rails really do come in discrete
 * products:
 *
 *   • which shipping service and how much ceremony (photos, video, signature)
 *   • how long a unit realistically takes to handle
 *   • whether postage is charged to the buyer or absorbed
 *   • which payment rails are permitted
 *
 * ── The rail is the one that still hard-gates ───────────────────────────────────
 * Card is 2.9% + $0.30 and uncapped: $290 on a $10,000 order. Stripe ACH is 0.8%
 * capped at $5. Above roughly $7,500 a card fee can exceed the entire contribution,
 * so high-value profiles refuse cards outright. That is not a margin policy, it is
 * arithmetic about a fee schedule.
 */

export type PaymentRail = 'CARD' | 'ACH' | 'WIRE';

export interface OperationalProfile {
  label: string;
  /** Inclusive lower bound on ORDER VALUE (what the customer pays). */
  minOrderUsd: number;
  /** Exclusive upper bound. */
  maxOrderUsd: number;
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
export const OPERATIONAL_PROFILES: readonly OperationalProfile[] = [
  {
    label: 'MICRO',
    minOrderUsd: 0,
    maxOrderUsd: 150,
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
    handlingMinutes: 90,
    shippingChargedToCustomer: false,
    allowedRails: ['WIRE'],
    preferredRail: 'WIRE',
    notes:
      'Wire only, funds cleared before the watch moves. Parcel Pro or armoured ' +
      'courier. Every unit is a bespoke transaction with a phone call.',
  },
];

export function operationalProfile(orderValueUsd: number): OperationalProfile {
  const found = OPERATIONAL_PROFILES.find(
    (t) => orderValueUsd >= t.minOrderUsd && orderValueUsd < t.maxOrderUsd,
  );
  // Only reachable for negative input; treat as the lightest profile.
  return found ?? OPERATIONAL_PROFILES[0]!;
}

/** @deprecated Use operationalProfile(). Kept so call sites migrate incrementally. */
export const tierFor = operationalProfile;

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
  const tier = operationalProfile(orderValueUsd);
  if (!requested) return tier.preferredRail;
  return tier.allowedRails.includes(requested) ? requested : null;
}
