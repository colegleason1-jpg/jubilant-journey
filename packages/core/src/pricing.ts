/**
 * Landed-cost model and list-price solver — tier-aware.
 *
 * Costs, margin floors and payment rails all vary with order value; see tiers.ts for
 * why that has to be fluid rather than a single constant.
 *
 * The number that matters is maxViableSourcePrice(): given what the market pays,
 * what is the most we can pay and still clear BOTH the percentage floor and the
 * absolute dollar floor for that tier?
 */

import {
  processingFeeUsd,
  tierFor,
  type PaymentRail,
  type PriceTier,
} from './tiers.ts';
import type { AuthTier, LandedCost, MarginProjection } from './types.ts';

export interface PricingConfig {
  /** Your state's rate. Irrelevant once hasResaleCertificate is true — the point. */
  salesTaxRate: number;
  /** ⭐ The single highest-leverage flag in the codebase. See docs/03. */
  hasResaleCertificate: boolean;
  /** Usually 0 — eBay sellers in our bands ship free. */
  inboundShippingUsd: number;
  cardPercent: number;
  cardFixedUsd: number;
  radarPerTxnUsd: number;
  achPercent: number;
  achCapUsd: number;
  wireFeeUsd: number;
  /** eBay Partner Network commission on our own purchase. */
  epnCommissionRate: number;
  /** Buyer-paid Authenticity Guarantee add-on for $500–$1,999.99 source prices. */
  authAddonUsd: number;
  /** How far under market we list. Our value proposition. */
  targetDiscountToMarket: number;
  /**
   * Optional global override of the tier's percentage floor. Leave undefined to use
   * each tier's own floor, which is the whole point of the tier model.
   */
  minMarginPctOverride?: number;
  /** Optional global override of the tier's absolute floor. */
  minGrossProfitUsdOverride?: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  salesTaxRate: 0.075,
  hasResaleCertificate: true, // get this done in week 1 — docs/03
  inboundShippingUsd: 0,
  cardPercent: 0.029,
  cardFixedUsd: 0.3,
  radarPerTxnUsd: 0.07,
  achPercent: 0.008,
  achCapUsd: 5,
  wireFeeUsd: 0,
  epnCommissionRate: 0.015,
  authAddonUsd: 80,
  targetDiscountToMarket: 0.1,
};

export function minMarginPctFor(tier: PriceTier, config: PricingConfig): number {
  return config.minMarginPctOverride ?? tier.minMarginPct;
}

export function minGrossProfitUsdFor(tier: PriceTier, config: PricingConfig): number {
  return config.minGrossProfitUsdOverride ?? tier.minGrossProfitUsd;
}

// ─────────────────────────── authentication ─────────────────────────────────────

/** eBay Authenticity Guarantee bands, keyed on the SOURCE price. See docs/01 §4. */
export function authTierForPrice(sourcePriceUsd: number): AuthTier {
  if (sourcePriceUsd >= 2000) return 'FREE';
  if (sourcePriceUsd >= 500) return 'ADDON';
  return 'NONE';
}

export function authenticationCostUsd(
  sourcePriceUsd: number,
  config: PricingConfig,
): number {
  return authTierForPrice(sourcePriceUsd) === 'ADDON' ? config.authAddonUsd : 0;
}

/** Outbound shipping + insurance for an order value, from its tier. */
export function outboundShippingUsd(orderValueUsd: number): number {
  return tierFor(orderValueUsd).outboundShippingUsd;
}

export function packagingUsd(orderValueUsd: number): number {
  return tierFor(orderValueUsd).packagingUsd;
}

// ───────────────────────────── landed cost ──────────────────────────────────────

export function computeLandedCost(
  sourcePriceUsd: number,
  listPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): LandedCost {
  const tier = tierFor(listPriceUsd);
  const salesTaxUsd = config.hasResaleCertificate
    ? 0
    : sourcePriceUsd * config.salesTaxRate;
  const authenticationUsd = authenticationCostUsd(sourcePriceUsd, config);

  const fixedCostUsd =
    sourcePriceUsd +
    salesTaxUsd +
    authenticationUsd +
    config.inboundShippingUsd +
    tier.outboundShippingUsd +
    tier.packagingUsd;

  return {
    sourcePriceUsd: r2(sourcePriceUsd),
    salesTaxUsd: r2(salesTaxUsd),
    authenticationUsd: r2(authenticationUsd),
    inboundShippingUsd: r2(config.inboundShippingUsd),
    outboundShippingUsd: r2(tier.outboundShippingUsd),
    packagingUsd: r2(tier.packagingUsd),
    fixedCostUsd: r2(fixedCostUsd),
  };
}

/** List price = market less our discount, rounded to a retail-looking number. */
export function solveListPrice(
  marketPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): number {
  const raw = marketPriceUsd * (1 - config.targetDiscountToMarket);
  // Round to $5 above $100; to $1 below, where $5 steps are a 5% swing.
  return raw >= 100 ? Math.round(raw / 5) * 5 : Math.round(raw);
}

export function projectMargin(
  sourcePriceUsd: number,
  listPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
  rail?: PaymentRail,
): MarginProjection {
  const tier = tierFor(listPriceUsd);
  const landedCost = computeLandedCost(sourcePriceUsd, listPriceUsd, config);
  const usedRail = rail ?? tier.preferredRail;

  // Cheap tiers collect postage on top of the item price; expensive tiers absorb it.
  const shippingCollectedUsd = tier.shippingChargedToCustomer
    ? tier.outboundShippingUsd
    : 0;
  const revenueUsd = listPriceUsd + shippingCollectedUsd;

  const processing = processingFeeUsd(revenueUsd, usedRail, {
    cardPercent: config.cardPercent,
    cardFixedUsd: config.cardFixedUsd,
    radarUsd: config.radarPerTxnUsd,
    achPercent: config.achPercent,
    achCapUsd: config.achCapUsd,
    wireFeeUsd: config.wireFeeUsd,
  });
  const epnCreditUsd = sourcePriceUsd * config.epnCommissionRate;

  // We always PAY outbound shipping (it is inside landedCost.fixedCostUsd); when the
  // customer is charged for it, we also collect it back through revenue.
  const grossProfitUsd =
    revenueUsd - landedCost.fixedCostUsd - processing + epnCreditUsd;

  return {
    listPriceUsd: r2(listPriceUsd),
    shippingCollectedUsd: r2(shippingCollectedUsd),
    revenueUsd: r2(revenueUsd),
    landedCost,
    processingFeeUsd: r2(processing),
    epnCreditUsd: r2(epnCreditUsd),
    grossProfitUsd: r2(grossProfitUsd),
    marginPct: revenueUsd > 0 ? r4(grossProfitUsd / revenueUsd) : 0,
    rail: usedRail,
    tierLabel: tier.label,
    effectiveHourlyUsd: r2(grossProfitUsd / (tier.handlingMinutes / 60)),
  };
}

/**
 * Does this deal clear BOTH floors for its tier?
 *
 * The percentage floor protects cheap units (where 12% of $40 is not worth the
 * handling). The dollar floor protects expensive ones (where a great-looking 8%
 * still has to beat your time and risk). Neither alone is sufficient.
 */
export function meetsFloors(
  projection: MarginProjection,
  config: PricingConfig = DEFAULT_PRICING,
): { ok: boolean; failures: string[] } {
  const tier = tierFor(projection.listPriceUsd);
  const failures: string[] = [];
  if (projection.marginPct < minMarginPctFor(tier, config)) failures.push('MARGIN_PCT');
  if (projection.grossProfitUsd < minGrossProfitUsdFor(tier, config)) {
    failures.push('MARGIN_ABSOLUTE');
  }
  return { ok: failures.length === 0, failures };
}

/**
 * The bid ceiling — the most we can pay.
 *
 * Two constraints, take the lower:
 *
 *   percentage:  S ≤ [ L(1−m) − processing − auth − inbound − outbound − pack ] / (1 + τ − epn)
 *   absolute:    S ≤ [ L − processing − auth − inbound − outbound − pack − G  ] / (1 + τ − epn)
 *
 * Authentication cost depends on S through the $2,000 Authenticity Guarantee band,
 * so we solve assuming the paid add-on and re-solve if the answer clears $2,000.
 */
export function maxViableSourcePrice(
  listPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
  targetMarginPct?: number,
  rail?: PaymentRail,
): number {
  const tier = tierFor(listPriceUsd);
  const m = targetMarginPct ?? minMarginPctFor(tier, config);
  const g = minGrossProfitUsdFor(tier, config);
  const tau = config.hasResaleCertificate ? 0 : config.salesTaxRate;
  const denominator = 1 + tau - config.epnCommissionRate;

  const shippingCollectedUsd = tier.shippingChargedToCustomer
    ? tier.outboundShippingUsd
    : 0;
  const revenueUsd = listPriceUsd + shippingCollectedUsd;

  const processing = processingFeeUsd(revenueUsd, rail ?? tier.preferredRail, {
    cardPercent: config.cardPercent,
    cardFixedUsd: config.cardFixedUsd,
    radarUsd: config.radarPerTxnUsd,
    achPercent: config.achPercent,
    achCapUsd: config.achCapUsd,
    wireFeeUsd: config.wireFeeUsd,
  });

  const solve = (authUsd: number): number => {
    const overhead =
      processing +
      authUsd +
      config.inboundShippingUsd +
      tier.outboundShippingUsd +
      tier.packagingUsd;
    const byPercent = (revenueUsd * (1 - m) - overhead) / denominator;
    const byAbsolute = (revenueUsd - overhead - g) / denominator;
    return Math.min(byPercent, byAbsolute);
  };

  // Authentication cost is a step function of the SOURCE price, which is what we are
  // solving for. Evaluate both assumptions and keep only the self-consistent ones:
  // a $27 order must not be charged the $80 add-on, and a $3,000 one must not be
  // charged it either (it is free above $2,000).
  const zeroAuth = solve(0);
  const withAddon = solve(config.authAddonUsd);

  const consistent: number[] = [];
  if (zeroAuth < 500) consistent.push(zeroAuth); // NONE band
  if (withAddon >= 500 && withAddon < 2000) consistent.push(withAddon); // ADDON band
  if (zeroAuth >= 2000) consistent.push(zeroAuth); // FREE band

  if (consistent.length > 0) return r2(Math.max(...consistent));

  // No self-consistent solution: buying just under $500 avoids the add-on entirely
  // and is the best we can do.
  return r2(Math.min(zeroAuth, 499.99));
}

/** How far under market is this candidate, as a fraction? */
export function discountToMarket(
  sourcePriceUsd: number,
  marketPriceUsd: number,
): number {
  if (marketPriceUsd <= 0) return 0;
  return r4((marketPriceUsd - sourcePriceUsd) / marketPriceUsd);
}

function r2(x: number): number {
  return Math.round(x * 100) / 100;
}
function r4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}
