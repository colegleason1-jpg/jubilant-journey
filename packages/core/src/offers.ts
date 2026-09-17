/**
 * Offer ladder, buy-box solving, and fulfilment routing.
 *
 * ── What "fluid" means here ─────────────────────────────────────────────────────
 * There is no single right buy discount. The required discount NARROWS as value
 * rises, because the absolute dollars get large enough to be worth having:
 *
 *   market $30      buy ≤ 47% of market  →  $10 gross at 30%    (~$78/hour)
 *   market $900     buy ≤ 63% of market  →  $122 gross at 15%
 *   market $2,600   buy ≤ 73% of market  →  $281 gross at 12%
 *   market $10,000  buy ≤ 89% of market  →  $100 gross at 1.1%  (wire, not card)
 *
 * A flat percentage floor gets both ends wrong: it makes cheap watches look
 * impossible and lets expensive ones through on margins that do not cover the
 * handling. tiers.ts carries the per-band costs, floors and payment rails.
 */

import {
  DEFAULT_PRICING,
  maxViableSourcePrice,
  meetsFloors,
  projectMargin,
  solveListPrice,
  type PricingConfig,
} from './pricing.ts';
import { tierFor, type PriceTier } from './tiers.ts';
import type { MarginProjection } from './types.ts';

// ─────────────────────────────── buy box ────────────────────────────────────────

/**
 * Given the market price and what we paid, the deepest discount we can advertise
 * while still clearing BOTH floors for the tier.
 *
 * Returns null when no list price works — the purchase was a mistake and no price
 * rescues it.
 *
 * Solved by scan rather than algebra: outbound shipping, packaging, margin floors
 * and the payment rail are all step functions of the order value, so the closed form
 * is piecewise across every tier boundary. Scanning is microseconds and immune to
 * the discontinuities.
 */
export function maxCustomerDiscount(
  marketPriceUsd: number,
  sourcePriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
  targetMarginPct?: number,
): number | null {
  if (marketPriceUsd <= 0 || sourcePriceUsd <= 0) return null;
  // Up to 60%: cheap tiers genuinely support discounts that deep.
  for (let d = 0.6; d >= -1e-9; d -= 0.0025) {
    const listPriceUsd = solveListPrice(marketPriceUsd, {
      ...config,
      targetDiscountToMarket: d,
    });
    if (listPriceUsd <= 0) continue;
    const tier = tierFor(listPriceUsd);
    const m = targetMarginPct ?? tier.minMarginPct;
    const g = tier.minGrossProfitUsd;
    const p = projectMargin(sourcePriceUsd, listPriceUsd, config);
    if (p.marginPct >= m && p.grossProfitUsd >= g) {
      return Math.round(Math.max(0, d) * 10_000) / 10_000;
    }
  }
  return null;
}

export interface Tradeability {
  tradeable: boolean;
  tier: PriceTier;
  listPriceUsd: number;
  /** The bid ceiling. Pay more than this and the deal stops working. */
  maxSourceUsd: number;
  /** How far below market we must buy. This is what actually varies by tier. */
  requiredDiscountFromMarket: number;
  /** Outcome if we buy exactly at the ceiling. */
  projectionAtCeiling: MarginProjection;
}

/**
 * The honest answer to "can I make money on a watch worth $X?"
 *
 * Almost always yes — what changes is how far below market you have to buy, and
 * whether the resulting dollars justify the handling time. That is why this returns
 * the whole picture rather than a boolean.
 */
export function tradeability(
  marketPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): Tradeability {
  const listPriceUsd = solveListPrice(marketPriceUsd, config);
  const tier = tierFor(listPriceUsd);
  const maxSourceUsd = maxViableSourcePrice(listPriceUsd, config);
  return {
    tradeable: maxSourceUsd > 0 && marketPriceUsd > 0,
    tier,
    listPriceUsd,
    maxSourceUsd,
    requiredDiscountFromMarket:
      marketPriceUsd > 0
        ? Math.round((1 - maxSourceUsd / marketPriceUsd) * 10_000) / 10_000
        : 1,
    projectionAtCeiling: projectMargin(maxSourceUsd, listPriceUsd, config),
  };
}

/** Thin boolean wrapper. Prefer tradeability() — the detail is the useful part. */
export function isTradeableAtAnyPrice(
  marketPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): boolean {
  return tradeability(marketPriceUsd, config).tradeable;
}

// ──────────────────────────── the offer ladder ──────────────────────────────────

export type OfferRung = {
  /** 1-indexed step in the ladder. */
  step: number;
  /** Fraction below the seller's asking price. 0 means "pay the ask". */
  discountFromAsk: number;
  offerUsd: number;
  /** Projected margin if the seller accepts at this rung. */
  marginPctIfAccepted: number;
  /** Absolute gross if accepted — the number that matters at high value. */
  grossProfitIfAcceptedUsd: number;
  /** False when even this rung breaches the margin floor — never send it. */
  viable: boolean;
};

export interface OfferLadderOptions {
  /** Discounts to try, in order. Default 10% then 5%, then pay the ask. */
  rungs?: readonly number[];
  config?: PricingConfig;
  /** Fall back to paying the full asking price if every offer is rejected. */
  payAskIfRejected?: boolean;
}

/**
 * Build the offer sequence for a listing with Best Offer enabled.
 *
 * eBay caps how many offers a buyer may make on one item (commonly 3 in most
 * categories; rejected, retracted and expired offers all count against it), so a
 * 10% → 5% → pay-ask ladder is exactly the budget. Do not add rungs.
 *
 * ⚠️ Offers are SENT BY YOU, BY HAND. eBay's User Agreement prohibits automated
 * order placement, and that includes offers. This function decides the numbers and
 * puts them in the digest; the clicking is yours. See docs/01.
 *
 * ⚠️ Timing: a seller has up to 48 hours to respond, and two rungs can burn four
 * days. That does not fit inside a 7-day card authorization with shipping still to
 * come, so the ladder is for STOCKED buying only — never for an order already
 * placed on our site. See docs/12.
 */
export function buildOfferLadder(
  askingPriceUsd: number,
  listPriceUsd: number,
  options: OfferLadderOptions = {},
): OfferRung[] {
  const config = options.config ?? DEFAULT_PRICING;
  const rungs = options.rungs ?? [0.1, 0.05];
  const discounts = options.payAskIfRejected === false ? [...rungs] : [...rungs, 0];

  return discounts.map((discountFromAsk, i) => {
    const offerUsd = Math.round(askingPriceUsd * (1 - discountFromAsk) * 100) / 100;
    const projection = projectMargin(offerUsd, listPriceUsd, config);
    return {
      step: i + 1,
      discountFromAsk,
      offerUsd,
      marginPctIfAccepted: projection.marginPct,
      grossProfitIfAcceptedUsd: projection.grossProfitUsd,
      // Both tier floors, not a single global percentage.
      viable: meetsFloors(projection, config).ok,
    };
  });
}

/**
 * The only rungs worth sending. If the final rung (paying the ask) is not viable,
 * the ladder is truncated — walking away is the correct outcome, and an automated
 * system that silently pays the ask would be the expensive bug here.
 */
export function viableRungs(ladder: readonly OfferRung[]): OfferRung[] {
  return ladder.filter((r) => r.viable);
}

// ─────────────────────────── fulfilment routing ─────────────────────────────────

export type FulfilmentRoute =
  /** eBay seller ships straight to the end customer. Cheapest, fastest, riskiest. */
  | 'DIRECT_TO_CUSTOMER'
  /** eBay seller → us → inspect, photograph, log serial → customer. */
  | 'VIA_OPERATOR';

export interface RoutingDecision {
  route: FulfilmentRoute;
  reasons: string[];
}

export interface RoutingConfig {
  /** At or above this order value, always route through the operator. */
  operatorThresholdUsd: number;
  /**
   * Until this many orders have completed cleanly, route EVERYTHING through the
   * operator regardless of value. Direct-ship is an optimisation you earn.
   */
  minCompletedOrdersForDirect: number;
  /** Never direct-ship to an address that failed AVS or looks like a reshipper. */
  allowDirectOnElevatedRisk: boolean;
}

export const DEFAULT_ROUTING: RoutingConfig = {
  operatorThresholdUsd: 1000,
  minCompletedOrdersForDirect: 20,
  allowDirectOnElevatedRisk: false,
};

export interface RoutingSignals {
  orderValueUsd: number;
  completedOrdersToDate: number;
  riskDecision: 'ACCEPT' | 'REVIEW' | 'BLOCK';
  /** Watch is going through eBay Authenticity Guarantee before delivery. */
  authenticityGuaranteed: boolean;
  /** Seller confirmed they will omit invoices/branding from the parcel. */
  sellerConfirmedBlindShip: boolean;
}

/**
 * Decide whether a watch passes through your hands.
 *
 * Direct-to-customer is genuinely cheaper (one leg of shipping instead of two, 2–4
 * days faster) but it costs you the three things that win an "item not as
 * described" dispute: your own photographs, the logged serial number, and the
 * packing video. It also puts a third party's packaging in front of your customer.
 *
 * So it is gated, not forbidden — earned after 20 clean orders, capped by value,
 * and never used on an order the risk engine flagged.
 */
export function routeFulfilment(
  signals: RoutingSignals,
  config: RoutingConfig = DEFAULT_ROUTING,
): RoutingDecision {
  const reasons: string[] = [];

  if (signals.orderValueUsd >= config.operatorThresholdUsd) {
    reasons.push(
      `order value $${signals.orderValueUsd} >= $${config.operatorThresholdUsd} threshold`,
    );
  }
  if (signals.completedOrdersToDate < config.minCompletedOrdersForDirect) {
    reasons.push(
      `only ${signals.completedOrdersToDate} clean orders completed (need ${config.minCompletedOrdersForDirect})`,
    );
  }
  if (signals.riskDecision !== 'ACCEPT' && !config.allowDirectOnElevatedRisk) {
    reasons.push(`risk decision is ${signals.riskDecision}`);
  }
  if (!signals.sellerConfirmedBlindShip) {
    reasons.push('seller has not confirmed a blind ship (no invoice or branding)');
  }
  if (!signals.authenticityGuaranteed) {
    reasons.push('no Authenticity Guarantee leg — nothing would verify it but us');
  }

  return reasons.length > 0
    ? { route: 'VIA_OPERATOR', reasons }
    : { route: 'DIRECT_TO_CUSTOMER', reasons: ['all direct-ship conditions met'] };
}
