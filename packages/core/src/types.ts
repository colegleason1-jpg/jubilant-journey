/**
 * Domain types for the Gleason Timepiece deal engine.
 *
 * Deliberately dependency-free and framework-free. This package is the only part of
 * the system that is expensive to get right, so it must survive a migration from the
 * custom Next.js storefront to Medusa (or anything else) unchanged. See docs/05.
 */

export type Condition = 'NEW' | 'NEW_OTHER' | 'EXCELLENT' | 'GOOD' | 'FAIR';

/** Where an observed sale price came from. Ordered by how much we trust it. */
export type CompSource =
  | 'OWN' // our own closed sales — ground truth, no one else has it
  | 'WATCHCHARTS' // licensed market data (docs/04 J2)
  | 'TERAPEAK' // manual weekly refresh, eBay's own numbers
  | 'CHRONO24'; // dealer asks, adjusted — weakest

export interface WatchModel {
  id: string;
  brand: string;
  reference: string;
  nickname?: string;
  /** Current MSRP if still in production. Used as a sanity ceiling. */
  retailPriceUsd?: number;
}

/** A single observed sale. The atom of the comp engine. */
export interface ObservedSale {
  priceUsd: number;
  soldAt: Date;
  condition: Condition;
  source: CompSource;
  hasBoxAndPapers?: boolean;
}

export interface CompResult {
  sampleSize: number;
  /** Recency-weighted median. This is THE number — what we price against. */
  marketPriceUsd: number;
  rawMedianUsd: number;
  p25Usd: number;
  p75Usd: number;
  /** Interquartile spread as a fraction of the median. High = disagreement = danger. */
  spreadPct: number;
  /** Median absolute deviation, in dollars. Robust dispersion measure. */
  madUsd: number;
  outliersRejected: number;
  /** 0..1. Below `minCompConfidence` we refuse to trade the model at all. */
  confidence: number;
  windowDays: number;
  asOf: Date;
}

/**
 * The formalisation of "make sure the sales are tight and not one every 3 months."
 *
 * A model can have a great average price and still be untradeable if the sales arrive
 * in irregular clumps: capital gets stuck, and stuck capital is what actually kills
 * businesses like this. See docs/10 risk #4.
 */
export interface LiquidityResult {
  qualified: boolean;
  sampleSize: number;
  salesPerMonth: number;
  /** Median days between consecutive sales. The "tightness" measure. */
  medianGapDays: number;
  /** Worst drought in the window. One 60-day gap disqualifies an otherwise busy model. */
  longestGapDays: number;
  /** Days since the most recent observed sale. Stale data is not liquidity. */
  daysSinceLastSale: number;
  /** 0..1, blended. Used for ranking, not gating. */
  score: number;
  failures: string[];
}

export interface EbaySellerSnapshot {
  feedbackScore: number;
  positiveFeedbackPercent: number;
  accountAgeDays: number;
  returnsAccepted: boolean;
  itemLocationCountry: string;
}

/** A raw eBay listing after J1 discovery + normalisation. */
export interface Candidate {
  id: string;
  ebayItemId: string;
  modelId: string;
  title: string;
  priceUsd: number;
  condition: Condition;
  hasBoxAndPapers: boolean;
  seller: EbaySellerSnapshot;
  listedAt: Date;
  itemUrl: string;
  imageUrls: string[];
  /** True when the listing images collide with known manufacturer press photos. */
  usesStockPhotos?: boolean;
}

export type GateName =
  | 'PRICE_BAND'
  | 'COMP_CONFIDENCE'
  | 'LIQUIDITY'
  | 'DISCOUNT_TO_MARKET'
  | 'MARGIN'
  | 'SELLER_QUALITY'
  | 'RETURNS_ACCEPTED'
  | 'TITLE_BLOCKLIST'
  | 'AUTHENTICATION_ELIGIBLE'
  | 'STOCK_PHOTOS'
  | 'TOO_GOOD_TO_BE_TRUE';

export interface DealEvaluation {
  candidateId: string;
  /** True only if every gate passed. Only these reach the daily digest. */
  pass: boolean;
  /** 0..100. Ranks the survivors. */
  score: number;
  gatesFailed: GateName[];
  /** Passed, but a human should look harder. */
  warnings: string[];
  comps: CompResult;
  liquidity: LiquidityResult;
  /** Full contribution breakdown. See economics.ts. */
  economics: import('./economics.ts').DealEconomics;
  /** The bid ceiling: pay more than this and the deal stops paying for itself. */
  maxSourceUsd: number;
  discountToMarketPct: number;
}

/**
 * Authenticity Guarantee tier, driven by eBay's price bands.
 * FREE at $2,000+; $80 buyer-paid add-on from $500–$1,999.99; unavailable below.
 * See docs/01 §4.
 */
export type AuthTier = 'FREE' | 'ADDON' | 'NONE';
