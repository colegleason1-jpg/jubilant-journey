import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCURATE_RELATIONSHIP_PHRASINGS,
  AUTHENTICATOR_PHRASINGS,
  buildListingPrice,
  DEFAULT_UNIT,
  findSourcingDisclosures,
  positioningClaims,
  positioningStrength,
  reviewCustomerCopy,
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
    ]) {
      assert.ok(findProhibitedClaims(copy).length > 0, `should flag: ${copy}`);
    }
  });

  test('does NOT flag possessives or "employ" — ordinary English for engaged parties', () => {
    for (const copy of [
      'Authenticated by our third-party authenticator',
      'Checked by our authenticators before dispatch',
      'We employ third-party staff for authentication',
      'We employ a third-party authentication service',
      'We authenticate every watch before it ships',
      'Our specialists inspect each piece',
    ]) {
      assert.deepEqual(findProhibitedClaims(copy), [], `should pass: ${copy}`);
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

describe('positioning copy', () => {
  test('every generated claim passes both guards', () => {
    for (const unit of [
      { ...DEFAULT_UNIT, thirdPartyAuthenticated: true },
      { ...DEFAULT_UNIT, orderValueUsd: 60, photosTaken: 5 },
      { ...DEFAULT_UNIT, fulfilmentRoute: 'DIRECT_TO_CUSTOMER' as const, photosTaken: 0 },
      { ...DEFAULT_UNIT, returnWindowDays: 30 },
    ]) {
      for (const claim of positioningClaims(unit)) {
        assert.equal(reviewCustomerCopy(claim).ok, true, claim);
      }
    }
  });

  test('never mentions how many listings we screen', () => {
    const block = positioningClaims({ ...DEFAULT_UNIT, thirdPartyAuthenticated: true }).join(' ');
    for (const word of [/listings/i, /screened/i, /references/i, /sourced/i]) {
      assert.ok(!word.test(block), `should not contain ${word}`);
    }
  });

  test('claims no photography on a direct ship — we never touched it', () => {
    const claims = positioningClaims({
      ...DEFAULT_UNIT,
      fulfilmentRoute: 'DIRECT_TO_CUSTOMER',
      photosTaken: 0,
      serialLogged: false,
      intakeVideoRecorded: false,
    });
    assert.ok(!claims.some((c) => /photograph/i.test(c)));
    assert.ok(!claims.some((c) => /Serial number recorded/.test(c)));
    assert.ok(!claims.some((c) => /packing recorded/.test(c)));
  });

  test('scales the claim down below the full-service threshold', () => {
    const cheap = positioningClaims({
      ...DEFAULT_UNIT,
      orderValueUsd: 60,
      photosTaken: 5,
      intakeVideoRecorded: false,
    });
    assert.ok(cheap.some((c) => /5 images/.test(c)));
    assert.ok(!cheap.some((c) => /controlled lighting/.test(c)));
    assert.ok(!cheap.some((c) => /condition report/i.test(c)));
  });

  test('omits the returns line entirely when returns are not offered', () => {
    const noReturns = positioningClaims({ ...DEFAULT_UNIT, returnWindowDays: null });
    assert.ok(!noReturns.some((c) => /returns/i.test(c) && /no questions/i.test(c)));
    // The trust burden moves to disclosure, so say that rather than leave a silence.
    assert.ok(noReturns.some((c) => /described exactly as it is/.test(c)));

    const withReturns = positioningClaims({ ...DEFAULT_UNIT, returnWindowDays: 30 });
    assert.ok(withReturns.some((c) => /30-day returns/.test(c)));
  });
});

describe('positioning strength warns about thin configurations', () => {
  test('a direct-shipped order has almost nothing true to say', () => {
    const s = positioningStrength({
      ...DEFAULT_UNIT,
      fulfilmentRoute: 'DIRECT_TO_CUSTOMER',
      photosTaken: 0,
      serialLogged: false,
      intakeVideoRecorded: false,
    });
    assert.equal(s.thin, true);
    assert.ok(s.warnings.some((w) => w.includes('direct ship')));
  });

  test('flags no-returns on a four-figure order', () => {
    const s = positioningStrength({ ...DEFAULT_UNIT, orderValueUsd: 1500, returnWindowDays: null });
    assert.ok(s.warnings.some((w) => w.includes('chargeback')));
  });

  test('does not flag no-returns on a cheap one', () => {
    const s = positioningStrength({ ...DEFAULT_UNIT, orderValueUsd: 80, returnWindowDays: null });
    assert.ok(!s.warnings.some((w) => w.includes('chargeback')));
  });

  test('a full-service in-hand order is not thin', () => {
    assert.equal(positioningStrength({ ...DEFAULT_UNIT, thirdPartyAuthenticated: true }).thin, false);
  });
});

describe('the sourcing-disclosure guard', () => {
  test('flags copy that explains the business model', () => {
    for (const copy of [
      'Sourced from roughly 2,400 listings screened each month across 40 tracked references',
      'We source our watches from marketplace listings',
      'Every watch is bought on eBay and inspected before resale',
      'A retail arbitrage operation',
      'We scan 2400 listings a day',
      'We find them across the major marketplaces',
      'Drop-shipped direct from the supplier',
    ]) {
      assert.ok(findSourcingDisclosures(copy).length > 0, `should flag: ${copy}`);
    }
  });

  test('does NOT flag citing eBay authentication — that is a trust asset', () => {
    for (const copy of [
      "This watch was authenticated through eBay's Authenticity Guarantee programme by their third-party authenticator.",
      "We purchase professional third-party authentication through eBay's Authenticity Guarantee service.",
    ]) {
      assert.deepEqual(findSourcingDisclosures(copy), [], `should pass: ${copy}`);
    }
  });

  test('reviewCustomerCopy separates untrue claims from ones that should stay internal', () => {
    const r = reviewCustomerCopy(
      'As an eBay-approved dealer we source from listings screened daily.',
    );
    assert.equal(r.ok, false);
    assert.ok(r.untrueClaims.length > 0);
    assert.ok(r.sourcingDisclosures.length > 0);
  });

  test('passes clean copy', () => {
    assert.equal(
      reviewCustomerCopy(
        'Serial number recorded and matched at dispatch. 30-day returns, no questions asked.',
      ).ok,
      true,
    );
  });
});

describe('the authentication toggle on a listing', () => {
  test('below $2,000 the displayed price excludes it', () => {
    const p = buildListingPrice(1200, 950);
    assert.equal(p.displayPriceUsd, 1200);
    assert.equal(p.authenticationIncluded, false);
    assert.equal(p.authenticationOptional, true);
    assert.equal(p.totalIfToggledUsd, 1200 + p.authenticationUsd);
    assert.ok(p.toggleLabel.length > 0);
  });

  test('below $2,000 it discloses what we did and did not do', () => {
    const p = buildListingPrice(1200, 950);
    assert.ok(/established seller with verified transaction history/.test(p.disclosure));
    assert.ok(/has not been independently\s+authenticated/.test(p.disclosure));
  });

  test('at $2,000+ it is included, free, and stated affirmatively', () => {
    const p = buildListingPrice(2600, 2100);
    assert.equal(p.authenticationIncluded, true);
    assert.equal(p.authenticationOptional, false);
    assert.equal(p.authenticationUsd, 0);
    assert.equal(p.totalIfToggledUsd, 2600);
    assert.equal(p.toggleLabel, '');
    assert.ok(/included at no charge/.test(p.disclosure));
  });

  test('every generated line passes both copy guards', () => {
    for (const [display, source] of [[1200, 950], [2600, 2100], [700, 520]] as const) {
      const p = buildListingPrice(display, source);
      for (const copy of [p.disclosure, p.toggleLabel].filter(Boolean)) {
        assert.equal(reviewCustomerCopy(copy).ok, true, copy);
      }
    }
  });

  test('every suggested authenticator phrasing passes', () => {
    for (const good of AUTHENTICATOR_PHRASINGS.good) {
      assert.deepEqual(findProhibitedClaims(good), [], good);
    }
    assert.deepEqual(findProhibitedClaims('Checked by our authenticators'), []);
  });
});
