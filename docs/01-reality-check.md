# 01 — Reality Check & Hard Constraints

Six things break the naive version of this plan. Each has a workaround, and every
workaround is already baked into the rest of these docs. Read this before you build
anything, because two of these would have cost you an eBay account.

---

## 1. You cannot scrape eBay, and you cannot let an agent click "Buy"

This is the big one, and it is **new since you last ran this business**.

- In **December 2025** eBay updated `robots.txt` to explicitly block scrapers and AI
  crawlers — Anthropic, Perplexity and Amazon were named directly.
- Effective **February 20, 2026**, eBay's User Agreement added an explicit anti-scraping
  and anti-agent clause. It prohibits "any robot, spider, scraper, data mining tools,
  data gathering and extraction tools, or other automated means (including buy-for-me
  agents, LLM-driven bots, or **any end-to-end flow that attempts to place orders
  without human review**)."

So the version of this business where an AI agent watches eBay all day and
auto-buys is not just risky — it's a written violation, and the penalty is losing the
buying account the entire business runs on.

**What we do instead:**

| Instead of | We use |
|---|---|
| Scraping eBay search HTML | The official **Browse API** — free, ~5,000 calls/day default, real-time price + availability, explicitly built for this |
| An agent placing the order | **Human-in-the-loop purchase.** The system ranks deals and puts a one-click link in front of you. You press buy. |
| Fighting anti-bot | Joining **eBay Partner Network** on top, so eBay is paid to like us and we earn affiliate commission on our own purchases |

This costs you roughly **90 seconds per deal**. At 5–10 deals a month that is 15
minutes of work, and it is the difference between a durable business and a banned one.
Everything else — discovery, comping, pricing, listing, delisting, fraud screening,
fulfillment paperwork — stays fully automated.

> The honest framing: this is not "automate the arbitrage." It's "automate everything
> around the arbitrage so the human decision takes 90 seconds."

## 2. Sold-price comps are now the hard problem — harder than sourcing

Your whole edge is knowing the *true* median sale price. That data got much harder to
get in 2026:

- **July 22, 2026** — eBay began redirecting signed-out visitors away from sold listings.
- **August 19, 2026** — no signed-out route to sold listings remains at all.
- The **Marketplace Insights API** (the official 90-day sold-price API) is a Limited
  Release, and eBay is **not accepting new applicants** — community reports say access
  is "no longer provided besides for major partners."
- **Terapeak** (free inside Seller Hub with any seller account, up to 365 days of
  research and ~3 years of sales history) is **UI-only**. There is no API behind it.

Active listings are unaffected and fully available via Browse API. Sold prices are the
scarce input.

**What we do instead** — a three-source comp stack, in priority order:

1. **WatchCharts API** (paid, licensed, legitimate). 29,000+ watches, current market
   price and historical data. Requires a Professional membership, metered by data
   credits. This is the only *programmatic, licensed* comp source and it is the
   backbone. Budget for it.
2. **Our own closed-sale ledger.** Every watch we sell is a data point nobody else has.
   After ~40 sales this starts to beat generic data in our chosen niche.
3. **Terapeak, manually, weekly.** 30 minutes every Sunday to refresh the reference
   band on our ~40 tracked models. Cheap, legal, and it calibrates the other two.

Active-listing asks (from Browse API) are used as a *ceiling and liquidity signal*,
never as a comp. Ask prices are fiction; sold prices are truth.

## 3. The loss mode you're worried about is solvable. The one that actually gets you isn't the same one.

You described the loss as: *someone buys on my site, but it already sold on eBay, so I
have to buy at retail and eat it.*

**That loss goes to zero with authorize-and-capture.** Stripe holds a card
authorization for ~7 days (Visa customer-initiated 7 days, Stripe works to a 4d18h
buffer; Mastercard/Amex/Discover 7 days; the exact deadline is on the charge as
`payment_method_details.card.capture_before`). We never capture until the eBay purchase
is confirmed. If the source listing is gone, we **void the authorization** — the
customer was never charged, we're out nothing but an apology email. See
[docs/06](06-payments-and-fraud.md).

The loss that *will* actually hurt you is different: an **"item not as described"
(INAD) chargeback**. 3D Secure shifts liability to the issuer for *fraudulent*
disputes only. It does **nothing** for "not as described," "item not received," or
cancelled orders. A customer who receives a genuine watch and claims it's fake, or
claims the condition was misrepresented, can take the money back and you have no
liability shift to hide behind.

That reframes the sourcing filter entirely: **we buy authentication, not just price.**
See constraint 4.

## 4. Authentication is a sourcing filter, not an afterthought

eBay's Authenticity Guarantee for watches:

- **$2,000 and above** — automatic and **free to both buyer and seller**. A third-party
  authenticator physically inspects the watch, does a multi-point check, and attaches a
  security tag before it continues on.
- **$500 – $1,999.99** — optional add-on the **buyer** can elect at checkout for **$80 +
  tax**.
- **Under $500** — not available.

This is enormous for us. It means for a modest fee (or free above $2k) a neutral
third party certifies the watch *before we ever take possession* — which is precisely
the evidence that kills an INAD chargeback and the thing our customers are actually
paying us for.

> **Correction to an earlier draft:** this section used to say "only source
> AG-eligible watches" and treated the $80 add-on as a cost of doing business. Both
> were wrong. The add-on is **optional and buyer-elected**, we are the buyer, and
> paying it by default cost ~9% of a $900 order for no benefit we weren't already
> getting free from **eBay Money Back Guarantee** — which covers counterfeit and
> not-as-described on every purchase for 30 days regardless.
>
> **The actual rule:** take the free certificate above $2,000 because it costs
> nothing. Below that, don't pay for it by default — elect it per-unit when a
> specific seller or reference warrants it. There is no $500 sourcing floor.
> See [docs/12](12-buy-box-and-offers.md).

## 5. Google Business Profile will not accept you

You mentioned wanting a Google Business page. Google's guidelines exclude
**online-only businesses**: a profile requires in-person customer contact, either at a
physical location or within a defined service area. Online-only brands selling
exclusively through a website don't qualify. PO boxes and virtual offices get
suspended.

**The right channel is Google Merchant Center instead**, which you actually want more:
free product listings on the Shopping tab, Search and Images, no ad spend required, no
Google Ads account needed. `condition: used` is a supported attribute. This puts your
individual watches into Google Shopping results for free.
See [docs/07](07-marketing-and-demand.md).

## 6. Automated forum posting will get you banned and torch the brand

Forums are the best demand signal in this market *and* the fastest way to become a
pariah. r/Watchexchange requires a 30-day-old account with positive karma, a `[WTS]`
title format, and a **handwritten timestamp photo showing your username and the current
date**. It runs on a flair-based reputation count. WatchUSeek and most brand forums
require paid affiliate/dealer status to sell commercially.

Reputation in these communities is the asset. It cannot be automated and it takes
months to build.

**Split the use case:**
- **Automated (read-only):** scrape *public* forum and subreddit discussion for demand
  signal — which references people are hunting, what they say a fair price is, which
  models generate "WTB" posts. This informs the watchlist. No posting.
- **Manual (you, genuinely):** participate. Build flair on r/Watchexchange with real
  sales. Pay for affiliate status on one forum once volume justifies it.

---

## What this adds up to

None of this kills the business. It reshapes it:

- The moat is **not** the scraper — anyone can call the Browse API.
- The moat is **the comp database + the liquidity model + the trust assets**
  (authentication, photography, reputation, return policy).
- The automation target is **everything except the buy click**.
- The money is protected by **capture timing**, not by scraping speed.

That's a better business than the one you described, and a legal one.

---

### Sources
- [eBay bans AI agents / anti-scraping UA update (ValueAddedResource, Feb 2026)](https://www.valueaddedresource.net/ebay-bans-ai-agents-updates-arbitration-user-agreement-feb-2026/)
- [eBay updates legalese to ban AI-powered shop-bots (The Register)](https://www.theregister.com/2026/01/22/ebay_updates_legalese_to_ban/)
- [eBay Explicitly Bans AI "Buy For Me" Agents (EcommerceBytes)](https://www.ecommercebytes.com/2026/01/21/ebay-bans-ai-shopping-agents-updates-arbitration-provision/)
- [Does eBay Allow Scraping? Anti-Bot (ScrapeOps)](https://scrapeops.io/websites/ebay/)
- [eBay Browse API docs](https://developer.ebay.com/api-docs/buy/static/api-browse.html)
- [eBay API call limits](https://developer.ebay.com/develop/get-started/api-call-limits)
- [Marketplace Insights API overview (Limited Release)](https://edp.ebay.com/api-docs/buy/marketplace-insights/static/overview.html)
- [Marketplace Insights API access — developer community thread](https://community.ebay.com/forum/talk-to-your-fellow-developers-57970/topic/marketplace-insights-api-access-168586/)
- [eBay sold listings login wall, July/Aug 2026](https://www.openwebninja.com/blog/how-to-get-ebay-sold-and-completed-listings)
- [Terapeak Product Research is free to all Seller Hub sellers (eBay)](https://export.ebay.com/en/resources/important-updates/ebay-news-archive/terapeak)
- [Terapeak product research help (eBay)](https://www.ebay.com/help/selling/selling-tools/terapeak-research?id=4853)
- [WatchCharts API — getting started](https://watchcharts.com/api)
- [WatchCharts API — license types](https://watchcharts.com/api/license)
- [Stripe — place a hold on a payment method](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
- [What the 3D Secure liability shift actually covers (Redo)](https://redo.com/resources/articles/chargebacks/3d-secure-liability-shift)
- [Liability shift with frictionless 3DS2 (Stripe support)](https://support.stripe.com/questions/liability-shift-with-frictionless-flow-for-3d-secure-v2-(3ds2))
- [eBay Authenticity Guarantee for watches — seller page](https://pages.ebay.com/authenticity-guarantee-watches-seller/)
- [eBay Authenticity Guarantee help](https://www.ebay.com/help/selling/selling-tools/ebay-authenticity-guarantee?id=4644)
- [Guidelines for representing your business on Google](https://support.google.com/business/answer/3038177?hl=en)
- [Everything You Need To Know About Google Business Profile Eligibility (Local Falcon)](https://www.localfalcon.com/blog/everything-you-need-to-know-about-google-business-profile-eligibility)
- [Free listings for products — Google Merchant Center Help](https://support.google.com/merchants/answer/13889434?hl=en)
- [r/WatchExchange safety & rules guide (WatchScanning)](https://www.watchscanning.com/guides/reddit-watchexchange-safety/)
