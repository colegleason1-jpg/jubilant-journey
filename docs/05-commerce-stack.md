# 05 — Commerce Stack (Shopify Alternatives)

## What's actually different about our requirements

Before comparing platforms, be clear about why a normal store platform fits badly:

| Requirement | Normal store | Us |
|---|---|---|
| Inventory | Many units of few SKUs | **1 unit of many SKUs.** Every product is unique, sold once, then gone forever |
| Product lifecycle | Months/years | **Days.** Created, sold or pulled, dead |
| Delisting | Rare, manual | **Automated, urgent, must happen in seconds** |
| Payment | Charge at checkout | **Authorize at checkout, capture minutes-to-hours later, sometimes void** |
| Catalog creation | Human writes it | **Machine-generated from a source listing** |

The delist speed and the auth/capture split are the two things that eliminate most
platforms. **A platform you have to fight through an API to delist a product is a
platform that costs you money.**

---

## The comparison

| Option | Type | Cost | 1-of-1 inventory | Auth/capture control | Delist latency | Verdict |
|---|---|---|---|---|---|---|
| **Shopify** | SaaS | $39+/mo + 2.9%+30¢, or +2% if not Shopify Payments | OK | ⚠️ Manual capture exists but is clunky; Shopify Payments auth window is 7 days | API, seconds | Works, but you're renting. The +2% penalty for using Stripe directly is the problem |
| **Custom: Next.js + Stripe + Postgres** | Build | **$0–45/mo** | ✅ Native | ✅ **Full** | ✅ Instant (it's our DB) | ⭐ **Recommended** |
| **Medusa v2** | OSS, Node/TS, MIT | $0 self-host (~$200–600/mo infra) or Cloud $299/mo | ✅ Good | ✅ Full | ✅ Fast | Best OSS option. Overkill now, right answer at 50+ orders/mo |
| **Vendure** | OSS, TS/NestJS, GPLv3 | Self-host; Cloud custom-quoted | ✅ Good | ✅ Full | ✅ Fast | Excellent architecture. **GPLv3** — read it before you build proprietary logic on top |
| **Saleor** | OSS, Python/GraphQL, BSD-3 | Self-host; Cloud has GMV-based fee | ✅ Good | ✅ Full | ✅ Fast | Most mature (since 2012), most enterprise. Python + GraphQL is a second stack to learn |
| **WooCommerce** | WordPress plugin | ~$15/mo hosting | ⚠️ Workable | ⚠️ Plugin-dependent | ⚠️ Slower | The SEO story is genuinely good. The security surface on a site handling $2k orders is not |
| **Swell** | SaaS headless | ~$299+/mo | ✅ | ✅ | ✅ | Good product, priced for companies with revenue |
| **BigCommerce** | SaaS | $39+/mo, no transaction fee | OK | ⚠️ | API | Better than Shopify on fees. Still renting |
| **Sharetribe** | SaaS marketplace | $99+/mo | ✅ | ⚠️ | ✅ | Built for *multi-vendor* marketplaces. **We are not a marketplace** — see the warning below |
| **Squarespace / Big Cartel / Ecwid** | SaaS | $10–40/mo | ⚠️ | ❌ No manual capture | ❌ | Rules out the core mechanic |

### ⚠️ Do not call yourself a marketplace or a broker

Stripe's restricted business list prohibits **"payment facilitation and aggregation —
receiving settlement proceeds for goods or services that you did not provide, on behalf
of one or multiple third-party sellers."**

You used the word "broker" in your brief. **Never use that word with Stripe, or in your
site copy, or in your business description.** You are not brokering; you are not
connecting buyers to sellers; you do not handle anyone else's money.

**You buy watches, you take title to them, and you resell them.** You are a
**merchant of record** — a pre-owned watch retailer. That's accurate, it's what you're
actually doing, and it's a supported Stripe business. The distinction is the difference
between a normal account and a frozen one.

This also means: **never let a customer's watch ship directly from the eBay seller.**
Two-hop through you isn't just quality control — it's the physical fact that makes
"merchant of record" true. See [docs/08](08-operations-runbook.md).

---

## Recommendation: build it

**Next.js 15 (App Router) + Stripe + Supabase Postgres, on Vercel.**

Not because building is fun, but because our three hard requirements — instant delist,
authorize-and-capture with programmatic void, and machine-generated 1-of-1 products —
are *exactly* the three things platforms make hard, and *exactly* what a custom app
makes trivial.

A storefront for single-unit inventory is genuinely small: product list, product page,
checkout, order status, admin. **That's ~2,000 lines.** The engine in `packages/core`
is the hard part and it's platform-independent anyway.

### The stack

| Layer | Choice | Why | Cost |
|---|---|---|---|
| Frontend + API | **Next.js 15 on Vercel** | SSR for SEO (critical — see [docs/07](07-marketing-and-demand.md)), API routes, ISR for product pages | $0 → $20/mo |
| Database | **Supabase Postgres** | Managed Postgres, row-level security, realtime, storage for photos, generous free tier | $0 → $25/mo |
| Payments | **Stripe** | Only processor with clean programmatic manual capture + Radar + Identity in one place | 2.9% + 30¢ |
| Images | **Supabase Storage + Next/Image** | Watch photography is the product. Needs to be fast and sharp | included |
| Jobs | **Vercel Cron → API routes** (→ Railway worker if runtimes get long) | J1–J4 from docs/04 | $0 |
| Email | **Resend** | Transactional + the eventual list | $0 → $20/mo |
| Analytics | **Plausible** or Vercel Analytics | Lightweight, no cookie banner | $0 → $9/mo |
| Alerts to you | **Telegram Bot API** | Free, instant, phone push, trivially scriptable | $0 |

**Total: $0/mo to start, ~$75–115/mo fully loaded including WatchCharts.**

### When to reconsider

Move to **Medusa v2** if any of these become true:
- More than ~50 orders/month (you'll want real order management, returns, exchanges)
- You add a second sales channel that needs real inventory sync
- You hire anyone
- You want to stop maintaining checkout yourself

Medusa is MIT-licensed Node/TS, so it's a migration, not a rewrite, and `packages/core`
ports across unchanged. **Design for that migration now by keeping all business logic
in `packages/core` and out of the Next.js app.** This is already how the repo is
structured.

---

## Data model sketch

Full DDL in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

```
watch_models          the ~40 references we track (brand, ref, nickname, retail)
  └─ comp_snapshots   daily market price per model  (the proprietary time series)
  └─ candidates       raw eBay listings seen by J1, scored by the deal engine
       └─ inventory   candidates we actually bought → what appears on the storefront
            └─ orders customer orders, with the auth/capture state machine
                 └─ order_events  immutable audit log (this IS the chargeback evidence)
```

Two design notes that matter:

1. **`order_events` is append-only.** Every state change, every photo, every tracking
   scan, every risk decision, timestamped. When a chargeback arrives 60 days later, you
   don't reconstruct the story — you export it. See [docs/06](06-payments-and-fraud.md).
2. **`comp_snapshots` is never deleted.** It's the only asset here that compounds and
   that a competitor can't buy.

---

### Sources
- [Stripe — Prohibited and Restricted Businesses](https://stripe.com/legal/restricted-businesses)
- [Stripe — Restricted business list and considerations](https://support.stripe.com/questions/restricted-business-list-and-considerations)
- [Medusa vs Saleor vs Vendure 2026 (PkgPulse)](https://www.pkgpulse.com/guides/medusa-vs-saleor-vs-vendure-headless-ecommerce-2026)
- [Medusa vs Saleor vs Vendure open-source commerce engines (Kanopy)](https://kanopylabs.com/blog/medusa-vs-saleor-vs-vendure-open-source-commerce)
- [Medusa.js pricing: Cloud vs self-hosting 2026](https://www.buildwithmatija.com/blog/medusajs-pricing-cloud-self-host-costs-2026)
- [Best headless commerce platforms 2026 (Vendure)](https://vendure.io/blog/best-headless-commerce-platforms)
- [Stripe — place a hold on a payment method](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
