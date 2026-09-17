/**
 * Offer ladder and fulfilment routing.
 *
 * The buy-box maths moved to economics.ts, which models cost as a curve and gates on
 * contribution rather than a declared margin percentage. See docs/12.
 */

import {
  computeEconomics,
  judgeDeal,
  maxSourcePrice,
  solveListPrice,
  DEFAULT_POLICY,
  type DealEconomics,
  type DealPolicy,
  type EconomicsInput,
} from './economics.ts';
import { operationalProfile, type OperationalProfile } from './tiers.ts';

// ─────────────────────────────── buy box ────────────────────────────────────────

export interface Tradeability {
  tradeable: boolean;
  profile: OperationalProfile;
  listPriceUsd: number;
  /** The bid ceiling. Pay more than this and the deal stops paying for itself. */
  maxSourceUsd: number;
  /** How far below market we must buy. Far shallower than a margin gate implies. */
  requiredDiscountFromMarket: number;
  economicsAtCeiling: DealEconomics;
}

/**
 * The honest answer to "can I make money on a watch worth $X?"
 *
 * Almost always yes. What varies is how far below market you must buy and whether
 * the resulting dollars justify the hour — which is why this returns the whole
 * picture rather than a boolean.
 */
export function tradeability(
  marketPriceUsd: number,
  opts: Omit<EconomicsInput, 'sourcePriceUsd' | 'listPriceUsd'> = {},
  policy: DealPolicy = DEFAULT_POLICY,
  discountToMarket = 0.1,
): Tradeability {
  const listPriceUsd = solveListPrice(marketPriceUsd, discountToMarket);
  const maxSourceUsd = maxSourcePrice(listPriceUsd, opts, policy);
  return {
    tradeable: maxSourceUsd > 0 && marketPriceUsd > 0,
    profile: operationalProfile(listPriceUsd),
    listPriceUsd,
    maxSourceUsd,
    requiredDiscountFromMarket:
      marketPriceUsd > 0
        ? Math.round((1 - maxSourceUsd / marketPriceUsd) * 10_000) / 10_000
        : 1,
    economicsAtCeiling: computeEconomics({
      ...opts,
      sourcePriceUsd: maxSourceUsd,
      listPriceUsd,
    }),
  };
}

/**
 * Deepest discount we can advertise on a watch we already own, while the deal still
 * clears the policy floor. Returns null when nothing works.
 */
export function maxCustomerDiscount(
  marketPriceUsd: number,
  sourcePriceUsd: number,
  opts: Omit<EconomicsInput, 'sourcePriceUsd' | 'listPriceUsd'> = {},
  policy: DealPolicy = DEFAULT_POLICY,
): number | null {
  if (marketPriceUsd <= 0 || sourcePriceUsd <= 0) return null;
  for (let d = 0.6; d >= -1e-9; d -= 0.0025) {
    const listPriceUsd = solveListPrice(marketPriceUsd, d);
    if (listPriceUsd <= 0) continue;
    const e = computeEconomics({ ...opts, sourcePriceUsd, listPriceUsd });
    if (judgeDeal(e, policy).accept) {
      return Math.round(Math.max(0, d) * 10_000) / 10_000;
    }
  }
  return null;
}

// ──────────────────────────── the offer ladder ──────────────────────────────────

export interface OfferRung {
  step: number;
  discountFromAsk: number;
  offerUsd: number;
  contributionIfAcceptedUsd: number;
  contributionPerHourUsd: number;
  /** False when this rung fails the policy floor — never send it. */
  viable: boolean;
}

export interface OfferLadderOptions {
  rungs?: readonly number[];
  economics?: Omit<EconomicsInput, 'sourcePriceUsd' | 'listPriceUsd'>;
  policy?: DealPolicy;
  payAskIfRejected?: boolean;
}

/**
 * Build the offer sequence for a listing with Best Offer enabled.
 *
 * eBay caps how many offers a buyer may make on one item (commonly 3; rejected,
 * retracted and expired offers all count), so a 10% → 5% → pay-ask ladder is exactly
 * the budget. Do not add rungs.
 *
 * ⚠️ YOU SEND THESE BY HAND. eBay's User Agreement prohibits automated order
 * placement and an offer is an order commitment. This decides the numbers; the
 * clicking is yours.
 *
 * ⚠️ STOCKED BUYING ONLY. A seller has up to 48 hours to answer, so two rungs can
 * burn four days — which does not fit inside a 7-day card authorization with
 * shipping still to come. For an order already placed on our site, buy at the ask.
 */
export function buildOfferLadder(
  askingPriceUsd: number,
  listPriceUsd: number,
  options: OfferLadderOptions = {},
): OfferRung[] {
  const policy = options.policy ?? DEFAULT_POLICY;
  const rungs = options.rungs ?? [0.1, 0.05];
  const discounts = options.payAskIfRejected === false ? [...rungs] : [...rungs, 0];

  return discounts.map((discountFromAsk, i) => {
    const offerUsd = Math.round(askingPriceUsd * (1 - discountFromAsk) * 100) / 100;
    const e = computeEconomics({
      ...options.economics,
      sourcePriceUsd: offerUsd,
      listPriceUsd,
    });
    return {
      step: i + 1,
      discountFromAsk,
      offerUsd,
      contributionIfAcceptedUsd: e.contributionUsd,
      contributionPerHourUsd: e.contributionPerHourUsd,
      viable: judgeDeal(e, policy).accept,
    };
  });
}

/**
 * The only rungs worth sending. If paying the ask is not viable, the ladder is
 * truncated — walking away is the correct outcome, and a system that quietly pays
 * the ask after two declines is the expensive bug here.
 */
export function viableRungs(ladder: readonly OfferRung[]): OfferRung[] {
  return ladder.filter((r) => r.viable);
}

// ─────────────────────────── fulfilment routing ─────────────────────────────────

export type FulfilmentRoute = 'DIRECT_TO_CUSTOMER' | 'VIA_OPERATOR';

export interface RoutingDecision {
  route: FulfilmentRoute;
  reasons: string[];
}

export interface RoutingConfig {
  operatorThresholdUsd: number;
  minCompletedOrdersForDirect: number;
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
  authenticityGuaranteed: boolean;
  sellerConfirmedBlindShip: boolean;
}

/**
 * Decide whether a watch passes through your hands.
 *
 * Direct-to-customer is cheaper and faster but forfeits your photos, the logged
 * serial and the packing video — the three things that win an "item not as
 * described" dispute. So it is gated, not forbidden. See docs/13.
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
