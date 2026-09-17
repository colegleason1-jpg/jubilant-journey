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
  computeEconomics,
  discountToMarket,
  judgeDeal,
  maxSourcePrice,
  solveListPrice,
  DEFAULT_POLICY,
  type DealEconomics,
  type DealPolicy,
  type EconomicsInput,
} from './economics.ts';
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
  /** How far under market we advertise. */
  targetDiscountToMarket: number;
  /** The contribution floor and capacity state. See economics.ts. */
  policy: DealPolicy;
  economics: Omit<EconomicsInput, 'sourcePriceUsd' | 'listPriceUsd'>;
}

export const DEFAULT_DEAL_CONFIG: DealConfig = {
  // Was 500, inherited from the old "only source AG-eligible watches" rule. That
  // rule is gone: the $80 add-on is optional and Money Back Guarantee covers the
  // purchase regardless, so a $500 floor silently filtered out the whole cheap band.
  minSourcePriceUsd: 50,
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
  targetDiscountToMarket: 0.1,
  policy: DEFAULT_POLICY,
  economics: {},
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

  const listPriceUsd = solveListPrice(comps.marketPriceUsd, config.targetDiscountToMarket);
  const economicsInput = config.economics;
  const economics = computeEconomics({
    ...economicsInput,
    sourcePriceUsd: candidate.priceUsd,
    listPriceUsd,
  });
  const verdict = judgeDeal(economics, config.policy);
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
  // NOT a margin percentage. The floor is positive contribution after real cash
  // costs; anything above that is a capacity question, not a margin one. A $1
  // contribution plus a new customer beats an idle hour. See economics.ts.
  if (!verdict.accept) {
    gatesFailed.push('MARGIN');
    warnings.push(...verdict.reasons);
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
  if (economics.contributionUsd > 0 && economics.contributionPerHourUsd < 25) {
    warnings.push(
      `only $${economics.contributionPerHourUsd.toFixed(0)}/hr — fine when you have ` +
        `spare capacity, skip it when you don't`,
    );
  }
  if (comps.spreadPct > 0.3) {
    // NOT a reason to walk. A wide interquartile range in the pre-owned market is
    // the seller-sophistication signal this whole watchlist is selected for: some
    // owners priced from research and some did not. It does mean the median is a
    // less certain estimate — which comps.ts already prices in via spreadScore —
    // so the action is to verify the comp, not to skip the deal.
    warnings.push(
      `wide spread (IQR ${(comps.spreadPct * 100).toFixed(0)}% of median) — where ` +
        `the opportunity lives, but check the comp before trusting the number`,
    );
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
    score: pass ? scoreDeal(verdict.rankScore, liquidity.score, comps.confidence, s) : 0,
    gatesFailed,
    warnings,
    comps,
    liquidity,
    economics,
    maxSourceUsd: maxSourcePrice(listPriceUsd, economicsInput, config.policy),
    discountToMarketPct: discountPct,
  };
}

/**
 * 0..100, for ranking the daily digest.
 *
 * Ranks on ADJUSTED CONTRIBUTION PER HOUR — what an hour of your life is worth on
 * this deal, counting the customer it acquires, not just the watch it flips. A cheap
 * fast watch can and should outrank an expensive slow one.
 */
function scoreDeal(
  rankScoreUsdPerHour: number,
  liquidityScore: number,
  compConfidence: number,
  seller: Candidate['seller'],
): number {
  // $200/hr saturates the scale. Above that, sort by liquidity and confidence.
  const valueScore = clamp01(rankScoreUsdPerHour / 200);
  const sellerScore = clamp01(
    0.5 * clamp01(seller.feedbackScore / 500) +
      0.5 * clamp01((seller.positiveFeedbackPercent - 98) / 2),
  );

  const blended =
    0.5 * valueScore + 0.25 * liquidityScore + 0.15 * compConfidence + 0.1 * sellerScore;

  return Math.round(blended * 100);
}

/**
 * What the daily digest shows you: the bid ceiling. "Market says $2,600, we list at
 * $2,470, do not pay more than $2,322 for it."
 */
export function bidCeiling(
  marketPriceUsd: number,
  config: DealConfig = DEFAULT_DEAL_CONFIG,
): { listPriceUsd: number; maxSourcePriceUsd: number } {
  const listPriceUsd = solveListPrice(marketPriceUsd, config.targetDiscountToMarket);
  return {
    listPriceUsd,
    maxSourcePriceUsd: maxSourcePrice(listPriceUsd, config.economics, config.policy),
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
