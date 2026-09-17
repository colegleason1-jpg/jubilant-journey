# Gleason Timepiece — Platform Plan & Engine

> "Our watches make every second count."

This repository holds the **full operating plan** and the **core decision engine** for
relaunching Gleason Timepiece as an automated pre-owned watch retail operation.

The business in one line: **find pre-owned watches listed below their true market
value, list them on our own storefront just under market, and only commit money once a
customer has already committed to buy.**

---

## Read the plan in this order

| # | Doc | What it answers |
|---|-----|-----------------|
| 00 | [Executive summary](docs/00-executive-summary.md) | The whole thing in 3 pages, incl. what changed since 2022 |
| 01 | [Reality check & constraints](docs/01-reality-check.md) | **Read this first if you read nothing else.** The 6 things that break the naive version of this plan |
| 02 | [Market research](docs/02-market-research.md) | Market size, where the spread actually lives, who we compete with |
| 03 | [Unit economics](docs/03-unit-economics.md) | Real per-watch P&L, the tax leak, volume needed per income target |
| 04 | [Sourcing & the data pipeline](docs/04-sourcing-and-scrapers.md) | How we get listings and comps legally, interval design, API budget math |
| 05 | [Commerce stack](docs/05-commerce-stack.md) | Shopify alternatives compared, and why we're not using any of them |
| 06 | [Payments, fraud & chargebacks](docs/06-payments-and-fraud.md) | The auth-and-capture design that removes your 2022 loss modes |
| 07 | [Marketing & demand](docs/07-marketing-and-demand.md) | Organic-first plan, forums, the Google Business Profile correction |
| 08 | [Operations runbook](docs/08-operations-runbook.md) | Daily/weekly loop, shipping, insurance, the evidence pack |
| 09 | [Roadmap & time estimates](docs/09-roadmap-and-estimates.md) | Phase-by-phase hours, calendar weeks, and what "best possible" costs |
| 10 | [Risk register](docs/10-risk-register.md) | Every way this loses money, ranked, with the control for each |

## What's code here

`packages/core` is the part worth building carefully — everything else is plumbing.

- `comps.ts` — turn a pile of observed sales into a defensible market price, and
  decide whether a model is **liquid enough to touch** (your "not one sale every
  3 months" rule, made into math)
- `pricing.ts` — landed-cost model and list-price solver
- `deal.ts` — the gates a candidate must pass before a human ever sees it
- `risk.ts` — order risk scoring for chargeback defense
- `orderflow.ts` — the order state machine that makes the eBay race condition unlosable

Run `npm install && npm test` in `packages/core`.

## Status

Planning + core engine scaffold. Nothing is live. No money at risk.
See [docs/09](docs/09-roadmap-and-estimates.md) for what to build in what order.
