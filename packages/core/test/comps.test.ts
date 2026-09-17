import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComps,
  computeLiquidity,
  median,
  medianAbsoluteDeviation,
  normalisePrice,
  quantile,
  weightedMedian,
} from '../src/comps.ts';
import { NOW, regularSales, sale } from './helpers.ts';

describe('robust statistics', () => {
  test('median handles odd and even lengths', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), 0);
    assert.equal(median([42]), 42);
  });

  test('quantile interpolates', () => {
    assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
    assert.equal(quantile([1, 2, 3, 4, 5], 0.75), 4);
    assert.equal(quantile([0, 10], 0.5), 5);
  });

  test('MAD is unmoved by a single absurd value', () => {
    const clean = [100, 101, 102, 103, 104];
    const polluted = [...clean, 99_999];
    // MAD barely moves; a standard deviation would explode.
    assert.ok(medianAbsoluteDeviation(polluted) < 5);
  });

  test('weightedMedian respects weights', () => {
    const points = [
      { value: 100, weight: 1 },
      { value: 200, weight: 1 },
      { value: 300, weight: 10 },
    ];
    assert.equal(weightedMedian(points), 300);
  });
});

describe('normalisePrice', () => {
  test('restates a GOOD sale as EXCELLENT (upward)', () => {
    const s = sale(920, 5, { condition: 'GOOD' });
    // 920 / 0.92 * 1.0 = 1000
    assert.equal(Math.round(normalisePrice(s, 'EXCELLENT', false)), 1000);
  });

  test('strips the box-and-papers premium when comparing to a bare watch', () => {
    const s = sale(1050, 5, { hasBoxAndPapers: true });
    // 1050 / 1.05 = 1000
    assert.equal(Math.round(normalisePrice(s, 'EXCELLENT', false)), 1000);
  });
});

describe('computeComps', () => {
  test('returns a zeroed, zero-confidence result with no sales', () => {
    const r = computeComps([], { now: NOW });
    assert.equal(r.sampleSize, 0);
    assert.equal(r.marketPriceUsd, 0);
    assert.equal(r.confidence, 0);
  });

  test('ignores sales outside the window', () => {
    const r = computeComps([sale(1150, 5), sale(1150, 200)], { now: NOW });
    assert.equal(r.sampleSize, 1);
  });

  test('rejects an absurd outlier via MAD', () => {
    const sales = [...regularSales(20, 1150), sale(18_000, 3)];
    const r = computeComps(sales, { now: NOW });
    assert.equal(r.outliersRejected, 1);
    assert.equal(r.marketPriceUsd, 1150);
  });

  test('weights recent sales more heavily than old ones', () => {
    // 10 old sales at 1300, 10 recent at 1000. The raw median sits in between;
    // the recency-weighted market price should track the recent, lower market.
    const sales = [
      ...Array.from({ length: 10 }, (_, i) => sale(1300, 60 + i)),
      ...Array.from({ length: 10 }, (_, i) => sale(1000, i)),
    ];
    const r = computeComps(sales, { now: NOW });
    assert.equal(r.marketPriceUsd, 1000);
    assert.ok(r.marketPriceUsd < r.p75Usd, 'weighted price below the upper quartile');
  });

  test('confidence is high for a large, tight, fresh sample', () => {
    const r = computeComps(regularSales(22, 1150), { now: NOW });
    assert.ok(r.confidence > 0.9, `expected >0.9, got ${r.confidence}`);
    assert.equal(r.spreadPct, 0);
  });

  test('confidence is low for a thin, stale, scattered sample', () => {
    const r = computeComps([sale(900, 80), sale(1400, 75), sale(1100, 70)], {
      now: NOW,
    });
    assert.ok(r.confidence < 0.5, `expected <0.5, got ${r.confidence}`);
  });
});

describe('computeLiquidity — the "tight sales" rule', () => {
  test('qualifies a model that sells every few days', () => {
    const r = computeLiquidity(regularSales(22, 1150, 4), { now: NOW });
    assert.equal(r.qualified, true);
    assert.equal(r.medianGapDays, 4);
    assert.deepEqual(r.failures, []);
    assert.ok(r.salesPerMonth > 7);
  });

  test('rejects "one sale every 3 months" — the case you called out', () => {
    const r = computeLiquidity([sale(1150, 0), sale(1150, 90)], { now: NOW });
    assert.equal(r.qualified, false);
    assert.ok(r.failures.includes('INSUFFICIENT_SALES'));
    assert.ok(r.failures.includes('SALES_TOO_SPARSE'));
  });

  test('rejects a clumpy model: plenty of sales, but all in one burst', () => {
    // 12 sales inside a single week, two months ago. Volume looks fine; it is not.
    const clump = Array.from({ length: 12 }, (_, i) => sale(1150, 60 + i * 0.5));
    const r = computeLiquidity(clump, { now: NOW });
    assert.equal(r.qualified, false);
    assert.ok(r.failures.includes('DROUGHT_TOO_LONG'));
    assert.ok(r.failures.includes('STALE_DEMAND'));
  });

  test('counts the trailing gap: a busy history that stopped is not liquid', () => {
    // 20 sales every 3 days, but nothing in the last 40 days.
    const sales = Array.from({ length: 20 }, (_, i) => sale(1150, 40 + i * 3));
    const r = computeLiquidity(sales, { now: NOW });
    assert.equal(r.qualified, false);
    assert.ok(r.failures.includes('STALE_DEMAND'));
    assert.equal(r.daysSinceLastSale, 40);
  });

  test('scores tight regular sales above sparse ones', () => {
    const tight = computeLiquidity(regularSales(22, 1150, 4), { now: NOW });
    const sparse = computeLiquidity(regularSales(9, 1150, 10), { now: NOW });
    assert.ok(tight.score > sparse.score);
  });

  test('handles an empty history without throwing', () => {
    const r = computeLiquidity([], { now: NOW });
    assert.equal(r.qualified, false);
    assert.deepEqual(r.failures, ['NO_SALES_IN_WINDOW']);
  });
});
