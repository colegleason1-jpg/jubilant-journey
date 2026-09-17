# Gleason Timepiece — working context

Read this before changing anything. It is the foundation the rest of the repo
assumes, and most of it was learned the expensive way.

## What the business is

Buy pre-owned watches below market, sell them slightly under market on our own
storefront, ship, bank the difference, reinvest all of it. Point A is an undervalued
watch; point B is money in the bank. Everything here is the vehicle between them.

**We are in the business of making money, not inventing things.** Assemble from
existing parts wherever a part exists. See [docs/17](docs/17-foundation-and-stack.md)
for what is genuinely ours versus what is bought.

## Non-negotiables

1. **No scraping eBay, no automated buying.** eBay's User Agreement (Feb 2026) bans
   scrapers and "buy-for-me agents… any end-to-end flow that attempts to place orders
   without human review." The buying account IS the business. Use the Browse API; a
   human clicks buy. Also applies to Best Offers.
2. **Never capture payment before the source purchase is confirmed.** Exactly one
   transition in `orderflow.ts` emits `CAPTURE_PAYMENT`, enforced by a test that walks
   every state × event pair. This is what makes the eBay race condition unlosable.
3. **Gate on contribution, not margin percentage.** A $1 profit plus a new customer
   beats an idle hour — paid acquisition costs $156–782 at these price points. What is
   scarce is time and float, not margin.
4. **Per-unit claims must be true of that unit.** If a watch did not go through
   authentication, do not say it did. `provenanceStatement()` generates copy from
   facts so it cannot drift.
5. **Never reveal the acquisition model in customer copy.** `findSourcingDisclosures()`
   blocks it. Describe what we do TO the watch, never where it came from.

## Mistakes already made — do not repeat

| Mistake | What it cost | Correction |
|---|---|---|
| Flat 12% margin floor across all prices | Rejected a $2,600 deal at 84% of market that contributed $70 | Tiered costs, contribution floor |
| One shipping assumption ($32 insured Express) at every price | Invented a fake "$800 floor" — nothing under it looked viable | Cost curve over declared value |
| Charging the $80 authentication add-on as mandatory | ~9% of a $900 order, for something optional | Opt-in; Money Back Guarantee covers the purchase anyway |
| Crediting eBay Partner Network on our own purchases | $34.50 of a $38 contribution — it was carrying the deal | Defaults to zero, unverified |
| `min_source_price_usd` left at $500 after the AG rule was dropped | Silently filtered the entire cheap band | Lowered to $50 |
| Recommending Vercel Hobby | Non-commercial only; a storefront breaks the terms | Cloudflare Pages |

**The pattern:** every one was a number reasoned toward rather than measured. That is
what `--shadow` and `scout.calibrate` exist to prevent.

## Layout

```
packages/core/        the engine. Zero dependencies, runs on Node 22 natively.
  economics.ts        cost curve, contribution, capacity policy  ← the money maths
  comps.ts            market price + liquidity ("tight sales" rule)
  deal.ts             the gates a candidate must clear
  orderflow.ts        order state machine. The capture invariant lives here.
  tiers.ts            operational profiles: shipping service, handling, rails
  authentication.ts   the upsell, claim generation, copy guards
  photos.ts           which images may represent which watch
  platforms.ts        what each sourcing platform authenticates for free
services/scout/       Python scanner. Stdlib only — CI skips pip install.
supabase/migrations/  schema
docs/                 00-17, read 00 then 01
```

## Commands

```bash
cd packages/core   && npm test                      # 188 tests, no install needed
cd services/scout  && python -m unittest discover -s tests
cd services/scout  && python -m scout.main --replay  # full pipeline, no credentials
cd services/scout  && python -m scout.main --smoke   # verify eBay credentials
cd services/scout  && python -m scout.calibrate --demo
cd services/scout  && python -m scout.fit_shipping --demo   # curve vs real rates
```

## Conventions

- **Both engines must agree.** `services/scout/scout/economics.py` mirrors
  `packages/core/src/economics.ts`, and the Python tests assert the same worked
  examples. Change one, change both.
- **No runtime dependencies in `scout`.** GitHub Actions bills per whole minute;
  skipping `pip install` is worth 15–30s of a 60s budget.
- **Thresholds are config, never literals in logic.**
- **Record rejections as carefully as passes.** A gate set too tight leaves no trace
  except the deals it silently refused.

## Current state

Engine and scanner are built and tested. **Nothing has run against live data.** Every
threshold is still an untested guess.

**Phase 0 in progress** ([docs/17](docs/17-foundation-and-stack.md)): the shipping
curve is still fitted to USPS RETAIL rates and overstates cost on every unit. Fixing
it needs no account and no API — quote the bands on any rate calculator and run
`fit_shipping --quotes "30=6.10,300=12.40,…"`. Do this BEFORE shadow mode, or every
threshold gets calibrated against a cost that is wrong everywhere.

Label automation is **deliberately not being built** — labels are bought by hand on
Pirate Ship with an existing label printer. `scout/shipping.py` exists and is tested
for the day volume justifies it, and is not on the critical path.

Then shadow mode — [docs/16](docs/16-shadow-mode-runbook.md).
