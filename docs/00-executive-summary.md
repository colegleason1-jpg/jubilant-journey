# 00 — Executive Summary

**Gleason Timepiece** — an automated pre-owned watch retail operation.
*"Our watches make every second count."*

## The business

Find pre-owned watches listed below true market value. List them on our own storefront
just under market. **Only commit money once a customer has already committed to buy.**

The 2022 version made $200–300/month with an iPad and manual research. The 2026 version
automates everything except a 90-second human decision, and targets **$1,200+/month at
~14 hours/month** by end of year one.

## What changed since 2022 — and it cuts both ways

**In your favor:**
- The pre-owned watch market roughly doubled, to **~$35.7B in 2026**, and buyers are now
  comfortable purchasing online from small dealers.
- Licensed comp data (WatchCharts API) and eBay's official Browse API make a real
  pricing model buildable by one person.
- **eBay Authenticity Guarantee** — free above $2,000, an $80 buyer add-on from
  $500–$1,999 — means a neutral third party authenticates the watch before you ever
  touch it. This did not exist in usable form for you last time and it is the single
  best fraud control available.
- **Stripe manual capture** structurally eliminates the loss you actually experienced.

**Against you:**
- **eBay banned scraping and AI buying agents** in its User Agreement, effective
  February 20, 2026 — including "any end-to-end flow that attempts to place orders
  without human review."
- **eBay sold listings went behind a login wall** in July–August 2026, and the official
  sold-price API is closed to new applicants. **Comps are now the hard problem, not
  sourcing.**
- Price transparency has compressed spreads at the high end.

## The four decisions that define this plan

### 1. Automate everything except the buy click
An agent cannot legally place the eBay order. So: the system discovers, comps, scores,
ranks and hands you a one-tap link. You buy. **90 seconds per deal, ~15 minutes a
month.** Everything else — listing, pricing, delisting, fraud screening, fulfillment
paperwork — is automated. See [docs/01](01-reality-check.md), [docs/04](04-sourcing-and-scrapers.md).

### 2. Authorize, source, then capture — never the other way round
Your stated loss mode ("it sold on eBay before I could pull my listing") goes to **$0**.
Stripe holds a card authorization ~7 days; we need ~20 minutes. Customer orders → card
authorized, not charged → we verify the source listing is live → you buy it on eBay →
**then** we capture. If the listing is gone, we void the auth. **The customer is never
charged and we lose nothing.** See [docs/06](06-payments-and-fraud.md).

### 3. Only source watches eligible for Authenticity Guarantee
The loss that will actually hurt you isn't the race condition — it's an "item not as
described" chargeback, which 3D Secure does **not** cover. The defense is a neutral
third-party authentication certificate, plus a logged serial number and 20 in-hand
photos. That sets a **$500 purchase floor** and a **$600–$2,500 target band**.
See [docs/02](02-market-research.md), [docs/06](06-payments-and-fraud.md).

### 4. Build the storefront; skip Shopify and the OSS platforms
Our inventory is 1-of-1, lives for days, must delist in seconds, and needs programmatic
authorize/capture/void. Those are exactly the things platforms make hard. **Next.js +
Stripe + Supabase, $0–45/month.** Medusa v2 is the migration path at 50+ orders/month.
See [docs/05](05-commerce-stack.md).

## The three corrections to your original brief

| You said | Reality | Instead |
|---|---|---|
| AI agents scrape eBay and buy automatically | ToS violation since Feb 2026; risks the account the business depends on | Official API + a 90-second human buy click |
| Get a Google Business Page | Online-only businesses are **ineligible** — Google requires in-person contact | **Google Merchant Center** — free Shopping listings, which you want more anyway |
| Scrapers target forums hard | Automated posting = instant ban; reputation is the asset | Read-only demand signal (automated) + genuine participation (you) |

And one word to retire: **"broker."** Stripe prohibits receiving settlement for goods
you didn't provide on behalf of third-party sellers. You buy watches, take title, and
resell them — you are a **pre-owned watch retailer** and merchant of record. Never
describe it otherwise to a payment processor.

## The one boring thing worth more than all the code

> **Get a state resale certificate and register eBay's buyer tax exemption in week 1.**

You're paying 7–9% sales tax on purchases you shouldn't be. On a $900 watch that's
$63–81 against a ~$165 margin. **Fixing this roughly doubles net profit per unit** and
takes an afternoon. See [docs/03](03-unit-economics.md).

## Numbers

| | |
|---|---|
| Target band | **$70–$2,300**, capped. Mechanical/automatic enthusiast watches (Seiko, Orient, Hamilton, Tissot, Certina, Mido, Longines, Oris, Sinn, Nomos). The cheap end is customer acquisition, not a rounding error |
| Gross profit/unit | **~$165** (~16% margin) |
| Fixed costs | **~$150/month** |
| Units for $1,200/mo net | **~8/month** |
| Working capital needed | **$4,000–5,000** to start |
| API budget | Free tier (5,000 calls/day) covers ~80 concurrent listings |
| Time, steady state | **~14 hrs/month** |

## Timeline

| | Solo part-time (10 hrs/wk) | Focused full-time |
|---|---|---|
| 🎯 **First real sale** | **Week 14** (~152 hrs) | Day 22 |
| Fully built out | ~8 months (~281 hrs) | ~9 weeks |
| 💡 **"Ugly but real" test version** | **Week 4 (~35 hrs)** | Day 5 |

**Recommendation: build the 35-hour version first.** Payment Links, a Google Sheet, a
one-page site, five real listings. It answers the questions no plan can — do the comps
predict reality, will strangers buy from you, is it still fun — for 35 hours instead of
150. Then build the real thing on validated assumptions.

## Year one, honestly

Roughly **$6,000–8,000 net**, all reinvested, exiting at **~$1,200/month on ~14
hrs/month**. Not life-changing in year one. A real, compounding, mostly-automated asset
that throws off more each year — and unlike the 2022 version, it runs whether or not you
have time that week.

The binding constraint all year is **working capital, not demand**. Every dollar of
early profit should go to being able to say yes to the next good deal.

---

**Next:** read [docs/01 — Reality Check](01-reality-check.md). It's the one that changes
what you build.
