/**
 * Landed-cost model and list-price solver.
 *
 * The arithmetic that matters is in maxViableSourcePrice(): given what the market
 * pays, what is the most we can pay on eBay and still clear our margin floor? That
 * single number is what turns "this looks cheap" into "buy it".
 *
 * See docs/03 for the worked P&L these formulas reproduce.
 */

import type { AuthTier, LandedCost, MarginProjection } from './types.ts';

export interface PricingConfig {
  /** Your state's rate. Irrelevant once hasResaleCertificate is true — which is the point. */
  salesTaxRate: number;
  /** ⭐ The single highest-leverage flag in the codebase. See docs/03. */
  hasResaleCertificate: boolean;
  packagingUsd: number;
  /** Usually 0 — eBay sellers in our band ship free. */
  inboundShippingUsd: number;
  stripePercent: number;
  stripeFixedUsd: number;
  radarPerTxnUsd: number;
  /** eBay Partner Network commission on our own purchase. */
  epnCommissionRate: number;
  /** Buyer-paid Authenticity Guarantee add-on for $500–$1,999.99 items. */
  authAddonUsd: number;
  /** How far under market we list. Our whole value proposition. */
  targetDiscountToMarket: number;
  /** Margin floor. Below this we don't buy, however pretty the watch is. */
  minMarginPct: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  salesTaxRate: 0.075,
  hasResaleCertificate: true, // get this done in week 1 — docs/03
  packagingUsd: 9,
  inboundShippingUsd: 0,
  stripePercent: 0.029,
  stripeFixedUsd: 0.3,
  radarPerTxnUsd: 0.07,
  epnCommissionRate: 0.015,
  authAddonUsd: 80,
  targetDiscountToMarket: 0.1,
  minMarginPct: 0.12,
};

/** eBay Authenticity Guarantee price bands. See docs/01 §4. */
export function authTierForPrice(sourcePriceUsd: number): AuthTier {
  if (sourcePriceUsd >= 2000) return 'FREE';
  if (sourcePriceUsd >= 500) return 'ADDON';
  return 'NONE';
}

export function authenticationCostUsd(
  sourcePriceUsd: number,
  config: PricingConfig,
): number {
  const tier = authTierForPrice(sourcePriceUsd);
  if (tier === 'FREE') return 0;
  if (tier === 'ADDON') return config.authAddonUsd;
  return 0; // NONE — but such candidates are gated out entirely, see deal.ts
}

/**
 * Outbound shipping + insurance, banded by order value.
 * Deliberately conservative: carrier jewelry liability is a trap (docs/08).
 */
export function outboundShippingUsd(orderValueUsd: number): number {
  if (orderValueUsd < 1000) return 32; // Priority Express, signature, declared value
  if (orderValueUsd < 5000) return 40; // + adult signature
  return 60; // Registered Mail / Parcel Pro
}

export function computeLandedCost(
  sourcePriceUsd: number,
  listPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): LandedCost {
  const salesTaxUsd = config.hasResaleCertificate
    ? 0
    : sourcePriceUsd * config.salesTaxRate;
  const authenticationUsd = authenticationCostUsd(sourcePriceUsd, config);
  const outbound = outboundShippingUsd(listPriceUsd);

  const fixedCostUsd =
    sourcePriceUsd +
    salesTaxUsd +
    authenticationUsd +
    config.inboundShippingUsd +
    outbound +
    config.packagingUsd;

  return {
    sourcePriceUsd: r2(sourcePriceUsd),
    salesTaxUsd: r2(salesTaxUsd),
    authenticationUsd: r2(authenticationUsd),
    inboundShippingUsd: r2(config.inboundShippingUsd),
    outboundShippingUsd: r2(outbound),
    packagingUsd: r2(config.packagingUsd),
    fixedCostUsd: r2(fixedCostUsd),
  };
}

/** List price = market price less our discount, rounded to a retail-looking number. */
export function solveListPrice(
  marketPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): number {
  const raw = marketPriceUsd * (1 - config.targetDiscountToMarket);
  return Math.round(raw / 5) * 5;
}

export function projectMargin(
  sourcePriceUsd: number,
  listPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
): MarginProjection {
  const landedCost = computeLandedCost(sourcePriceUsd, listPriceUsd, config);
  const processingFeeUsd =
    listPriceUsd * config.stripePercent + config.stripeFixedUsd + config.radarPerTxnUsd;
  const epnCreditUsd = sourcePriceUsd * config.epnCommissionRate;

  const grossProfitUsd =
    listPriceUsd - landedCost.fixedCostUsd - processingFeeUsd + epnCreditUsd;

  return {
    listPriceUsd: r2(listPriceUsd),
    landedCost,
    processingFeeUsd: r2(processingFeeUsd),
    epnCreditUsd: r2(epnCreditUsd),
    grossProfitUsd: r2(grossProfitUsd),
    marginPct: listPriceUsd > 0 ? r4(grossProfitUsd / listPriceUsd) : 0,
  };
}

/**
 * The bid ceiling. Solves the margin equation for S:
 *
 *   profit = L(1 − p) − f − radar − S(1 + τ − epn) − auth − inbound − outbound − pack
 *   profit = m · L
 *   ⇒  S = [ L(1 − p − m) − (f + radar + auth + inbound + outbound + pack) ] / (1 + τ − epn)
 *
 * `auth` depends on S through eBay's $2,000 Authenticity Guarantee band, so we solve
 * twice: once assuming the paid add-on, and again with free authentication if the
 * answer landed above $2,000.
 */
export function maxViableSourcePrice(
  listPriceUsd: number,
  config: PricingConfig = DEFAULT_PRICING,
  targetMarginPct: number = config.minMarginPct,
): number {
  const tau = config.hasResaleCertificate ? 0 : config.salesTaxRate;
  const denominator = 1 + tau - config.epnCommissionRate;
  const outbound = outboundShippingUsd(listPriceUsd);

  const solve = (authUsd: number): number => {
    const overhead =
      config.stripeFixedUsd +
      config.radarPerTxnUsd +
      authUsd +
      config.inboundShippingUsd +
      outbound +
      config.packagingUsd;
    const numerator =
      listPriceUsd * (1 - config.stripePercent - targetMarginPct) - overhead;
    return numerator / denominator;
  };

  // Pass 1: assume the $500–$1,999.99 paid add-on.
  const withAddon = solve(config.authAddonUsd);
  // Pass 2: if we can afford a $2,000+ watch, authentication is free — re-solve.
  if (withAddon >= 2000) {
    const free = solve(0);
    if (free >= 2000) return r2(free);
  }
  return r2(withAddon);
}

/** Convenience: how far under market is this candidate, as a fraction? */
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
