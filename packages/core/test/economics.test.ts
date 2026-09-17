import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEconomics,
  DEFAULT_LTV,
  DEFAULT_POLICY,
  judgeDeal,
  maxSourcePrice,
  newCustomerCreditUsd,
  packagingCostUsd,
  shippingCostUsd,
} from '../src/economics.ts';

describe('the $2,600 case the margin model threw away', () => {
  const e = computeEconomics({
    sourcePriceUsd: 2300,
    listPriceUsd: 2450, // only 5.8% under a $2,600 market
    rail: 'CARD',
    authenticationUsd: 0,
  });

  test('it is profitable, and the old 27%-discount gate rejected it', () => {
    assert.ok(e.contributionUsd > 1, `contribution ${e.contributionUsd}`);
    assert.equal(judgeDeal(e).accept, true);
  });

  test('on ACH the same deal is worth nearly 20x more', () => {
    const ach = computeEconomics({
      sourcePriceUsd: 2300,
      listPriceUsd: 2450,
      rail: 'ACH',
      authenticationUsd: 0,
    });
    // $70.10 vs $3.68. The rail is most of the deal at this size.
    assert.ok(ach.contributionUsd > e.contributionUsd * 10);
  });

  test('$10 on a $2,600 watch is accepted, exactly as asked', () => {
    const thin = computeEconomics({
      sourcePriceUsd: 2360,
      listPriceUsd: 2450,
      rail: 'ACH',
      authenticationUsd: 0,
    });
    assert.ok(thin.contributionUsd > 1 && thin.contributionUsd < 30);
    assert.equal(judgeDeal(thin).accept, true);
  });

  test('but a genuine loss is still refused', () => {
    const loss = computeEconomics({
      sourcePriceUsd: 2450,
      listPriceUsd: 2450,
      rail: 'ACH',
      authenticationUsd: 0,
    });
    assert.ok(loss.contributionUsd < 0);
    assert.equal(judgeDeal(loss).accept, false);
  });
});

describe('a dollar on a $30 watch', () => {
  const e = computeEconomics({
    sourcePriceUsd: 25,
    listPriceUsd: 29,
    authenticationUsd: 0,
  });

  test('is accepted', () => {
    assert.ok(e.contributionUsd >= 1);
    assert.equal(judgeDeal(e).accept, true);
  });

  test('and carries the same customer credit as a $10,000 sale', () => {
    const big = computeEconomics({
      sourcePriceUsd: 9000,
      listPriceUsd: 9500,
      authenticationUsd: 0,
    });
    assert.equal(e.strategicCreditUsd, big.strategicCreditUsd);
  });

  test('postage is charged to the buyer at this size, not absorbed', () => {
    assert.ok(e.shippingCollectedUsd > 0);
    assert.equal(e.revenueUsd, 29 + e.outboundShippingUsd);
  });
});

describe('the only hard floor is positive contribution', () => {
  test('accepts a $1 contribution at every price point when capacity is abundant', () => {
    for (const market of [30, 100, 350, 900, 2600, 5000, 10000, 18000]) {
      const list = market >= 100 ? Math.round((market * 0.95) / 5) * 5 : Math.round(market * 0.95);
      const ceiling = maxSourcePrice(list, { authenticationUsd: 0 });
      const e = computeEconomics({
        sourcePriceUsd: ceiling,
        listPriceUsd: list,
        authenticationUsd: 0,
      });
      assert.ok(e.contributionUsd >= 0.5, `market ${market}: ${e.contributionUsd}`);
      assert.equal(judgeDeal(e).accept, true, `market ${market}`);
    }
  });

  test('the required buy discount is single-digit at most price points now', () => {
    // The old model demanded 27% at $2,600. The real constraint is far looser.
    const ceiling = maxSourcePrice(2470, { authenticationUsd: 0 });
    assert.ok(ceiling / 2600 > 0.85, `can buy at ${(ceiling / 2600) * 100}% of market`);
  });

  test('never accepts a deal that loses cash', () => {
    const e = computeEconomics({ sourcePriceUsd: 1000, listPriceUsd: 900 });
    assert.ok(e.contributionUsd < 0);
    assert.equal(judgeDeal(e).accept, false);
  });

  test('strategic credit does not paper over a cash loss by default', () => {
    const e = computeEconomics({ sourcePriceUsd: 400, listPriceUsd: 420 });
    assert.ok(e.adjustedContributionUsd > 0, 'LTV credit makes it look fine...');
    assert.ok(e.contributionUsd < 0, '...but the cash is negative');
    assert.equal(judgeDeal(e).accept, false, 'and the floor is cash-real by default');
  });

  test('unless you explicitly opt in to counting it', () => {
    const e = computeEconomics({ sourcePriceUsd: 400, listPriceUsd: 420 });
    const verdict = judgeDeal(e, {
      ...DEFAULT_POLICY,
      countStrategicCreditTowardFloor: true,
    });
    assert.equal(verdict.accept, true);
  });
});

describe('capacity, not margin, is what rejects a thin deal', () => {
  const thin = computeEconomics({
    sourcePriceUsd: 2300,
    listPriceUsd: 2450,
    rail: 'CARD',
    authenticationUsd: 0,
  });

  test('abundant capacity takes it — a $6 hour beats an idle hour', () => {
    assert.equal(judgeDeal(thin, DEFAULT_POLICY).accept, true);
  });

  test('constrained capacity declines it, and says why', () => {
    const verdict = judgeDeal(thin, {
      ...DEFAULT_POLICY,
      capacity: 'CONSTRAINED',
      minContributionPerHourUsd: 60,
    });
    assert.equal(verdict.accept, false);
    assert.ok(verdict.reasons.some((r) => r.includes('scarce')));
  });

  test('a fat deal is taken under either capacity state', () => {
    const fat = computeEconomics({
      sourcePriceUsd: 720,
      listPriceUsd: 1035,
      authenticationUsd: 80,
    });
    assert.equal(judgeDeal(fat, DEFAULT_POLICY).accept, true);
    assert.equal(judgeDeal(fat, { ...DEFAULT_POLICY, capacity: 'CONSTRAINED' }).accept, true);
  });

  test('ranking is on adjusted contribution per hour, not margin percentage', () => {
    // A cheap watch with a tiny margin can outrank an expensive one, because the
    // customer is worth the same and the hour is shorter.
    const cheapFast = computeEconomics({ sourcePriceUsd: 20, listPriceUsd: 40, authenticationUsd: 0 });
    const dearSlow = computeEconomics({ sourcePriceUsd: 9350, listPriceUsd: 9500, authenticationUsd: 0 });
    assert.ok(judgeDeal(cheapFast).rankScore > judgeDeal(dearSlow).rankScore);
  });
});

describe('customer value, sourced not invented', () => {
  test('a new customer is worth about a published CAC benchmark', () => {
    const credit = newCustomerCreditUsd();
    // Cross-check: ~$48 CAC benchmark for >$200-AOV ecommerce. Acquiring a customer
    // should be worth roughly what acquiring one costs.
    assert.ok(credit > 35 && credit < 60, `credit ${credit}`);
  });

  test('it scales with the assumptions, which are all configurable', () => {
    const conservative = newCustomerCreditUsd({ ...DEFAULT_LTV, repeatRate: 0.05, expectedReferrals: 0 });
    const optimistic = newCustomerCreditUsd({ ...DEFAULT_LTV, repeatRate: 0.2, expectedReferrals: 0.3 });
    assert.ok(optimistic > conservative * 3);
  });

  test('repeat customers get no acquisition credit — they are already acquired', () => {
    const e = computeEconomics({
      sourcePriceUsd: 720,
      listPriceUsd: 1035,
      isNewCustomer: false,
    });
    assert.equal(e.strategicCreditUsd, 0);
    assert.equal(e.adjustedContributionUsd, e.contributionUsd);
  });
});

describe('the shipping curve', () => {
  test('is a curve over value, not seven hand-picked buckets', () => {
    const values = [30, 150, 300, 800, 1500, 3000, 8000, 20000];
    const costs = values.map((v) => shippingCostUsd(v));
    for (let i = 1; i < costs.length; i++) {
      assert.ok(costs[i]! > costs[i - 1]!, `${values[i]} should cost more than ${values[i - 1]}`);
    }
  });

  test('a cheap watch gets a padded envelope, not insured Express', () => {
    assert.ok(shippingCostUsd(30) < 10);
  });

  test('insurance is only charged above the included $100', () => {
    assert.equal(shippingCostUsd(80), shippingCostUsd(100));
    assert.ok(shippingCostUsd(300) > shippingCostUsd(100));
  });

  test('packaging scales too', () => {
    assert.ok(packagingCostUsd(30) < packagingCostUsd(800));
    assert.ok(packagingCostUsd(800) < packagingCostUsd(9000));
  });
});

describe('eBay Partner Network credit', () => {
  test('is zero by default — unverified revenue is not in the base case', () => {
    const e = computeEconomics({ sourcePriceUsd: 720, listPriceUsd: 1035 });
    assert.equal(e.epnCreditUsd, 0);
  });

  test('can be switched on once EPN confirms self-referral is permitted', () => {
    const e = computeEconomics({
      sourcePriceUsd: 720,
      listPriceUsd: 1035,
      epnCommissionRate: 0.015,
    });
    assert.equal(e.epnCreditUsd, 10.8);
  });
});

describe('the envelope band', () => {
  test('a watch under $50 ships in a mailer, not a box', () => {
    assert.ok(shippingCostUsd(30) < shippingCostUsd(60));
    assert.equal(shippingCostUsd(30), shippingCostUsd(49));
  });

  test('the switch happens exactly at $50', () => {
    assert.ok(shippingCostUsd(50) > shippingCostUsd(49.99));
  });

  test('packaging switches with it', () => {
    assert.ok(packagingCostUsd(30) < packagingCostUsd(60));
  });

  test('the curve stays monotonic across the switch', () => {
    const values = [25, 49, 50, 80, 200, 400, 900, 1500, 3000, 8000];
    const costs = values.map((v) => shippingCostUsd(v) + packagingCostUsd(v));
    for (let i = 1; i < costs.length; i++) {
      assert.ok(costs[i]! >= costs[i - 1]!, `${values[i]} should not cost less than ${values[i - 1]}`);
    }
  });

  test('it materially improves the cheap band', () => {
    // A few dollars is most of the contribution down here.
    const e = computeEconomics({ sourcePriceUsd: 14, listPriceUsd: 29, authenticationUsd: 0 });
    assert.ok(e.contributionUsd > 8, `contribution ${e.contributionUsd}`);
  });
});
