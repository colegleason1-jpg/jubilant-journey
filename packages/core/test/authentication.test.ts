import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticationCostFor,
  authenticationOffer,
  findProhibitedClaims,
  provenanceStatement,
  type ProvenanceFacts,
} from '../src/authentication.ts';

function facts(o: Partial<ProvenanceFacts> = {}): ProvenanceFacts {
  return {
    operatorInspected: true,
    passedEbayAuthenticityGuarantee: false,
    independentlyAuthenticated: false,
    serialLogged: true,
    ...o,
  };
}

describe('the authentication upsell', () => {
  test('is not offered on a cheap watch — the fee would dwarf it', () => {
    assert.equal(authenticationOffer(300, 200).offer, false);
  });

  test('is a paid independent service in the middle band', () => {
    const o = authenticationOffer(1400, 1100);
    assert.equal(o.offer, true);
    assert.equal(o.method, 'INDEPENDENT');
    assert.ok(o.netContributionUsd > 0);
  });

  test('uses an INDEPENDENT authenticator, not eBay, and says why', () => {
    const o = authenticationOffer(1400, 1100);
    assert.ok(o.operatorNotes.some((n) => n.includes('checkout-only')));
    assert.ok(o.operatorNotes.some((n) => n.includes('eBay-branded')));
  });

  test('discloses the added days in the customer copy', () => {
    assert.ok(/business days/.test(authenticationOffer(1400, 1100).customerCopy));
  });

  test('is included FREE at high value, because eBay gives it to us free', () => {
    const o = authenticationOffer(3200, 2700);
    assert.equal(o.includedFree, true);
    assert.equal(o.priceToCustomerUsd, 0);
    assert.equal(o.costToUsUsd, 0);
  });

  test('costs nothing above the $2,000 source threshold', () => {
    assert.equal(authenticationCostFor('EBAY_AG_ELECTED', 2400), 0);
    assert.equal(authenticationCostFor('EBAY_AG_ELECTED', 1100), 80);
    assert.equal(authenticationCostFor('EBAY_AG_ELECTED', 300), 0);
  });
});

describe('claims are generated from facts, not chosen', () => {
  test('our own inspection is a real, and modest, claim', () => {
    const s = provenanceStatement(facts());
    assert.deepEqual(s.kinds, ['OPERATOR_INSPECTION']);
    assert.ok(/inspected it in hand/.test(s.customerCopy));
    assert.ok(s.limitations.some((l) => l.includes('not a third-party authentication')));
  });

  test('eBay AG may be cited ONLY when the watch actually went through it', () => {
    const without = provenanceStatement(facts());
    assert.ok(without.mustNotClaim.some((c) => c.includes('Authenticity Guarantee')));
    assert.ok(!/Authenticity Guarantee/.test(without.customerCopy));

    const withIt = provenanceStatement(facts({ passedEbayAuthenticityGuarantee: true }));
    assert.ok(/Authenticity Guarantee/.test(withIt.customerCopy));
  });

  test('independent authentication may be cited only when we obtained one', () => {
    const s = provenanceStatement(facts());
    assert.ok(s.mustNotClaim.some((c) => c.includes('independent third-party')));

    const real = provenanceStatement(
      facts({ independentlyAuthenticated: true, independentAuthenticatorName: 'WatchCSA' }),
    );
    assert.ok(/WatchCSA/.test(real.customerCopy));
  });

  test('affiliation with eBay staff is prohibited under every combination of facts', () => {
    for (const ebay of [true, false]) {
      for (const indie of [true, false]) {
        const s = provenanceStatement(
          facts({ passedEbayAuthenticityGuarantee: ebay, independentlyAuthenticated: indie }),
        );
        assert.ok(
          s.mustNotClaim.some((c) => c.includes('no such relationship exists')),
          `ebay=${ebay} independent=${indie}`,
        );
      }
    }
  });

  test('always scopes the claim to authenticity, not condition or value', () => {
    const s = provenanceStatement(facts({ independentlyAuthenticated: true }));
    assert.ok(s.limitations.some((l) => l.includes('not a valuation')));
  });
});

describe('copy is checked before it ships', () => {
  test('catches the affiliation claim in any phrasing', () => {
    for (const copy of [
      'We work with eBay authentication staff',
      'We work with eBay to verify every watch',
      'Authenticated in partnership with eBay',
      'As an eBay-approved dealer we verify each piece',
      'Checked by our in-house authenticators',
    ]) {
      assert.ok(findProhibitedClaims(copy).length > 0, `should flag: ${copy}`);
    }
  });

  test('passes accurate copy', () => {
    const s = provenanceStatement(facts({ passedEbayAuthenticityGuarantee: true }));
    assert.deepEqual(findProhibitedClaims(s.customerCopy), []);
    assert.deepEqual(
      findProhibitedClaims(
        "Verified through eBay's Authenticity Guarantee programme by their third-party authenticator.",
      ),
      [],
    );
  });
});
