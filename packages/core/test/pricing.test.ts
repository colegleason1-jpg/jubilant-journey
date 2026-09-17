import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  authTierForPrice,
  computeLandedCost,
  DEFAULT_PRICING,
  discountToMarket,
  maxViableSourcePrice,
  meetsFloors,
  outboundShippingUsd,
  projectMargin,
  solveListPrice,
} from '../src/pricing.ts';
import { processingFeeUsd, resolveRail, tierFor } from '../src/tiers.ts';

describe('Authenticity Guarantee tiers', () => {
  test('matches eBay price bands', () => {
    assert.equal(authTierForPrice(499.99), 'NONE');
    assert.equal(authTierForPrice(500), 'ADDON');
    assert.equal(authTierForPrice(1999.99), 'ADDON');
    assert.equal(authTierForPrice(2000), 'FREE');
    assert.equal(authTierForPrice(5000), 'FREE');
  });
});

describe('shipping bands', () => {
  test('scales with order value, from padded envelope to registered mail', () => {
    assert.equal(outboundShippingUsd(40), 7.5); // Ground Advantage
    assert.equal(outboundShippingUsd(250), 11);
    assert.equal(outboundShippingUsd(800), 22); // Priority + signature
    assert.equal(outboundShippingUsd(1035), 40); // Express + adult signature
    assert.equal(outboundShippingUsd(5000), 55);
    assert.equal(outboundShippingUsd(9000), 110); // Registered / Parcel Pro
  });

  test('a cheap watch is not charged luxury logistics', () => {
    // The bug this replaced: a flat $32 floor made every sub-$150 order look like a
    // loss purely because of an assumption that never applied to it.
    assert.ok(outboundShippingUsd(40) < 10);
  });
});

describe('the resale certificate — docs/03', () => {
  test('sales tax on a $900 purchase is a real cost without the certificate', () => {
    const without = computeLandedCost(900, 1035, {
      ...DEFAULT_PRICING,
      hasResaleCertificate: false,
    });
    assert.equal(without.salesTaxUsd, 67.5);
  });

  test('and disappears entirely with it', () => {
    const withCert = computeLandedCost(900, 1035, DEFAULT_PRICING);
    assert.equal(withCert.salesTaxUsd, 0);
  });

  test('the certificate is worth more than the entire margin on a marginal deal', () => {
    const noCert = { ...DEFAULT_PRICING, hasResaleCertificate: false };
    const withCert = projectMargin(840, 1035, DEFAULT_PRICING);
    const withoutCert = projectMargin(840, 1035, noCert);
    assert.ok(withoutCert.grossProfitUsd < 0, 'loses money without the certificate');
    assert.ok(withCert.grossProfitUsd > 0, 'profitable with it');
    assert.equal(
      Math.round(withCert.grossProfitUsd - withoutCert.grossProfitUsd),
      63, // 840 × 7.5%
    );
  });
});

describe('projectMargin — reproduces the docs/03 worked example', () => {
  const p = projectMargin(720, 1035, DEFAULT_PRICING);

  test('itemises the landed cost', () => {
    assert.equal(p.landedCost.sourcePriceUsd, 720);
    assert.equal(p.landedCost.salesTaxUsd, 0);
    assert.equal(p.landedCost.authenticationUsd, 80);
    assert.equal(p.landedCost.outboundShippingUsd, 40);
    assert.equal(p.landedCost.packagingUsd, 9);
    assert.equal(p.landedCost.fixedCostUsd, 849);
  });

  test('lands on ~$166 gross at ~16% margin', () => {
    assert.equal(p.processingFeeUsd, 30.39);
    assert.equal(p.epnCreditUsd, 10.8);
    assert.equal(p.grossProfitUsd, 166.42);
    assert.ok(p.marginPct > 0.16 && p.marginPct < 0.161);
  });
});

describe('solveListPrice', () => {
  test('lists 10% under market, rounded to $5', () => {
    assert.equal(solveListPrice(1150, DEFAULT_PRICING), 1035);
    assert.equal(solveListPrice(1187, DEFAULT_PRICING), 1070);
  });
});

describe('maxViableSourcePrice — the bid ceiling', () => {
  /** At the ceiling, exactly one of the two floors should be sitting on its limit. */
  function bindsExactly(ceiling: number, list: number): boolean {
    const tier = tierFor(list);
    const p = projectMargin(ceiling, list);
    return (
      Math.abs(p.marginPct - tier.minMarginPct) < 0.0006 ||
      Math.abs(p.grossProfitUsd - tier.minGrossProfitUsd) < 0.05
    );
  }

  test('buying at exactly the ceiling sits on the binding floor', () => {
    for (const list of [27, 180, 810, 1035, 3200, 9000]) {
      const ceiling = maxViableSourcePrice(list);
      assert.equal(meetsFloors(projectMargin(ceiling, list)).ok, true, `list ${list}`);
      assert.ok(bindsExactly(ceiling, list), `list ${list} should bind a floor exactly`);
    }
  });

  test('one dollar over the ceiling breaches a floor', () => {
    for (const list of [27, 180, 810, 1035, 3200, 9000]) {
      const ceiling = maxViableSourcePrice(list);
      assert.equal(
        meetsFloors(projectMargin(ceiling + 1, list)).ok,
        false,
        `list ${list} should fail one dollar over`,
      );
    }
  });

  test('resolves the $2,000 free-authentication band consistently', () => {
    const list = 3200;
    const ceiling = maxViableSourcePrice(list);
    assert.ok(ceiling >= 2000, `expected >= 2000, got ${ceiling}`);
    assert.equal(authTierForPrice(ceiling), 'FREE');
    assert.equal(projectMargin(ceiling, list).landedCost.authenticationUsd, 0);
    assert.equal(meetsFloors(projectMargin(ceiling, list)).ok, true);
  });

  test('never charges the add-on to an order that could not trigger it', () => {
    const ceiling = maxViableSourcePrice(27);
    assert.ok(ceiling > 0 && ceiling < 500);
    assert.equal(authTierForPrice(ceiling), 'NONE');
  });

  test('a tighter margin target lowers the ceiling', () => {
    assert.ok(maxViableSourcePrice(1035, DEFAULT_PRICING, 0.25)
      < maxViableSourcePrice(1035, DEFAULT_PRICING, 0.10));
  });

  test('no resale certificate lowers what we can afford to pay', () => {
    assert.ok(
      maxViableSourcePrice(1035, { ...DEFAULT_PRICING, hasResaleCertificate: false })
        < maxViableSourcePrice(1035, DEFAULT_PRICING),
    );
  });

  test('the required discount NARROWS as value rises', () => {
    // The core of the fluid model: you must buy a $30 watch at half price, but an
    // $18,000 watch at 90% of market is a perfectly good trade.
    const buyFraction = (list: number) => maxViableSourcePrice(list) / list;

    assert.ok(buyFraction(27) < 0.55, 'cheap watches need a deep discount');
    assert.ok(buyFraction(2340) > 0.7);
    assert.ok(buyFraction(9000) > 0.95);
    assert.ok(buyFraction(16200) > 0.95, 'expensive ones need very little');
    assert.ok(buyFraction(16200) > buyFraction(27) + 0.4, 'the trend is large');
  });

  test('the $500 authentication threshold creates a real dead zone', () => {
    // Not a modelling artefact — a business fact worth knowing. A source price just
    // over $500 picks up the $80 Authenticity Guarantee add-on, so it needs a DEEPER
    // discount than a cheaper watch that avoids the fee entirely.
    //
    // Practical consequence: a watch sourced at $480 is easier to make work than one
    // at $520. Be deliberate about which side of that line you buy on.
    const justBelow = maxViableSourcePrice(180) / 180; // no add-on
    const justAbove = maxViableSourcePrice(810) / 810; // pays the $80 add-on
    assert.ok(justAbove < justBelow, 'the add-on tightens the ceiling');
    assert.equal(projectMargin(maxViableSourcePrice(810), 810).landedCost.authenticationUsd, 80);
    assert.equal(projectMargin(maxViableSourcePrice(180), 180).landedCost.authenticationUsd, 0);
  });
});

describe('discountToMarket', () => {
  test('computes the spread we are capturing', () => {
    assert.equal(discountToMarket(720, 1150), 0.3739);
    assert.equal(discountToMarket(1150, 1150), 0);
    assert.equal(discountToMarket(500, 0), 0);
  });
});


describe('price tiers — the fluid model', () => {
  test('assigns the right tier by order value', () => {
    assert.equal(tierFor(40).label, 'MICRO');
    assert.equal(tierFor(250).label, 'BUDGET');
    assert.equal(tierFor(800).label, 'ENTRY');
    assert.equal(tierFor(1035).label, 'CORE');
    assert.equal(tierFor(5000).label, 'UPPER');
    assert.equal(tierFor(10000).label, 'HIGH');
    assert.equal(tierFor(40000).label, 'ULTRA');
  });

  test('required margin percentage falls as value rises', () => {
    const labels = [40, 250, 800, 1035, 5000, 10000].map((v) => tierFor(v).minMarginPct);
    for (let i = 1; i < labels.length; i++) {
      assert.ok(labels[i]! <= labels[i - 1]!, 'margin floor must be non-increasing');
    }
    assert.equal(tierFor(40).minMarginPct, 0.3);
    assert.equal(tierFor(10000).minMarginPct, 0.01);
  });

  test('1% of a $10,000 watch is $100 and that clears the floor', () => {
    const p = projectMargin(8903.55, 9000);
    assert.ok(p.grossProfitUsd >= 100, `expected >= $100, got ${p.grossProfitUsd}`);
    assert.equal(meetsFloors(p).ok, true);
  });

  test('a healthy percentage still fails when the dollars are not worth the time', () => {
    // 33% of a $20 order is $9. A fine ratio; not worth the handling, so the
    // absolute floor catches it where a percentage-only model would not.
    const p = projectMargin(8.46, 20);
    assert.ok(p.marginPct > 0.3, `margin ${p.marginPct}`);
    assert.ok(p.grossProfitUsd < 10, `gross ${p.grossProfitUsd}`);
    assert.deepEqual(meetsFloors(p).failures, ['MARGIN_ABSOLUTE']);
  });
});

describe('payment rails — what makes the top end work', () => {
  test('ACH is 0.8% capped at $5; the cap binds above $625', () => {
    assert.equal(processingFeeUsd(500, 'ACH'), 4);
    assert.equal(processingFeeUsd(625, 'ACH'), 5);
    assert.equal(processingFeeUsd(10000, 'ACH'), 5);
  });

  test('card is uncapped, and that is the whole problem at high value', () => {
    assert.equal(processingFeeUsd(10000, 'CARD').toFixed(2), '290.37');
    // $290 against a 1% gross margin of $100 — the deal is impossible on a card.
    assert.ok(processingFeeUsd(10000, 'CARD') > 100);
  });

  test('high-value tiers refuse cards outright', () => {
    assert.equal(resolveRail(10000, 'CARD'), null);
    assert.equal(resolveRail(10000, 'WIRE'), 'WIRE');
    assert.equal(resolveRail(1035, 'CARD'), 'CARD');
  });

  test('switching a $10k order from card to wire is the difference between yes and no', () => {
    const onCard = projectMargin(8903.55, 9000, DEFAULT_PRICING, 'CARD');
    const onWire = projectMargin(8903.55, 9000, DEFAULT_PRICING, 'WIRE');
    assert.ok(onCard.grossProfitUsd < 0, 'card loses money here');
    assert.ok(onWire.grossProfitUsd >= 100, 'wire clears the floor');
  });
});

describe('cheap tiers pass postage through', () => {
  test('MICRO collects shipping on top of the item price', () => {
    const p = projectMargin(14, 27);
    assert.equal(p.shippingCollectedUsd, 7.5);
    assert.equal(p.revenueUsd, 34.5);
    assert.ok(p.grossProfitUsd > 9);
  });

  test('CORE absorbs it — free shipping is expected on an expensive watch', () => {
    const p = projectMargin(720, 1035);
    assert.equal(p.shippingCollectedUsd, 0);
    assert.equal(p.revenueUsd, 1035);
  });

  test('a $30 watch is genuinely tradeable and pays a sane hourly rate', () => {
    const p = projectMargin(13.99, 27);
    assert.ok(p.grossProfitUsd >= 10, `gross ${p.grossProfitUsd}`);
    assert.ok(p.effectiveHourlyUsd > 60, `hourly ${p.effectiveHourlyUsd}`);
  });
});

describe('the authentication band is applied consistently', () => {
  test('a $27 order is never charged the $80 Authenticity Guarantee add-on', () => {
    const ceiling = maxViableSourcePrice(27);
    assert.ok(ceiling > 0, `expected a positive ceiling, got ${ceiling}`);
    assert.equal(authTierForPrice(ceiling), 'NONE');
    assert.equal(projectMargin(ceiling, 27).landedCost.authenticationUsd, 0);
  });

  test('the ADDON band pays it', () => {
    assert.equal(projectMargin(720, 1035).landedCost.authenticationUsd, 80);
  });

  test('above $2,000 it is free again', () => {
    assert.equal(projectMargin(2400, 3000).landedCost.authenticationUsd, 0);
  });
});
