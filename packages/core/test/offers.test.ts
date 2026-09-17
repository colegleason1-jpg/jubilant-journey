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
import { projectMargin } from '../src/pricing.ts';

describe('the fluid buy band', () => {
  test('buying at 90-95% of market loses in the everyday bands', () => {
    for (const market of [200, 600, 1000, 2600]) {
      for (const frac of [0.9, 0.95]) {
        assert.equal(
          maxCustomerDiscount(market, market * frac),
          null,
          `market $${market} at ${frac * 100}% should have no viable list price`,
        );
      }
    }
  });

  test('but the SAME 90% is a good trade at high value', () => {
    // This is the part a flat margin floor gets wrong. 1% of $10,000 is $100 — a
    // real profit — and the cheap wire rail is what makes it reachable.
    assert.ok(maxCustomerDiscount(10000, 9000)! > 0.05);
    assert.ok(maxCustomerDiscount(18000, 16200)! > 0.05);
    assert.ok(maxCustomerDiscount(5000, 4500)! > 0);
  });

  test('even 95% works once the order is big enough', () => {
    assert.equal(maxCustomerDiscount(2600, 2470), null);
    assert.ok(maxCustomerDiscount(10000, 9500)! > 0.03);
  });

  test('a $1,000 watch bought at $925 still loses badly', () => {
    assert.ok(projectMargin(925, 900).grossProfitUsd < -140);
  });

  test('a $30 watch IS tradeable — you just buy at half', () => {
    const t = tradeability(30);
    assert.equal(t.tradeable, true);
    assert.equal(t.tier.label, 'MICRO');
    assert.ok(t.maxSourceUsd > 12 && t.maxSourceUsd < 16);
    assert.ok(t.projectionAtCeiling.grossProfitUsd >= 10);
    assert.ok(t.projectionAtCeiling.effectiveHourlyUsd > 60);
  });

  test('so is a $100 one', () => {
    const t = tradeability(100);
    assert.equal(t.tradeable, true);
    assert.ok(t.maxSourceUsd > 50 && t.maxSourceUsd < 60);
  });

  test('the required discount narrows monotonically across the big picture', () => {
    const required = [30, 900, 2600, 10000, 18000].map(
      (m) => tradeability(m).requiredDiscountFromMarket,
    );
    assert.ok(required[0]! > 0.45, '$30 needs a deep discount');
    assert.ok(required[required.length - 1]! < 0.12, '$18k needs very little');
    assert.ok(required[0]! > required[required.length - 1]! + 0.3);
  });

  test('every band is tradeable at SOME price — nothing is structurally dead', () => {
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

  test('margin falls as we climb the ladder', () => {
    const ladder = buildOfferLadder(800, 1035);
    assert.ok(ladder[0]!.marginPctIfAccepted > ladder[1]!.marginPctIfAccepted);
    assert.ok(ladder[1]!.marginPctIfAccepted > ladder[2]!.marginPctIfAccepted);
  });

  test('the first rung matches the docs/03 worked example', () => {
    const ladder = buildOfferLadder(800, 1035);
    assert.equal(ladder[0]!.offerUsd, 720);
    assert.equal(
      projectMargin(720, 1035).grossProfitUsd,
      166.42,
    );
  });

  test('marks rungs that breach either floor as non-viable', () => {
    // Asking price is too close to our list price for any rung to work.
    const ladder = buildOfferLadder(980, 1035);
    assert.ok(ladder.every((r) => !r.viable));
    assert.deepEqual(viableRungs(ladder), []);
  });

  test('truncates to only the rungs worth sending', () => {
    // Offering 10% and 5% below a $790 ask clears the floors; paying the ask does not.
    const ladder = buildOfferLadder(790, 1035);
    const viable = viableRungs(ladder);
    assert.equal(viable.length, 2);
    assert.equal(viable[0]!.discountFromAsk, 0.1);
    assert.ok(!ladder[2]!.viable, 'paying the ask must not be viable here');
  });

  test('reports absolute gross per rung, which is what matters at high value', () => {
    const ladder = buildOfferLadder(8900, 9000);
    assert.ok(ladder[0]!.grossProfitIfAcceptedUsd > ladder[2]!.grossProfitIfAcceptedUsd);
    assert.ok(ladder.every((r) => typeof r.grossProfitIfAcceptedUsd === 'number'));
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
