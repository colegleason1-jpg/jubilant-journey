# 12 — The Buy Box, The Offer Ladder, and Auto-Listing

## The model is fluid, because the economics are

There is no single right buy discount and no single right margin floor. Two things
move in opposite directions as price rises, and **both** have to be modelled:

| | Cheap watch ($30) | Expensive watch ($10,000) |
|---|---|---|
| **Percentage margin needed** | **High** — 30%, because 5% of $30 is $1.50 | **Low** — 1%, because 1% is $100 |
| **Discount you must buy at** | **Deep** — ~50% of market | **Shallow** — ~90% of market is fine |
| **Shipping** | $7.50 padded envelope, **charged to the buyer** | $110 Registered Mail, absorbed |
| **Payment rail** | Card | **Wire or ACH — card is banned** |
| **Handling** | 8 minutes, 5 photos | 60 minutes, full SOP, a phone call |
| **What gates it** | $/hour | Absolute dollars vs. risk |

> **An earlier draft of this document was wrong.** It applied one shipping assumption
> (insured Priority Express, ~$32 floor) and one margin floor (12%) to every price
> point, and concluded that nothing under ~$800 was tradeable. That conclusion was an
> artefact of bad constants, not a fact about the business. You can absolutely make
> money on a $30 watch, and you can absolutely make money on 1% of a $10,000 one.

### What the engine says now

```
market     tier    rail   list     max buy    buy%    gross    margin   $/hour
    30     MICRO   CARD      27      13.99     47%    $10.35    30.0%      $78
   100     MICRO   CARD      90      56.91     57%    $29.25    30.0%     $219
   350     BUDGET  CARD     315     233.97     67%    $71.72    22.0%     $287
   900     ENTRY   CARD     810     565.12     63%   $121.50    15.0%     $243
 2,600     CORE    CARD   2,340   1,890.32     73%   $280.80    12.0%     $481
 5,000     UPPER   ACH    4,500   4,190.86     84%   $300.00     6.7%     $400
10,000     HIGH    WIRE   9,000   8,903.55     89%   $100.00     1.1%     $100
18,000     HIGH    WIRE  16,200  16,150.25     90%   $162.00     1.0%     $162
```

**The required discount narrows from ~53% to ~10% as you move up the range.** That's
the whole model in one sentence.

### So "buy at 90% of market" is neither right nor wrong — it depends where you are

| Market price | Buy at 90%? | Buy at 95%? |
|---:|---|---|
| $200 | ❌ loses | ❌ loses |
| $1,000 | ❌ loses | ❌ loses |
| $2,600 | ❌ loses | ❌ loses |
| $5,000 | ✅ works (3.75% discount to offer) | ❌ loses |
| $10,000 | ✅ works (9% discount to offer) | ✅ works (4%) |
| $18,000 | ✅ works (9.5%) | ✅ works (4.75%) |

---

## ⚡ The payment rail is what makes the top end possible

This is the single most important mechanical fact above ~$2,500.

**Card processing is 2.9% + $0.30 and uncapped.** On a $10,000 order that is
**$290.37** — nearly three times a 1% gross margin. On a card, a 1% deal at $10,000
is not thin, it is a **$190 loss**.

**Stripe ACH Direct Debit is 0.8%, capped at $5.** The cap binds above $625. Same
$10,000 order: **$5.00**.

```
$10,000 order, bought at $8,903.55:
  on CARD  →  −$190.37   ❌
  on WIRE  →  +$100.00   ✅
```

Same watch, same purchase price, same day. **The rail is the deal.**

So the `HIGH` and `ULTRA` tiers don't merely prefer ACH/wire — they **refuse cards**
(`resolveRail(10000, 'CARD')` returns `null`). Two reasons, both good:

1. The fee would exceed the entire gross margin.
2. Wire is effectively irreversible and ACH disputes are far weaker than card
   chargebacks. A 1% margin can only survive if a single reversal isn't going to eat
   a hundred units of profit.

**Practical move:** offer a 1–2% "bank transfer discount" on orders over $2,500. Most
buyers of a $5,000 watch will happily wire to save $75, and it costs you a fraction of
what the card would.

---

## ⚠️ One real dead zone: just above a $500 source price

Not a modelling artefact — a genuine kink worth knowing. A watch sourced at **$520**
picks up the **$80 Authenticity Guarantee add-on**; one sourced at **$480** doesn't.
That $80 has to come out of a still-modest margin, so the required discount actually
*deepens* right there:

```
list $180  (source ~$131, no add-on)   → buy at 73% of list
list $810  (source ~$565, pays $80)    → buy at 70% of list   ← tighter, not looser
```

Above ~$2,000 source price, authentication goes free again and the curve resumes
narrowing. **Be deliberate about which side of $500 you buy on.** There's a test
documenting this (`the $500 authentication threshold creates a real dead zone`).

---

## The two floors

Every deal must clear **both**, and each catches what the other misses:

| Floor | Catches |
|---|---|
| **Percentage** (`minMarginPct`) | Expensive deals that look fine in dollars but are too thin to absorb a return or a price move |
| **Absolute dollars** (`minGrossProfitUsd`) | Cheap deals with a flattering ratio that aren't worth the handling. *33% of a $20 order is $9 — a great ratio, a bad use of 15 minutes* |

`effectiveHourlyUsd` is reported on every projection for exactly this reason. A
$10.35 gross on 8 minutes of handling is **$78/hour**. That's the honest test at the
cheap end, and a percentage can't express it.

---

## The offer ladder

For listings with Best Offer enabled: **10% below ask → 5% below → pay the ask.**

eBay caps buyer offers per listing (commonly 3; rejected, retracted and expired
offers all count against it), so this ladder is exactly the budget. **Do not add
rungs.**

```
Ask $790, our list price $1,035 (CORE tier, 12% / $120 floors):
  Step 1   offer $711.00  (−10%)  →  $199.30 gross, 19.3%   ✅ send
  Step 2   offer $750.50  (−5%)   →  $160.40 gross, 15.5%   ✅ send if declined
  Step 3   pay   $790.00  (ask)   →  $121.50 gross, 11.7%   ❌ below floor — WALK AWAY
```

The ladder **truncates at the floors**. An automated system that quietly pays the ask
because the first two offers were declined is the expensive bug here, so
`viableRungs()` returns only the rungs worth sending and walking away is an expected
outcome.

Each rung reports **absolute gross as well as percentage**, because at high value the
percentage stops being the useful number.

### Two hard constraints

**⚠️ You send offers by hand.** eBay's User Agreement prohibits automated order
placement and an offer is an order commitment. The engine decides the numbers and
emails them to you; the clicking is yours.

**⚠️ The ladder is for stocked buying only.** A seller has up to 48 hours to answer.
Two rungs can burn four days, which does not fit inside a 7-day card authorization
with shipping still to come.

### So there are two buying modes

| | **Mode A — Stocked** | **Mode B — Sourced to order** |
|---|---|---|
| Trigger | Scout finds a deal | Customer orders |
| Offers | ✅ Full 10→5→ask ladder | ❌ Buy at ask immediately |
| Margin | Higher | Lower |
| Capital | Tied up until it sells | None |
| Risk | **Dead inventory** ([docs/10](10-risk-register.md) #4) | Source disappears (costs $0) |

**Run Mode B first.** Add Mode A once you have 20 clean orders and know your
days-to-sell. Both share every gate and pricing function; only the offer step differs.

---

## Auto-listing: what the machine may and may not do

```
  scout finds deal ──► you buy (90 seconds, by hand)
                              │
       watch arrives ──► ✅ AUTOMATED: draft listing
                          title · specs · price from the comp engine ·
                          condition template · SEO metadata
                              │
                     🔴 HUMAN GATE — you, 5 minutes
                          photos attached · serial logged ·
                          condition text checked against the actual watch
                              │
                       ✅ AUTOMATED: publish, feeds, indexing
                       ✅ AUTOMATED: delist instantly when the source ends
```

The `publishable_inventory` view enforces this in the database: a listing renders only
when it is photographed, serial-logged and human-reviewed. **The scout can stage a
listing; it cannot publish one.**

Listing copy is a legal description of goods. Machine-written text saying "excellent"
about a scratched bezel is an "item not as described" chargeback you will lose, and
3D Secure doesn't cover those. Five minutes per watch is the cheapest insurance here.

**For MICRO/BUDGET tiers the gate can be lighter** — 5 photos, no video, a
30-second check. Scale the ceremony to the value; that's the point of tiers.

**Delisting is fully automated, no gate.** Removing a listing can't hurt a customer.

---

## Where each number lives

| Question | Function | File |
|---|---|---|
| Which tier, what costs? | `tierFor()` | `packages/core/src/tiers.ts` |
| What does the rail cost? | `processingFeeUsd()` | `tiers.ts` |
| Is this rail even allowed? | `resolveRail()` | `tiers.ts` |
| What's it worth? | `computeComps()` | `comps.ts` |
| Will it sell regularly? | `computeLiquidity()` | `comps.ts` |
| What do we list at? | `solveListPrice()` | `pricing.ts` |
| **Most we can pay?** | `maxViableSourcePrice()` | `pricing.ts` |
| Does it clear both floors? | `meetsFloors()` | `pricing.ts` |
| **Can I trade at this price point?** | `tradeability()` | `offers.ts` |
| What discount can I offer? | `maxCustomerDiscount()` | `offers.ts` |
| What do we offer the seller? | `buildOfferLadder()` | `offers.ts` |
| Should it reach me? | `evaluateDeal()` | `deal.ts` |
| Same, in the scanner | `deal.evaluate()` | `services/scout/scout/deal.py` |

Every threshold in `tiers.ts` is a **starting guess**. Re-fit them from your own
closed sales — that's what the comp snapshots and the rejection log are for.

---

### Sources
- [Stripe ACH fees: 0.8% capped at $5](https://feeprobe.com/stripe-ach-fees/)
- [Stripe pricing breakdown 2026](https://flexprice.io/blog/stripe-pricing-breakdown-2026)
- [USPS Ground Advantage — tracking + $100 insurance included](https://www.usps.com/ship/ground-advantage.htm)
- [USPS Ground Advantage pricing 2026](https://www.clickpost.ai/blog/usps-ground-advantage)
- [eBay Best Offer — buyer offer limits](https://www.ebay.com/help/selling/listings/selling-buy-now/adding-best-offer-listing?id=4144)
- [eBay Authenticity Guarantee for watches](https://pages.ebay.com/authenticity-guarantee-watches-seller/)
