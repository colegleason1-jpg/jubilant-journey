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
| 11 | [Free-tier architecture](docs/11-free-tier-architecture.md) | $0/month stack, and the six gotchas that break it |
| 12 | [Buy box & offer ladder](docs/12-buy-box-and-offers.md) | **The fluid margin model.** What to pay at every price point, and why the payment rail decides the top end |
| 13 | [Fulfilment routing](docs/13-fulfilment-routing.md) | Direct-ship vs through you, and the $1,000 rule |
| 14 | [Authentication as a service](docs/14-authentication-as-a-service.md) | Selling the certificate as an upsell, photo provenance rules |
| 15 | [Platform matrix](docs/15-platform-matrix.md) | **What each sourcing platform authenticates for free** — Bezel, Poshmark, Chrono24 escrow, and why Facebook Marketplace ranks last |
| 16 | [Shadow mode runbook](docs/16-shadow-mode-runbook.md) | **Start here to actually run something.** Grade the model before spending money |
| 17 | [Foundation & stack](docs/17-foundation-and-stack.md) | **Buy vs build audit.** What is ours, what to assemble, every free tier, and the Shippo finding |
| 18 | [The watchlist](docs/18-watchlist.md) | The 36 references we scan for, why those, and how to drop the third that won't survive |

## What's code here

`packages/core` is the part worth building carefully — everything else is plumbing.

- `tiers.ts` — **the fluid cost/margin model**: per-band shipping, margin floors,
  handling time and permitted payment rails, from $30 padded envelopes to $40,000 wires
- `comps.ts` — turn a pile of observed sales into a defensible market price, and
  decide whether a model is **liquid enough to touch** (your "not one sale every
  3 months" rule, made into math)
- `pricing.ts` — landed-cost model and list-price solver
- `deal.ts` — the gates a candidate must pass before a human ever sees it
- `risk.ts` — order risk scoring for chargeback defense
- `offers.ts` — buy-box solving, the 10%→5%→ask offer ladder, fulfilment routing
- `orderflow.ts` — the order state machine that makes the eBay race condition unlosable

`cd packages/core && npm test` — 134 tests, **zero dependencies** (Node 22 runs the
TypeScript natively, so there is nothing to install or build).

`services/scout` is the Python scanner that runs on GitHub Actions free tier:

```bash
cd services/scout
python -m unittest discover -s tests    # 36 tests, no dependencies
SCOUT_DRY_RUN=1 python -m scout.main    # scan and print, write nothing
```

See [services/scout/README.md](services/scout/README.md) — including why it calls the
eBay Browse API rather than scraping, and where BeautifulSoup *is* used.

## Status

Planning docs + working engine + working scanner. Nothing is live. No money at risk.
See [docs/09](docs/09-roadmap-and-estimates.md) for what to build in what order.
