import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assessSourcing, PLATFORMS, rankPlatforms } from '../src/platforms.ts';

describe('free authentication by platform', () => {
  test('Bezel authenticates free on every purchase', () => {
    for (const value of [300, 800, 5000]) {
      assert.equal(assessSourcing('BEZEL', value).freeAuthentication, true, `$${value}`);
    }
  });

  test('Poshmark is free above $500 only', () => {
    assert.equal(assessSourcing('POSHMARK', 400).freeAuthentication, false);
    assert.equal(assessSourcing('POSHMARK', 800).freeAuthentication, true);
  });

  test('eBay is free above $2,000, $80 below', () => {
    assert.equal(assessSourcing('EBAY', 900).freeAuthentication, false);
    assert.equal(assessSourcing('EBAY', 900).authenticationCostUsd, 80);
    assert.equal(assessSourcing('EBAY', 2500).freeAuthentication, true);
    assert.equal(assessSourcing('EBAY', 2500).authenticationCostUsd, 0);
  });

  test('Chrono24 reviews listings but does not physically authenticate them', () => {
    const a = assessSourcing('CHRONO24', 3000);
    assert.equal(a.platform.authentication.physicalInspection, false);
    assert.ok(a.warnings.some((w) => /does not physically authenticate/.test(w)));
  });

  test('Mercari watch authentication is photo-based with no certificate', () => {
    const a = assessSourcing('MERCARI', 800);
    assert.equal(a.platform.authentication.certificateIssued, false);
    assert.ok(a.warnings.some((w) => /no certificate/.test(w)));
  });

  test('Mercari and Chrono24 are the two without physical inspection', () => {
    const withoutPhysical = Object.values(PLATFORMS)
      .filter((p) => !p.authentication.physicalInspection)
      .map((p) => p.id)
      .sort();
    assert.deepEqual(withoutPhysical, ['CHRONO24', 'MERCARI']);
  });
});

describe('escrow platforms let us inspect before the seller is paid', () => {
  test('Chrono24, Bezel, Poshmark, StockX and Mercari all hold funds', () => {
    for (const id of ['CHRONO24', 'BEZEL', 'POSHMARK', 'STOCKX', 'MERCARI'] as const) {
      assert.equal(PLATFORMS[id].recourse.escrow, true, id);
      assert.ok(assessSourcing(id, 1500).warnings.some((w) => /escrow/.test(w)), id);
    }
  });

  test('eBay does not — it is a claims process after the fact', () => {
    assert.equal(PLATFORMS.EBAY.recourse.escrow, false);
  });
});

describe('ranking', () => {
  test('Bezel leads at every order size', () => {
    for (const value of [800, 2500, 6000]) {
      assert.equal(rankPlatforms(value)[0]!.platform.id, 'BEZEL', `$${value}`);
    }
  });

  test('every remaining platform offers some recourse — Facebook was dropped', () => {
    assert.ok(!('FACEBOOK_MARKETPLACE' in PLATFORMS));
    for (const a of rankPlatforms(800)) {
      assert.equal(a.protected, true, a.platform.id);
    }
  });

  test('eBay climbs sharply once authentication goes free at $2,000', () => {
    const below = rankPlatforms(900).find((a) => a.platform.id === 'EBAY')!;
    const above = rankPlatforms(2500).find((a) => a.platform.id === 'EBAY')!;
    assert.ok(above.confidence > below.confidence + 0.1);
  });

  test('only eBay has official programmatic price access', () => {
    const withApi = Object.values(PLATFORMS).filter(
      (p) => p.livePriceAccess === 'OFFICIAL_API',
    );
    assert.deepEqual(withApi.map((p) => p.id), ['EBAY']);
  });
});
