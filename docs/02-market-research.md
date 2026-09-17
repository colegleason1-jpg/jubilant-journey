# 02 — Market Research

## The market is much bigger and much more institutional than in 2022

| Metric | Figure |
|---|---|
| Global pre-owned luxury watch market | **~$32.3B (2025) → ~$35.7B (2026)**, forecast to ~$85B by 2033 (13.3% CAGR) |
| Dealer pre-owned sales, 2025 | **$15.65B, up 38.3% YoY** |
| Auction results, 2025 | $1.09B, +14% YoY |
| Top model H1 2026 | Rolex Daytona, $962M; Datejust $940M (+44%) |

The growth driver matters more than the size: the market is **institutionalizing**.
Certified pre-owned programs, better authentication standards, and price transparency
via WatchCharts/Chrono24 are all expanding. That's a double-edged finding for us:

- **Good:** buyers are far more comfortable buying pre-owned online than in 2022. The
  trust barrier you had to overcome personally is now partly carried by the category.
- **Bad:** price transparency compresses spreads. The "I know something you don't"
  arbitrage that worked on a 2022 iPad is thinner now at the high end.

**Conclusion: the spread has moved down-market.** Where a Daytona trades in a
liquid, fully-transparent, professionally-arbitraged market with 2–4% spreads, a
$900 Seiko or a $1,600 Longines trades in a sloppy one.

## Where the spread actually lives

Ranked by *exploitability for a solo operator*, not by glamour:

| Tier | Examples | Spread | Verdict |
|---|---|---|---|
| **Start here: $800–$2,500 enthusiast** | Seiko (Alpinist, SPB, Turtle), Hamilton, Tissot PRX/Gentleman, Longines Hydroconquest/Spirit, Oris Aquis/65, Christopher Ward, Certina, Sinn, Nomos entry, Tudor entry (used) | **12–25%** | **Target this.** Sloppy pricing, real demand, AG-eligible, survivable single-unit loss |
| Mid-lux $2,500–$6,000 | Omega Seamaster/Speedmaster, Tudor BB58, Grand Seiko, Breitling | 6–12% | Phase 3. Free AG. Higher absolute margin, much higher single-unit risk |
| High-lux $6,000+ | Rolex, AP, Patek | 2–5% | **Not year one** — but not never. 2% of $15,000 is $300, which is a fine trade *if* you settle by wire (card fees alone would be $435) and have the float. Revisit once you've done 50 clean orders |
| Micro / fashion <$500 | Seiko 5, Casio, Orient, Timex | 25–35% | **Viable, and a good testbed.** A $30 watch bought at $14 nets ~$10 in 8 minutes (~$78/hour) with postage charged to the buyer. No authentication, but a dispute costs $30. Good for learning the pipeline with near-zero risk |

> **There is no hard floor — the economics are fluid** (see
> [docs/12](12-buy-box-and-offers.md)). Money can be made at $30 and at $18,000; what
> changes is how far below market you must buy (~50% down low, ~90% up high), what
> margin percentage is worth taking, and which payment rail is viable. An earlier
> draft claimed a "$800 floor"; that was an artefact of applying one shipping cost
> and one margin floor to every price point, not a fact about the market.
>
> **$800–$2,500 is the recommended STARTING band** — not because other bands don't
> work, but because it's where deal flow, absolute margin and survivable risk overlap
> best for a solo operator with limited float. Expand outward once the process works.

### Why $800–$2,500 is the right place to start

1. **Authenticity Guarantee is reachable.** $2,000+ is free; $500–$1,999.99 the buyer
   can add for $80. Under $500 there is no authentication and therefore no INAD defense.
2. **Absolute margin clears the fixed costs.** ~$150–$350 gross per unit covers
   shipping, insurance, Stripe and a real return rate. A $40 margin does not.
3. **The buyer is a hobbyist, not an investor.** They read forums, they know what a
   fair price is, and they *will* buy from a small dealer with good photos and a return
   policy. Rolex buyers want a Bucherer receipt.
4. **Liquidity is good but attention is scarce.** A Longines Spirit sells maybe 40–80
   times a month across eBay. That's tight enough to price confidently, thin enough
   that the big dealers don't bother.

## Who we are actually competing with

| Competitor | Their edge | Our opening |
|---|---|---|
| **Chrono24** (6.5% private / 9–12% pro + ~€199/mo) | Universal inventory, escrow, trust | Their fee structure means dealer prices carry 9–12%+ baked in. We undercut on total price. Also: **list on them as a channel later** |
| **eBay sellers themselves** | Direct, no middleman | Buyers distrust eBay condition descriptions. We inspect, re-photograph, and stand behind it |
| **Bob's Watches / WatchBox / Hodinkee Shop** | Capital, brand, authentication | They ignore sub-$2,500. Entire segment underserved |
| **r/Watchexchange private sellers** | No fees, lowest prices | Zero buyer protection, requires trust in a stranger. We are the "I'd rather pay $80 more and not get scammed" option |
| **Other arbitrage resellers** | Same play | Most are manual, most have no comp discipline, most chase Rolex. Our liquidity gating is the differentiator |

## Our actual positioning

Not "cheapest watches." That's a losing race and it attracts fraud.

> **"Inspected, authenticated, fairly priced — from someone who'll pick up the phone."**

The three things we sell that eBay doesn't:
1. **Curation** — we already rejected the 95% of listings that were overpriced or sketchy.
2. **Verification** — it went through an authenticator, we photographed it in hand, we logged the serial.
3. **Recourse** — a real return policy from a named business, not a stranger's PayPal.

Priced at **8–15% below the eBay sold median**, that's a genuinely good deal for the
buyer and a ~$150–350 margin for us. Both things can be true; that's why the business works.

## Demand research: what to actually track

Build the initial watchlist (~40 references) from these, in this order:

1. **r/Watchexchange `[WTB]` posts** — literal, stated, unmet demand. The single best signal.
2. **WatchCharts trending / most-viewed** — aggregate buyer attention.
3. **Forum "should I buy X" threads** — WatchUSeek, r/Watches, WatchCrunch. High thread
   volume on a reference = high consideration = it will sell.
4. **eBay Browse API active-listing counts over time** — a reference where active
   listings *drop* fast is one that clears fast.
5. **Terapeak sell-through rate** — eBay's own number, free, 90-day window. Gate at
   **>60% sell-through**.

The forum scraping here is read-only public discussion for demand signal. We never
post automatically. See [docs/01 §6](01-reality-check.md).

---

### Sources
- [Pre-owned Luxury Watches Market Size (Business Research Insights)](https://www.businessresearchinsights.com/market-reports/pre-owned-luxury-watches-market-121379)
- [How a $16.7B Secondary Market Is Reshaping Luxury Watches (EveryWatch)](https://everywatch.com/magazine/market/the-16-7b-market-reshaping-luxury-watches)
- [EveryWatch Report 2026 — most successful pre-owned models (Insight Luxury)](https://insight-luxury.com/en/2026/08/03/everywatch-report-2026-the-most-successful-luxury-watches-on-the-pre-owned-market/)
- [Pre-owned Luxury Watches Market Report (Grand View Research)](https://www.grandviewresearch.com/industry-analysis/pre-owned-luxury-watches-market-report)
- [Chrono24 fee structure (Vericog calculator)](https://vericog.io/tools/chrono24-fee-calculator)
- [Chrono24 Marketplace / dealer program](https://update.chrono24.com/marketplace/)
- [eBay Authenticity Guarantee for watches](https://pages.ebay.com/authenticity-guarantee-watches-seller/)
