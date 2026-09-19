# 18 — The Watchlist

`supabase/seeds/watch_models.sql` — 29 references, capped at $2,300 retail.

The scanner cannot look for watches in general. It searches for specific strings
against specific references, so this file is the aperture: **a deal that is not on
this list is invisible, no matter how good it is.** Nothing downstream can recover
from a reference that should have been here and isn't.

It is also the one part of the system that is pure judgement. The gates are arithmetic
and shadow mode grades them. The watchlist is a guess about where mispricing lives,
and the only thing that grades it is deal flow.

## Load it

```bash
psql "$SUPABASE_DB_URL" -f supabase/seeds/watch_models.sql
```

Idempotent — safe to re-run. `on conflict (id) do update` refreshes nickname, retail
price and queries, and deliberately does **not** touch `active`: deactivating a
reference is a decision made from data, and re-seeding must not silently undo it.

## Why these 36

The full rationale is in the header comment of the seed file, kept there so it is read
by whoever edits the list. In short, in order of weight:

1. **Counterfeit risk** — an exclusion filter: what we must not touch. Rolex alone is
   80%+ of fakes, and used-watch retailers now catch only ~20% of counterfeits because
   superclones outran visual inspection. Nobody bothers faking a $600 Hamilton, so the
   cheap end is safer on the merits, independent of margin.
2. **Seller sophistication** — the actual selection signal, and the one that finds
   money. Variance *within* the pre-owned market, not the new→used gap. Two identical
   listings priced $200 apart because one seller researched it and the other didn't.
   Highest under ~$2,000, where owners are ordinary people selling a watch they're done
   with; it collapses above that, where sellers know what they have.
3. **Movement** — mechanical or automatic. Quartz is excluded in the $200–$2,000 band;
   allowed below it (different buyer, acquisition play) and above it only where the
   movement is the collectible.
4. **New-old-stock ceiling** — can a buyer get it new, with a warranty, for less than
   we'd list it used? Then there is no trade at any buy price. Four of the first
   backfill candidates died here. It also biases comps upward wherever new stock
   dominates the active listings. **No gate currently catches this.**
5. **Liquidity** — a real second-hand market, not occasional collector trades. Not to
   be confused with obscurity: "Americans don't know this brand" is a trap, argued for
   both Mido and Certina. Thin distribution means few casual owners, so the naive
   seller pool criterion 2 needs is thin too.
6. **Search demand** — converts on the storefront and earns organic traffic.

**Low depreciation is good, not bad.** It means a stable, well-known anchor price,
which makes the comp trustworthy and an underpriced listing obvious. The Tissot PRX
holding ~94% of retail is a feature.

Excluded on purpose: Rolex, AP, Patek (thin spreads, ruinous single-unit downside,
most of the fake market) and the Seiko SKX007/009 (liquid, but among the most faked
affordable divers). The Citizen Promaster was dropped under criterion 3 — solar quartz
at $350 sits in the band where the movement argument bites hardest.

### Retail price is not the operational tier

`retail_price_usd` is a reference anchor for the comp engine. The operational
profile — shipping service, handling time, permitted payment rails — comes from
`operationalProfile(orderValueUsd)` in `tiers.ts`, resolved per unit from what we
actually list it at.

The two diverge, always downward. Grouped by retail, 9 of the 36 sit in the $2,500+
band; at an indicative 55% of retail only 3 would actually list into the `UPPER`
profile, and 11 into `CORE`. So a high retail figure is not a reason to hold a
reference back — that gate is on order value and `tiers.ts` applies it on its own.

## This list is a hypothesis

Expect to drop roughly a third. That is the designed outcome, not a failure: the list
was assembled from general market knowledge rather than measurement, which is exactly
the mistake pattern CLAUDE.md warns about — *every one was a number reasoned toward
rather than measured*. The difference here is that the error is cheap and shadow mode
is already pointed at it.

Three weeks of shadow mode produces enough `shadow_decisions` rows to replace judgement
with counting. Review then, and monthly after.

## Maintenance

Run these against the shadow tables. Each answers one question, and each has a
different fix — the failure modes look identical from the outside (a reference that
never produces a deal) and have opposite corrections.

### 1. Silent references — never appeared at all

```sql
select m.id, m.brand, m.nickname, m.ebay_queries
from watch_models m
left join shadow_decisions d on d.model_id = m.id
where m.active
group by m.id, m.brand, m.nickname, m.ebay_queries
having count(d.id) = 0;
```

Zero decisions means the scanner never matched a listing. **Check the query strings
before dropping the reference** — a typo'd or over-specific `ebay_queries` entry looks
exactly like a dead market. Search the strings on eBay by hand. If listings exist and
the scanner saw none, the bug is in the query, not the choice of watch.

Only after the strings are confirmed good is a silent reference genuinely supply-dead,
and worth `active = false`.

### 2. No dispersion — appears, never close

```sql
select m.brand, m.nickname,
       count(*)                                  as seen,
       round(avg(d.discount_to_market_pct) * 100, 1) as avg_disc_pct,
       round(max(d.discount_to_market_pct) * 100, 1) as best_disc_pct
from shadow_decisions d
join watch_models m on m.id = d.model_id
where not d.passed
group by m.brand, m.nickname
having count(*) >= 10
order by best_disc_pct;
```

Plenty of listings, and the best one still isn't close. `discount_to_market_pct` is
measured against the *used* market, so this is criterion 2 failing in production: every
seller of this reference prices it correctly. Note what this is **not** — it is not
about depreciation from retail. A reference that barely depreciates can still have
sellers scattered ±25% around the used price, which is the ideal case.

An efficient used market is the honest drop: supply is real, the sellers are just all
informed. Set `active = false`.

### 3. Comps too weak to trade on

```sql
select m.brand, m.nickname,
       count(*)                           as decisions,
       round(avg(d.comp_confidence), 3)   as avg_confidence,
       round(avg(d.comp_sample_size), 1)  as avg_sample,
       count(*) filter (where d.liquidity_qualified) as liquid
from shadow_decisions d
join watch_models m on m.id = d.model_id
group by m.brand, m.nickname
having avg(d.comp_sample_size) < 5 or avg(d.comp_confidence) < 0.5
order by avg_confidence;
```

The market estimate is a guess wearing a number. Do not tune gates against this and do
not buy against it — per docs/16, comp accuracy comes first or every gate downstream is
fitted to a fiction. Either find more comp sources for the reference or drop it.

### 4. Money left behind, by reference

```sql
-- Mirrors score_gates() in scout/shadow.py: value the rejected unit at the price it
-- actually sold for, less the 10% we list under market. Deliberately NOT
-- projected_contribution_usd — that is derived from the comp estimate, which is the
-- thing under test, so summing it would grade the estimate against itself.
select m.brand, m.nickname,
       count(*) as profitable_rejects,
       round(sum(o.sold_price_usd * 0.90 - d.landed_source_usd), 2) as left_behind_usd,
       mode() within group (order by g) as usual_gate
from shadow_decisions d
join watch_models m on m.id = d.model_id
join shadow_outcomes o on o.ebay_item_id = d.ebay_item_id
cross join lateral unnest(d.gates_failed) as g
where not d.passed
  and o.sold
  and o.sold_price_usd is not null
  and o.sold_price_usd * 0.90 - d.landed_source_usd >= 1.00   -- min contribution floor
group by m.brand, m.nickname
order by left_behind_usd desc nulls last;
```

`left_behind_usd` is gross of shipping, fees and packaging — same simplification the
engine makes — so treat it as a ranking signal, not a P&L line.

This one is a **gate** problem, not a watchlist problem, and it is the reason to check
before dropping anything. A reference with many profitable rejections is not a bad
reference — it is a good reference behind a threshold set too tight. `usual_gate` names
the threshold to loosen. Dropping it would delete the evidence and the deal flow.

If you change the 0.90 or the $1.00 floor here, change them in `score_gates()` too.
Two graders that disagree is worse than one that is slightly wrong.

### 5. Keep the winners honest

```sql
select m.brand, m.nickname,
       count(*) filter (where d.passed)             as passes,
       count(o.ebay_item_id) filter (where o.sold)  as sold,
       round(avg(o.days_to_sell), 1)                as avg_days,
       round(sum(d.projected_contribution_usd) filter (where d.passed), 2) as projected_usd
from shadow_decisions d
join watch_models m on m.id = d.model_id
left join shadow_outcomes o on o.ebay_item_id = d.ebay_item_id
group by m.brand, m.nickname
having count(*) filter (where d.passed) > 0
order by projected_usd desc nulls last;
```

A reference that passes often but sells slowly is working capital sitting still — which
is the scarce resource, per non-negotiable 3. High `avg_days` is a reason to demand more
contribution from that reference, not to keep buying it because the gate says yes.

## A note on researching candidates

A multi-agent research pass was run to backfill this list after the $2,300 cap. It
proposed 60 candidates and returned 14 recommendations. **Only 3 of those 14 had
actually been verified.**

The cause is worth recording, because the same trap is waiting for the next person who
tries it. The proposing agents consumed the entire session web-search budget (200
calls) before the verification stage began, so ~57 verifiers ran with no research
capability at all and rejected their candidates with reasons like *"REJECT ON PROCESS,
NOT ON MERITS"* and *"BLOCKED, NOT DISPROVEN."* Those are not findings. Then the
selection step had been told to "select 12–16" from a pool that had shrunk to 3, so it
made up the difference from its own recall — and reported that honestly, in a prose
field several hundred words long that was easy to skim past while the structured
`selected` array looked authoritative.

Two lessons, both cheap to apply:

1. **Never let a quota outlive its pool.** Ask for "up to N of these, fewer if fewer
   qualify," never a fixed count.
2. **Budget the verification stage first.** Verification is the stage that must not be
   skipped, so it should be the stage that gets the research budget. A proposal is
   worthless without it — and worse than worthless, because it arrives looking like a
   result.

A re-run that spent its whole budget on verification is the correct shape. Anything a
research pass proposes stays out of this file until a reference number has been
confirmed against a real source, because a wrong reference number is not a visible
error: it produces a search string that silently matches nothing, and three weeks later
it is indistinguishable from a dead market (see maintenance query 1).

That re-run confirmed 3 of 11 reference numbers and found that **all eleven inclusion
arguments were wrong** — including all three whose references checked out. None were
added. A real reference with a disproven argument is not a reason to scan for it, and
the two failure patterns it exposed (criteria 4 and 5 above) are worth more than the
references would have been. Full record in
[`supabase/seeds/CANDIDATES-EVALUATED.md`](../supabase/seeds/CANDIDATES-EVALUATED.md).

## Adding a reference

Add to the seed file, in the retail band where it belongs, keeping rows in ascending
price order. Then:

- `id` — `brand-model-variant`, lowercase and hyphenated. Stable forever; it is the FK
  target for every comp snapshot and shadow decision, so renaming one orphans history.
- `ebay_queries` — two to three strings, how a *seller* would title it, not how a
  collector would say it. Include the bare reference number; that is the highest-signal
  token in a listing title. One over-specific string that matches nothing is the most
  common way a reference goes silently dead (see query 1).
- Check dispersion **before** adding, not after. If retail and pre-owned prices are
  within ~15% of each other, there is no spread and the reference will only ever
  produce query-1 and query-2 noise.
- Watch the API budget: the Browse API allows ~5,000 calls/day and cost scales with
  total query strings, not references. 29 references × 45 strings is comfortable; a few
  hundred would not be.

## Deactivating, not deleting

```sql
update watch_models set active = false where id = 'tissot-prx-auto';
```

Never `delete`. `comp_snapshots` is described in `0001_init.sql` as the one asset that
compounds and cannot be bought, and every snapshot is FK'd to a model id. Deactivating
stops the sourcing and keeps the history — including the evidence for why it was
dropped, so the same reference does not get re-added a year later on the same hunch
that put it here.
