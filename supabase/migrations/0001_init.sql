-- Gleason Timepiece — initial schema
--
-- Two tables are load-bearing beyond their immediate use:
--   comp_snapshots  — never deleted. The only asset here that compounds and that a
--                     competitor cannot buy. See docs/07 (programmatic SEO).
--   order_events    — append-only. This IS the chargeback evidence pack. See docs/06.

create extension if not exists "pgcrypto";

-- ─────────────────────────────── watch models ───────────────────────────────────

create table watch_models (
  id                text primary key,           -- e.g. 'longines-hydroconquest-41'
  brand             text not null,
  reference         text not null,
  nickname          text,
  retail_price_usd  numeric(10,2),
  -- Search strings used by the J1 discovery job (docs/04).
  ebay_queries      text[] not null default '{}',
  watchcharts_id    text,
  -- Set false to stop sourcing a reference without losing its history.
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (brand, reference)
);

-- ──────────────────────── comp snapshots (the moat) ─────────────────────────────

create table comp_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  model_id           text not null references watch_models(id),
  captured_on        date not null,
  source             text not null check (source in ('OWN','WATCHCHARTS','TERAPEAK','CHRONO24')),
  market_price_usd   numeric(10,2) not null,
  raw_median_usd     numeric(10,2),
  p25_usd            numeric(10,2),
  p75_usd            numeric(10,2),
  sample_size        integer not null default 0,
  spread_pct         numeric(6,4),
  confidence         numeric(6,4),
  -- Liquidity, per docs/04 / comps.ts
  sales_per_month    numeric(8,2),
  median_gap_days    numeric(8,2),
  longest_gap_days   numeric(8,2),
  liquidity_score    numeric(6,4),
  qualified          boolean,
  raw_payload        jsonb,
  created_at         timestamptz not null default now(),
  unique (model_id, captured_on, source)
);

create index on comp_snapshots (model_id, captured_on desc);

-- Individual observed sales. Our own closed sales (source='OWN') are ground truth.
create table observed_sales (
  id                uuid primary key default gen_random_uuid(),
  model_id          text not null references watch_models(id),
  price_usd         numeric(10,2) not null check (price_usd > 0),
  sold_at           timestamptz not null,
  condition         text not null check (condition in ('NEW','NEW_OTHER','EXCELLENT','GOOD','FAIR')),
  source            text not null check (source in ('OWN','WATCHCHARTS','TERAPEAK','CHRONO24')),
  has_box_and_papers boolean not null default false,
  external_ref      text,
  created_at        timestamptz not null default now()
);

create index on observed_sales (model_id, sold_at desc);

-- ──────────────────────────────── candidates ────────────────────────────────────

create table candidates (
  id                  uuid primary key default gen_random_uuid(),
  ebay_item_id        text not null,
  model_id            text not null references watch_models(id),
  title               text not null,
  price_usd           numeric(10,2) not null,
  condition           text not null,
  has_box_and_papers  boolean not null default false,
  item_url            text not null,
  image_urls          text[] not null default '{}',
  uses_stock_photos   boolean,

  seller_feedback_score      integer,
  seller_positive_pct        numeric(5,2),
  seller_account_age_days    integer,
  seller_returns_accepted    boolean,
  seller_country             text,

  -- Deal engine output (packages/core/src/deal.ts)
  evaluated_at        timestamptz,
  passed              boolean,
  score               integer,
  gates_failed        text[],
  warnings            text[],
  market_price_usd    numeric(10,2),
  list_price_usd      numeric(10,2),
  max_bid_usd         numeric(10,2),
  projected_margin_pct numeric(6,4),
  discount_to_market_pct numeric(6,4),

  -- Human decision. NEVER automated — eBay UA prohibits agent purchasing (docs/01).
  operator_decision   text check (operator_decision in ('BUY','PASS','WATCH')),
  decided_at          timestamptz,

  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  source_ended_at     timestamptz,
  unique (ebay_item_id)
);

create index on candidates (passed, score desc) where passed;
create index on candidates (model_id, first_seen_at desc);

-- ───────────────────────────────── inventory ────────────────────────────────────

create table inventory (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid references candidates(id),
  model_id           text not null references watch_models(id),

  -- Acquisition
  source_ebay_item_id text,
  purchase_price_usd  numeric(10,2),
  purchased_at        timestamptz,
  sales_tax_paid_usd  numeric(10,2) not null default 0,  -- should be 0 — docs/03
  auth_guarantee_usd  numeric(10,2) not null default 0,

  -- ★ The single most valuable field for dispute defence (docs/06, docs/08).
  serial_number       text,

  condition           text,
  has_box_and_papers  boolean not null default false,
  condition_notes     text,
  photo_urls          text[] not null default '{}',
  intake_video_url    text,

  -- Listing
  list_price_usd      numeric(10,2),
  listed_at           timestamptz,
  slug                text unique,

  status              text not null default 'SOURCING'
                      check (status in ('SOURCING','IN_TRANSIT','IN_HAND','LISTED',
                                        'RESERVED','SOLD','RETURNED','SOURCE_GONE')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on inventory (status);
create index on inventory (listed_at desc) where status = 'LISTED';

-- ────────────────────────────────── orders ──────────────────────────────────────

create table orders (
  id                    uuid primary key default gen_random_uuid(),
  inventory_id          uuid not null references inventory(id),
  order_number          text not null unique,

  customer_email        text not null,
  customer_name         text,
  shipping_address      jsonb not null,
  billing_address       jsonb,

  amount_usd            numeric(10,2) not null,

  -- Stripe. capture_method MUST be 'manual' — enforced in code, documented here.
  stripe_payment_intent_id text unique,
  authorized_at         timestamptz,
  -- Mirror of payment_method_details.card.capture_before. Alert at T-24h.
  capture_before        timestamptz,
  captured_at           timestamptz,
  voided_at             timestamptz,
  refunded_at           timestamptz,
  card_brand            text,
  three_ds_result       text,

  -- Risk (packages/core/src/risk.ts)
  risk_score            integer,
  risk_decision         text check (risk_decision in ('ACCEPT','REVIEW','BLOCK')),
  risk_reasons          text[],
  identity_verified     boolean not null default false,

  state                 text not null default 'DRAFT'
                        check (state in ('DRAFT','AUTHORIZED','SOURCING','SECURED',
                                         'IN_TRANSIT_INBOUND','RECEIVED','SHIPPED',
                                         'DELIVERED','CLOSED','VOIDED','REFUNDED')),

  -- Fulfilment
  outbound_carrier      text,
  outbound_tracking     text,
  outbound_insured_usd  numeric(10,2),
  packing_video_url     text,
  shipped_at            timestamptz,
  delivered_at          timestamptz,
  delivery_signature    text,

  -- Disputes
  disputed_at           timestamptz,
  dispute_reason        text,
  dispute_outcome       text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index on orders (state);
-- Powers the "uncaptured authorization about to expire" alert.
create index on orders (capture_before)
  where state in ('AUTHORIZED','SOURCING');

-- ─────────────────── order_events — append-only evidence pack ───────────────────

create table order_events (
  id            bigserial primary key,
  order_id      uuid not null references orders(id),
  occurred_at   timestamptz not null default now(),
  event         text not null,
  from_state    text,
  to_state      text,
  effects       text[],
  -- Photos, tracking scans, risk decisions, 3DS results, customer messages.
  payload       jsonb,
  actor         text not null default 'system'
);

create index on order_events (order_id, occurred_at);

-- Append-only: no updates, no deletes. If a dispute lands 60 days later, this table
-- is exported, not reconstructed.
create rule order_events_no_update as on update to order_events do instead nothing;
create rule order_events_no_delete as on delete to order_events do instead nothing;

-- ─────────────────────────── demand signal (J4) ─────────────────────────────────

create table demand_signals (
  id            uuid primary key default gen_random_uuid(),
  model_id      text references watch_models(id),
  captured_on   date not null,
  source        text not null,          -- 'REDDIT_WTB' | 'FORUM_THREADS' | 'GOOGLE_TRENDS'
  raw_query     text,
  mentions      integer not null default 0,
  avg_asking_usd numeric(10,2),
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index on demand_signals (model_id, captured_on desc);

-- ───────────────────────────── API call budget ──────────────────────────────────
-- eBay default is 5,000 calls/day. The delist watcher (J3) is the big consumer.
-- Request an increase via the Application Growth Check at ~60 live listings, not 80.

create table api_call_log (
  id          bigserial primary key,
  api         text not null,           -- 'EBAY_BROWSE' | 'WATCHCHARTS' | 'REDDIT'
  endpoint    text not null,
  called_on   date not null default current_date,
  call_count  integer not null default 1,
  unique (api, endpoint, called_on)
);
