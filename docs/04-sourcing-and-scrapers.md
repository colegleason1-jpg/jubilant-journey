# 04 — Sourcing & The Data Pipeline

Four jobs, all on intervals, none running 24/7. Total compute cost: functionally zero.

```
                ┌──────────────────────────────────────────────────────┐
                │                 WATCHLIST (~40 refs)                 │
                │   curated by you, informed by demand signal below    │
                └───────────────────────┬──────────────────────────────┘
                                        │
   ┌────────────────┬───────────────────┼────────────────────┬─────────────────────┐
   │                │                   │                    │                     │
┌──▼───────────┐ ┌──▼──────────────┐ ┌──▼───────────────┐ ┌──▼──────────────┐ ┌────▼────────┐
│ J1 DISCOVERY │ │ J2 COMP REFRESH │ │ J3 DELIST WATCH  │ │ J4 DEMAND SIGNAL│ │ (manual)    │
│ eBay Browse  │ │ WatchCharts API │ │ eBay Browse      │ │ Reddit/forums   │ │ Terapeak    │
│ every 30 min │ │ nightly         │ │ 10 or 60 min     │ │ 6 hours         │ │ weekly, you │
│ business hrs │ │                 │ │ tiered           │ │ read-only       │ │             │
└──────┬───────┘ └────────┬────────┘ └────────┬─────────┘ └────────┬────────┘ └─────┬───────┘
       │                  │                   │                    │                │
       └──────────────────┴─────────┬─────────┴────────────────────┴────────────────┘
                                    │
                       ┌────────────▼─────────────┐
                       │   Postgres (Supabase)    │
                       │  candidates · comps ·    │
                       │  inventory · orders      │
                       └────────────┬─────────────┘
                                    │
                       ┌────────────▼─────────────┐
                       │     DEAL ENGINE          │
                       │ comps → liquidity gate → │
                       │ landed cost → score      │
                       └────────────┬─────────────┘
                                    │
                       ┌────────────▼─────────────┐
                       │  DAILY DIGEST → you      │
                       │  you click BUY on eBay   │  ← the only manual step
                       └──────────────────────────┘
```

---

## J1 — Discovery (eBay Browse API)

**Interval:** every 30 minutes, 07:00–23:00 local. **Not overnight** — listings posted
at 3am are still there at 7am, and the good ones aren't found by other humans overnight
either. 32 runs/day.

**Endpoint:** `GET /buy/browse/v1/item_summary/search`

Per watchlist reference, one query with server-side filters that eliminate 90% of junk
before it costs us anything:

```
q=<reference query>
category_ids=31387                         # Wristwatches
filter=
  price:[500..3500],
  priceCurrency:USD,
  buyingOptions:{FIXED_PRICE|BEST_OFFER},
  conditions:{USED|NEW_OTHER|NEW},
  itemLocationCountry:US,
  deliveryCountry:US,
  returnsAccepted:true                     # hard gate — see below
sort=price
limit=200
```

**`returnsAccepted:true` is a hard gate.** If the eBay seller doesn't accept returns,
our only recourse on a bad watch is an eBay money-back-guarantee claim, which is slow
and adversarial. A seller who accepts returns is our insurance policy. Skip the rest.

**Call budget:** 40 references, batched — realistically ~15 calls per run (multiple
references share queries), 32 runs/day = **~480 calls/day**.

### Seller quality gates (applied locally, free)

| Gate | Threshold | Why |
|---|---|---|
| Feedback score | ≥ 50 | Below this, no track record |
| Positive feedback % | ≥ 98.5% | Standard industry floor |
| Account age | ≥ 12 months | Burner accounts |
| Returns accepted | required | our recourse |
| Ships from | US | customs, transit time, recourse |
| Title keyword blocklist | `homage, replica, rep, aftermarket, franken, for parts, not working, as-is, custom dial, mod, project` | the fastest fraud filter in existence |
| Stock-photo detection | image perceptual hash vs. brand press images | a listing using the manufacturer's press photo for a "used" watch is a scam ~90% of the time |

## J2 — Comp refresh (WatchCharts API)

**Interval:** nightly, once, ~02:00. 40 references = 40 calls. Data credits are metered,
so this is the budgeted line item.

We store a **comp snapshot per reference per day** — this builds a proprietary time
series from day one. In 12 months you have a year of daily market data on your niche
that nobody else has organized this way.

**Level 1** endpoints (watch lookup, current market price, limited history) are enough
to start. **Level 2** (retail prices, appraisals, historical listings) is the upgrade
once volume justifies it.

⚠️ **Licensing:** WatchCharts charges a **50% surcharge for distribution with
attribution, 100% for white-label.** Internal-use pricing only covers internal use.
If you want to show "market price: $1,150 — source: WatchCharts" on a product page,
that's a distribution license. **Check this before you put comp data on the storefront.**
Internally, for deciding what to buy, internal-use is correct and cheaper.

## J3 — Delist watcher (the one that protects money)

**This is the job that solves your stated problem.** Every live listing on our store
whose source eBay item is still unsold gets polled. The moment the source listing ends,
we pull ours down.

**Endpoint:** `GET /buy/browse/v1/item/{item_id}` — returns real-time availability.

**Tiered intervals** — not everything deserves the same attention:

| Tier | Criteria | Interval | Calls/day/item |
|---|---|---:|---:|
| **Hot** | discount to median > 25%, or listed < 48h, or has an open order | 10 min | 144 |
| **Warm** | discount 15–25% | 30 min | 48 |
| **Cold** | discount < 15%, listed > 14 days | 2 hours | 12 |

### Call budget math (the free tier is 5,000/day)

| Load | Hot | Warm | Cold | J3 calls/day | + J1 (480) | Headroom |
|---|---:|---:|---:|---:|---:|---|
| Starting (20 live) | 4 | 8 | 8 | 1,056 | 1,536 | ✅ 69% free |
| Target (50 live) | 8 | 20 | 22 | 2,376 | 2,856 | ✅ 43% free |
| Stretch (80 live) | 12 | 32 | 36 | 3,696 | 4,176 | ⚠️ 17% free |

**Above ~80 concurrent listings, request a limit increase** via eBay's Application
Growth Check. It's a form, not a negotiation, and approval is routine for a real
application. Do it at 60 listings, not at 80.

### Response to a delist event

1. Set inventory `status = SOURCE_GONE`, storefront listing hidden within seconds.
2. If there is an **open uncaptured order** on it → alert immediately, **void the
   authorization**, send the customer the apology + alternatives email. Customer is
   never charged. This is the scenario you lost money on in 2022 and it now costs $0.
3. If already captured and bought → nothing to do, we own the watch.

## J4 — Demand signal (read-only)

**Interval:** every 6 hours. Public, read-only, no posting, respects `robots.txt` and
rate limits.

| Source | Access | What we extract |
|---|---|---|
| r/Watchexchange, r/Watches | **Official Reddit API** (free tier, OAuth, 100 req/min) | `[WTB]` reference frequency, asking prices in `[WTS]` posts, sold-flair conversions |
| WatchCrunch, WatchUSeek public threads | polite HTTP, 1 req/5s, cached, identified UA | thread volume per reference = consideration volume |
| Google Trends | `pytrends` / official | search interest trend per reference |

Feeds the **watchlist score**, which tells you which 40 references to track next month.

> **Use the official Reddit API, not scraping.** It's free at our volume and it keeps
> the account that you'll later need for r/Watchexchange reputation clean. Never risk
> the reputation asset for data you can get legitimately.

## What we deliberately do not do

| Not doing | Why |
|---|---|
| Scrape eBay HTML | UA violation since Feb 2026, and the buying account is the business |
| Auto-purchase on eBay | Same clause, explicitly names "buy-for-me agents" |
| Scrape eBay sold listings | Behind a login wall since Aug 2026; scraping it = logged-in ToS violation with your account attached |
| Residential proxies / anti-bot evasion | If the plan requires evading detection, the plan is wrong |
| Post to forums automatically | Instant ban, and reputation is the asset |
| Run 24/7 | No edge gained, more API budget consumed, more ways to break |

## Alternate sourcing venues (phase 2+)

Once the eBay pipeline is proven, the same engine points at:

| Venue | API/feed | Notes |
|---|---|---|
| **Chrono24** | XML/JSON private feed for dealers, imported every 12–24h | Primarily a **sales** channel for us (6.5% private / 9–12% pro + ~€199/mo package). Sourcing there is harder — prices already efficient |
| **r/Watchexchange** | Reddit API | Best *prices*, highest risk. Manual only, and only once you have flair |
| Mercari / OfferUp | limited | Mispriced inventory, but mostly sub-$500 and no authentication |
| Local estate sales / pawn | none | Highest margins in the business, zero automation, real time cost |

---

### Sources
- [eBay Browse API documentation](https://developer.ebay.com/api-docs/buy/static/api-browse.html)
- [eBay API call limits & Application Growth Check](https://developer.ebay.com/develop/get-started/api-call-limits)
- [eBay Partner Network + Buy APIs](https://partnernetwork.ebay.com/solutions/meet-the-buy-apis-let-your-visitors-shop-purchase-and-track-orders-without-ever-leaving-your-site)
- [WatchCharts API — getting started](https://watchcharts.com/api)
- [WatchCharts API — license types & distribution surcharges](https://watchcharts.com/api/license)
- [Chrono24 listing import / feed guide](https://update.chrono24.com/listing-import-guide/)
- [Chrono24 partners & dealer program](https://about.chrono24.com/en/partners)
- [eBay anti-scraping & agent policy (ValueAddedResource)](https://www.valueaddedresource.net/ebay-bans-ai-agents-updates-arbitration-user-agreement-feb-2026/)
