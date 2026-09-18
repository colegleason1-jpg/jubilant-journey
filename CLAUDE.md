# Gleason Timepiece — working context

Read this before changing anything. It is the foundation the rest of the repo
assumes, and most of it was learned the expensive way.

## What the business is

Buy pre-owned watches below market, sell them slightly under market on our own
storefront, ship, bank the difference, reinvest all of it. Point A is an undervalued
watch; point B is money in the bank. Everything here is the vehicle between them.

**How the margin is actually made — the sequence matters.** We list at a slim expected
contribution. When a customer buys, we then source the unit and negotiate the seller
down. The deal already cleared the gates on the slim number, so the negotiation is
upside on a sale that was viable without it. This is why `orderflow.ts` authorizes
first and captures only on `PURCHASE_CONFIRMED` — the sequence is the business model,
not just a fraud control.

**Where the spread comes from:** not depreciation, and not our cleverness. Sub-$2,000
pre-owned watches are mostly sold by ordinary owners who don't know the market price,
don't research it, and aren't trying to extract the last dollar. Two identical
listings sit $200 apart because one seller looked it up and the other didn't. That
variance is the inventory. It collapses above ~$2,000, where sellers know what they
have. **Sub-$2,000 is the specialty, not the starter band.**

**Who the buyer is:** hobbyists, roughly $200–$2,000, who care about the movement they
can't see — automatics, hand-wounds, day-dates, moonphases. They are buying a movement
and a bracelet, not a logo, and on the merits they'll take a good $2,000 movement over
a Rolex. No batteries, no smart watches.

**The $2,300 ceiling is an edge limit, not a risk limit.** Above roughly $2,000 the
sellers are dealers and collectors who price correctly, so the dispersion that pays us
collapses — and that is exactly where the superclones are, so counterfeit exposure
rises at the same time. Both reasons point the same way. Do not reintroduce a
"Phase 3 mid-lux" band; it was removed deliberately, not deferred. The engine's UPPER
/ HIGH / ULTRA operational profiles in `tiers.ts` stay because they are correct and
tested, but nothing in the watchlist should reach them.

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
| Ranking watchlist references by how far they fall from retail | Would have dropped the best references — the PRX holds 94% of retail and is a *good* pick | Dispersion is variance WITHIN the used market, driven by seller sophistication. New→used is an axis we never transact on; capturing it would mean selling used as new |
| "For an order already placed on our site, buy at the ask immediately" | Deleted the primary margin source on every customer-triggered order | Wrong premise: transit is outside the auth window because capture fires at `PURCHASE_CONFIRMED`. One offer rung fits on every card brand with 66h+ to spare |

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
supabase/seeds/       watch_models.sql — the 29 references we scan for, capped at $2,300 (docs/18)
docs/                 00-18, read 00 then 01
```

## Commands

```bash
cd packages/core   && npm test                      # 193 tests, no install needed
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

**Shipping facts worth not re-deriving:** USPS dimensional weight only applies above
1 cu ft and our largest parcel is 480 cu in, so actual weight always bills. All four
parcel presets qualify for USPS **Cubic pricing**, which ignores weight under 20 lb
and prices on volume and zone alone — usually 20–40% cheaper on the heavier bands, so
quote both. Under a pound, Ground Advantage rounds up to 4/8/12/15.999 oz tiers.

Label automation is **deliberately not being built** — labels are bought by hand on
Pirate Ship with an existing label printer. `scout/shipping.py` exists and is tested
for the day volume justifies it, and is not on the critical path.

Then shadow mode — [docs/16](docs/16-shadow-mode-runbook.md).
