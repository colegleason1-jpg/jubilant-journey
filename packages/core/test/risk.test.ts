import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RISK_CONFIG,
  scoreOrder,
  type OrderRiskSignals,
} from '../src/risk.ts';

/** A clean, boring, genuine order. */
function cleanOrder(overrides: Partial<OrderRiskSignals> = {}): OrderRiskSignals {
  return {
    amountUsd: 1035,
    threeDSResult: 'authenticated',
    avsLine1Match: true,
    avsZipMatch: true,
    cvcMatch: true,
    billingCountry: 'US',
    shippingCountry: 'US',
    billingZip: '80202',
    shippingZip: '80202',
    cardCountry: 'US',
    ipCountry: 'US',
    isAnonymousIp: false,
    customerAccountAgeDays: 40,
    priorSuccessfulOrders: 1,
    emailVelocity1h: 1,
    ipVelocity24h: 1,
    cardsPerEmail24h: 1,
    isKnownReshipperZip: false,
    identityVerified: false,
    ...overrides,
  };
}

describe('clean orders', () => {
  test('accepts a boring genuine order', () => {
    const r = scoreOrder(cleanOrder());
    assert.equal(r.decision, 'ACCEPT');
    assert.deepEqual(r.reasons, []);
    assert.equal(r.score, 0);
  });

  test('accepts frictionless-3DS attempt_acknowledged — it still carries liability shift', () => {
    const r = scoreOrder(cleanOrder({ threeDSResult: 'attempt_acknowledged' }));
    assert.equal(r.decision, 'ACCEPT');
  });
});

describe('hard blocks — the 2022 stolen-card scenario', () => {
  test('blocks a payment with no 3DS liability shift', () => {
    for (const result of ['failed', 'not_supported', 'none'] as const) {
      const r = scoreOrder(cleanOrder({ threeDSResult: result }));
      assert.equal(r.decision, 'BLOCK', `3DS=${result} must block`);
      assert.ok(r.reasons.includes('NO_3DS_LIABILITY_SHIFT'));
    }
  });

  test('blocks a CVC mismatch', () => {
    const r = scoreOrder(cleanOrder({ cvcMatch: false }));
    assert.equal(r.decision, 'BLOCK');
  });

  test('blocks billing/shipping country mismatch', () => {
    const r = scoreOrder(cleanOrder({ shippingCountry: 'NG' }));
    assert.equal(r.decision, 'BLOCK');
    assert.ok(r.reasons.includes('BILLING_SHIPPING_COUNTRY_MISMATCH'));
  });

  test('blocks a US card driven from a foreign IP', () => {
    const r = scoreOrder(cleanOrder({ ipCountry: 'RU' }));
    assert.equal(r.decision, 'BLOCK');
  });

  test('blocks anonymised IPs', () => {
    const r = scoreOrder(cleanOrder({ isAnonymousIp: true }));
    assert.equal(r.decision, 'BLOCK');
  });

  test('blocks card-testing patterns', () => {
    const r = scoreOrder(cleanOrder({ cardsPerEmail24h: 5 }));
    assert.equal(r.decision, 'BLOCK');
    assert.ok(r.reasons.includes('CARD_TESTING_PATTERN'));
  });

  test('a fatal rule blocks regardless of loyalty history', () => {
    const r = scoreOrder(cleanOrder({ cvcMatch: false, priorSuccessfulOrders: 50 }));
    assert.equal(r.decision, 'BLOCK');
    assert.equal(r.score, 100);
  });
});

describe('scored risk', () => {
  test('sends AVS failures to review', () => {
    const r = scoreOrder(cleanOrder({ avsZipMatch: false, avsLine1Match: false }));
    assert.equal(r.decision, 'REVIEW');
    assert.ok(r.score >= DEFAULT_RISK_CONFIG.reviewScore);
  });

  test('a lone billing/shipping ZIP mismatch is not enough to hold an order', () => {
    const r = scoreOrder(cleanOrder({ shippingZip: '10001' }));
    assert.equal(r.decision, 'ACCEPT');
    assert.ok(r.reasons.includes('BILLING_SHIPPING_ZIP_MISMATCH'));
  });

  test('ignores ZIP+4 formatting differences', () => {
    const r = scoreOrder(cleanOrder({ shippingZip: '80202-1234' }));
    assert.deepEqual(r.reasons, []);
  });

  test('stacks reshipper ZIP with a new high-value customer into review', () => {
    const r = scoreOrder(
      cleanOrder({ isKnownReshipperZip: true, amountUsd: 1800, priorSuccessfulOrders: 0 }),
    );
    assert.equal(r.decision, 'REVIEW');
  });

  test('blocks when enough signals stack', () => {
    const r = scoreOrder(
      cleanOrder({
        avsZipMatch: false,
        avsLine1Match: false,
        isKnownReshipperZip: true,
        priorSuccessfulOrders: 0,
        amountUsd: 2200,
      }),
    );
    assert.equal(r.decision, 'BLOCK');
  });
});

describe('identity verification', () => {
  test('requires it for a new customer above the threshold', () => {
    const r = scoreOrder(cleanOrder({ amountUsd: 2000, priorSuccessfulOrders: 0 }));
    assert.equal(r.requiresIdentityVerification, true);
    assert.equal(r.decision, 'REVIEW');
  });

  test('does not require it for a returning customer', () => {
    const r = scoreOrder(cleanOrder({ amountUsd: 2000, priorSuccessfulOrders: 3 }));
    assert.equal(r.requiresIdentityVerification, false);
    assert.equal(r.decision, 'ACCEPT');
  });

  test('does not require it once verified', () => {
    const r = scoreOrder(
      cleanOrder({ amountUsd: 2000, priorSuccessfulOrders: 0, identityVerified: true }),
    );
    assert.equal(r.requiresIdentityVerification, false);
  });
});

describe('loyalty', () => {
  test('repeat customers earn tolerance for soft signals', () => {
    const newCustomer = scoreOrder(
      cleanOrder({ priorSuccessfulOrders: 0, avsZipMatch: false }),
    );
    const regular = scoreOrder(
      cleanOrder({ priorSuccessfulOrders: 4, avsZipMatch: false }),
    );
    assert.ok(regular.score < newCustomer.score);
    assert.equal(regular.decision, 'ACCEPT');
  });

  test('the loyalty discount is capped', () => {
    const r = scoreOrder(cleanOrder({ priorSuccessfulOrders: 1000, avsZipMatch: false }));
    assert.equal(r.score, 10); // 30 points − 20 cap
  });
});
