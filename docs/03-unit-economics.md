# 03 — Unit Economics

## The single highest-leverage thing in this entire document

> **Get a resale certificate and register for eBay's buyer tax exemption before you buy
> a single watch.**

When you buy on eBay as a consumer, eBay collects state sales tax on your purchase —
call it 7–9% depending on your state. On a $900 watch that's **$63–$81**. Your gross
margin on that watch is maybe $150–$230.

**Sales tax you shouldn't be paying is eating 30–40% of your profit.**

You are buying for resale. That purchase is exempt. eBay supports this — you register
for their buyer exemption program and upload your state resale certificate against your
buying account. It takes a few hours of paperwork, once.

Doing this roughly **doubles net margin per unit**. It is more valuable than any
optimization to the scraper, the pricing model, or the marketing. Do it in week 1.

*(Corollary: you then have a sales tax collection obligation on your own sales in your
home state, and economic-nexus obligations elsewhere once you cross state thresholds.
At your volume that's your home state only, and Stripe Tax handles the calculation for
~0.5% of transactions. Talk to a CPA once — one hour, worth it.)*

---

## Per-unit P&L — worked example

**Watch:** Longines Hydroconquest 41mm, sold median ~$1,150, found on eBay at $840.

| Line | Without resale cert | With resale cert |
|---|---:|---:|
| Customer pays (our list, ~10% under median) | $1,035.00 | $1,035.00 |
| — eBay purchase price | −$840.00 | −$840.00 |
| — Sales tax on eBay purchase (@7.5%) | **−$63.00** | **$0.00** |
| — Authenticity Guarantee add-on (item $500–1,999) | −$80.00 | −$80.00 |
| — Inbound shipping to us | $0.00 (seller-paid) | $0.00 |
| — Outbound: Priority Express, signature, insured ($1k–5k band) | −$40.00 | −$40.00 |
| — Packaging, travel case, printed docs | −$9.00 | −$9.00 |
| — Stripe (2.9% + $0.30) + Radar ($0.07) | −$30.39 | −$30.39 |
| + eBay Partner Network commission on our purchase (1.5%) | +$12.60 | +$12.60 |
| **Gross profit** | **−$14.79** | **$48.22** |

That's a **loss** without the cert, and thin with it. **The example is deliberately
chosen to show that a 27% spread on a $1,150 watch is not enough.** This is why the
deal engine exists.

*(These are the exact figures `projectMargin()` produces — see
`packages/core/test/pricing.test.ts`, which asserts them. Docs and code agree by
construction.)*

### Re-run it with a deal that passes our gates

Same watch, sourced at **$720** (a 37% discount to median — these exist, roughly 1 in
40 qualified candidates):

| Line | Amount |
|---|---:|
| Customer pays | $1,035.00 |
| — eBay purchase | −$720.00 |
| — Sales tax (exempt) | $0.00 |
| — Authenticity Guarantee | −$80.00 |
| — Outbound shipping + insurance | −$40.00 |
| — Packaging | −$9.00 |
| — Stripe + Radar | −$30.39 |
| + eBay Partner Network commission (1.5%) | +$10.80 |
| **Gross profit** | **$166.42** |
| **Gross margin** | **16.1%** |

**That's the target shape for the CORE band: ~$165 gross, ~16% margin, on a ~$1,000
order.** Other bands look completely different — see
[docs/12](12-buy-box-and-offers.md) for the full curve from $30 to $40,000.

The engine works this backwards for you. Given a market price of $1,150 it returns:

```
bidCeiling(1150) → { listPriceUsd: 1035, maxSourcePriceUsd: 762.86 }
```

*"Market says $1,150. We list at $1,035. Do not pay more than $762 for it."* That one
number is what the daily digest puts in front of you.

> ⚠️ **This whole section uses the old margin-percentage model and understates what
> you can pay.** The current engine gates on **contribution**, not margin: on a $1,150
> market the ceiling is **$863 (75%)**, not $763 (66%). Across the range the required
> discount is 11–25%, not 27–53%. See [docs/12](12-buy-box-and-offers.md) for the
> current numbers — that page supersedes the tables above.

### The $2,000+ variant is better per unit

At $2,000+ **Authenticity Guarantee is free**, which is an $80 swing straight to the
bottom line, and absolute margins scale. A $2,600 sale sourced at $2,050 nets
**$455.98 at 17.5%** — nearly 2.8× the profit of the $1,035 order, for identical work.
The tradeoff is working capital and single-unit risk: a $2,600 chargeback is
2.7 months of profit.

**Sequencing:** first 20 sales in the $600–$1,800 band to build process and reputation,
then add $2,000–$3,500 once the fraud controls have been proven in production.

---

## Volume required, by income target

Assumptions: **$165 average gross profit/unit**, fixed costs below.

### Fixed monthly costs

| Item | Cost/mo | Notes |
|---|---:|---|
| Hosting (Vercel Hobby→Pro, Supabase Free→Pro) | $0–45 | $0 to start, ~$45 once real |
| Domain + Google Workspace | $8 | |
| **WatchCharts Professional + API** | **$40–150** | The one real cost. Comp data is the moat |
| Stripe Radar for Fraud Teams | $0.07/txn | Rules engine. Worth it from day 1 |
| Stripe Tax | ~0.5% of txns | Optional early |
| Shipping insurance (Parcel Pro / Jewelers Mutual) | $0 + per-shipment | Per-unit, already in COGS |
| Business insurance (general liability) | $30–60 | Get it before the first $2k sale |
| Accounting software | $0–20 | Wave free tier is fine at this size |
| **Total** | **~$80–280/mo** | Call it **$150/mo** steady-state |

### The table

| Monthly net target | Gross profit needed | **Units/month** | Deals to review/mo | Candidates to screen/mo |
|---:|---:|---:|---:|---:|
| $300 (your 2022 baseline) | $450 | **3** | ~9 | ~360 |
| $750 | $900 | **6** | ~18 | ~720 |
| $1,500 | $1,650 | **10** | ~30 | ~1,200 |
| $3,000 | $3,150 | **20** | ~60 | ~2,400 |

Funnel assumptions, which you should treat as hypotheses to validate in shadow mode:
- **~1 in 40** screened candidates passes all deal gates → surfaced to you
- **~1 in 3** surfaced deals you actually buy (the rest fail your eyeball check or sell first)
- **~85%** of purchased inventory sells within 45 days at or near list

### Does the API budget support it?

**Yes, comfortably.** 2,400 candidates/month ≈ 80/day. The Browse API returns up to 200
items per call, so screening is ~5–20 calls/day. The real API spend is the **delist
watcher** (see [docs/04](04-sourcing-and-scrapers.md) for the full budget math) — and
that still fits inside the free 5,000/day tier up to ~80 concurrent live listings.

**You do not need to scrape 24/7. You barely need to call the API at all.** Your
instinct on intervals was right.

---

## Working capital

This is the constraint people miss. With authorize-and-capture you buy *after* the
customer commits — but you still front the cash for 3–7 days before the capture settles
and Stripe pays out.

| Concurrent open orders | Float needed (avg $900 COGS) |
|---:|---:|
| 2 | ~$1,800 |
| 4 | ~$3,600 |
| 8 | ~$7,200 |

Plus **speculative inventory**: watches you buy because the deal was too good to pass
up, before a customer exists. That's how you actually build a catalog, and it's where
capital gets tied up.

**Recommended starting float: $4,000–$5,000**, ideally on a business credit card with a
statement cycle that gives you ~25 interest-free days and purchase protection. That
single choice converts the float problem into a rounding error.

## The reinvestment loop you asked for

You said profit feeds 100% back in. Here's the allocation that compounds fastest:

| Stage | Allocation |
|---|---|
| **Months 1–3** (proving it) | 100% → working capital. Grow float to $8k. Do not spend a dollar on ads. |
| **Months 4–6** (finding the channel) | 70% working capital / 20% content & photography / 10% test ad spend |
| **Months 7–12** (scaling what works) | 50% working capital / 30% whatever channel proved out / 20% tooling & data |

Float is the binding constraint before demand is. Every dollar of early profit should
go to being able to say yes to the next good deal, not to Meta.
