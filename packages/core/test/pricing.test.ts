import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  authTierForPrice,
  computeLandedCost,
  DEFAULT_PRICING,
  discountToMarket,
  maxViableSourcePrice,
  outboundShippingUsd,
  projectMargin,
  solveListPrice,
} from '../src/pricing.ts';

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
  test('scales with order value', () => {
    assert.equal(outboundShippingUsd(800), 32);
    assert.equal(outboundShippingUsd(1035), 40);
    assert.equal(outboundShippingUsd(9000), 60);
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
  test('buying at exactly the ceiling yields exactly the margin floor', () => {
    const list = 1035;
    const ceiling = maxViableSourcePrice(list, DEFAULT_PRICING);
    const margin = projectMargin(ceiling, list, DEFAULT_PRICING).marginPct;
    assert.ok(
      Math.abs(margin - DEFAULT_PRICING.minMarginPct) < 0.0005,
      `expected ~${DEFAULT_PRICING.minMarginPct}, got ${margin}`,
    );
  });

  test('one dollar over the ceiling breaches the floor', () => {
    const list = 1035;
    const ceiling = maxViableSourcePrice(list, DEFAULT_PRICING);
    const margin = projectMargin(ceiling + 1, list, DEFAULT_PRICING).marginPct;
    assert.ok(margin < DEFAULT_PRICING.minMarginPct);
  });

  test('resolves the $2,000 free-authentication band consistently', () => {
    // A high list price should resolve into the FREE tier, and the resulting
    // source price must actually sit in that tier — no circular inconsistency.
    const list = 3200;
    const ceiling = maxViableSourcePrice(list, DEFAULT_PRICING);
    assert.ok(ceiling >= 2000, `expected >= 2000, got ${ceiling}`);
    assert.equal(authTierForPrice(ceiling), 'FREE');
    const margin = projectMargin(ceiling, list, DEFAULT_PRICING).marginPct;
    assert.ok(Math.abs(margin - DEFAULT_PRICING.minMarginPct) < 0.0005);
  });

  test('a tighter margin target lowers the ceiling', () => {
    const loose = maxViableSourcePrice(1035, DEFAULT_PRICING, 0.1);
    const tight = maxViableSourcePrice(1035, DEFAULT_PRICING, 0.25);
    assert.ok(tight < loose);
  });

  test('no resale certificate lowers what we can afford to pay', () => {
    const withCert = maxViableSourcePrice(1035, DEFAULT_PRICING);
    const without = maxViableSourcePrice(1035, {
      ...DEFAULT_PRICING,
      hasResaleCertificate: false,
    });
    assert.ok(without < withCert);
  });
});

describe('discountToMarket', () => {
  test('computes the spread we are capturing', () => {
    assert.equal(discountToMarket(720, 1150), 0.3739);
    assert.equal(discountToMarket(1150, 1150), 0);
    assert.equal(discountToMarket(500, 0), 0);
  });
});
