# 07 — Marketing & Demand

Your instinct that **organic is the best route** is correct, and more correct than you
probably realize. Here's the arithmetic that proves it.

## Why paid ads are structurally bad for this business

Our gross profit is ~$165 on a ~$1,035 order. Realistic Meta CPMs for US jewelry/watch
audiences run $15–30, click-through ~1%, and a cold-traffic conversion rate on a $1,000
considered purchase is **0.3–0.8%**.

| | Optimistic | Realistic |
|---|---:|---:|
| CPM | $15 | $25 |
| CTR | 1.2% | 0.8% |
| CPC | $1.25 | $3.13 |
| Conversion | 0.8% | 0.4% |
| **Customer acquisition cost** | **$156** | **$782** |
| Gross profit/order | $165 | $165 |
| **Contribution** | **+$9** | **−$617** |

**Paid acquisition does not work at this margin and this price point.** Even the
optimistic column is a rounding error. This isn't pessimism about your ad skills — it's
that a $165 margin can't absorb a considered-purchase CAC.

**The only paid channel that can work is high-intent search retargeting** — someone who
already searched "Longines Hydroconquest for sale" and visited your page. Tiny audience,
tiny budget, decent ROAS. Everything else is a donation to Meta.

So: **organic, owned, and community. In that order.**

---

## Channel plan, ranked by expected return per hour

### 1. ⭐ Programmatic SEO — the flywheel (highest ROI, slowest to start)

This is the channel that fits us perfectly and almost nobody in this niche does well.

Every watch we source generates a product page. Every watch we *sell* generates a
**permanent data point**. Turn both into pages:

| Page type | Template | Example | Volume |
|---|---|---|---|
| **Product page** | Individual watch, 20 photos, full condition report, serial-verified | "Longines Hydroconquest L3.781.4 — 2021, Box & Papers" | 1 per watch |
| **Reference hub** | Everything about a reference + our price history + what we've sold | "Longines Hydroconquest 41mm: Real Prices, 2024–2026" | ~40 |
| **Buying guide** | Honest, opinionated, genuinely useful | "How to Not Get Scammed Buying a Used Seiko Alpinist" | ~20 |
| **Comparison** | Head-to-head | "Tissot PRX vs Hamilton Jazzmaster: which holds value?" | ~30 |
| **Price tracker** | Our comp time series, published | "Used Seiko Alpinist SPB121 prices, updated monthly" | ~15 |

**The unfair advantage:** by month 6 you have a proprietary daily comp time series
(`comp_snapshots`) on every reference in the watchlist. *Nobody else can publish that.*
WatchCharts has the data but their audience is collectors, not buyers-with-intent. A
page titled **"What a used Longines HydroConquest actually sells for — 18 months of
real data"** ranks, earns links from
forums, and converts, because it answers the exact question a buyer has 20 minutes
before purchase.

> ⚠️ Check your WatchCharts license before publishing anything derived from their data.
> Distribution with attribution carries a 50% surcharge over internal-use pricing;
> white-label is 100%. **Your own sales data is unrestricted — lead with that.**

- **Timeline:** 3–6 months to meaningful traffic. Start week 1 anyway; it compounds.
- **Effort:** ~4 hrs/week writing. This is the highest-leverage 4 hours in the plan.
- **Why it beats ads:** a page ranking for "used hydroconquest price" earns traffic
  forever at zero marginal cost, and the visitor has already decided to buy.

### 2. Google Merchant Center — free product listings

**Not Google Business Profile.** As covered in [docs/01 §5](01-reality-check.md),
online-only businesses are ineligible for a Business Profile: Google requires in-person
customer contact at a location or within a service area, and PO boxes/virtual offices
get suspended.

Merchant Center is the correct channel and the better one: **free listings on the
Shopping tab, Search and Images**, with no Google Ads account and no ad spend. Products
appear based on feed quality, not bids.

Requirements: verified website, compliant policies, approved product data.
`condition: used` is fully supported.

- **Setup:** 4–6 hours once (feed generation is already in scope — same generator feeds Meta)
- **Ongoing:** automated
- **This should be live before your first listing.**

### 3. r/Watchexchange — the reputation asset

The highest-trust, highest-intent audience that exists for this product, and the one
that takes longest to earn.

Rules that matter: **30-day-old account with positive karma**, `[WTS] Brand Model
Details` title format, a **handwritten timestamp photo showing your username and the
current date**, all sale details in a top-level comment. Reputation is **flair-based** —
each completed deal increments a visible counter, and higher flair means faster sales at
better prices.

**Start the account today, before you have anything to sell.** The 30-day clock and the
karma requirement mean the account you need in month 2 has to be created in month 0.
Then: participate genuinely for 60 days, answer questions, be useful. Sell your first
few personal watches to build flair.

- **Effort:** 20 min/day for 60 days, then 1 hr/week
- **Payoff:** by flair 10+, you can move inventory in 48 hours at near-median

### 4. Forums — read constantly, post rarely, sponsor eventually

WatchUSeek, WatchCrunch, Omega Forums, and the model-specific communities are where
your buyers already are.

| Use | Approach |
|---|---|
| **Demand signal (automated)** | Read-only via official APIs / polite fetching. Which references generate WTB posts and "should I buy" threads. Feeds the watchlist. **Never post automatically** |
| **Participation (manual, you)** | Be a real person with a real account who knows things. Answer questions. No link-dropping |
| **Commercial (paid, later)** | Most forums require paid affiliate/dealer status to sell commercially. ~$300–1,000/yr. Worth it at ~15 sales/month, not before |

**Automating forum posts gets you banned and permanently poisons the brand in a small
community with long memories.** This is the one place where the automation instinct is
actively destructive.

### 5. Meta catalog → Instagram/Facebook Shops (organic, not ads)

There is no public Facebook Marketplace listing API for individuals — the "Marketplace
API" is partner-gated and requires Meta approval. What *is* available and free: a
**Commerce Manager catalog**, fed by the same CSV/XML product feed we build for Google.
One catalog powers both Facebook and Instagram Shops. Requires a linked Instagram
Business Account and a Facebook Page.

- **Setup:** 3 hours once, reuses the Google feed
- **Ongoing:** automated
- **Instagram organic is genuinely good for watches** — it's a visual product, the
  hashtag communities are active, and good macro photography performs. Budget 2 hrs/week
  for posting. Expect it to be a slow burn, not a firehose.

### 6. Email list — the only audience you own

Every other channel is rented. Start collecting from day one.

- **"Watch alerts"**: tell us the reference you want, we email you when we source one.
  This is *demand telegraphing* — it tells you what to buy before you buy it, which is
  worth more than the sales it generates.
- **Weekly "what we found"**: 3 watches, honest commentary, real prices.
- Resend free tier covers 3,000 emails/month. Costs nothing.

---

## Sales pipeline

You said the sales pipeline needs to be solid. For a $1,000 considered purchase bought
from a small unknown dealer, the pipeline is almost entirely **trust removal**:

```
DISCOVER  → organic search / IG / Reddit / Shopping tab
   │
   ▼
EVALUATE  → product page. This is where it's won or lost.
   │         20 photos · condition report · serial logged · AG certificate ·
   │         comp chart showing OUR price vs market · return policy above the fold
   │
   ▼
TRUST     → the objection is always "is this person real?"
   │         • Real name, real address, real phone, answered
   │         • r/Watchexchange flair linked
   │         • 30-day no-questions returns
   │         • Authenticity Guarantee explained in plain English
   │         • "Ask a question" that reaches you on your phone in <1 hour
   ▼
PURCHASE  → Stripe Checkout. Clear "authorized, not charged until confirmed" copy.
   │
   ▼
RETAIN    → the surprising part: this converts well
             • Shipping updates with real photos
             • A handwritten note in the box (yes, really)
             • 30 days later: "how is it?" → review request
             • "We'll buy it back at X% if you want to trade up" → repeat business
               AND free inventory acquisition below market
```

**The buy-back offer is underrated.** It converts a one-time buyer into a supply channel
and a repeat customer simultaneously. Offer 70–75% of current market; you're sourcing
below your eBay cost with zero acquisition spend.

---

## First 90 days, concretely

| Week | Action | Hours |
|---|---|---:|
| 0 | Create Reddit account. Start the 30-day clock. Begin lurking. | 1 |
| 1 | Domain, brand basics, IG + FB Page + Google Workspace | 4 |
| 2–4 | Write 5 cornerstone buying guides. Publish as you go. | 12 |
| 4 | Merchant Center + Meta catalog live (product feed already built) | 8 |
| 5–8 | 3 posts/week IG. Genuine forum participation. First r/WE personal sales for flair. | 16 |
| 9–12 | Reference hub pages for top 10 models. Launch email capture. | 12 |
| 12 | Review: which channel produced sessions? Double down on exactly one. | 2 |

**Total: ~55 hours over 90 days. Zero ad spend.**

Reassess paid only when organic has proven the product page converts. Spending on ads
before you know your conversion rate is buying traffic to a leaky bucket.

---

### Sources
- [Guidelines for representing your business on Google](https://support.google.com/business/answer/3038177?hl=en)
- [Google Business Profile eligibility (Local Falcon)](https://www.localfalcon.com/blog/everything-you-need-to-know-about-google-business-profile-eligibility)
- [Free listings for products — Google Merchant Center Help](https://support.google.com/merchants/answer/13889434?hl=en)
- [Google product data specification](https://support.google.com/merchants/answer/7052112?hl=en)
- [Free listings on the Shopping tab — retailer guide (Google PDF)](https://services.google.com/fh/files/misc/beginner_guide_to_free_listings_on_the_shopping_tab.pdf)
- [Catalog eligibility requirements for Shops on Facebook and Instagram (Meta)](https://www.facebook.com/business/help/1205792533104321)
- [Meta product feed specifications](https://webappick.com/facebook-product-feed-specifications-the-definitive-guide/)
- [Facebook Marketplace API — developer overview (api2cart)](https://api2cart.com/api-technology/facebook-marketplace-api/)
- [Meta Commerce Policies](https://www.facebook.com/policies_center/commerce)
- [r/WatchExchange rules & safety guide (WatchScanning)](https://www.watchscanning.com/guides/reddit-watchexchange-safety/)
- [Why watch dealers should sell on r/watchexchange (CoListable)](https://colistable.com/guides/reddit-watchexchange)
- [WatchCharts API license types](https://watchcharts.com/api/license)
