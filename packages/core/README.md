# @gleason/core

The decision engine. Zero dependencies, zero build step.

```bash
cd packages/core
npm test        # 91 tests, runs on Node 22+ native TypeScript
```

No `npm install` required — Node 22.6+ strips types natively, so this package has no
`node_modules`, no bundler and no transpile step. That is deliberate: it keeps the one
part of the system that is expensive to get right portable across whatever storefront
it ends up attached to (see [docs/05](../../docs/05-commerce-stack.md)).

> Note: Node's strip-only mode does not support `enum`, `namespace`, or constructor
> parameter properties. Stick to `type`, `interface`, and plain classes.

## The five modules

| Module | Answers |
|---|---|
| **`comps.ts`** | What is this watch worth, and **will it sell regularly?** |
| **`pricing.ts`** | What do we list it at, and what is the most we can pay? |
| **`deal.ts`** | Should this candidate reach a human at all? |
| **`risk.ts`** | Should we accept this order? |
| **`orderflow.ts`** | When exactly do we take the customer's money? |

## The two ideas worth understanding

### 1. Liquidity gating — `computeLiquidity()`

A model can have a great average price and still be untradeable. `computeLiquidity()`
requires **volume, tightness, consistency and freshness** together:

```ts
computeLiquidity(sales)  // → { qualified, medianGapDays, longestGapDays, failures }
```

The subtle part is the **trailing gap**: the interval between the most recent sale and
*now* counts as a gap. Without it, a reference that sold 12 times in one week two
months ago would look perfectly liquid. It isn't — demand moved on, and your capital
would sit in it.

```ts
// Sells every 4 days, most recent today → qualified
// Sold 12 times in one week, two months ago → DROUGHT_TOO_LONG, STALE_DEMAND
```

### 2. The capture invariant — `orderflow.ts`

There is exactly **one** transition in the entire state machine that emits
`CAPTURE_PAYMENT`, and it is `SOURCING --PURCHASE_CONFIRMED--> SECURED`. This is
enforced by a test that walks every state × event pair:

```ts
test('CAPTURE_PAYMENT is reachable from exactly one transition in the whole machine')
```

Everything before that point voids the authorization on any failure, so the customer is
never charged for a watch we couldn't get. That is the structural fix for the 2022 loss
mode. See [docs/06](../../docs/06-payments-and-fraud.md).

## Quick tour

```ts
import { computeComps, computeLiquidity, evaluateDeal, bidCeiling } from '@gleason/core';

// What should we pay?
const { listPriceUsd, maxSourcePriceUsd } = bidCeiling(1150);
// → { listPriceUsd: 1035, maxSourcePriceUsd: 762.86 }
//   "Market says $1,150. We list at $1,035. Do not pay more than $762."

// Should this candidate reach the daily digest?
const evaluation = evaluateDeal(candidate, observedSales);
if (evaluation.pass) {
  console.log(evaluation.score, evaluation.projection.grossProfitUsd);
} else {
  console.log('rejected:', evaluation.gatesFailed);
}
```

## Tuning

Every threshold lives in a config object — `DEFAULT_PRICING`, `DEFAULT_DEAL_CONFIG`,
`DEFAULT_RISK_CONFIG` — so nothing needs editing in the logic to retune it.

**Do not tune these from intuition.** Run shadow mode for three weeks first
([docs/09 M2](../../docs/09-roadmap-and-estimates.md)), then fit the thresholds to what
actually happened. The defaults are starting guesses, and they are deliberately
conservative.
