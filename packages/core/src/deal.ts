/**
 * The deal gates.
 *
 * Every candidate from J1 runs through here. A candidate must pass EVERY gate to
 * reach the daily digest — gates are not weighted, they are binary. Scoring only
 * ranks the survivors.
 *
 * The bias is deliberately toward rejection. There is always another watch tomorrow;
 * one bad purchase costs more than six good ones make (docs/08).
 */

import { computeComps, computeLiquidity } from './comps.ts';
import {
  authTierForPrice,
  discountToMarket,
  DEFAULT_PRICING,
  maxViableSourcePrice,
  meetsFloors,
  minMarginPctFor,
  projectMargin,
  solveListPrice,
  type PricingConfig,
} from './pricing.ts';
import { tierFor } from './tiers.ts';
import type {
  Candidate,
  DealEvaluation,
  GateName,
  ObservedSale,
} from './types.ts';

export interface DealConfig {
  minSourcePriceUsd: number;
  maxSourcePriceUsd: number;
  minCompConfidence: number;
  minDiscountToMarketPct: number;
  /**
   * Above this discount, treat it as a red flag rather than a win. A genuine watch
   * 50% under market is usually stolen, fake, broken, or a seller about to cancel.
   */
  suspiciousDiscountPct: number;
  minSellerFeedbackScore: number;
  minSellerPositivePct: number;
  minSellerAccountAgeDays: number;
  allowedCountries: readonly string[];
  /** Matched as whole words, case-insensitive. The cheapest fraud filter there is. */
  titleBlocklist: readonly string[];
  pricing: PricingConfig;
}

export const DEFAULT_DEAL_CONFIG: DealConfig = {
  minSourcePriceUsd: 500, // below this there is no Authenticity Guarantee — docs/01 §4
  maxSourcePriceUsd: 3500,
  minCompConfidence: 0.5,
  minDiscountToMarketPct: 0.18,
  suspiciousDiscountPct: 0.45,
  minSellerFeedbackScore: 50,
  minSellerPositivePct: 98.5,
  minSellerAccountAgeDays: 365,
  allowedCountries: ['US'],
  titleBlocklist: [
    'homage',
    'replica',
    'rep',
    'aftermarket',
    'franken',
    'frankenwatch',
    'parts',
    'repair',
    'not working',
    'as-is',
    'as is',
    'custom dial',
    'mod',
    'modded',
    'project',
    'read description',
    'no reserve',
  ],
  pricing: DEFAULT_PRICING,
};

export function matchesBlocklist(
  title: string,
  blocklist: readonly string[],
): string[] {
  const lower = title.toLowerCase();
  return blocklist.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Whole-word match so "mod" doesn't fire on "model" and "rep" doesn't fire on
    // "reputable".
    return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
  });
}

export function evaluateDeal(
  candidate: Candidate,
  observedSales: readonly ObservedSale[],
  config: DealConfig = DEFAULT_DEAL_CONFIG,
  now: Date = new Date(),
): DealEvaluation {
  const gatesFailed: GateName[] = [];
  const warnings: string[] = [];

  const comps = computeComps(observedSales, {
    now,
    targetCondition: candidate.condition,
    targetBoxAndPapers: candidate.hasBoxAndPapers,
  });
  const liquidity = computeLiquidity(observedSales, { now });

  const listPriceUsd = solveListPrice(comps.marketPriceUsd, config.pricing);
  const projection = projectMargin(candidate.priceUsd, listPriceUsd, config.pricing);
  const discountPct = discountToMarket(candidate.priceUsd, comps.marketPriceUsd);

  // ── Gate: price band ──────────────────────────────────────────────────────────
  if (
    candidate.priceUsd < config.minSourcePriceUsd ||
    candidate.priceUsd > config.maxSourcePriceUsd
  ) {
    gatesFailed.push('PRICE_BAND');
  }

  // ── Gate: Authenticity Guarantee eligibility ──────────────────────────────────
  // Our entire "item not as described" defence rests on third-party authentication.
  if (authTierForPrice(candidate.priceUsd) === 'NONE') {
    gatesFailed.push('AUTHENTICATION_ELIGIBLE');
  }

  // ── Gate: do we even know what this is worth? ─────────────────────────────────
  if (comps.confidence < config.minCompConfidence) {
    gatesFailed.push('COMP_CONFIDENCE');
  }

  // ── Gate: will it sell, regularly? ────────────────────────────────────────────
  if (!liquidity.qualified) {
    gatesFailed.push('LIQUIDITY');
  }

  // ── Gate: is there enough room? ───────────────────────────────────────────────
  if (discountPct < config.minDiscountToMarketPct) {
    gatesFailed.push('DISCOUNT_TO_MARKET');
  }

  // ── Gate: does the money actually work? ───────────────────────────────────────
  // Both floors for the tier: the percentage (protects cheap units from not being
  // worth the handling) and the absolute dollars (protects expensive ones from a
  // flattering-looking percentage). See tiers.ts.
  const floors = meetsFloors(projection, config.pricing);
  if (!floors.ok) {
    gatesFailed.push('MARGIN');
    warnings.push(`margin floors failed: ${floors.failures.join(', ')}`);
  }

  // ── Gate: seller quality ──────────────────────────────────────────────────────
  const s = candidate.seller;
  if (
    s.feedbackScore < config.minSellerFeedbackScore ||
    s.positiveFeedbackPercent < config.minSellerPositivePct ||
    s.accountAgeDays < config.minSellerAccountAgeDays ||
    !config.allowedCountries.includes(s.itemLocationCountry)
  ) {
    gatesFailed.push('SELLER_QUALITY');
  }

  // ── Gate: returns accepted (our only recourse on a bad watch) ─────────────────
  if (!s.returnsAccepted) {
    gatesFailed.push('RETURNS_ACCEPTED');
  }

  // ── Gate: title blocklist ─────────────────────────────────────────────────────
  const hits = matchesBlocklist(candidate.title, config.titleBlocklist);
  if (hits.length > 0) {
    gatesFailed.push('TITLE_BLOCKLIST');
    warnings.push(`blocklist: ${hits.join(', ')}`);
  }

  // ── Gate: stock photography ───────────────────────────────────────────────────
  if (candidate.usesStockPhotos) {
    gatesFailed.push('STOCK_PHOTOS');
  }

  // ── Gate: too good to be true ─────────────────────────────────────────────────
  if (discountPct > config.suspiciousDiscountPct) {
    gatesFailed.push('TOO_GOOD_TO_BE_TRUE');
    warnings.push(
      `${(discountPct * 100).toFixed(0)}% under market — treat as a warning, not a win`,
    );
  }

  // ── Non-blocking warnings for the human reviewer ──────────────────────────────
  if (comps.spreadPct > 0.3) {
    warnings.push('wide price dispersion — market disagrees on this reference');
  }
  if (candidate.imageUrls.length < 4) {
    warnings.push('few photos — ask the seller for more before buying');
  }
  if (comps.sampleSize < 10) {
    warnings.push(`thin comps (n=${comps.sampleSize})`);
  }
  if (!candidate.hasBoxAndPapers) {
    warnings.push('no box/papers — harder resale, priced in');
  }

  const pass = gatesFailed.length === 0;

  return {
    candidateId: candidate.id,
    pass,
    score: pass
      ? scoreDeal(
          projection.marginPct,
          minMarginPctFor(tierFor(listPriceUsd), config.pricing),
          discountPct,
          liquidity.score,
          comps.confidence,
          s,
        )
      : 0,
    gatesFailed,
    warnings,
    comps,
    liquidity,
    projection,
    discountToMarketPct: discountPct,
  };
}

/**
 * 0..100, for ranking the daily digest. Margin and liquidity dominate deliberately:
 * a fat margin on something that won't sell is a capital trap, and a fast seller with
 * no margin is unpaid work.
 */
function scoreDeal(
  marginPct: number,
  tierMinMarginPct: number,
  discountPct: number,
  liquidityScore: number,
  compConfidence: number,
  seller: Candidate['seller'],
): number {
  // Score margin RELATIVE to the tier's floor. A 2% margin is excellent on a
  // $15,000 watch and worthless on a $200 one; an absolute scale would rank every
  // high-value deal last.
  const marginScore = clamp01(marginPct / Math.max(tierMinMarginPct * 2.5, 0.02));
  const discountScore = clamp01(discountPct / 0.4);
  const sellerScore = clamp01(
    0.5 * clamp01(seller.feedbackScore / 500) +
      0.5 * clamp01((seller.positiveFeedbackPercent - 98) / 2),
  );

  const blended =
    0.35 * marginScore +
    0.25 * liquidityScore +
    0.2 * discountScore +
    0.12 * compConfidence +
    0.08 * sellerScore;

  return Math.round(blended * 100);
}

/**
 * What the daily digest actually shows you: the bid ceiling. "Market says $1,150,
 * we list at $1,035, do not pay more than $787 for it."
 */
export function bidCeiling(
  marketPriceUsd: number,
  config: DealConfig = DEFAULT_DEAL_CONFIG,
): { listPriceUsd: number; maxSourcePriceUsd: number } {
  const listPriceUsd = solveListPrice(marketPriceUsd, config.pricing);
  return {
    listPriceUsd,
    maxSourcePriceUsd: maxViableSourcePrice(listPriceUsd, config.pricing),
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
