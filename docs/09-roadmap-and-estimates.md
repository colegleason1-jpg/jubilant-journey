# 09 — Roadmap & Time Estimates

You asked how long this takes to do at its absolute best capabilities. Here it is, phase
by phase, in hours.

**Two columns throughout:**
- **Solo P/T** — you, ~10 hrs/week, evenings and weekends
- **Focused** — you, full-time on it

Hours assume you're technical enough to work with an AI coding assistant productively,
which you said you are. Halve nothing; these are already optimistic-realistic.

---

## Summary

| Milestone | Hours | Solo P/T | Focused |
|---|---:|---|---|
| **M1 — Legal & accounts ready** | 12 | Week 1 | Day 2 |
| **M2 — Data spine running in shadow mode** | 34 | Week 4 | Day 6 |
| **M3 — Deal engine validated on real data** | 28 | Week 7 | Day 10 |
| **M4 — Storefront + payments live** | 56 | Week 12 | Day 18 |
| **M5 — 🎯 FIRST REAL SALE** | 22 | **Week 14** | **Day 22** |
| **M6 — Fraud & ops hardened** | 26 | Week 17 | Day 26 |
| **M7 — Demand channels producing** | 55 | Week 24 | Day 45 |
| **M8 — Scaled & largely hands-off** | 48 | Week 34 | Day 60 |
| **Total to "absolute best"** | **~281 hrs** | **~8 months** | **~9 weeks** |

**Two numbers that matter more than the total:**

- 🎯 **First real sale: ~152 hours / week 14 part-time.** That's the number to plan
  around. Everything after M5 is optimization on a working business.
- 💡 **A deliberately ugly version can take a first order in ~35 hours** (week 4). See
  "The 35-hour shortcut" at the bottom. **Seriously consider this.**

---

## M1 — Legal & accounts (12 hrs · Week 1 · Day 2)

| Task | Hrs |
|---|---:|
| LLC filing + EIN | 2 |
| Business bank + credit card application | 1 |
| ⭐ **State resale certificate + eBay buyer tax exemption** | 3 |
| eBay buying account audit (age it / build feedback if new) | 1 |
| eBay Developer account + production keyset | 1 |
| Stripe account (described as pre-owned watch **retail**) | 1 |
| Domain, Google Workspace, business phone | 1 |
| CPA consult (1 hr) | 1 |
| Reddit account created ← **starts the 30-day clock, do it day 1** | 0.25 |
| Insurance quotes | 1 |

**Exit:** you can legally buy tax-free for resale and accept a card payment.

**Do not skip the resale certificate to "move faster."** It is worth more than the next
100 hours of code. See [docs/03](03-unit-economics.md).

## M2 — Data spine, shadow mode (34 hrs · Week 4 · Day 6)

| Task | Hrs |
|---|---:|
| Supabase project + schema (DDL is already written in this repo) | 3 |
| eBay OAuth client + token refresh + rate-limit accounting | 6 |
| J1 discovery job: search, filter, normalize, dedupe, persist | 8 |
| Watchlist v1: 40 references chosen from demand research | 4 |
| WatchCharts API evaluation + integration (J2) | 6 |
| Terapeak manual baseline for all 40 references | 3 |
| Telegram alert bot | 2 |
| Deploy on cron, monitoring | 2 |

**Exit:** every morning, candidates land in a database. **Zero money at risk.**

> ⚠️ **Run shadow mode for a minimum of 3 weeks before spending a dollar.** Let the
> pipeline record what it *would* have bought, then check those items against what they
> actually sold for. This is the single highest-value thing in the plan and it costs
> nothing but patience. If the model is wrong, you find out for free instead of for
> $900.

## M3 — Deal engine validated (28 hrs · Week 7 · Day 10)

| Task | Hrs |
|---|---:|
| Comp engine: trimmed median, MAD outlier rejection, recency weighting | 6 |
| **Liquidity scoring** — your "tight sales, not one every 3 months" rule | 5 |
| Landed cost model + list price solver | 4 |
| Deal gates & scoring | 4 |
| Daily digest email/Telegram with one-click eBay links | 3 |
| **Backtest against 3 weeks of shadow data** | 6 |

Most of this code already exists in `packages/core` in this repo — these hours are
integration, tuning against your real data, and the backtest.

**Exit:** you trust the number the engine prints. If the backtest says your modeled
margin and realized market prices disagree by more than 15%, **stop and fix it here**.

## M4 — Storefront + payments (56 hrs · Week 12 · Day 18)

The big one.

| Task | Hrs |
|---|---:|
| Next.js scaffold, layout, design system | 8 |
| Product listing + detail pages (SEO-first, SSR, structured data) | 10 |
| Listing generator: candidate → live product page, auto-copy, photo pipeline | 8 |
| Stripe Checkout with `capture_method: 'manual'` | 6 |
| **Order state machine** (AUTHORIZED → SOURCING → SECURED → …) | 8 |
| **J3 delist watcher** + auto-void on source-gone | 6 |
| Admin: inventory, orders, approve/reject, capture/void buttons | 8 |
| Transactional email (Resend) | 2 |

**Exit:** a stranger can buy a watch and you can fulfill it.

## M5 — 🎯 First real sale (22 hrs · Week 14 · Day 22)

| Task | Hrs |
|---|---:|
| Terms of Sale, Returns, Privacy, shipping/handling disclosures | 4 |
| Photography setup (lightbox, macro lens, consistent backdrop) + SOP dry run | 5 |
| End-to-end test with a watch you already own | 4 |
| First 5 real listings | 3 |
| Shipping accounts, insurance bound, packaging supplies | 3 |
| Google Merchant Center feed live | 3 |

**Exit: money in the bank. Everything past here is optimization.**

## M6 — Fraud & ops hardened (26 hrs · Week 17 · Day 26)

| Task | Hrs |
|---|---:|
| Radar for Fraud Teams: full rule set from [docs/06](06-payments-and-fraud.md), tested | 6 |
| 3DS forced + block-if-no-liability-shift verified with test cards | 3 |
| Stripe Identity on first orders > $1,500 | 4 |
| Automated evidence pack assembly per order | 8 |
| Dispute response template + runbook | 2 |
| Alerting: uncaptured auth at T-24h, source-gone, risk-flagged order | 3 |

**Exit:** your 2022 loss modes are closed.

## M7 — Demand channels (55 hrs · Week 24 · Day 45)

Runs in parallel with everything from Week 1 — the hours are spread, not blocked.

| Task | Hrs |
|---|---:|
| 10 cornerstone SEO articles | 20 |
| 15 reference hub pages (auto-generated from comp data + hand-edited) | 10 |
| Meta catalog → IG/FB Shops | 4 |
| Instagram: 3 posts/week for 12 weeks | 12 |
| r/Watchexchange reputation building (genuine, manual) | 6 |
| Email capture + weekly "what we found" | 3 |

**Exit:** organic sessions trending up; you know which one channel to double down on.

## M8 — Scale & hands-off (48 hrs · Week 34 · Day 60)

| Task | Hrs |
|---|---:|
| eBay Application Growth Check (API limit increase) | 2 |
| Auto-generated listing copy + photo processing pipeline | 10 |
| Chrono24 as a second sales channel (XML feed) | 10 |
| Buy-back / trade-in flow | 8 |
| Analytics dashboard (the weekly numbers in [docs/08](08-operations-runbook.md)) | 6 |
| Watchlist auto-tuning from demand signal (J4) | 8 |
| Accounting automation | 4 |

**Exit:** ~14 hrs/month of your time, running at 10–20 sales/month.

---

## 💡 The 35-hour shortcut (strongly consider this)

The full build is the right destination and the wrong starting point. Here's how to
learn whether this business still works **before** spending 150 hours:

| Task | Hrs |
|---|---:|
| M1 legal & accounts (**don't skip the resale certificate**) | 12 |
| J1 discovery script → Google Sheet. No database, no web app. | 8 |
| 40-reference Terapeak comp baseline, by hand | 3 |
| Stripe **Payment Links** with manual capture, one per watch. No storefront. | 3 |
| A one-page Carrd/Framer site + a Linktree of Payment Links | 4 |
| List the same 5 watches on r/Watchexchange and eBay | 5 |

**~35 hours. Week 4. Real money, real customers, real data.**

What you learn that no amount of planning can tell you:
- Do your comps actually predict sale prices?
- Will anyone buy from a new unknown dealer, and at what discount?
- How often does the source listing really disappear?
- Do you still enjoy this?

Then build M2–M8 **on validated assumptions** instead of guesses. If the answer is
"nobody buys," you found out for 35 hours instead of 150.

**My recommendation: do the 35-hour version first.** The architecture in this repo isn't
wasted — it's what you build in month 2 once you know the shortcut worked.

---

## Realistic revenue ramp

Assumes ~$165 gross profit/unit, [docs/03](03-unit-economics.md) funnel, organic-only.

| Month | Units | Gross | Fixed | **Net** | Note |
|---:|---:|---:|---:|---:|---|
| 1–3 | 0 | $0 | −$150/mo | **−$450** | Building. Shadow mode. |
| 4 | 2 | $330 | −$150 | **+$180** | First sales. Painful and slow. |
| 5 | 3 | $495 | −$150 | **+$345** | ≈ your 2022 baseline, now automated |
| 6 | 4 | $660 | −$180 | **+$480** | SEO starts |
| 7–9 | 6/mo | $990 | −$200 | **+$790/mo** | Flair on r/WE, reputation compounds |
| 10–12 | 9/mo | $1,485 | −$250 | **+$1,235/mo** | Organic working, float is the constraint |
| **Year 2** | 15–20/mo | $2,475–3,300 | −$350 | **+$2,100–2,950/mo** | Assumes profit reinvested into float |

**Year 1 total net: roughly $6,000–8,000**, all reinvested.
**Exit rate: ~$1,200/month at ~14 hrs/month.**

That comfortably beats the 2022 business *and* takes a fraction of the time. It is not
life-changing money in year one. It is a real, compounding, largely automated asset that
throws off more each year and could be sold.

### The three things that would change these numbers most

1. **Float.** Every model above is capital-constrained, not demand-constrained. $15k of
   working capital roughly doubles the ramp.
2. **Moving up-market** to the $2,000–3,500 band once fraud controls are proven. Free
   Authenticity Guarantee and ~$400/unit margins. Same work per unit, 2.4× the profit.
3. **One SEO page that ranks.** Organic compounds; nothing else in this plan does.
