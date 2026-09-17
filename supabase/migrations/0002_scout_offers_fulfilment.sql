-- 0002 — scout support, the offer ladder, and fulfilment routing.
--
-- Adds what services/scout writes, the Best Offer ladder, and the direct-ship vs
-- via-operator routing decision. See docs/11, docs/12, docs/13.

-- ────────────────────── candidates: shipping and offers ─────────────────────────

alter table candidates
  add column if not exists shipping_usd        numeric(10,2) not null default 0,
  -- What the watch actually costs to get. The brief said "no more than $95 AFTER
  -- shipping" — inbound shipping is part of the buy price, never an afterthought.
  add column if not exists landed_source_usd   numeric(10,2),
  add column if not exists accepts_offers      boolean not null default false;

comment on column candidates.landed_source_usd is
  'price_usd + shipping_usd. Every gate and margin projection uses THIS, not price_usd.';

-- ─────────────────────────── service state / caches ─────────────────────────────

-- Small key/value store. Currently the eBay OAuth token (valid ~2h), cached so a
-- scan every 30 minutes does not re-authenticate four times an hour.
create table if not exists service_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- One round trip for the whole watchlist's current market price.
create or replace view distinct_market_price as
select distinct on (model_id)
  model_id,
  market_price_usd,
  confidence,
  qualified,
  captured_on
from comp_snapshots
order by model_id, captured_on desc;

comment on view distinct_market_price is
  'Latest comp per model. Lets the scout fetch every market price in a single request.';

-- Best-effort accounting against eBay''s 5,000 calls/day. Request an increase via the
-- Application Growth Check at ~60 live listings, not at 80.
create or replace function bump_api_calls(p_api text, p_endpoint text, p_count int)
returns void language sql as $$
  insert into api_call_log (api, endpoint, called_on, call_count)
  values (p_api, p_endpoint, current_date, p_count)
  on conflict (api, endpoint, called_on)
  do update set call_count = api_call_log.call_count + excluded.call_count;
$$;

-- ──────────────────────────── the offer ladder ──────────────────────────────────

-- 10% below ask, then 5%, then pay the ask. eBay caps buyer offers per listing
-- (commonly 3, and rejected/expired offers count against it), so this is the budget.
--
-- ⚠️ Offers are SENT BY HAND. eBay prohibits automated ordering and that includes
-- offers. This table records what you were advised to send and what happened, so the
-- acceptance rate per rung can be measured and the ladder tuned. See docs/12.
create table if not exists offers (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid references candidates(id),
  ebay_item_id        text not null,
  step                smallint not null check (step between 1 and 3),
  discount_from_ask   numeric(6,4) not null,
  offer_usd           numeric(10,2) not null,
  margin_pct_if_accepted numeric(6,4),
  sent_at             timestamptz,
  outcome             text check (outcome in ('ACCEPTED','DECLINED','COUNTERED','EXPIRED','NOT_SENT')),
  counter_usd         numeric(10,2),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (ebay_item_id, step)
);

create index if not exists offers_open_idx on offers (ebay_item_id)
  where outcome is null;

-- ────────────────────────── fulfilment routing ──────────────────────────────────

alter table orders
  add column if not exists fulfilment_route text
    check (fulfilment_route in ('DIRECT_TO_CUSTOMER','VIA_OPERATOR')),
  add column if not exists routing_reasons  text[],
  -- Where the eBay purchase is shipped. For VIA_OPERATOR this is the operator
  -- address, held in the HIGH_VALUE_SHIP_TO env var rather than committed here.
  add column if not exists source_ship_to   jsonb,
  add column if not exists seller_confirmed_blind_ship boolean not null default false;

comment on column orders.fulfilment_route is
  'DIRECT_TO_CUSTOMER ships from the eBay seller straight to the buyer: cheaper and '
  'faster, but forfeits our photos, serial log and packing video — the three things '
  'that win an "item not as described" dispute. Gated by value, order history and '
  'risk. See docs/13.';

-- ───────────────────────── auto-listing pipeline ────────────────────────────────

alter table inventory
  add column if not exists auto_listed          boolean not null default false,
  add column if not exists auto_listed_at       timestamptz,
  -- Machine-written copy still gets a human pass before it faces a customer.
  add column if not exists copy_reviewed_by_human boolean not null default false,
  add column if not exists source_shipping_usd  numeric(10,2) not null default 0;

-- A listing may only go live once a human has seen the photos and the copy. The
-- scout can stage a listing; it cannot publish one.
create or replace view publishable_inventory as
select *
from inventory
where status = 'LISTED'
  and copy_reviewed_by_human
  and serial_number is not null;

comment on view publishable_inventory is
  'What the storefront is allowed to render. Enforces: photographed, serial logged, '
  'copy human-reviewed. See docs/12.';
