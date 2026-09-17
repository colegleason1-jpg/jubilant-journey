# 10 — Risk Register

Ranked by expected loss (probability × severity), not by how scary they sound.

| # | Risk | P | Severity | Control | Residual |
|---|---|---|---|---|---|
| 1 | **eBay buying account banned** (scraping / agent ToS violation) | Med if naive, **Low with this plan** | 🔴 **Fatal** — the business stops | Official Browse API only. Human-in-the-loop purchase. No HTML scraping. No proxies. See [docs/01](01-reality-check.md) | Low |
| 2 | **INAD chargeback on a genuine watch** | Med | 🔴 High — one wipes out 6 units of profit | Authenticity Guarantee sourcing filter · serial log · 20 photos · packing video · 30-day returns · signature | Med — **accept and price for it** |
| 3 | **Buy a fake or misrepresented watch** | Med | 🔴 High | AG-only sourcing · returns-accepted hard gate · seller quality gates · your 90-second eyeball · stock-photo detection | Low |
| 4 | **Dead inventory** — bought it, nobody wants it | **High** | 🟠 Med — capital locked, not lost | Liquidity gating in `comps.ts` (your "tight sales" rule) · days-to-sell as the #1 metric · cut prices at 45 days | Med |
| 5 | **Stripe account frozen / reserve imposed** | Low–Med | 🔴 High — no payments = no business | Described as retail not broker/marketplace · merchant of record (two-hop shipping) · dispute rate ≤1% · **open a backup processor at month 6** | Low |
| 6 | **Comp model is wrong** → systematic overpaying | Med | 🟠 Med | 3-week shadow-mode backtest before spending · realized-vs-modeled margin tracked weekly · own sales ledger as ground truth | Low |
| 7 | **Source listing sells first** (your 2022 loss) | **High (frequent)** | 🟢 **Low — $0** | Authorize-and-capture. Void the auth. Customer never charged. See [docs/06](06-payments-and-fraud.md) | **Negligible** |
| 8 | **WatchCharts pricing/licensing changes** | Med | 🟠 Med | Own sales ledger + Terapeak as independent fallbacks · never single-source comps | Low |
| 9 | **Package lost or stolen in transit** | Low | 🟠 Med | Correct insurance for value band — **not** UPS's $500 jewelry cap, not Shippo's XCover (excludes jewelry) · signature required · plain packaging | Low |
| 10 | **Spreads compress; the arbitrage stops working** | Med (over years) | 🟠 Med | Move down-market where pricing stays sloppy · shift toward brand/SEO/trust as the moat · buy-back channel sources below eBay | Med |
| 11 | **eBay API terms change again** | Med | 🟠 Med | Keep sourcing adapters behind an interface · Chrono24 + Reddit as alternate inputs | Med |
| 12 | **Burnout** — 14 hrs/mo stops feeling worth $1,200 | **High** | 🟠 Med | The 35-hour shortcut proves it's fun before it's expensive · automate the boring half first · it's fine to stop | — |
| 13 | Sales tax nexus obligations missed | Med | 🟠 Med | Stripe Tax · one CPA hour up front · home-state only at this volume | Low |
| 14 | FTC Mail Order Rule violation (shipping late) | Low | 🟡 Low–Med | State 5–7 day handling, actually ship in 3–5 · automated delay notice + cancel right | Low |
| 15 | Forum/subreddit ban from automated posting | **High if attempted** | 🟠 Med — reputation is unrecoverable | **Never post automatically.** Read-only signal collection only | Negligible |

---

## The three that deserve real thought

### 🔴 #1 — The eBay account is the business

Everything routes through one buying account. If it's banned, there is no pipeline, no
inventory, no Authenticity Guarantee, nothing. The entire operation is a
single-point-of-failure attached to someone else's terms of service.

This is *the* reason the plan refuses to scrape or auto-buy, and it's why "it would
probably be fine" is not an acceptable answer. The upside of automating the buy click is
90 seconds a day. The downside is the company.

**Mitigations beyond compliance:** keep the account's buying behavior human-normal (no
bursts, pay instantly, communicate with sellers, leave feedback). Build the Chrono24
channel in year 2 so eBay isn't the only source.

### 🔴 #2 — INAD chargebacks are a cost of doing business, not a bug

You cannot eliminate these. 3D Secure doesn't cover them. A determined bad actor with a
real card can receive a genuine watch, claim it's not as described, and take the money
back.

The correct response is not to prevent them absolutely — it's to (a) make the evidence
overwhelming so you win most, (b) keep the rate low enough that Stripe stays happy, and
(c) **price the residual into the margin**.

At a 1% dispute rate on $1,000 orders, that's $10/order of expected loss against $165 of
gross profit — about 6% of margin. Budget for it. If you're not losing *any*, you're
probably being too restrictive and turning away good customers.

### 🟠 #4 — Dead inventory is the quiet killer

Nobody's business dies from a dramatic chargeback. They die from $6,000 tied up in
eleven watches that won't move, with no cash to buy the good deal that showed up this
morning.

**This is exactly what you were describing** when you said the sales need to be tight and
not one every three months. You identified the real risk. The liquidity gate in
`packages/core/src/comps.ts` is the formal version: a model doesn't qualify unless it
sells often *and regularly* — enough observations, a short enough median gap between
sales, and no long droughts.

**Days-to-sell is the number to watch weekly.** A 5% margin realized in 20 days beats a
20% margin realized in 200.

---

## Kill criteria — decide these now, while it's abstract

Write these down while you're calm. Pre-committing to them is how you avoid the slow
bleed that kills most side businesses.

Stop and reassess if:

- **3 months after first sale**, fewer than 2 sales/month
- **Dispute rate hits 2 in a quarter** — stop selling, fix the process, then resume
- **Median days-to-sell exceeds 60** for two consecutive months
- **Realized margin is under 8%** for 10 consecutive units
- **Your time exceeds 25 hrs/month** without revenue above $1,500/month
- **You stop enjoying it** — this is a legitimate and sufficient reason

None of these means the idea was wrong. They mean the specific configuration isn't
working, and the right move is to change it or stop, not to grind.
