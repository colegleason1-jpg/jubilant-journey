import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  captureDeadline,
  captureUrgency,
  IllegalTransitionError,
  isCommitted,
  isUncaptured,
  transition,
  type OrderEvent,
  type OrderState,
} from '../src/orderflow.ts';

const ALL_STATES: OrderState[] = [
  'DRAFT', 'AUTHORIZED', 'SOURCING', 'SECURED', 'IN_TRANSIT_INBOUND',
  'RECEIVED', 'SHIPPED', 'DELIVERED', 'CLOSED', 'VOIDED', 'REFUNDED',
];

const ALL_EVENTS: OrderEvent[] = [
  'PAYMENT_AUTHORIZED', 'SOURCE_VERIFIED', 'SOURCE_GONE', 'PURCHASE_CONFIRMED',
  'PURCHASE_FAILED', 'SOURCING_TIMEOUT', 'INBOUND_SHIPPED', 'INBOUND_RECEIVED',
  'INSPECTION_FAILED', 'OUTBOUND_SHIPPED', 'DELIVERY_CONFIRMED',
  'RETURN_WINDOW_CLOSED', 'CUSTOMER_CANCELLED',
];

describe('★ the core money invariant', () => {
  test('CAPTURE_PAYMENT is reachable from exactly one transition in the whole machine', () => {
    const capturePoints: string[] = [];
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        if (!canTransition(state, event)) continue;
        if (transition(state, event).effects.includes('CAPTURE_PAYMENT')) {
          capturePoints.push(`${state} --${event}-->`);
        }
      }
    }
    assert.deepEqual(capturePoints, ['SOURCING --PURCHASE_CONFIRMED-->']);
  });

  test('we never capture before the eBay purchase is confirmed', () => {
    for (const event of ALL_EVENTS) {
      for (const state of ['DRAFT', 'AUTHORIZED'] as OrderState[]) {
        if (!canTransition(state, event)) continue;
        assert.ok(
          !transition(state, event).effects.includes('CAPTURE_PAYMENT'),
          `${state}/${event} must not capture`,
        );
      }
    }
  });

  test('every pre-purchase failure path voids the authorization', () => {
    const failureEvents: OrderEvent[] = [
      'SOURCE_GONE', 'PURCHASE_FAILED', 'SOURCING_TIMEOUT', 'CUSTOMER_CANCELLED',
    ];
    for (const state of ['AUTHORIZED', 'SOURCING'] as OrderState[]) {
      for (const event of failureEvents) {
        if (!canTransition(state, event)) continue;
        const t = transition(state, event);
        assert.equal(t.to, 'VOIDED', `${state}/${event} should void`);
        assert.ok(t.effects.includes('VOID_AUTHORIZATION'));
      }
    }
  });
});

describe('the 2022 loss scenario, replayed', () => {
  test('source sells on eBay first → customer is never charged', () => {
    let state: OrderState = 'DRAFT';
    state = transition(state, 'PAYMENT_AUTHORIZED').to;
    assert.equal(state, 'AUTHORIZED');
    assert.ok(isUncaptured(state), 'money is reserved, not taken');

    const t = transition(state, 'SOURCE_GONE');
    assert.equal(t.to, 'VOIDED');
    assert.ok(t.effects.includes('VOID_AUTHORIZATION'));
    assert.ok(t.effects.includes('EMAIL_CUSTOMER_UNAVAILABLE'));
    assert.ok(!t.effects.includes('CAPTURE_PAYMENT'));
    assert.ok(!t.effects.includes('REFUND_PAYMENT'), 'no refund needed — nothing was taken');
  });

  test('it also sells first while we are mid-sourcing → still $0', () => {
    let state: OrderState = 'DRAFT';
    state = transition(state, 'PAYMENT_AUTHORIZED').to;
    state = transition(state, 'SOURCE_VERIFIED').to;
    assert.equal(state, 'SOURCING');
    assert.ok(isUncaptured(state));

    const t = transition(state, 'SOURCE_GONE');
    assert.equal(t.to, 'VOIDED');
    assert.ok(t.effects.includes('VOID_AUTHORIZATION'));
  });

  test('once SECURED the race is over — SOURCE_GONE is no longer a legal event', () => {
    assert.equal(canTransition('SECURED', 'SOURCE_GONE'), false);
    assert.throws(
      () => transition('SECURED', 'SOURCE_GONE'),
      IllegalTransitionError,
    );
  });
});

describe('happy path', () => {
  test('runs DRAFT → CLOSED, capturing exactly once', () => {
    const path: [OrderEvent, OrderState][] = [
      ['PAYMENT_AUTHORIZED', 'AUTHORIZED'],
      ['SOURCE_VERIFIED', 'SOURCING'],
      ['PURCHASE_CONFIRMED', 'SECURED'],
      ['INBOUND_SHIPPED', 'IN_TRANSIT_INBOUND'],
      ['INBOUND_RECEIVED', 'RECEIVED'],
      ['OUTBOUND_SHIPPED', 'SHIPPED'],
      ['DELIVERY_CONFIRMED', 'DELIVERED'],
      ['RETURN_WINDOW_CLOSED', 'CLOSED'],
    ];

    let state: OrderState = 'DRAFT';
    let captures = 0;
    let evidenceSnapshots = 0;

    for (const [event, expected] of path) {
      const t = transition(state, event);
      assert.equal(t.to, expected, `${state} --${event}--> ${t.to}`);
      if (t.effects.includes('CAPTURE_PAYMENT')) captures++;
      if (t.effects.includes('SNAPSHOT_EVIDENCE')) evidenceSnapshots++;
      state = t.to;
    }

    assert.equal(state, 'CLOSED');
    assert.equal(captures, 1);
    assert.ok(evidenceSnapshots >= 4, 'evidence pack accumulates along the way');
  });

  test('authorizing delists the item from the storefront immediately', () => {
    const t = transition('DRAFT', 'PAYMENT_AUTHORIZED');
    assert.ok(t.effects.includes('DELIST_FROM_STOREFRONT'));
  });
});

describe('inspection failure', () => {
  test('a mismatched watch refunds the customer and returns it to the seller', () => {
    const t = transition('RECEIVED', 'INSPECTION_FAILED');
    assert.equal(t.to, 'REFUNDED');
    assert.ok(t.effects.includes('REFUND_PAYMENT'));
    assert.ok(t.effects.includes('START_EBAY_RETURN'));
  });
});

describe('state predicates', () => {
  test('isUncaptured covers exactly the pre-purchase states', () => {
    assert.ok(isUncaptured('AUTHORIZED'));
    assert.ok(isUncaptured('SOURCING'));
    assert.ok(!isUncaptured('SECURED'));
    assert.ok(!isUncaptured('DRAFT'));
  });

  test('isCommitted starts at SECURED', () => {
    assert.ok(!isCommitted('SOURCING'));
    assert.ok(isCommitted('SECURED'));
    assert.ok(isCommitted('DELIVERED'));
    assert.ok(!isCommitted('VOIDED'));
  });
});

describe('authorization deadlines', () => {
  const authorizedAt = new Date('2026-09-17T12:00:00Z');

  test('uses the conservative Visa window by default', () => {
    const d = captureDeadline(authorizedAt, 'visa');
    // 4 days 18 hours
    assert.equal(d.toISOString(), '2026-09-22T06:00:00.000Z');
  });

  test('gives 7 days on Mastercard/Amex/Discover', () => {
    assert.equal(
      captureDeadline(authorizedAt, 'amex').toISOString(),
      '2026-09-24T12:00:00.000Z',
    );
  });

  test('falls back for an unknown brand', () => {
    assert.equal(
      captureDeadline(authorizedAt, 'unknown-brand').toISOString(),
      captureDeadline(authorizedAt, 'visa').toISOString(),
    );
  });

  test('is not urgent at our normal 20-minute turnaround', () => {
    const u = captureUrgency(
      'SOURCING', authorizedAt, 'visa',
      new Date('2026-09-17T12:20:00Z'),
    );
    assert.equal(u.urgent, false);
    assert.equal(u.expired, false);
    assert.ok(u.hoursRemaining > 100);
  });

  test('goes urgent inside 24 hours — something is badly stuck', () => {
    const u = captureUrgency(
      'SOURCING', authorizedAt, 'visa',
      new Date('2026-09-21T18:00:00Z'),
    );
    assert.equal(u.urgent, true);
    assert.equal(u.expired, false);
  });

  test('reports expiry past the deadline', () => {
    const u = captureUrgency(
      'AUTHORIZED', authorizedAt, 'visa',
      new Date('2026-09-23T00:00:00Z'),
    );
    assert.equal(u.expired, true);
  });

  test('is irrelevant once captured', () => {
    const u = captureUrgency(
      'SECURED', authorizedAt, 'visa',
      new Date('2026-10-30T00:00:00Z'),
    );
    assert.equal(u.urgent, false);
    assert.equal(u.hoursRemaining, Infinity);
  });
});

describe('illegal transitions are loud', () => {
  test('throws rather than silently ignoring', () => {
    assert.throws(() => transition('CLOSED', 'PAYMENT_AUTHORIZED'), IllegalTransitionError);
    assert.throws(() => transition('VOIDED', 'PURCHASE_CONFIRMED'), IllegalTransitionError);
    assert.throws(() => transition('DRAFT', 'OUTBOUND_SHIPPED'), IllegalTransitionError);
  });

  test('terminal states accept nothing', () => {
    for (const state of ['CLOSED', 'VOIDED', 'REFUNDED'] as OrderState[]) {
      for (const event of ALL_EVENTS) {
        assert.equal(canTransition(state, event), false, `${state}/${event}`);
      }
    }
  });
});
