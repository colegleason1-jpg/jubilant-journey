import type { Candidate, Condition, CompSource, ObservedSale } from '../src/types.ts';

const DAY_MS = 86_400_000;

export const NOW = new Date('2026-09-17T12:00:00Z');

export function daysAgo(n: number, from: Date = NOW): Date {
  return new Date(from.getTime() - n * DAY_MS);
}

export function sale(
  priceUsd: number,
  agoDays: number,
  overrides: Partial<ObservedSale> = {},
): ObservedSale {
  return {
    priceUsd,
    soldAt: daysAgo(agoDays),
    condition: 'EXCELLENT' as Condition,
    source: 'WATCHCHARTS' as CompSource,
    hasBoxAndPapers: false,
    ...overrides,
  };
}

/** `count` sales at `price`, evenly spaced `everyDays` apart, most recent today. */
export function regularSales(
  count: number,
  price: number,
  everyDays = 4,
): ObservedSale[] {
  return Array.from({ length: count }, (_, i) => sale(price, i * everyDays));
}

export function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'cand_1',
    ebayItemId: '1234567890',
    modelId: 'longines-hydroconquest-41',
    title: 'Longines HydroConquest 41mm Automatic L3.781.4 Blue Dial',
    priceUsd: 720,
    condition: 'EXCELLENT',
    hasBoxAndPapers: false,
    seller: {
      feedbackScore: 480,
      positiveFeedbackPercent: 99.6,
      accountAgeDays: 2200,
      returnsAccepted: true,
      itemLocationCountry: 'US',
    },
    listedAt: daysAgo(1),
    itemUrl: 'https://www.ebay.com/itm/1234567890',
    imageUrls: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'],
    usesStockPhotos: false,
    ...overrides,
  };
}
