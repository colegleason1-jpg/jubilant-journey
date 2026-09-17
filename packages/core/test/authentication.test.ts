import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCURATE_RELATIONSHIP_PHRASINGS,
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

  test("uses eBay's cheap add-on when the customer elected it before we bought", () => {
    // The option sits on the product page, so the election reaches us before the
    // eBay checkout — which is exactly when the add-on must be chosen.
    const o = authenticationOffer(1400, 1100);
    assert.equal(o.offer, true);
    assert.equal(o.method, 'EBAY_AG_ELECTED');
    assert.equal(o.costToUsUsd, 80);
    assert.equal(o.netContributionUsd, 99);
  });

  test('falls back to an independent service on STOCKED units', () => {
    // We already own it, so the eBay checkout is behind us and the add-on can never
    // be applied. Costs more and takes longer — a real reason to prefer Mode B.
    const o = authenticationOffer(1400, 1100, undefined, false);
    assert.equal(o.method, 'INDEPENDENT');
    assert.ok(o.costToUsUsd > 150);
    assert.ok(o.netContributionUsd < 30);
    assert.ok(o.operatorNotes.some((n) => n.includes('STOCKED')));
  });

  test("the eBay route is cheaper AND faster than the independent one", () => {
    const viaEbay = authenticationOffer(1400, 1100, undefined, true);
    const viaIndependent = authenticationOffer(1400, 1100, undefined, false);
    assert.ok(viaEbay.costToUsUsd < viaIndependent.costToUsUsd);
    assert.ok(viaEbay.addedDays < viaIndependent.addedDays);
  });

  test('outside the add-on band, sourced-to-order still needs an independent service', () => {
    // $400 source is below eBay's $500 minimum for the add-on.
    assert.equal(authenticationOffer(800, 400).method, 'INDEPENDENT');
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

  test('claiming an eBay dealer STATUS is prohibited under every combination of facts', () => {
    for (const ebay of [true, false]) {
      for (const indie of [true, false]) {
        const s = provenanceStatement(
          facts({ passedEbayAuthenticityGuarantee: ebay, independentlyAuthenticated: indie }),
        );
        assert.ok(
          s.mustNotClaim.some((c) => c.includes('customer of the service')),
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
  test('flags claims of a STATUS we do not hold', () => {
    for (const copy of [
      'Authenticated in partnership with eBay',
      'As an eBay-approved dealer we verify each piece',
      'An eBay authorised reseller',
      'Authorized by eBay',
      'Official eBay partner',
      'Checked by our in-house authenticators',
      'We authenticate every watch ourselves',
    ]) {
      assert.ok(findProhibitedClaims(copy).length > 0, `should flag: ${copy}`);
    }
  });

  test('does NOT flag accurate descriptions of buying the service', () => {
    // Electing the add-on IS purchasing eBay's authentication service. Saying so is
    // accurate and should be easy to say.
    for (const copy of [
      "We purchase professional third-party authentication through eBay's Authenticity Guarantee service.",
      "This watch was authenticated through eBay's Authenticity Guarantee programme by their third-party authenticator.",
      "We use eBay's Authenticity Guarantee on every watch over $2,000.",
      'We pay for independent authentication whenever a customer requests it.',
    ]) {
      assert.deepEqual(findProhibitedClaims(copy), [], `should pass: ${copy}`);
    }
  });

  test('every suggested phrasing passes its own guard', () => {
    for (const copy of ACCURATE_RELATIONSHIP_PHRASINGS) {
      assert.deepEqual(findProhibitedClaims(copy), [], copy);
    }
  });

  test('generated copy always passes', () => {
    const s = provenanceStatement(facts({ passedEbayAuthenticityGuarantee: true }));
    assert.deepEqual(findProhibitedClaims(s.customerCopy), []);
  });
});
