# scout

Scheduled eBay deal scanner. Runs on GitHub Actions free tier, reads/writes Supabase
free tier, emails you when a listing clears every gate.

**It finds and prices deals. It never buys them.** See [why](#why-the-api-and-not-beautifulsoup).

```bash
cd services/scout
python -m unittest discover -s tests -v     # 25 tests, no dependencies
SCOUT_DRY_RUN=1 python -m scout.main        # scan and print, write nothing
```

## Runtime budget

GitHub Actions rounds every job **up to a whole minute**. A 61-second run costs
exactly double a 59-second one, so "under a minute" isn't a nice-to-have — it's the
difference between ~1,020 and ~2,040 minutes a month against a 2,000-minute free
allowance.

Three decisions come from that:

| Decision | Saving |
|---|---|
| **Zero runtime dependencies** — stdlib `urllib`, no `requests`, no `supabase-py`. The workflow has no `pip install` step at all. | 15–30s |
| **Parallel queries** via `ThreadPoolExecutor` | ~10s |
| **Batched writes** — two Supabase round trips per run, not two per candidate | ~5s |
| **Cached eBay OAuth token** in `service_state` (valid ~2h) | ~0.3s/run |

`SCOUT_DEADLINE_SECONDS` (default 45) is enforced, not aspirational: when the clock
runs out the scan returns what it has and exits cleanly. A partial scan is fine — the
next one is 30 minutes away.

BeautifulSoup is the *only* dependency in `requirements.txt`, it's imported lazily,
and the scheduled job never installs it.

## Why the API and not BeautifulSoup

You asked for a BeautifulSoup scraper. For eBay specifically, that's the one
substitution I made, and it isn't a style preference:

- eBay's `robots.txt` (December 2025) blocks scrapers by name, Anthropic included.
- eBay's User Agreement, **effective 2026-02-20**, prohibits "any robot, spider,
  scraper, data mining tools... (including buy-for-me agents, LLM-driven bots, or any
  end-to-end flow that attempts to place orders without human review)."

The buying account *is* the business — no account, no pipeline, no inventory, no
Authenticity Guarantee. The Browse API is free (~5,000 calls/day), returns real-time
price and availability as structured JSON, is faster than parsing HTML, and is built
for exactly this. There's no upside to scraping and the downside is the company.

**BeautifulSoup is still here** — `scout/scrape.py` is a real, working adapter for
sources whose terms permit automated access (forum WTB boards, dealer feed pages, our
own storefront). It enforces two rules in code rather than in a comment:

```python
assert_permitted("https://www.ebay.com/itm/123")
# ScrapeNotPermitted: www.ebay.com is on the scrape denylist.
#                     Use the official API. See docs/01.
```

1. A **domain denylist** that eBay cannot be talked out of.
2. A **robots.txt check** that fails closed if robots.txt can't be read.

## What a run does

```
1. Read watchlist + latest market price per model + seen item IDs   (3 requests)
2. Search eBay Browse API, one query per watchlist entry, in parallel
3. Gate every result:  price band · authentication eligible · discount to market ·
                       margin · seller quality · title blocklist · too-good-to-be-true
4. Build the offer ladder for listings that accept Best Offer
5. Upsert every candidate (pass or fail — rejections are training data)  (1 request)
6. Email ONLY the deals that are new AND passed                          (1 request)
```

Rejections are stored deliberately. After a few months, "what did we reject and what
did it sell for" is how the thresholds get tuned from evidence instead of instinct.

## The gates

| Gate | Default | Why |
|---|---|---|
| `PRICE_BAND` | $500–$3,500 **landed** | Below $500 there's no Authenticity Guarantee |
| `AUTHENTICATION_ELIGIBLE` | landed ≥ $500 | Our whole INAD defence |
| `DISCOUNT_TO_MARKET` | ≥ 18% | Below this the margin doesn't survive fixed costs |
| `MARGIN` | ≥ 12% | The floor |
| `SELLER_QUALITY` | 50+ feedback, 98.5%+, US | Track record |
| `TITLE_BLOCKLIST` | `homage`, `replica`, `parts`… | Whole-word match, so "model" and "reputable" are safe |
| `TOO_GOOD_TO_BE_TRUE` | > 45% under market | A 50% discount is a warning, not a win |

Every threshold is an environment variable. Tune them from shadow-mode data, not
intuition.

## Landed price, not sticker price

Your spec said *"no more than $95 **after shipping**"* — so every gate and every
margin projection uses `price_usd + shipping_usd`:

```python
Listing(price_usd=750, shipping_usd=60).landed_source_usd   # 810.00
```

A $750 watch with $60 shipping fails `MARGIN` where a $750 watch with free shipping
passes. There's a test for exactly that.

## Configuration

All via environment (GitHub Actions secrets/vars). See `.env.example` at the repo
root. Required: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. Email needs `RESEND_API_KEY` + `ALERT_TO_EMAIL`.

## Parity with the TypeScript engine

`scout/pricing.py` is a port of `packages/core/src/pricing.ts` and `offers.ts`.
`tests/test_scout.py` asserts the **same worked examples** as the TypeScript suite —
`project_margin(720, 1035) → $166.42`, `max_viable_source_price(1035) → $762.86` — so
the two can't drift apart without a test going red.
