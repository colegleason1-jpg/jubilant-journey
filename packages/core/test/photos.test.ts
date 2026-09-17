import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPhotoSet, type PhotoSet } from '../src/photos.ts';

function set(o: Partial<PhotoSet> = {}): PhotoSet {
  return { provenance: 'IN_HAND', count: 20, condition: 'EXCELLENT', ...o };
}

describe('photos we took ourselves', () => {
  test('are always usable and need no disclosure', () => {
    const v = reviewPhotoSet(set());
    assert.equal(v.usable, true);
    assert.equal(v.requiredDisclosure, '');
  });

  test('warn when there are too few to defend a dispute', () => {
    assert.ok(reviewPhotoSet(set({ count: 2 })).warnings.some((w) => /thin evidence/.test(w)));
  });

  test('colour correction is fine; altering the watch is not', () => {
    assert.equal(reviewPhotoSet(set({ colorCorrected: true })).usable, true);
    const retouched = reviewPhotoSet(set({ blemishesRetouched: true }));
    assert.equal(retouched.usable, false);
    assert.ok(retouched.blockers.some((b) => /INAD/.test(b)));
  });
});

describe('manufacturer imagery', () => {
  test('is fine for a genuinely new watch, with disclosure', () => {
    const v = reviewPhotoSet(set({ provenance: 'MANUFACTURER_LICENSED', condition: 'NEW' }));
    assert.equal(v.usable, true);
    assert.ok(/new and unworn/.test(v.requiredDisclosure));
  });

  test('is blocked on anything pre-owned', () => {
    for (const condition of ['EXCELLENT', 'GOOD', 'FAIR'] as const) {
      const v = reviewPhotoSet(set({ provenance: 'MANUFACTURER_LICENSED', condition }));
      assert.equal(v.usable, false, condition);
      assert.ok(v.blockers.some((b) => /STOCK_PHOTOS rule we reject sellers on/.test(b)));
    }
  });

  test('warns that public availability is not permission', () => {
    const v = reviewPhotoSet(set({ provenance: 'MANUFACTURER_LICENSED', condition: 'NEW' }));
    assert.ok(v.warnings.some((w) => /not permission/.test(w)));
  });
});

describe('the source seller\'s photos', () => {
  test('are usable on a new item with permission and credit', () => {
    const v = reviewPhotoSet(set({ provenance: 'SOURCE_SELLER_PERMISSION', condition: 'NEW_OTHER' }));
    assert.equal(v.usable, true);
    assert.ok(/with their permission/.test(v.requiredDisclosure));
  });

  test('are blocked without permission, whatever the condition', () => {
    for (const condition of ['NEW', 'EXCELLENT'] as const) {
      const v = reviewPhotoSet(set({ provenance: 'UNLICENSED', condition }));
      assert.equal(v.usable, false);
      assert.ok(v.blockers.some((b) => /photographer owns them/.test(b)));
    }
  });
});

describe('the rule mirrors our own sourcing gate', () => {
  test('what we reject sellers for, we do not do to buyers', () => {
    // deal.ts rejects a used eBay listing using stock imagery (STOCK_PHOTOS gate).
    // The same configuration is blocked here.
    const v = reviewPhotoSet(set({ provenance: 'MANUFACTURER_LICENSED', condition: 'GOOD' }));
    assert.equal(v.usable, false);
  });
});
