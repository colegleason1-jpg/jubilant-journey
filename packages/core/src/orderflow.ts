/**
 * The order state machine.
 *
 * This file is the answer to "the only time I lose money is when someone buys on my
 * site before I can take the listing down after it sold on eBay."
 *
 * The invariant that makes that loss impossible:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  We NEVER capture payment until the eBay purchase is confirmed.      │
 *   │  Before that point, every failure path voids the authorization and   │
 *   │  the customer is never charged a cent.                               │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Stripe holds a card authorization ~7 days (Visa CIT 7d, Stripe works to a 4d18h
 * buffer; MC/Amex/Discover 7d). We need ~20 minutes. See docs/06.
 */

export type OrderState =
  | 'DRAFT'
  | 'AUTHORIZED' // money reserved, NOT taken
  | 'SOURCING' // operator has been pinged to buy on eBay
  | 'SECURED' // ★ we own the watch — capture happens on entry
  | 'IN_TRANSIT_INBOUND'
  | 'RECEIVED' // inspected, photographed, serial logged
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CLOSED'
  | 'VOIDED' // auth released, customer never charged
  | 'REFUNDED';

export type OrderEvent =
  | 'PAYMENT_AUTHORIZED'
  | 'SOURCE_VERIFIED' // Browse API says the listing is still live
  | 'SOURCE_GONE' // it sold out from under us — the 2022 loss scenario
  | 'PURCHASE_CONFIRMED' // operator bought it on eBay
  | 'PURCHASE_FAILED'
  | 'SOURCING_TIMEOUT'
  | 'INBOUND_SHIPPED'
  | 'INBOUND_RECEIVED'
  | 'INSPECTION_FAILED' // not as described — return it, refund customer
  | 'OUTBOUND_SHIPPED'
  | 'DELIVERY_CONFIRMED'
  | 'RETURN_WINDOW_CLOSED'
  | 'CUSTOMER_CANCELLED';

export type SideEffect =
  | 'CAPTURE_PAYMENT'
  | 'VOID_AUTHORIZATION'
  | 'REFUND_PAYMENT'
  | 'ALERT_OPERATOR_BUY_NOW'
  | 'ALERT_OPERATOR_URGENT'
  | 'EMAIL_CUSTOMER_RESERVED'
  | 'EMAIL_CUSTOMER_UNAVAILABLE'
  | 'EMAIL_CUSTOMER_CONFIRMED'
  | 'EMAIL_CUSTOMER_SHIPPED'
  | 'EMAIL_CUSTOMER_REVIEW_REQUEST'
  | 'DELIST_FROM_STOREFRONT'
  | 'START_EBAY_RETURN'
  | 'SNAPSHOT_EVIDENCE';

export interface Transition {
  to: OrderState;
  effects: readonly SideEffect[];
}

/**
 * The full transition table. Anything not listed here is an illegal transition and
 * throws — there is no permissive default, on purpose. An unexpected event on a
 * money-moving state machine should be loud.
 */
const TRANSITIONS: Partial<Record<OrderState, Partial<Record<OrderEvent, Transition>>>> = {
  DRAFT: {
    PAYMENT_AUTHORIZED: {
      to: 'AUTHORIZED',
      effects: ['EMAIL_CUSTOMER_RESERVED', 'DELIST_FROM_STOREFRONT', 'SNAPSHOT_EVIDENCE'],
    },
  },

  AUTHORIZED: {
    // Listing re-verified live → ping the operator to go buy it.
    SOURCE_VERIFIED: { to: 'SOURCING', effects: ['ALERT_OPERATOR_BUY_NOW'] },
    // ★ The 2022 loss scenario. Cost today: $0.00.
    SOURCE_GONE: {
      to: 'VOIDED',
      effects: ['VOID_AUTHORIZATION', 'EMAIL_CUSTOMER_UNAVAILABLE'],
    },
    CUSTOMER_CANCELLED: { to: 'VOIDED', effects: ['VOID_AUTHORIZATION'] },
    SOURCING_TIMEOUT: {
      to: 'VOIDED',
      effects: ['VOID_AUTHORIZATION', 'EMAIL_CUSTOMER_UNAVAILABLE'],
    },
  },

  SOURCING: {
    // ★★ The only CAPTURE_PAYMENT in the entire table. ★★
    PURCHASE_CONFIRMED: {
      to: 'SECURED',
      effects: ['CAPTURE_PAYMENT', 'EMAIL_CUSTOMER_CONFIRMED', 'SNAPSHOT_EVIDENCE'],
    },
    SOURCE_GONE: {
      to: 'VOIDED',
      effects: ['VOID_AUTHORIZATION', 'EMAIL_CUSTOMER_UNAVAILABLE'],
    },
    PURCHASE_FAILED: {
      to: 'VOIDED',
      effects: ['VOID_AUTHORIZATION', 'EMAIL_CUSTOMER_UNAVAILABLE'],
    },
    SOURCING_TIMEOUT: {
      to: 'VOIDED',
      effects: ['VOID_AUTHORIZATION', 'EMAIL_CUSTOMER_UNAVAILABLE'],
    },
    CUSTOMER_CANCELLED: { to: 'VOIDED', effects: ['VOID_AUTHORIZATION'] },
  },

  // From SECURED onward we own the watch. SOURCE_GONE is no longer meaningful —
  // that is the entire point of capturing here.
  SECURED: {
    INBOUND_SHIPPED: { to: 'IN_TRANSIT_INBOUND', effects: [] },
  },

  IN_TRANSIT_INBOUND: {
    INBOUND_RECEIVED: { to: 'RECEIVED', effects: ['SNAPSHOT_EVIDENCE'] },
  },

  RECEIVED: {
    OUTBOUND_SHIPPED: {
      to: 'SHIPPED',
      effects: ['EMAIL_CUSTOMER_SHIPPED', 'SNAPSHOT_EVIDENCE'],
    },
    // Watch doesn't match the listing: return to the eBay seller (returns-accepted is
    // a hard sourcing gate), refund the customer in full. Loss is shipping only.
    INSPECTION_FAILED: {
      to: 'REFUNDED',
      effects: ['REFUND_PAYMENT', 'START_EBAY_RETURN', 'EMAIL_CUSTOMER_UNAVAILABLE'],
    },
  },

  SHIPPED: {
    DELIVERY_CONFIRMED: { to: 'DELIVERED', effects: ['SNAPSHOT_EVIDENCE'] },
  },

  DELIVERED: {
    RETURN_WINDOW_CLOSED: { to: 'CLOSED', effects: ['EMAIL_CUSTOMER_REVIEW_REQUEST'] },
    CUSTOMER_CANCELLED: { to: 'REFUNDED', effects: ['REFUND_PAYMENT'] },
  },
};

export class IllegalTransitionError extends Error {
  readonly state: OrderState;
  readonly event: OrderEvent;

  constructor(state: OrderState, event: OrderEvent) {
    super(`Illegal transition: ${event} is not valid in state ${state}`);
    this.name = 'IllegalTransitionError';
    this.state = state;
    this.event = event;
  }
}

export function transition(state: OrderState, event: OrderEvent): Transition {
  const next = TRANSITIONS[state]?.[event];
  if (!next) throw new IllegalTransitionError(state, event);
  return next;
}

export function canTransition(state: OrderState, event: OrderEvent): boolean {
  return TRANSITIONS[state]?.[event] !== undefined;
}

/** States in which the customer's money is reserved but not taken. */
export function isUncaptured(state: OrderState): boolean {
  return state === 'AUTHORIZED' || state === 'SOURCING';
}

/** True once we own the watch and the race against eBay is over. */
export function isCommitted(state: OrderState): boolean {
  return (
    state === 'SECURED' ||
    state === 'IN_TRANSIT_INBOUND' ||
    state === 'RECEIVED' ||
    state === 'SHIPPED' ||
    state === 'DELIVERED' ||
    state === 'CLOSED'
  );
}

/**
 * Card-network authorization windows, in hours.
 * Stripe reports the real deadline per charge on
 * `payment_method_details.card.capture_before` — always prefer that value when you
 * have it. These are the planning defaults.
 */
export const AUTH_WINDOW_HOURS: Record<string, number> = {
  visa: 4 * 24 + 18, // Stripe's conservative 4d18h buffer
  mastercard: 7 * 24,
  amex: 7 * 24,
  discover: 7 * 24,
  default: 4 * 24 + 18,
};

export function captureDeadline(authorizedAt: Date, cardBrand = 'default'): Date {
  const hours = AUTH_WINDOW_HOURS[cardBrand.toLowerCase()] ?? AUTH_WINDOW_HOURS.default!;
  return new Date(authorizedAt.getTime() + hours * 3_600_000);
}

/**
 * Should we be shouting about this order? Our target time in an uncaptured state is
 * under 30 minutes, so anything within 24h of the deadline means something is badly
 * stuck.
 */
export function captureUrgency(
  state: OrderState,
  authorizedAt: Date,
  cardBrand = 'default',
  now: Date = new Date(),
): { urgent: boolean; expired: boolean; hoursRemaining: number } {
  if (!isUncaptured(state)) {
    return { urgent: false, expired: false, hoursRemaining: Infinity };
  }
  const deadline = captureDeadline(authorizedAt, cardBrand);
  const hoursRemaining = (deadline.getTime() - now.getTime()) / 3_600_000;
  return {
    urgent: hoursRemaining <= 24,
    expired: hoursRemaining <= 0,
    hoursRemaining: Math.round(hoursRemaining * 100) / 100,
  };
}
