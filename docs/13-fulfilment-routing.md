# 13 — Fulfilment Routing: Direct Ship vs Through You

You proposed: **under $1,000 ships straight from the eBay seller to the customer;
$1,000+ comes to you in Rockford first, and you handle it personally.**

The threshold instinct is right. The starting point should be stricter, then relax.

---

## What direct-ship actually costs you

Shipping eBay-seller → customer saves one leg (~$32–40) and 2–4 days. Real money and
real speed. But it forfeits four things:

| Lost | Why it matters |
|---|---|
| **Your 20 in-hand photos** | Proves condition as sold. The listing photos are the *seller's* claims, not yours |
| **The logged serial number** | Kills the buy-genuine/return-fake swap — the most common high-value watch scam |
| **The packing video** | Kills "the box was empty" |
| **The inspection** | You find out the watch is wrong *from your customer*, after they've paid |

Those are the four items that win an "item not as described" chargeback, and 3D
Secure does **not** cover INAD ([docs/06](06-payments-and-fraud.md)). Direct-ship
trades your entire dispute defence for $40 and three days.

Two more problems:

- **Someone else's packaging.** A customer who paid gleasontimepiece.org $1,035
  receives an unfamiliar parcel, possibly with an invoice showing $720. That is a
  chargeback and a one-star review. Any seller must **confirm a blind ship** first.
- **Merchant-of-record.** Stripe prohibits taking settlement for goods you didn't
  provide on behalf of third-party sellers ([docs/05](05-commerce-stack.md)). Taking
  physical possession is the clearest evidence that you buy and resell rather than
  broker. Never direct-shipping in month one is also the cleanest story if Stripe
  ever asks.

---

## The routing rule

Implemented in `routeFulfilment()` (`packages/core/src/offers.ts`). **Every condition
must pass for direct-ship; any single failure routes through you.**

| Condition | Default | Why |
|---|---|---|
| Order value | **< $1,000** | Your threshold, kept as-is |
| Clean orders completed | **≥ 20** | Direct-ship is earned, not assumed |
| Risk decision | **ACCEPT** only | Never direct-ship something the risk engine flagged |
| Authenticity Guarantee | **required** | Without it and without you, *nothing* verifies the watch |
| Seller confirmed blind ship | **required** | No invoices, no third-party branding |

```ts
routeFulfilment({ orderValueUsd: 850, completedOrdersToDate: 40, riskDecision: 'ACCEPT',
                  authenticityGuaranteed: true, sellerConfirmedBlindShip: true })
// → { route: 'DIRECT_TO_CUSTOMER' }

routeFulfilment({ orderValueUsd: 850, completedOrdersToDate: 3, ... })
// → { route: 'VIA_OPERATOR', reasons: ['only 3 clean orders completed (need 20)'] }
```

**So in practice: everything comes to Rockford for the first 20 orders.** That's
roughly your first 3–4 months. By then you'll know your seller pool, your dispute
rate and your photography workflow — and you can relax the threshold from evidence
instead of hope.

### A middle option worth knowing

For **$500–$1,999** watches, the buyer-elected Authenticity Guarantee add-on ($80)
routes the watch through an eBay authenticator who inspects it, tags it, and
*repackages* it before onward shipping. That solves verification and the
packing-slip problem in one step, without a leg through you.

It still doesn't give you your own photos or the serial log. Treat it as the
strongest direct-ship variant, not as equivalent to handling it yourself.

---

## The $1,000+ path — which is the good one

Your instinct to personally handle the expensive ones is right, and it's worth more
than the shipping it costs:

1. Watch ships to you (free Authenticity Guarantee at $2,000+; $80 add-on below)
2. Full inbound SOP — film, serial, 20 photos, inspect ([docs/08](08-operations-runbook.md))
3. **You email or call the customer personally.** On a $2,000 purchase from an
   unknown dealer this is the single highest-value thing you do
4. Ship with adult signature, insured, plain packaging, handwritten note
5. Full evidence pack filed against the order

At ~$400 gross on a $2,600 order, 50 extra minutes is time very well spent — and it's
the segment where a single chargeback hurts most.

### 🔒 Your address stays out of the repo

Your Rockford address is configured as the `HIGH_VALUE_SHIP_TO` environment variable
(GitHub Actions secret / Supabase config), **not committed to git**. It's in
`.env.example` as a placeholder only.

Even in a private repo, a home address in version control leaks the moment the repo
is shared, forked, or made public. Same reasoning as API keys — one line of config
now, no cleanup later.

---

## Summary

| Order | Route | Who touches it |
|---|---|---|
| Any order, first 20 | **Via you** | You inspect, photograph, ship |
| Risk-flagged, any value | **Via you** | You inspect, photograph, ship |
| No Authenticity Guarantee | **Via you** | You are the only verification |
| < $1,000, after 20 clean orders, AG + blind ship confirmed | **Direct** | Authenticator → customer |
| **≥ $1,000** | **Via you, always** | You inspect, photograph, **call the customer**, ship |
