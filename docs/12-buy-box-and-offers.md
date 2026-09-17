# 12 — What To Pay: Contribution, Not Margin

## The correction

Two earlier versions of this document were wrong in the same way: they gated deals on
a **margin percentage**. The second version at least made the percentage vary by price
band, but it was still a number I picked, not a number derived from anything.

On a **$2,600** watch it demanded you buy at **$1,890** — a 27% discount — and clear
$280 of gross. Here is what that threw away:

```
market $2,600  →  list $2,450 (5.8% under market, still a real discount for the buyer)
               →  buy at $2,300
                     on card:  +$3.68
                     on ACH:   +$70.10
```

Positive money, a **far more findable** deal, and — the part a margin gate cannot see
at all — **a customer**.

## Why a margin floor is the wrong objective

This is not a portfolio of independent transactions. It is a business trying to build
an organic customer pipeline, and in that business:

- **Paid acquisition costs $156–782 per customer** at our price points ([docs/07](07-marketing-and-demand.md)).
- So a sale that contributes **$1** and acquires a customer is not a marginal deal.
  It is the cheapest customer acquisition available, by two orders of magnitude.
- Customers leave reviews, refer (**20–30% referral rate in luxury**), and return
  (**9–20%** in jewellery/watches, **76% of those within 90 days**).

**A $30 watch sold at a dollar of profit is a customer acquisition, a review, a
forum reputation point, and a person who might buy a $2,000 watch next year.** None of
that appears in a margin percentage.

### What a new customer is actually worth

Derived, not invented — every input is sourced, and all of it is configurable:

| Input | Value | Source |
|---|---|---|
| Repeat purchase rate (jewellery/watches) | 12% | published range 9–20% |
| Second-order AOV multiplier | 1.4× | published range 1.3–1.6× |
| Converted referrals per customer | 0.15 | luxury referral rates run 20–30% |
| Average future contribution | $150 | our own model |
| **New-customer credit** | **$47.70** | |

**Cross-check:** the published CAC benchmark for >$200-AOV ecommerce is ~$48. Our
independently-derived figure lands within a dollar of it. Acquiring a customer is
worth roughly what acquiring one costs — which is exactly the point.

---

## The rule

```
HARD FLOOR (always):     contribution > $1 after every real cash cost
                         ↑ literally "if I make a damn dollar that's fine"

THEN:                    is capacity abundant or constrained?

  ABUNDANT   spare hours, spare float  →  take it. A $1 hour beats an idle hour.
  CONSTRAINED  hours/float are binding →  now rank, because a thin deal occupies
                                          an hour a fatter deal wanted.
```

**Margin percentage appears nowhere.** What's scarce is your time (~14 hrs/month) and
your float ($4–5k) — so deals are ranked on **adjusted contribution per hour** and
rejected only when something better competes for the same hour or the same dollar.

### What this does to the bid ceiling

| market | list | max buy | **buy %** | old margin gate |
|---:|---:|---:|---:|---:|
| $30 | $27 | $23.10 | **77%** | (called it impossible) |
| $100 | $90 | $84.27 | **84%** | (called it impossible) |
| $350 | $315 | $299.89 | **86%** | (called it impossible) |
| $900 | $810 | $754.94 | **84%** | 63% |
| $1,150 | $1,035 | $943.42 | **82%** | 66% |
| $2,600 | $2,340 | $2,196.92 | **84%** | 73% |
| $10,000 | $9,000 | $8,880.95 | **89%** | 89% |

The required discount is now **11–23% across the whole range**, not 27–53%. That is
several times the deal flow, at every price point.

## Authentication is optional, and we don't buy it by default

eBay's collector-item authentication programme — **Authenticity Guarantee**, covering
sneakers, watches, handbags, jewellery, streetwear and trading cards — has three bands
for watches:

| Source price | Authentication | Who pays |
|---|---|---|
| **$2,000+** | Automatic | **eBay. Free to both sides.** |
| **$500–$1,999.99** | **Optional** | **$80, elected by the BUYER** |
| Under $500 | Not offered | — |

**We are the buyer, so in the middle band that $80 is ours and it is optional.** An
earlier version of this model charged it as a mandatory cost on every purchase in that
range. It isn't mandatory, and paying it was costing ~9% of a $900 order — which is
what made that band the tightest in the whole book at 75%. Not electing it takes it to
**84%**.

**We don't need to buy it, because our buy-side protection is already free.** eBay
**Money Back Guarantee** covers counterfeit and not-as-described on every purchase for
30 days, and it overrides the seller's own return policy. If a watch turns out wrong,
that is our remedy — we don't need to have pre-paid $80 for the privilege.

And above $2,000 the certificate is **free and automatic**, so it costs us nothing
exactly where the stakes are highest.

**When to elect it anyway** (`electAuthenticity: true`, per unit, never as a policy):
- a seller with thin history on a commonly-faked reference
- a reference with a known high-quality counterfeit in circulation
- a customer who asks for it and will absorb the cost

> **Two different protections, and it's worth keeping them straight:**
> **Money Back Guarantee** protects *us* when we buy (reactive, free, always).
> **Authenticity Guarantee** produces a certificate we can hand *our* customer
> (proactive, free above $2,000). Our sell-side defence below $2,000 is our own
> inspection, logged serial and 20 photos — which we do on every unit anyway under
> the routing rules in [docs/13](13-fulfilment-routing.md).

---

## ⚡ The payment rail is most of the deal above $2,500

**Card is 2.9% + $0.30, uncapped.** On a $10,000 order that is **$290.37**.
**Stripe ACH is 0.8%, capped at $5** (the cap binds above $625). Same order: **$5.00**.

```
$2,600 watch bought at $2,300:   on CARD  +$3.68     on ACH  +$70.10   (19×)
$10,000 bought at $8,903.55:     on CARD  −$190.37   on WIRE +$100.00
```

Same watch, same day. So the `HIGH` and `ULTRA` profiles **refuse cards outright** —
`resolveRail(10000, 'CARD')` returns `null`. Not a margin policy; arithmetic about a
fee schedule. Wire is also near-irreversible, which is the other reason a 1% margin
survives up there.

**Practical move:** offer a 1–2% bank-transfer discount above $2,500. A $5,000 buyer
will happily wire to save $75, and it costs you a fraction of the card fee.

---

## ⚠️ A revenue line I removed

Every earlier version credited **eBay Partner Network commission (1.5%) on our own
purchases**. I could not confirm that self-referral is permitted — EPN is built for
driving *external* traffic, and affiliate programmes generally prohibit earning on
your own orders.

**It is now zero by default.** This matters more than it sounds: on the $2,600 example
it was $34.50 of a $38 contribution. It was carrying the deal.

Verify with EPN directly. If they confirm it, set `epnCommissionRate` and enjoy the
upside — but do not build a thin-margin business on unconfirmed revenue.

---

## The cost curve

Shipping is modelled as a **curve over declared value** built from the real published
components, not hand-picked buckets:

```
postage       Ground Advantage $8.50 → Priority $11 → Express $28 → Registered $45
signature     none → confirmation $4.15 → adult $10.05
insurance     first $100 included, then $2.65 + $1.05 per additional $100
```

A $30 watch ships for **$8.50** and the buyer pays the postage. A $10,000 watch ships
Registered for ~$105 and we absorb it. Previous versions charged $32 insured Express
to *everything*, which is what invented the fake floor.

> **Re-fit these constants to your own commercial rates.** This cost sits on every
> single unit — it is the easiest way to widen every deal in the book.

## The two capacity knobs

| Setting | When | Effect |
|---|---|---|
| `capacity: 'ABUNDANT'` | Starting out; spare evenings; float idle | Takes anything ≥ $1 |
| `capacity: 'CONSTRAINED'` | Time or float is the bottleneck | Also enforces $/hr and return-on-float |
| `countStrategicCreditTowardFloor: false` *(default)* | | Floor stays cash-real; LTV credit ranks but never masks a cash loss |
| `...: true` | Deliberate land-grab phase | A small cash loss is acceptable to buy a customer |

---

## The offer ladder

**10% below ask → 5% below → pay the ask.** eBay caps buyer offers per listing
(commonly 3; rejected, retracted and expired all count), so that's exactly the budget.
Do not add rungs.

Each rung reports **absolute contribution and contribution per hour** — the percentage
stops being useful at either end of the range. The ladder truncates at the floor: a
system that quietly pays the ask after two declines is the expensive bug here.

**⚠️ You send offers by hand.** eBay prohibits automated order placement and an offer
is an order commitment.

**⚠️ Stocked buying only.** A seller has 48 hours to answer; two rungs can burn four
days, which doesn't fit inside a 7-day card authorization with shipping still to come.
For an order already placed on our site, buy at the ask immediately.

---

## Where each number lives

| Question | Function | File |
|---|---|---|
| What does shipping actually cost? | `shippingCostUsd()` | `economics.ts` |
| What does the rail cost? | `processingFeeUsd()` | `tiers.ts` |
| Is this rail allowed at this value? | `resolveRail()` | `tiers.ts` |
| What is a new customer worth? | `newCustomerCreditUsd()` | `economics.ts` |
| **Does this deal pay for itself?** | `computeEconomics()` → `judgeDeal()` | `economics.ts` |
| **Most we can pay?** | `maxSourcePrice()` | `economics.ts` |
| Can I trade at this price point? | `tradeability()` | `offers.ts` |
| What do we offer the seller? | `buildOfferLadder()` | `offers.ts` |
| Should it reach me? | `evaluateDeal()` | `deal.ts` |
| Same, in the scanner | `deal.evaluate()` | `services/scout/scout/deal.py` |

129 TypeScript tests and 27 Python tests, with the Python suite asserting the same
worked examples so the two cannot drift.

---

### Sources
- [Repeat purchase rate benchmarks 2026](https://prooflytics.io/blog/repeat-purchase-rate-benchmarks)
- [Average repeat purchase rate by vertical](https://eightx.co/blog/average-repeat-purchase-rate-by-vertical)
- [Jewelry ecommerce benchmarks 2026](https://www.immerss.live/content/jewelry-ecommerce-benchmarks-2026/)
- [CLV benchmarks 2026](https://www.digitalapplied.com/blog/customer-lifetime-value-benchmarks-2026-industry-data)
- [CAC benchmarks by industry 2026](https://www.digitalapplied.com/blog/customer-acquisition-cost-benchmarks-2026-industry)
- [LTV:CAC ratio for ecommerce](https://fractosolutions.com/blog/what-is-a-good-ltvcac-ratio-for-ecommerce/)
- [Stripe ACH fees: 0.8% capped at $5](https://feeprobe.com/stripe-ach-fees/)
- [USPS Ground Advantage — tracking + $100 insurance included](https://www.usps.com/ship/ground-advantage.htm)
- [eBay Best Offer — buyer offer limits](https://www.ebay.com/help/selling/listings/selling-buy-now/adding-best-offer-listing?id=4144)
- [eBay Partner Network — programme rules](https://partnernetwork.ebay.com/solutions/step-5-knowing-the-rules)
