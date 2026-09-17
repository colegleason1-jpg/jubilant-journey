import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfferLadder,
  DEFAULT_ROUTING,
  maxCustomerDiscount,
  routeFulfilment,
  tradeability,
  viableRungs,
  type RoutingSignals,
} from '../src/offers.ts';
import { computeEconomics } from '../src/economics.ts';

describe('the fluid buy band', () => {
  test('buying at 90% of market is workable from $2,600 up', () => {
    // The old margin gate said this lost money at every price point under $5,000.
    // It does not.
    for (const market of [2600, 5000, 10000, 18000]) {
      assert.ok(
        maxCustomerDiscount(market, market * 0.9) !== null,
        `market $${market} at 90% should be workable`,
      );
    }
  });

  test('the $500 authentication add-on is what blocks 90% lower down', () => {
    // At a $900 market the $80 Authenticity Guarantee fee is ~9% of the order, so
    // buying at 90% cannot cover it. A real constraint, not a policy choice.
    assert.equal(maxCustomerDiscount(900, 810), null);
    assert.ok(maxCustomerDiscount(900, 810, { authenticationUsd: 0 }) !== null);
  });

  test('the discount we can pass on grows with order size', () => {
    assert.ok(maxCustomerDiscount(10000, 9000)! >= maxCustomerDiscount(2600, 2340)!);
  });

  test('but buying above what we can list for is still refused', () => {
    assert.equal(maxCustomerDiscount(1000, 1200), null);
  });

  test('a $1,000 watch bought at $925 still loses — the floor is cash-real', () => {
    assert.ok(computeEconomics({ sourcePriceUsd: 925, listPriceUsd: 900 }).contributionUsd < 0);
  });

  test('a $30 watch is tradeable, and the postage goes to the buyer', () => {
    const t = tradeability(30);
    assert.equal(t.tradeable, true);
    assert.equal(t.profile.label, 'MICRO');
    assert.ok(t.economicsAtCeiling.contributionUsd >= 0.5);
    assert.ok(t.economicsAtCeiling.shippingCollectedUsd > 0);
  });

  test('so is a $100 one', () => {
    assert.equal(tradeability(100).tradeable, true);
  });

  test('the required discount is modest at every price point', () => {
    for (const m of [30, 100, 900, 2600, 10000, 18000]) {
      const req = tradeability(m).requiredDiscountFromMarket;
      // Worst case is ~25% at $900, where the $80 authentication add-on is nearly a
      // tenth of the order. Everywhere else it is far shallower. The old margin gate
      // demanded 27-53% across this same range.
      assert.ok(req <= 0.26, `$${m} needs ${(req * 100).toFixed(1)}% off`);
    }
    assert.ok(tradeability(10000).requiredDiscountFromMarket < 0.13);
    assert.ok(tradeability(2600).requiredDiscountFromMarket < 0.17);
  });

  test('every band is tradeable — nothing is structurally dead', () => {
    for (const m of [30, 60, 100, 250, 600, 900, 1500, 2600, 5000, 10000, 40000]) {
      assert.equal(tradeability(m).tradeable, true, `$${m} should be tradeable`);
    }
  });

  test('returns null rather than a bad number when nothing clears the floors', () => {
    assert.equal(maxCustomerDiscount(1000, 1200), null);
    assert.equal(maxCustomerDiscount(0, 500), null);
    assert.equal(maxCustomerDiscount(1000, 0), null);
  });
});

describe('offer ladder', () => {
  test('builds 10% -> 5% -> pay the ask, within eBay\'s 3-offer budget', () => {
    const ladder = buildOfferLadder(800, 1035);
    assert.equal(ladder.length, 3);
    assert.deepEqual(ladder.map((r) => r.discountFromAsk), [0.1, 0.05, 0]);
    assert.deepEqual(ladder.map((r) => r.offerUsd), [720, 760, 800]);
  });

  test('contribution falls as we climb the ladder', () => {
    const ladder = buildOfferLadder(800, 1035);
    assert.ok(ladder[0]!.contributionIfAcceptedUsd > ladder[1]!.contributionIfAcceptedUsd);
    assert.ok(ladder[1]!.contributionIfAcceptedUsd > ladder[2]!.contributionIfAcceptedUsd);
  });

  test('the first rung is the one to send', () => {
    const ladder = buildOfferLadder(800, 1035);
    assert.equal(ladder[0]!.offerUsd, 720);
    assert.ok(ladder[0]!.viable);
  });

  test('marks rungs that breach the floor as non-viable', () => {
    // Asking price is above our list price: no rung can work.
    const ladder = buildOfferLadder(1100, 1035);
    assert.ok(ladder.every((r) => !r.viable));
    assert.deepEqual(viableRungs(ladder), []);
  });

  test('truncates to only the rungs worth sending', () => {
    // Offering 10% and 5% below a $790 ask clears the floors; paying the ask does not.
    const ladder = buildOfferLadder(900, 1035);
    const viable = viableRungs(ladder);
    assert.ok(viable.length > 0 && viable.length < ladder.length);
    assert.equal(viable[0]!.discountFromAsk, 0.1);
  });

  test('reports absolute contribution per rung, which is what matters at high value', () => {
    const ladder = buildOfferLadder(8900, 9000);
    assert.ok(ladder[0]!.contributionIfAcceptedUsd > ladder[2]!.contributionIfAcceptedUsd);
    assert.ok(ladder.every((r) => typeof r.contributionPerHourUsd === 'number'));
  });

  test('can be told not to fall back to paying the ask', () => {
    const ladder = buildOfferLadder(800, 1035, { payAskIfRejected: false });
    assert.equal(ladder.length, 2);
    assert.ok(ladder.every((r) => r.discountFromAsk > 0));
  });

  test('accepts custom rungs', () => {
    const ladder = buildOfferLadder(1000, 1400, { rungs: [0.2, 0.12, 0.06] });
    assert.equal(ladder.length, 4);
    assert.equal(ladder[0]!.offerUsd, 800);
  });
});

describe('fulfilment routing', () => {
  function signals(overrides: Partial<RoutingSignals> = {}): RoutingSignals {
    return {
      orderValueUsd: 850,
      completedOrdersToDate: 40,
      riskDecision: 'ACCEPT',
      authenticityGuaranteed: true,
      sellerConfirmedBlindShip: true,
      ...overrides,
    };
  }

  test('routes $1,000+ through the operator, as specified', () => {
    const r = routeFulfilment(signals({ orderValueUsd: 1000 }));
    assert.equal(r.route, 'VIA_OPERATOR');
    assert.ok(r.reasons.some((x) => x.includes('threshold')));
  });

  test('allows direct ship below the threshold once everything else is clean', () => {
    assert.equal(routeFulfilment(signals()).route, 'DIRECT_TO_CUSTOMER');
  });

  test('routes everything through the operator until 20 clean orders', () => {
    const r = routeFulfilment(signals({ completedOrdersToDate: 3 }));
    assert.equal(r.route, 'VIA_OPERATOR');
    assert.ok(r.reasons.some((x) => x.includes('clean orders completed')));
  });

  test('never direct-ships a risk-flagged order', () => {
    const r = routeFulfilment(signals({ riskDecision: 'REVIEW' }));
    assert.equal(r.route, 'VIA_OPERATOR');
  });

  test('never direct-ships when the seller has not confirmed a blind ship', () => {
    const r = routeFulfilment(signals({ sellerConfirmedBlindShip: false }));
    assert.equal(r.route, 'VIA_OPERATOR');
    assert.ok(r.reasons.some((x) => x.includes('blind ship')));
  });

  test('never direct-ships an unauthenticated watch', () => {
    const r = routeFulfilment(signals({ authenticityGuaranteed: false }));
    assert.equal(r.route, 'VIA_OPERATOR');
  });

  test('reports every reason, not just the first', () => {
    const r = routeFulfilment(
      signals({ orderValueUsd: 2500, completedOrdersToDate: 0, riskDecision: 'REVIEW' }),
    );
    assert.ok(r.reasons.length >= 3);
  });

  test('the threshold is configurable', () => {
    const r = routeFulfilment(signals({ orderValueUsd: 600 }), {
      ...DEFAULT_ROUTING,
      operatorThresholdUsd: 500,
    });
    assert.equal(r.route, 'VIA_OPERATOR');
  });
});
