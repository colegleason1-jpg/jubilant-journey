-- Starting watchlist — 26 references.
--
-- THIS IS A HYPOTHESIS, NOT A RESULT. The prices below are indicative, drawn from
-- general market knowledge rather than measured, and exist only to put references
-- in roughly the right band. The comp engine establishes real numbers; shadow mode
-- says which of these are worth keeping. Expect to drop a third of them.
-- See docs/18-watchlist.md for how to decide which third.
--
-- SELECTION CRITERIA, in order of how much they matter:
--
--   1. COUNTERFEIT RISK — an exclusion filter, not a selection signal: it says what
--      we must not touch, while (2) says where the money is. It favours the cheap end.
--      Rolex alone is 80%+ of all fake watches, and used-watch retailers now
--      identify only about 20% of counterfeits because superclones have outrun
--      visual inspection. A $600 Hamilton is rarely faked because the economics
--      do not work for the faker. That is a real safety advantage of this band,
--      independent of margin.
--
--   2. SELLER SOPHISTICATION — the criterion that actually finds money. It is about
--      variance WITHIN the pre-owned market, not the gap between new and pre-owned.
--      Those are independent axes and only the first one pays us.
--
--      We buy pre-owned and sell pre-owned. What a watch costs new is not a price we
--      ever transact at, so the new→used drop is not a spread we can capture. The
--      only way to capture it would be to sell a used watch as new, which is the one
--      thing this repo exists to prevent.
--
--      What pays is two listings of the same reference in the same condition priced
--      $200 apart because one seller looked up the market and the other did not.
--      That variance is highest where the owner is an ordinary person rather than a
--      dealer or collector: someone with $700 in a watch, selling because they are
--      done with it, who does not know the market price, does not research it, and
--      is not trying to extract the last dollar. Under ~$2,000 that describes most
--      sellers. Above it, most listings are priced by people who know exactly what
--      they have, and the variance collapses.
--
--      So a SMALL depreciation curve is GOOD. It means the reference has a stable,
--      well-known anchor price, which makes the comp trustworthy and an underpriced
--      listing obvious. The Tissot PRX holding ~94% of retail is a feature, not a
--      disqualification.
--
--      An earlier version of this file said the opposite — that low depreciation
--      meant "nothing to capture" — and ranked references by how far they fell from
--      retail. It was measuring the wrong axis entirely. See the mistakes table in
--      CLAUDE.md.
--
--   3. MOVEMENT — mechanical or automatic. The buyer in this band is a hobbyist who
--      cares about what is inside and cannot be seen: automatics, hand-wounds,
--      day-dates, moonphases, power reserves. They are buying a movement and a
--      bracelet, not a logo, and on the merits they will take a good $2,000 movement
--      over a Rolex. They do not want a battery, and they certainly do not want a
--      smart watch.
--
--      The rule, since it has edges: quartz is excluded in the $200–$2,000 band,
--      where that buyer lives. Below it the buyer is different and the reference is
--      a customer-acquisition play (the DW-5600). Above it, quartz is allowed only
--      where the movement is itself the collectible (the SBGX261's 9F).
--
--   4. LIQUIDITY — enough sales, regularly. Enforced downstream by
--      computeLiquidity(); listed here as a judgement about which references have
--      a real second-hand market rather than occasional collector trades.
--
--   5. SEARCH DEMAND — a reference people actively look for converts on the
--      storefront and earns organic traffic.
--
-- WHERE THE CORE OF THIS LIST SITS: $200–$2,000. That is where hobbyist money is,
-- where sellers are least likely to have priced correctly, and where the counterfeit
-- economics still protect us. References outside it earn their place for a specific
-- reason, not by default.
--
-- HARD CAP: $2,300 retail. Nine references above it (Tudor BB58, both Omegas,
-- Breitling Superocean, TAG Carrera, Oris Aquis and ProDiver, GS Snowflake) were
-- removed rather than kept "in case". Above roughly $2,000 the sellers are dealers
-- and collectors who price correctly, so criterion 2 stops paying — and criterion 1
-- gets worse at the same time, because that is where the superclones are. The two
-- reasons point the same way. $2,300 rather than $2,000 only so the SBGX261 survives
-- on its 9F exception.
--
-- DELIBERATELY EXCLUDED: Rolex, Audemars Piguet, Patek Philippe. Thin spreads,
-- ruinous single-unit downside, and the overwhelming majority of the fake market.
-- Also excluded: Seiko SKX007/009 — genuinely liquid, but among the most faked
-- affordable divers, and discontinued so every listing is used.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SECTION HEADINGS BELOW ARE RETAIL PRICE. THEY ARE NOT OPERATIONAL TIERS.
--
-- retail_price_usd is a reference anchor for the comp engine, nothing more. The
-- operational profile — shipping service, handling time, which payment rails are
-- allowed — is chosen by operationalProfile(orderValueUsd) in tiers.ts from what
-- we LIST the unit at, resolved per unit at scan time.
--
-- The two diverge, and always downward, so a reference in the top section here will
-- often sell inside the CORE profile. Do not read a high retail figure as "do not
-- touch until the fraud controls are live" — that gate is on order value, and
-- tiers.ts applies it per unit on its own.
--
-- Note that how FAR a reference falls from retail is not itself interesting; see
-- criterion 2. It is recorded because the comp engine wants an anchor.
-- ─────────────────────────────────────────────────────────────────────────────

insert into watch_models (id, brand, reference, nickname, retail_price_usd, ebay_queries, active) values

-- ── Retail under $400 ──────────────────────────────────────────────────────────
-- Thin absolute margins, but fast handling and near-zero dispute exposure. Good
-- place to learn the pipeline where a mistake costs $40.
-- Quartz, and deliberately so: below the enthusiast band the buyer is different and
-- this is a customer-acquisition play. Probably the most liquid cheap watch there is.
('casio-dw5600',        'Casio',    'DW-5600E',   'G-Shock Square',      70,  array['casio g-shock dw5600','g shock square dw-5600'], true),
('seiko-5-snk809',      'Seiko',    'SNK809',     'Seiko 5 Field',       125, array['seiko 5 snk809','seiko snk809 field'], true),
('orient-bambino-v4',   'Orient',   'FAC08',      'Bambino V4',          150, array['orient bambino version 4','orient bambino fac08'], true),
('timex-marlin-hand',   'Timex',    'TW2T18000',  'Marlin Hand-Wound',   229, array['timex marlin hand wound'], true),
('orient-kamasu',       'Orient',   'RA-AA0004',  'Kamasu',              300, array['orient kamasu','orient ra-aa0004'], true),

-- ── Retail $400–1,000 ──────────────────────────────────────────────────────────
-- The densest band on the list, and the one most likely to survive shadow mode:
-- high volume, real dispersion, and low enough that a bad unit is an annoyance
-- rather than an event.
('seiko-presage-cocktail','Seiko',  'SRPB43',     'Cocktail Time',       425,  array['seiko presage cocktail time srpb43'], true),
('seiko-turtle-srpe93', 'Seiko',    'SRPE93',     'King Turtle',         525,  array['seiko king turtle srpe93','seiko turtle srpe93'], true),
('hamilton-khaki-mech', 'Hamilton', 'H69439931',  'Khaki Field Mechanical', 595, array['hamilton khaki field mechanical h69439931'], true),
('certina-ds-action',   'Certina',  'C032.407',   'DS Action Diver',     695,  array['certina ds action diver powermatic'], true),
('seiko-alpinist-spb121','Seiko',   'SPB121',     'Alpinist',            725,  array['seiko alpinist spb121','seiko spb121 green'], true),
('tissot-prx-auto',     'Tissot',   'T137.407',   'PRX Powermatic 80',   725,  array['tissot prx powermatic 80','tissot prx t137'], true),
('hamilton-khaki-auto', 'Hamilton', 'H70555523',  'Khaki Field Auto',    745,  array['hamilton khaki field automatic h70555523'], true),
('tissot-gentleman',    'Tissot',   'T127.407',   'Gentleman Powermatic',775,  array['tissot gentleman powermatic 80'], true),
('mido-ocean-star',     'Mido',     'M026.430',   'Ocean Star 200',      890,  array['mido ocean star 200 m026'], true),
('christopher-ward-c60','Christopher Ward','C60', 'Trident Pro 300',     995,  array['christopher ward c60 trident pro 300'], true),
('hamilton-intramatic', 'Hamilton', 'H38429130',  'Intra-Matic',         995,  array['hamilton intra-matic h38429130'], true),

-- ── Retail $1,000–$2,300 ───────────────────────────────────────────────────────
-- Mostly transacts pre-owned in the $600–1,500 range, i.e. the ENTRY and CORE
-- operational profiles.
('seiko-sumo-spb103',   'Seiko',    'SPB103',     'Sumo',                1100, array['seiko sumo spb103'], true),
('seiko-prospex-spb143','Seiko',    'SPB143',     '62MAS Reissue',       1200, array['seiko spb143','seiko prospex spb143 62mas'], true),
('longines-hydro-41',   'Longines', 'L3.781.4',   'HydroConquest 41mm',  1500, array['longines hydroconquest 41','longines hydroconquest l3.781'], true),
('sinn-556a',           'Sinn',     '556 A',      '556 A',               1520, array['sinn 556a','sinn 556 a'], true),
('nomos-club-campus',   'Nomos',    '765',        'Club Campus 38',      1700, array['nomos club campus 38'], true),
('longines-spirit-40',  'Longines', 'L3.810.4',   'Spirit 40mm',         2100, array['longines spirit 40mm l3.810'], true),
('longines-master-40',  'Longines', 'L2.793.4',   'Master Collection',   2200, array['longines master collection l2.793'], true),
('oris-65-40',          'Oris',     '01 733 7707','Divers Sixty-Five 40mm',2200, array['oris divers sixty five 40mm','oris 65 733 7707'], true),
('rado-captain-cook',   'Rado',     'R32105',     'Captain Cook 42mm',   2200, array['rado captain cook 42mm r32105'], true),
-- The quartz exception at the top end: the 9F is thermocompensated, hand-adjusted and
-- collected AS a movement. Criterion 3 excludes batteries, not this.
('seiko-gs-sbgx261',    'Grand Seiko','SBGX261',  'GS Quartz 9F',        2300, array['grand seiko sbgx261'], true)

on conflict (id) do update set
  nickname          = excluded.nickname,
  retail_price_usd  = excluded.retail_price_usd,
  ebay_queries      = excluded.ebay_queries;
