# 15 — Sourcing Platforms: What Each Gives You Free

Two things decide whether a platform is worth sourcing from, and they're **not the
same thing**:

1. **Authentication** — will a third party physically verify the watch before it
   reaches us, at no cost to us?
2. **Recourse** — if it's wrong, can we get our money back without a fight?

A platform can be strong on one and useless on the other.

## The matrix

| Platform | Free authentication | Recourse | Live price access | Confidence @$800 |
|---|---|---|---|---:|
| **Bezel** | ✅ **Every purchase, free** — in-house, watch specialists | Escrow | Manual | **0.98** |
| **Poshmark** | ✅ **Free at $500+** — physical, 1–3 days | Escrow, 3 days | Manual | **0.89** |
| **StockX** | ⚠️ Master watchmakers, but **buyer pays a processing fee** | Escrow | Manual | 0.80 |
| **eBay** | ⚠️ Free at **$2,000+**; $80 add-on from $500 | MBG, 30 days, no escrow | ✅ **Official API** | 0.64 |
| **Chrono24** | ❌ Listing review only, not per-unit. Certified = $249 | ✅ **Free escrow**, 14 days | Dealer feed | 0.54 |
| **Mercari** | ❌ $5 **photo-based**; watches get **no certificate** | Escrow, 3 days | Manual | 0.46 |
| **Facebook Marketplace** | ❌ None | ⚠️ Conditional, easily voided | None | 0.31 |

## What's actually new here

### 🟢 Bezel is the standout, and it isn't in the plan yet

**Free in-house authentication on every purchase**, by watch specialists, plus
**insured overnight shipping included** and **no buyer's premium**. That's a
materially better offer than eBay at any price point — it removes both the $80
add-on decision and the shipping line.

The catch is no programmatic price access, so it's a manual channel. At a handful of
deals a month that's fine. **Worth opening an account and checking weekly.**

### 🟢 Poshmark is free above $500 and underrated

Posh Authenticate is **free**, **physical**, and takes 1–3 days. Watches sit under
"select luxury brands and categories", so confirm the reference qualifies before
relying on it — but where it applies, it's free authentication at a threshold four
times lower than eBay's.

### 🟡 Chrono24's escrow may beat eBay's guarantee

Chrono24 does **not** physically authenticate most listings — internal experts review
listings and private sellers must supply time-set proof-of-ownership photos, but
that's listing review, not per-unit inspection.

What it does have is **free escrow**: funds held **14 days after delivery** for dealer
purchases, 7 for private sellers. That's structurally better recourse than eBay's,
because **we inspect before the seller is paid** rather than filing a claim after.

**Use the escrow window deliberately.** It's the intake SOP's natural home.

### 🔴 Facebook Marketplace is the weakest, and its protection is easy to void

No authentication of any kind. Purchase Protection is free but **only** on shipped
orders **under $2,000** paid through **Facebook Checkout**. Three ways to lose it:

- **Local pickup → zero protection.** None.
- **Paying via PayPal, Venmo or Messenger → voided.**
- **$2,000 or above → not covered.**

That's exactly the transaction shape a watch deal tends to take. `assessSourcing()`
models all three conditions so the engine can't forget them.

## How this changes sourcing

**eBay stays the primary channel** — it's the only one with official programmatic
price access (Browse API), which is what makes automated screening possible at all.
Everything else is a manual weekly check.

But the ranking says something useful: **above $2,000, eBay's free authentication
closes most of the gap** (0.64 → 0.80 confidence). Below that, Bezel and Poshmark are
genuinely safer sources and cost nothing extra.

```ts
rankPlatforms(800)[0]   // Bezel, 0.975
rankPlatforms(2500)     // eBay climbs from 0.64 to 0.80 once AG is free
assessSourcing('FACEBOOK_MARKETPLACE', 800, { localPickup: true }).protected  // false
```

### Suggested lanes

| Order band | Primary | Why |
|---|---|---|
| Under $500 | eBay | Nothing authenticates free this low; our own inspection is the check |
| **$500–$2,000** | **Bezel / Poshmark**, eBay as volume | Free authentication where eBay would charge $80 |
| **$2,000+** | **eBay** | Authentication free, and the API gives us the volume |
| Any | Chrono24 | When the escrow window matters more than authentication |
| Any | ❌ Facebook Marketplace | Only shipped, only via Checkout, only under $2,000 — and even then no authentication |

---

### Sources
- [eBay Authenticity Guarantee for watches](https://pages.ebay.com/authenticity-guarantee-watches-seller/)
- [eBay Money Back Guarantee policy](https://www.ebay.com/help/policies/ebay-money-back-guarantee-policy/ebay-money-back-guarantee-policy?id=4210)
- [Chrono24 buyer protection & escrow](https://www.chrono24.com/about-us.htm)
- [Certified by Chrono24 ($249)](https://www.chrono24.com/certified.htm)
- [Bezel — in-house authentication](https://www.getbezel.com/authentication)
- [Bezel marketplace](https://shop.getbezel.com/)
- [Posh Authenticate](https://poshmark.com/posh_authenticate)
- [Mercari Authenticate — what it is](https://www.mercari.com/us/help_center/article/475/)
- [Mercari Authenticate fees & certificates](https://www.mercari.com/us/help_center/article/508/)
- [StockX — how watches are authenticated](https://help.stockx.com/watches/how-is-the-watch-authenticated)
- [Facebook Purchase Protection](https://www.facebook.com/help/228307904608701)
