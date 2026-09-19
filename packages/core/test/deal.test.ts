import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bidCeiling,
  DEFAULT_DEAL_CONFIG,
  evaluateDeal,
  matchesBlocklist,
} from '../src/deal.ts';
import { candidate, NOW, regularSales, sale } from './helpers.ts';

/** A healthy, liquid reference trading at a steady $1,150. */
const GOOD_SALES = regularSales(22, 1150, 4);

describe('matchesBlocklist', () => {
  test('catches the obvious fraud words', () => {
    assert.deepEqual(
      matchesBlocklist('Rolex Submariner homage watch', DEFAULT_DEAL_CONFIG.titleBlocklist),
      ['homage'],
    );
    assert.ok(
      matchesBlocklist('Omega REPLICA - read description', DEFAULT_DEAL_CONFIG.titleBlocklist)
        .includes('replica'),
    );
  });

  test('matches whole words only — no false positives on "model" or "reputable"', () => {
    assert.deepEqual(
      matchesBlocklist(
        'Longines model L3.781.4 from a reputable modern seller',
        DEFAULT_DEAL_CONFIG.titleBlocklist,
      ),
      [],
    );
  });

  test('is case-insensitive', () => {
    assert.ok(
      matchesBlocklist('SEIKO FOR PARTS', DEFAULT_DEAL_CONFIG.titleBlocklist)
        .includes('parts'),
    );
  });
});

describe('evaluateDeal — the happy path', () => {
  const result = evaluateDeal(candidate(), GOOD_SALES, DEFAULT_DEAL_CONFIG, NOW);

  test('passes every gate', () => {
    assert.deepEqual(result.gatesFailed, []);
    assert.equal(result.pass, true);
  });

  test('prices against the recency-weighted market, not the ask', () => {
    assert.equal(result.comps.marketPriceUsd, 1150);
    assert.equal(result.economics.revenueUsd, 1035);
  });

  test('reports contribution and the bid ceiling', () => {
    assert.ok(result.economics.contributionUsd > 100);
    assert.ok(result.maxSourceUsd > result.economics.sourceCostUsd);
  });

  test('reports the discount being captured', () => {
    assert.equal(result.discountToMarketPct, 0.3739);
  });

  test('scores it meaningfully', () => {
    assert.ok(result.score > 50, `expected >50, got ${result.score}`);
  });
});

describe('evaluateDeal — gates', () => {
  test('a cheap watch is no longer filtered out before the engine sees it', () => {
    // The old $500 floor came from the "only source AG-eligible watches" rule and
    // silently removed the entire cheap band. A $420 watch against a $620 market is
    // a real deal and should be judged on its contribution like anything else.
    const r = evaluateDeal(
      candidate({ priceUsd: 420 }),
      regularSales(22, 620, 4),
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    // Assert the WHOLE verdict, not just PRICE_BAND. The earlier version of this
    // test checked only that one gate, so when AUTHENTICATION_ELIGIBLE re-imposed
    // the identical $500 floor through authTierForPrice() the test stayed green.
    // A floor can come back through any gate; only an empty list rules them all out.
    assert.deepEqual(r.gatesFailed, [], `a $420 deal should clear every gate`);
    assert.ok(r.pass, 'a $420 deal against a $620 market should pass');
    assert.ok(r.economics.contributionUsd > 0, `contribution ${r.economics.contributionUsd}`);
  });

  test('no gate imposes a price floor anywhere in the cheap band', () => {
    // Walks the band the $500 floor used to silently remove. Any gate that keys off
    // an absolute price threshold shows up here as a cliff.
    for (const priceUsd of [80, 150, 250, 350, 420, 499, 501]) {
      const r = evaluateDeal(
        candidate({ priceUsd }),
        regularSales(22, priceUsd * 1.6, 4),
        DEFAULT_DEAL_CONFIG,
        NOW,
      );
      assert.deepEqual(
        r.gatesFailed,
        [],
        `$${priceUsd} should clear every gate, failed: ${r.gatesFailed.join(', ')}`,
      );
    }
  });

  test('still rejects below the configured floor', () => {
    const r = evaluateDeal(
      candidate({ priceUsd: 25 }),
      regularSales(22, 620, 4),
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.ok(r.gatesFailed.includes('PRICE_BAND'));
  });

  test('rejects an illiquid model however good the price', () => {
    // Sells twice in 90 days. The price is a steal; the capital would be stuck.
    const r = evaluateDeal(
      candidate({ priceUsd: 600 }),
      [sale(1150, 2), sale(1150, 88)],
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.ok(r.gatesFailed.includes('LIQUIDITY'));
    assert.equal(r.pass, false);
  });

  test('rejects a seller who will not take returns', () => {
    const c = candidate();
    const r = evaluateDeal(
      { ...c, seller: { ...c.seller, returnsAccepted: false } },
      GOOD_SALES,
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.deepEqual(r.gatesFailed, ['RETURNS_ACCEPTED']);
  });

  test('rejects a low-reputation seller', () => {
    const c = candidate();
    const r = evaluateDeal(
      {
        ...c,
        seller: { ...c.seller, feedbackScore: 3, positiveFeedbackPercent: 92, accountAgeDays: 20 },
      },
      GOOD_SALES,
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.ok(r.gatesFailed.includes('SELLER_QUALITY'));
  });

  test('rejects insufficient discount', () => {
    const r = evaluateDeal(candidate({ priceUsd: 1050 }), GOOD_SALES, DEFAULT_DEAL_CONFIG, NOW);
    assert.ok(r.gatesFailed.includes('DISCOUNT_TO_MARKET'));
    assert.ok(r.gatesFailed.includes('MARGIN'), 'buying above our list price loses cash');
  });

  test('accepts a thin-but-positive deal that a margin gate would have killed', () => {
    // Buying at $850 against a $1,150 market: 26% under, where the old 12% margin
    // gate demanded 34%. It still contributes real money — and a customer, which a
    // margin percentage cannot see at all.
    const thin = evaluateDeal(
      candidate({ priceUsd: 850 }),
      GOOD_SALES,
      { ...DEFAULT_DEAL_CONFIG, minDiscountToMarketPct: 0.1 },
      NOW,
    );
    assert.ok(thin.economics.contributionUsd > 0, `contribution ${thin.economics.contributionUsd}`);
    assert.ok(!thin.gatesFailed.includes('MARGIN'));
  });

  test('treats an implausible bargain as a red flag, not a win', () => {
    const r = evaluateDeal(
      candidate({ priceUsd: 550 }), // 52% under market
      GOOD_SALES,
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.ok(r.gatesFailed.includes('TOO_GOOD_TO_BE_TRUE'));
    assert.equal(r.pass, false);
    assert.ok(r.warnings.some((w) => w.includes('under market')));
  });

  test('rejects stock photography', () => {
    const r = evaluateDeal(
      candidate({ usesStockPhotos: true }),
      GOOD_SALES,
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.deepEqual(r.gatesFailed, ['STOCK_PHOTOS']);
  });

  test('rejects a blocklisted title', () => {
    const r = evaluateDeal(
      candidate({ title: 'Longines HydroConquest - franken, sold for parts' }),
      GOOD_SALES,
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.ok(r.gatesFailed.includes('TITLE_BLOCKLIST'));
  });

  test('rejects a reference we cannot price confidently', () => {
    const r = evaluateDeal(
      candidate({ priceUsd: 600 }),
      [sale(900, 70), sale(1500, 65), sale(1100, 60)],
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.ok(r.gatesFailed.includes('COMP_CONFIDENCE'));
  });
});

describe('evaluateDeal — non-blocking warnings', () => {
  test('flags thin photography without failing the deal', () => {
    const r = evaluateDeal(
      candidate({ imageUrls: ['only.jpg'] }),
      GOOD_SALES,
      DEFAULT_DEAL_CONFIG,
      NOW,
    );
    assert.equal(r.pass, true);
    assert.ok(r.warnings.some((w) => w.includes('few photos')));
  });

  test('notes missing box and papers', () => {
    const r = evaluateDeal(candidate(), GOOD_SALES, DEFAULT_DEAL_CONFIG, NOW);
    assert.ok(r.warnings.some((w) => w.includes('box/papers')));
  });
});

describe('bidCeiling — what the daily digest shows you', () => {
  test('turns a market price into a list price and a hard maximum bid', () => {
    const { listPriceUsd, maxSourcePriceUsd } = bidCeiling(1150);
    assert.equal(listPriceUsd, 1035);
    // ~$943, i.e. 82% of market. Was $763 (66%) under the margin-percent gate, then
    // $863 (75%) while we were needlessly paying the $80 authentication add-on.
    assert.ok(maxSourcePriceUsd > 920 && maxSourcePriceUsd < 970);
    assert.ok(maxSourcePriceUsd < listPriceUsd, 'never pay more than we can list for');
  });
});
