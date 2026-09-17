# 17 — Foundation: What We Build vs What We Assemble

> *"We're in the business of making money, not inventing."*

Correct, and it's a fair criticism of what I'd been doing. This is the audit.

## What is genuinely ours

Four things. Nobody sells these for pre-owned watches, and they're where the money
actually comes from:

| Ours | Why it can't be bought |
|---|---|
| **Comp + liquidity engine** (`comps.ts`) | "Is this reference liquid enough to touch" is a judgement about *our* capital and *our* patience. Your "tight sales, not one every 3 months" rule. |
| **Contribution economics** (`economics.ts`) | Our cost structure, our capacity, our LTV assumptions. |
| **Deal gates** (`deal.ts`) | Our risk appetite, encoded. |
| **Capture-timing state machine** (`orderflow.ts`) | The thing that makes the eBay race unlosable. ~200 lines and it protects every order. |

That's maybe 1,200 lines of real logic. **Everything else should be assembled.**

## What I was building that I shouldn't

| I was going to build | Use instead | Saves |
|---|---|---|
| Storefront from scratch | **Medusa v2 + Next.js starter** — MIT, production-ready, monorepo via `create-medusa-app` | ~40 hrs |
| **Admin panel** | **Comes free with Medusa.** Products, orders, customers, fulfilment | ~25 hrs |
| Shipping label logic + rate tables | **Shippo API** | ~10 hrs + real money (below) |
| Email templates | **React Email** + Resend | ~6 hrs |
| Image pipeline | **Cloudflare Images** or `sharp` | ~8 hrs |
| Product feed generation | Medusa plugins / feed libraries | ~5 hrs |
| Error tracking | **Sentry** free tier | ~4 hrs |
| Auth | **Supabase Auth** (already in the stack) | ~10 hrs |
| Accounting | **Wave** free | ~ongoing |

**~110 hours of work that already exists.** The Medusa admin dashboard alone removes
the biggest chunk — it ships with the core install.

---

## 💰 The finding that pays for the whole exercise

**Shippo: 30 labels/month free, then $0.05/label, with up to 90% off USPS retail and
no minimums.** Our shipping curve was fitted to USPS *retail* rates.

| Order | Retail (current) | Commercial | Saved | Contribution |
|---:|---:|---:|---:|---|
| $29 | $8.50 | $4.68 | $3.82 | $1.04 → **$1.15** |
| $350 | $20.95 | $11.53 | $9.42 | $34.87 → **$35.15** |
| $1,035 | $51.20 | $28.19 | $23.01 | $149.42 → **$172.43** |
| $2,450 | $65.90 | $36.31 | $29.59 | $3.68 → **$33.27** |

That last row is the one to look at. **The $2,450 deal goes from $3.68 to $33.27 — 9×
— purely from commercial shipping rates.** The deal you flagged as being wrongly
rejected turns out to be genuinely good once the postage is priced correctly.

### ⚠️ Don't conflate "measure the rates" with "integrate an API"

They're separate problems and only one is urgent.

**Measuring** needs no account: open any rate calculator, quote the bands, type them
in. Fifteen minutes.

```bash
python -m scout.fit_shipping --quotes "30=6.10,300=12.40,1500=24.30,8000=68.20"
```

**Integrating** is a month-three problem — it automates label buying, which at under
10 labels/month you can do by hand.

| Provider | Cost | Signup | API | Use it for |
|---|---|---|---|---|
| **Pirate Ship** | **100% free** — no monthly, no per-label | Instant, self-serve | ❌ none published | ⭐ **Rates now, labels by hand.** At or below USPS Commercial Pricing; they're a licensed USPS Connect eCommerce Platform consolidating small-shipper volume |
| **Shippo** | Free to 30 labels/mo, then $0.05 | [apps.goshippo.com/join](https://apps.goshippo.com/join) — self-serve | ✅ good | The API later. **Not** the "contact an expert" form on the marketing site |
| **ShipEngine** | Free developer account | Instant, no card | ✅ sandbox + prod | Alternative API |
| ~~EasyPost~~ | ~~free tier~~ | — | ✅ | ❌ Cut the free tier Feb 2026, raised per-label ~60%, added 3% on all USPS spend |

**Decided: Pirate Ship, labels bought by hand.** There's already a label printer, so
the API buys nothing at this volume — it would be a dependency, an account and a
failure mode in exchange for saving a few clicks a week. Revisit only when the
clicking becomes the bottleneck, which is a good problem to have.

`scout/shipping.py` stays in the repo, tested and unused, for that day. Migration is
a config change; the curve constants don't care where the numbers came from.

---

## The full stack, with real free-tier limits

| Layer | Choice | Free tier | When it costs |
|---|---|---|---|
| **Commerce + admin** | Medusa v2 (MIT) | Self-host, free | Managed Cloud $299/mo — not needed |
| **Storefront** | Next.js starter (ships with Medusa) | free | — |
| **Hosting** | Cloudflare Pages + Workers | 100k req/day, unlimited bandwidth, **commercial use allowed** | ~never at our volume |
| **Database** | Supabase | 500MB, 1GB files | ~year 3 |
| **Payments** | Stripe | no monthly fee | 2.9%+30¢ / ACH 0.8% capped $5 |
| **Shipping** | **Shippo** | **30 labels/mo**, then $0.05 | ~$2/mo at 40 labels |
| **Email** | Resend | 3,000/mo, **100/day** | daily cap binds first |
| **Scheduling** | GitHub Actions | 2,000 min/mo (private) | rounds UP per job — keep runs < 60s |
| **Errors** | Sentry | 5,000 errors/mo | plenty |
| **Jobs (later)** | Inngest | 50,000 events/mo | if Actions isn't enough |
| **Analytics** | Plausible / Umami | self-host free | — |
| **Accounting** | Wave | free | — |
| **Comps** | WatchCharts API | ❌ none | $40–150/mo — the one real cost |

**Steady state: ~$1/month (domain) + Stripe fees + WatchCharts when you add it.**

## APIs and what they need

| API | Auth | Cost | Notes |
|---|---|---|---|
| **eBay Browse** | OAuth client-credentials | free, 5k calls/day | The sourcing spine. Already built. |
| **eBay Partner Network** | separate application | pays us | ⚠️ Verify self-referral is allowed — currently modelled at zero |
| **Stripe** | secret key | per-transaction | Manual capture is mandatory |
| **Shippo** | API token | free to 30/mo | ⭐ Do this first |
| **Supabase** | service role key | free | |
| **Resend** | API key | free to 3k/mo | Verify the domain |
| **WatchCharts** | Professional membership | paid | Check the licence before publishing comp data |
| **Reddit** | OAuth | free | Demand signal, read-only |

## Connectors worth attaching

Several are already available in this session:

| Connector | Status | Use |
|---|---|---|
| **Supabase MCP** | ✅ available now | Run migrations, inspect tables, check advisors — no dashboard round trip |
| **GitHub MCP** | ✅ available now | PRs, CI status, issues |
| **Stripe MCP** | install: `claude plugin install stripe@claude-plugins-official` | Payments, disputes, refunds, payouts read/write. Genuinely useful for dispute evidence |

## Skills to add to this repo

Repeatable workflows beat remembering. Proposed `.claude/skills/`:

| Skill | Does |
|---|---|
| `/deal-review` | Pull today's passed candidates, re-verify availability, produce the buy list with bid ceilings |
| `/intake` | Walk the inbound SOP: serial, photos, condition report, evidence pack |
| `/calibrate` | Run shadow calibration, interpret it, propose specific threshold changes |
| `/dispute` | Assemble the chargeback evidence pack from `order_events` |

---

## Build order

Foundation first, exactly as you said — cheaper to start solid than to retrofit.

| Phase | Do | Hours |
|---|---|---|
| **0 — free wins** | ⭐ Shippo account + re-fit the shipping curve. Sentry. Stripe MCP. | **4** |
| **1 — prove the model** | Shadow mode ([docs/16](16-shadow-mode-runbook.md)). 3 weeks of waiting. | 4 + wait |
| **2 — calibrate** | Fill outcomes, run `scout.calibrate`, move thresholds to what the data says | 6 |
| **3 — assemble the store** | `create-medusa-app`, wire Stripe manual capture, port `packages/core` | 25 |
| **4 — first sale** | Terms, photography kit, Shippo labels, 5 listings | 15 |
| **5 — demand** | Merchant Center, content, r/Watchexchange reputation | ongoing |

**~55 hours to first sale**, down from ~152 in the original plan — almost entirely by
not building the storefront and admin panel.

Phase 0 is four hours and pays for itself on the first $2,000 order.

---

### Sources
- [Medusa Next.js starter storefront](https://docs.medusajs.com/resources/nextjs-starter)
- [Medusa starters](https://medusajs.com/starters)
- [Shippo shipping label pricing](https://goshippo.com/shipping/shipping-label-pricing)
- [Shippo pricing 2026](https://www.authencio.com/blog/shippo-pricing-best-shipping-api-plans-for-startups)
- [EasyPost's 3% USPS fee](https://goshippo.com/blog/what-easyposts-new-3-fee-means-for-your-usps-shipping-costs)
- [Sentry free tier](https://freetier.co/directory/products/sentry)
- [Inngest free tier](https://hokai.io/hub/tools/inngest)
- [Official Stripe MCP server](https://mcpservers.org/servers/stripe-mcp-server)
- [Stripe MCP with Claude Code](https://www.merge.dev/blog/stripe-mcp-claude-code)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
