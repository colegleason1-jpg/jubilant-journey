# 16 — Shadow Mode Runbook

**Every number in the deal engine is currently a number I reasoned my way to.** The
18% discount gate, the liquidity rule, the $1 contribution floor, the 60-day drought
window, the comp half-life. None of it has touched a real sale.

Reasoning is also how the "$800 floor" and the flat margin gate got written, and both
were wrong in ways that would have cost real money. Shadow mode is how the numbers
stop being opinions.

## Run it right now, with nothing

```bash
cd services/scout
python -m scout.main --replay
```

No credentials, no network, no writes. It runs the whole pipeline — search, parse,
gate, price, rank — against recorded fixtures and prints every decision with the
reason:

```
screened 11 listings in 0.0s -> 5 passed, 6 rejected
  [PASS] Longines HydroConquest 41mm Automatic L3.781.4   landed $795.00  contrib $149.42
  [PASS] Seiko Alpinist SARB017 Discontinued Green        landed $413.00  contrib $103.34
  [----] Longines HydroConquest 41mm BLUE DIAL AUTOMATIC  landed $515.00  contrib $429.42
         rejected: TOO_GOOD_TO_BE_TRUE
  [----] Seiko Alpinist SPB121J1 Green Sunburst           landed $520.00  contrib $ -3.66
         rejected: DISCOUNT_TO_MARKET, MARGIN
```

> That replay already earned its keep: it exposed that `min_source_price_usd` still
> defaulted to **$500**, left over from the abandoned "only source AG-eligible
> watches" rule. It was silently filtering out the entire cheap band before the engine
> saw it. Two Seiko deals worth $103 and $86 of contribution were invisible.

## Setup, in order

| # | Step | Time |
|---|---|---|
| 1 | **Private** GitHub repo (public repos get their cron silently disabled after 60 days) | 5 min |
| 2 | Supabase project → run migrations `0001`, `0002`, `0003` | 20 min |
| 3 | eBay developer account → production keyset → Browse API | 30 min |
| 4 | Add repo secrets: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 10 min |
| 5 | **Verify credentials**: `python -m scout.main --smoke` | 2 min |
| 6 | Seed `watch_models` — `psql "$SUPABASE_DB_URL" -f supabase/seeds/watch_models.sql` (36 references, [docs/18](18-watchlist.md)) | 5 min |
| 7 | Seed one `comp_snapshots` row per model (Terapeak by hand is fine) | 2 hrs |
| 8 | Run the workflow manually, mode `shadow` | 5 min |
| 9 | **Leave it running for three weeks. Spend nothing.** | — |

Step 5 exists so a credential problem surfaces in two minutes rather than inside a
cron run at 3am:

```
OK   OAuth token acquired (1284 chars, expires in 7199s)
OK   Browse API returned 47 listings
     sample: Longines HydroConquest 41mm Automatic Blue Dial
             $812.00 + $0.00 shipping = $812.00 landed
             seller 1243 / 99.8%  GOOD  offers=True
```

## What gets recorded

**Every decision, pass and fail.** The rejections are the half people skip, and
they're the half that catches a gate set too tight — because a gate that's too tight
produces no error, no alert and no evidence. It just produces a quiet month that
looks like bad luck.

`shadow_decisions` stores what we believed the watch was worth, what we'd have listed
it at, what we'd have paid at most, the projected contribution, and which gates fired.

## Then grade it

Weekly, fill in `shadow_outcomes` for listings that have resolved — did it sell, for
how much, how fast. Then:

```bash
python -m scout.calibrate          # or --demo to see the report shape
```

```
COMP ACCURACY  — is our market estimate right?
  median abs error    : 9.5%
  median signed error : +9.5%
  -> comps are usable but loose. Systematic bias: we OVERvalue by 9.5%.

GATES  — are we passing the right things?
  passes profitable   : 6
  passes unprofitable : 0
  profitable rejects  : 5  ($225.00 left behind)
  blocked by          : {'DISCOUNT_TO_MARKET': 5}
  -> gates are TOO TIGHT — rejected 5 profitable listings worth $225.
```

### Reading it

**Comp accuracy first, always.** If the market estimate is wrong, every gate is tuned
against a fiction and no amount of gate adjustment fixes it.

| Median abs error | Meaning |
|---|---|
| ≤ 5% | Trustworthy. Tune gates against it. |
| 5–12% | Usable but loose. Widen the contribution floor to absorb the error. |
| > 12% | **Fix the comp engine first.** Nothing downstream is meaningful. |

A persistent **signed** error matters more than the absolute one — it means bias, not
noise, and bias is correctable. Overvaluing by 10% means you're systematically
overpaying by 10%.

**Then the gates.** Two failure modes, opposite fixes:

- **Too loose** — passes that would have lost money. Raise the contribution floor.
- **Too tight** — rejections that would have been profitable. The report names the
  gate responsible and totals the money left behind.

## Go-live criteria

Don't spend a dollar until all four hold:

- [ ] **≥ 30 resolved decisions.** Below that it's noise.
- [ ] **Comp median absolute error ≤ 12%**, and signed bias corrected if > 5%.
- [ ] **Gate precision ≥ 80%** — most passes would actually have made money.
- [ ] **You've re-tuned at least one threshold** from the data. If nothing moved,
      either you got lucky or the sample is too small.

Then flip the workflow to `live` and start with **one** purchase.

## Cost

$0. GitHub Actions free tier, Supabase free tier, eBay Browse API free tier. The only
thing being spent is three weeks of waiting — which is the cheapest thing in the plan
and the only one that can't be compressed.
