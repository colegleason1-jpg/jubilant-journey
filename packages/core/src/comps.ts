/**
 * The comp engine.
 *
 * Two jobs:
 *   1. computeComps()     — what is this watch actually worth?
 *   2. computeLiquidity() — will it sell, and will it sell *regularly*?
 *
 * (2) matters as much as (1). A model with a great price and clumpy sales is a capital
 * trap. See docs/10 risk #4.
 */

import type {
  CompResult,
  CompSource,
  Condition,
  LiquidityResult,
  ObservedSale,
} from './types.ts';

const DAY_MS = 86_400_000;

// ─────────────────────────────── robust statistics ───────────────────────────────

/** Linear-interpolated quantile. Input need not be sorted. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/**
 * Median absolute deviation — a dispersion measure that a couple of absurd prices
 * can't drag around, unlike standard deviation. This is why we use it for outlier
 * rejection: one $18,000 "Seiko" typo shouldn't move our view of the market.
 */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Weighted median: the value where cumulative weight crosses half the total.
 * Used so that a sale from 3 days ago counts for more than one from 80 days ago.
 */
export function weightedMedian(
  points: readonly { value: number; weight: number }[],
): number {
  const usable = points.filter((p) => p.weight > 0 && Number.isFinite(p.value));
  if (usable.length === 0) return 0;
  const sorted = [...usable].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, p) => s + p.weight, 0);
  let cumulative = 0;
  for (const p of sorted) {
    cumulative += p.weight;
    if (cumulative >= total / 2) return p.value;
  }
  return sorted[sorted.length - 1]!.value;
}

// ───────────────────────────────── adjustments ───────────────────────────────────

/** Price multipliers relative to an EXCELLENT baseline. Tune against your own sales. */
export const CONDITION_FACTOR: Record<Condition, number> = {
  NEW: 1.15,
  NEW_OTHER: 1.08,
  EXCELLENT: 1.0,
  GOOD: 0.92,
  FAIR: 0.8,
};

/** Full set is worth roughly 5% more than a watch-only sale in this segment. */
export const BOX_AND_PAPERS_PREMIUM = 1.05;

/** How much we trust each source. Our own closed sales are ground truth. */
export const SOURCE_WEIGHT: Record<CompSource, number> = {
  OWN: 1.0,
  WATCHCHARTS: 0.9,
  TERAPEAK: 0.8,
  CHRONO24: 0.5,
};

/**
 * Restate an observed sale as if it were the target condition and completeness,
 * so unlike sales become comparable.
 */
export function normalisePrice(
  sale: ObservedSale,
  targetCondition: Condition,
  targetBoxAndPapers: boolean,
): number {
  const conditionAdj =
    CONDITION_FACTOR[targetCondition] / CONDITION_FACTOR[sale.condition];
  const saleBP = sale.hasBoxAndPapers ? BOX_AND_PAPERS_PREMIUM : 1;
  const targetBP = targetBoxAndPapers ? BOX_AND_PAPERS_PREMIUM : 1;
  return sale.priceUsd * conditionAdj * (targetBP / saleBP);
}

// ────────────────────────────────── comps ────────────────────────────────────────

export interface CompOptions {
  windowDays?: number;
  /** A sale this many days old counts half as much as one today. */
  halfLifeDays?: number;
  /** Reject sales further than this many MADs from the median. */
  outlierMadMultiplier?: number;
  targetCondition?: Condition;
  targetBoxAndPapers?: boolean;
  now?: Date;
}

const COMP_DEFAULTS = {
  windowDays: 90,
  halfLifeDays: 30,
  outlierMadMultiplier: 3,
  targetCondition: 'EXCELLENT' as Condition,
  targetBoxAndPapers: false,
};

export function computeComps(
  sales: readonly ObservedSale[],
  options: CompOptions = {},
): CompResult {
  const o = { ...COMP_DEFAULTS, ...options };
  const now = options.now ?? new Date();

  const inWindow = sales.filter((s) => {
    const age = (now.getTime() - s.soldAt.getTime()) / DAY_MS;
    return age >= 0 && age <= o.windowDays && s.priceUsd > 0;
  });

  if (inWindow.length === 0) {
    return {
      sampleSize: 0,
      marketPriceUsd: 0,
      rawMedianUsd: 0,
      p25Usd: 0,
      p75Usd: 0,
      spreadPct: 0,
      madUsd: 0,
      outliersRejected: 0,
      confidence: 0,
      windowDays: o.windowDays,
      asOf: now,
    };
  }

  const normalised = inWindow.map((s) => ({
    sale: s,
    value: normalisePrice(s, o.targetCondition, o.targetBoxAndPapers),
  }));

  // Reject outliers on the normalised values using MAD.
  const values = normalised.map((n) => n.value);
  const med = median(values);
  const mad = medianAbsoluteDeviation(values);
  // MAD of 0 happens with tiny or identical samples; fall back to a 35% band so we
  // don't reject everything.
  const tolerance = mad > 0 ? mad * o.outlierMadMultiplier : med * 0.35;
  const kept = normalised.filter((n) => Math.abs(n.value - med) <= tolerance);
  const outliersRejected = normalised.length - kept.length;

  const keptValues = kept.map((k) => k.value);
  const rawMedianUsd = median(keptValues);

  // Recency × source weighting.
  const weighted = kept.map((k) => {
    const ageDays = (now.getTime() - k.sale.soldAt.getTime()) / DAY_MS;
    const recency = Math.pow(0.5, ageDays / o.halfLifeDays);
    return { value: k.value, weight: recency * SOURCE_WEIGHT[k.sale.source] };
  });
  const marketPriceUsd = weightedMedian(weighted);

  const p25Usd = quantile(keptValues, 0.25);
  const p75Usd = quantile(keptValues, 0.75);
  const spreadPct = rawMedianUsd > 0 ? (p75Usd - p25Usd) / rawMedianUsd : 0;

  const daysSinceLast = Math.min(
    ...kept.map((k) => (now.getTime() - k.sale.soldAt.getTime()) / DAY_MS),
  );

  // Confidence blends sample size, price agreement, and freshness.
  const sizeScore = Math.min(1, kept.length / 20);
  // Wide spread lowers CONFIDENCE, not desirability. Estimate certainty and profit
  // opportunity are different questions: dispersion is where the money is (see the
  // watchlist criteria) but it also makes the median a looser claim. Do not 'fix'
  // this to reward spread — deal.ts is where opportunity is judged.
  const spreadScore = clamp01(1 - spreadPct / 0.5);
  const recencyScore = clamp01(1 - daysSinceLast / 45);
  const confidence = 0.4 * sizeScore + 0.35 * spreadScore + 0.25 * recencyScore;

  return {
    sampleSize: kept.length,
    marketPriceUsd: round2(marketPriceUsd),
    rawMedianUsd: round2(rawMedianUsd),
    p25Usd: round2(p25Usd),
    p75Usd: round2(p75Usd),
    spreadPct: round4(spreadPct),
    madUsd: round2(mad),
    outliersRejected,
    confidence: round4(confidence),
    windowDays: o.windowDays,
    asOf: now,
  };
}

// ──────────────────────────────── liquidity ──────────────────────────────────────

export interface LiquidityOptions {
  windowDays?: number;
  /** Too few sales and we're guessing, however good they look. */
  minSales?: number;
  /** Typical gap between sales. The direct expression of "tight sales". */
  maxMedianGapDays?: number;
  /** A single drought this long disqualifies, even if the average looks fine. */
  maxDroughtDays?: number;
  /** If nothing has sold recently, whatever the history says, demand has moved. */
  maxDaysSinceLastSale?: number;
  now?: Date;
}

const LIQUIDITY_DEFAULTS = {
  windowDays: 90,
  minSales: 8,
  maxMedianGapDays: 10,
  maxDroughtDays: 30,
  maxDaysSinceLastSale: 21,
};

/**
 * Your "not one sale every 3 months" rule, made into math.
 *
 * Note the trailing gap: the interval between the most recent sale and *now* counts
 * as a gap. Without it, a model that sold 10 times in one week two months ago would
 * look perfectly liquid.
 */
export function computeLiquidity(
  sales: readonly ObservedSale[],
  options: LiquidityOptions = {},
): LiquidityResult {
  const o = { ...LIQUIDITY_DEFAULTS, ...options };
  const now = options.now ?? new Date();

  const inWindow = sales
    .filter((s) => {
      const age = (now.getTime() - s.soldAt.getTime()) / DAY_MS;
      return age >= 0 && age <= o.windowDays;
    })
    .sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());

  const failures: string[] = [];

  if (inWindow.length === 0) {
    return {
      qualified: false,
      sampleSize: 0,
      salesPerMonth: 0,
      medianGapDays: Infinity,
      longestGapDays: Infinity,
      daysSinceLastSale: Infinity,
      score: 0,
      failures: ['NO_SALES_IN_WINDOW'],
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < inWindow.length; i++) {
    gaps.push(
      (inWindow[i]!.soldAt.getTime() - inWindow[i - 1]!.soldAt.getTime()) / DAY_MS,
    );
  }
  const last = inWindow[inWindow.length - 1]!;
  const daysSinceLastSale = (now.getTime() - last.soldAt.getTime()) / DAY_MS;
  gaps.push(daysSinceLastSale); // trailing gap — see doc comment

  const medianGapDays = median(gaps);
  const longestGapDays = Math.max(...gaps);
  const salesPerMonth = inWindow.length / (o.windowDays / 30);

  if (inWindow.length < o.minSales) failures.push('INSUFFICIENT_SALES');
  if (medianGapDays > o.maxMedianGapDays) failures.push('SALES_TOO_SPARSE');
  if (longestGapDays > o.maxDroughtDays) failures.push('DROUGHT_TOO_LONG');
  if (daysSinceLastSale > o.maxDaysSinceLastSale) failures.push('STALE_DEMAND');

  const volumeScore = clamp01(inWindow.length / (o.minSales * 2));
  const tightnessScore = clamp01(1 - medianGapDays / (o.maxMedianGapDays * 2));
  const consistencyScore = clamp01(1 - longestGapDays / (o.maxDroughtDays * 2));
  const freshnessScore = clamp01(1 - daysSinceLastSale / (o.maxDaysSinceLastSale * 2));
  const score =
    0.3 * volumeScore +
    0.3 * tightnessScore +
    0.25 * consistencyScore +
    0.15 * freshnessScore;

  return {
    qualified: failures.length === 0,
    sampleSize: inWindow.length,
    salesPerMonth: round2(salesPerMonth),
    medianGapDays: round2(medianGapDays),
    longestGapDays: round2(longestGapDays),
    daysSinceLastSale: round2(daysSinceLastSale),
    score: round4(score),
    failures,
  };
}

// ────────────────────────────────── helpers ──────────────────────────────────────

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}
