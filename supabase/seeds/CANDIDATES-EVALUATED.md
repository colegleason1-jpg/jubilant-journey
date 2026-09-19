# Evaluated watchlist candidates

Every reference proposed for the watchlist and rejected, with the reason. Kept so the
same candidate is not re-proposed on the same reasoning a year from now.

**None of these are in `watch_models.sql`.** Three had their reference numbers and
movements confirmed but were still held back — a real reference with a disproven
inclusion argument is not a reason to scan for it.

## Held: reference real, argument disproven

| Reference | Verified | Why held |
|---|---|---|
| Bulova **98B320** Oceanographer Devil Diver | ✅ Miyota 821D auto, $795 MSRP | Sold new at **$429** (Walmart) and **$238.79** on eBay promo. Used typical **$335**. New stock is the price-setter, so the exit is capped below our list. Would need to buy under ~$250. |
| Junghans **027/3501** Max Bill Automatic | ✅ J800.1 (ETA 2824-2), retail **$1,670** — proposer said $1,290 | The stem is incomplete: `.00` is plexiglass, `.02` sapphire, `.04` different again, and they carry materially different values. One `model_id` would pool three watches. Counterfeit risk **medium**, the highest of any candidate. |
| Marathon **WW194006** GSAR | ✅ Marathon M2 (Sellita SW200-1) | No used price data found at all. The quartz **TSAR** sibling is visually near-identical and its reference could **not** be confirmed — an unresolved intake hazard where the wrong buy is a quartz watch at automatic money. |

## Rejected: reference or argument failed

| Reference | Verdict |
|---|---|
| Citizen **NJ0150-56A** Tsuyosa | Retail is **$475**, not $375. Argument was "fashion/gift piece bought by non-enthusiasts" — it is the opposite: one of the most enthusiast-driven affordable releases going, benchmarked against the PRX everywhere. Its sellers are unusually *likely* to have looked up the price. |
| Orient **FAA02004B9** Ray II | Reference real, F6922 auto, strong liquidity. But "discontinued" is **false** — new at **$209.99** (Walmart) and $290 (Orient USA) against a $465 MSRP that is permanent promo theatre. The grey channel is the dominant price-setter. |
| Tissot **T109.407** Everytime Swissmatic | "The only Swiss automatic under $400" is false — the Swatch Sistem51 sits at $100–300, and the Swissmatic calibre derives from it. Also sold at volume through Amazon, Walmart and grey discounters, so the naive-jeweller-customer seller pool the argument needs does not exist. |
| Timex **TW2T80700** M79 | Reference **not confirmed**. Thin liquidity. The claimed "automatic resells for double the quartz" is 1.6× at retail, and used the two compress into the same $100–180 band. Chronically dumped **new** at $109–166, below plausible used prices. |
| Laco **861690** Augsburg 39 | Reference **not confirmed**. The mechanism is the wrong shape: owners anchoring to a half-remembered discount shifts the whole ask distribution *down uniformly*. That is a level effect, not variance — and variance is what we sell. |
| Mido **M005.430** Multifort | Reference **not confirmed**, thin liquidity. See *low brand recognition* below. |
| Tissot **T006.407** Le Locle | Reference **not confirmed**. Counterfeit risk **high**. The dozen variants do carry different real values ($324 / $404 / $447) — but that is the difference between *different watches* (steel vs leather vs rose gold), not dispersion among sellers of one watch. Same error class as ranking by distance from retail. |
| Certina **C036.407** DS PH200M | Thin liquidity. See *low brand recognition* below. |

## Three lessons that outlived the candidates

**1. The new-old-stock ceiling.** A reference still in production with an active
discount channel has its exit capped by new stock, and four candidates died on this:
the Ray II ($209.99 new), the M79 ($109 new), the Devil Diver ($238.79 promo) and the
Everytime. If a buyer can get it new with a warranty for less than our used listing,
there is no trade at any buy price.

This is not currently a gate. `deal.ts` has no notion of what a watch costs new.

**2. It also poisons comps.** Where new stock dominates the active listings, a comp
built from asking prices reads the market high, and the engine overpays. This matters
directly to the unresolved comp-source decision: deriving comps from active eBay
listings is the cheap option, and this is its specific failure mode. Any such comp
needs to exclude new/NOS listings, or it is biased upward exactly where we are most
likely to lose money.

**3. "Low brand recognition" is a liquidity problem, not a dispersion signal.** Mido
and Certina were both proposed on "Americans don't know this brand, so sellers
misprice it." Two verifiers independently found the same flaw: thin US distribution
means **few Americans own one**, which produces a *thin* pool of naive private sellers,
not a rich one. The argument needs a large casual-owner population, and low
distribution is evidence against exactly that.
