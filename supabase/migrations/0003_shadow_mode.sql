-- 0003 — shadow mode.
--
-- Records what the engine WOULD have done, so the thresholds can be fitted to
-- evidence instead of argument. Every number in the deal engine is currently a
-- number someone reasoned their way to, and reasoning is how the "$800 floor" and
-- the flat margin gate got written. Both were wrong.

create table if not exists shadow_decisions (
  id                        bigserial primary key,
  captured_at               timestamptz not null default now(),
  ebay_item_id              text not null,
  model_id                  text not null references watch_models(id),
  title                     text not null,

  landed_source_usd         numeric(10,2) not null,
  -- What we BELIEVED it was worth. The claim under test.
  market_estimate_usd       numeric(10,2) not null,
  comp_confidence           numeric(6,4),
  comp_sample_size          integer,
  liquidity_qualified       boolean,

  list_price_usd            numeric(10,2),
  max_bid_usd               numeric(10,2),
  projected_contribution_usd numeric(10,2),
  contribution_per_hour_usd numeric(10,2),
  discount_to_market_pct    numeric(6,4),

  -- Rejections are recorded as carefully as passes. A gate that is too tight leaves
  -- no trace except the deals it silently refused.
  passed                    boolean not null,
  gates_failed              text[] not null default '{}',
  rank_score                numeric(10,2),

  unique (ebay_item_id, captured_at)
);

create index if not exists shadow_decisions_model_idx
  on shadow_decisions (model_id, captured_at desc);
create index if not exists shadow_decisions_pending_idx
  on shadow_decisions (ebay_item_id)
  where passed;

-- Filled in later, once a listing resolves. This is the other half of the
-- experiment: without it the decisions are just a log.
create table if not exists shadow_outcomes (
  ebay_item_id    text primary key,
  observed_at     timestamptz not null default now(),
  sold            boolean not null,
  sold_price_usd  numeric(10,2),
  days_to_sell    integer,
  notes           text
);

-- Decisions still waiting on an outcome. Work this list weekly.
create or replace view shadow_pending as
select d.*
from shadow_decisions d
left join shadow_outcomes o on o.ebay_item_id = d.ebay_item_id
where o.ebay_item_id is null
order by d.captured_at desc;

-- Everything graded, ready for the calibration report.
create or replace view shadow_graded as
select
  d.*,
  o.sold,
  o.sold_price_usd,
  o.days_to_sell,
  case when o.sold_price_usd > 0
       then (d.market_estimate_usd - o.sold_price_usd) / o.sold_price_usd
  end as comp_pct_error
from shadow_decisions d
join shadow_outcomes o on o.ebay_item_id = d.ebay_item_id;

comment on view shadow_graded is
  'Every decision with a known outcome. comp_pct_error > 0 means we OVERvalued. '
  'A persistent positive median across many rows means the comp engine is biased '
  'and every downstream threshold is tuned against a fiction.';
