# 11 — Running It All For Free

Target: **$0/month infrastructure**, forever, at this traffic level. That is
achievable. Here is the exact stack, and the six gotchas that break it if you don't
plan for them.

## The stack

| Layer | Service | Free tier | Our usage | Headroom |
|---|---|---|---|---|
| **Scheduled scans** | GitHub Actions | 2,000 min/mo (private repo) | ~1,020 min | ✅ 49% |
| **Database** | Supabase | 500 MB DB, 1 GB files, 5 GB bandwidth | < 50 MB in year 1 | ✅ 90% |
| **Storefront** | **Cloudflare Pages + Workers** | 100k function req/day, unlimited static + bandwidth, 500 builds/mo | < 1k req/day | ✅ 99% |
| **Email** | Resend | 3,000/mo, **100/day**, 1 domain | ~30/day | ✅ 70% |
| **Payments** | Stripe | No monthly fee | per-transaction | ✅ |
| **Repo / CI** | GitHub Free | unlimited private repos | | ✅ |
| **Domain** | — | **not free** | ~$12/yr | the only fixed cost |

**Total: ~$1/month** (the domain), plus Stripe's per-transaction cut and WatchCharts
if and when you add it.

---

## ⚠️ Correction to docs/05: not Vercel

**I recommended Vercel Hobby earlier. That was wrong and you should not use it.**

Vercel's Hobby plan is **non-commercial only**, and their definition explicitly
includes e-commerce storefronts, processing payments, advertising a product or
service, and affiliate linking as a primary purpose. A watch store is commercial on
at least three counts. Using Hobby for this risks the deployment being pulled, and
the fix is Vercel Pro at **$20/month** — which breaks the $0 goal.

**Cloudflare Pages + Workers** is the replacement: no commercial-use restriction,
100,000 function requests/day, unlimited bandwidth and unlimited static requests,
free SSL and custom domains. At a few hundred visitors a day we use well under 1% of
it.

The trade: Workers run on a V8 runtime rather than Node, so a few Node-only libraries
need swapping. Next.js deploys via `@opennextjs/cloudflare`; SvelteKit, Astro and Remix
have first-class adapters. For a storefront this simple it's a non-issue — and
`packages/core` has zero dependencies, so it runs anywhere unchanged.

---

## The six gotchas

### 1. GitHub Actions rounds every job UP to a whole minute

This is the one that quietly eats the budget. A 20-second job costs **one full
minute**. A 61-second job costs **two**.

```
34 runs/day × 30 days = 1,020 runs/month
  at ≤60s each → 1,020 min  ✅ of 2,000
  at  61-120s  → 2,040 min  ❌ over budget, ~$0.006/min after
```

So "under a minute" is a hard budget constraint, not a nice-to-have. The scout
enforces it internally (`SCOUT_DEADLINE_SECONDS=45`) and the workflow sets
`timeout-minutes: 2` as a backstop, so a hung run costs 2 minutes rather than 360.

**Design consequences:** zero runtime dependencies (no `pip install` step at all),
parallel queries, two batched DB round trips per run, and a cached OAuth token.

### 2. GitHub Actions cron is not punctual

GitHub makes no timing guarantee. **5–30 minute delays are routine**; 60+ minute
delays are documented under peak load; runs are occasionally skipped entirely, with
no alert.

For **discovery** this is fine — a listing posted at 09:03 is still there at 09:35.

For **protecting money** it is not, and this is why the architecture never depends on
it. Capture happens only after a **real-time** availability check at checkout
([docs/06](06-payments-and-fraud.md)), not because a sweep happened to run. The
delist sweep keeps the catalogue tidy; the checkout check is what stops you losing a
watch.

> If you ever do need punctual scheduling, **Cloudflare Cron Triggers** are reliable
> and included free. Worth knowing; not needed yet.

### 3. Scheduled workflows are disabled after 60 days — in public repos

In a **public** repo, GitHub silently disables scheduled workflows after 60 days with
no commits. Pushing tags, opening issues and merging PRs don't reset it — only new
commits. Private repos are exempt.

**Use a private repo.** You get the exemption *and* your gate thresholds, watchlist
and margin model stay out of public view. The cost is that minutes are metered (2,000
free) rather than unlimited — which the budget above already accounts for.

### 4. Supabase free projects pause after 7 days of inactivity

No database queries for 7 days → the project goes offline until you manually resume
it. Data is retained, but the storefront is down.

The scout running every 30 minutes keeps it awake permanently. **The risk is if you
ever pause the workflow** — a two-week holiday with the scout disabled takes the
store offline. If you plan to stop scanning, leave one daily heartbeat run enabled.

### 5. Resend's daily cap bites before the monthly one

3,000/month sounds generous; **100/day** is the real limit. At 34 scans/day, alerting
on every run — or re-alerting on deals you've already seen — would blow it by
lunchtime and then silently drop your order confirmations.

The scout only emails on deals that are **new AND passed every gate**. Order
confirmations and shipping notices get priority over deal alerts in the same budget.

### 6. Stripe isn't free, and shouldn't be

2.9% + $0.30 is real money (~$30 on a $1,035 order, already in the
[docs/03](03-unit-economics.md) model). Radar for Fraud Teams adds $0.07/txn and is
worth it from day one. There is no free payment processor worth having for this.

---

## Where money eventually becomes necessary

Honest thresholds — none of these are year-one problems:

| Trigger | Move | Cost |
|---|---|---|
| Comps need to be programmatic | WatchCharts Professional + API | $40–150/mo |
| > 100 emails/day | Resend Pro | $20/mo |
| > 2,000 Actions min/mo | Fewer scans, or Cloudflare Cron Triggers | $0 |
| DB > 500 MB (≈ year 3+) | Supabase Pro | $25/mo |
| > 50 orders/mo | Medusa v2, real order management | $0 self-host |

## Setup order

1. **Private** GitHub repo (gotcha 3)
2. Supabase project → run `supabase/migrations/0001` then `0002`
3. eBay developer account → production keyset → Browse API
4. Resend → verify `gleasontimepiece.org` → API key
5. Add secrets to the repo: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ALERT_TO_EMAIL`
6. Seed `watch_models` and one `comp_snapshots` row per model
7. Run the workflow manually with **dry run = true** and read the output
8. Let it run on schedule for three weeks in shadow mode before spending a dollar

---

### Sources
- [Vercel Hobby plan (non-commercial)](https://vercel.com/docs/plans/hobby)
- [Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [GitHub Actions billing — per-job rounding](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [How GitHub Actions usage is measured](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Scheduled workflows disabled after 60 days (gh-action-keepalive)](https://github.com/efrecon/gh-action-keepalive)
- [Cron delays — GitHub community discussion #156282](https://github.com/orgs/community/discussions/156282)
- [Supabase free tier limits 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
- [Resend account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
