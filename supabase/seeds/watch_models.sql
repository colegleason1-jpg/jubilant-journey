-- Starting watchlist — 36 references.
--
-- THIS IS A HYPOTHESIS, NOT A RESULT. The prices below are indicative, drawn from
-- general market knowledge rather than measured, and exist only to put references
-- in roughly the right band. The comp engine establishes real numbers; shadow mode
-- says which of these are worth keeping. Expect to drop a third of them.
-- See docs/18-watchlist.md for how to decide which third.
--
-- SELECTION CRITERIA, in order of how much they matter:
--
--   1. COUNTERFEIT RISK — the strongest filter, and it favours the cheap end.
--      Rolex alone is 80%+ of all fake watches, and used-watch retailers now
--      identify only about 20% of counterfeits because superclones have outrun
--      visual inspection. A $600 Hamilton is rarely faked because the economics
--      do not work for the faker. That is a real safety advantage of this band,
--      independent of margin.
--
--   2. PRICE DISPERSION — the spread is the business. A Tissot PRX depreciates
--      ~6% from retail, so there is nothing to capture. An Oris Aquis goes from
--      $2,500 retail to ~$1,200 pre-owned; that width is where mispriced listings
--      live. Counter-intuitively, LOW depreciation is bad for us.
--
--   3. LIQUIDITY — enough sales, regularly. Enforced downstream by
--      computeLiquidity(); listed here as a judgement about which references have
--      a real second-hand market rather than occasional collector trades.
--
--   4. SEARCH DEMAND — a reference people actively look for converts on the
--      storefront and earns organic traffic.
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
-- The two diverge a lot, and always downward. Pre-owned typically transacts
-- 40–60% under retail, so a reference in the top section here will often sell
-- inside the CORE profile: the $2,500 Oris Aquis is the dispersion example in
-- criterion 2 precisely because it changes hands near $1,200. So do not read a
-- high retail figure as "do not touch until the fraud controls are live" — that
-- gate is on order value, and tiers.ts applies it per unit on its own.
-- ─────────────────────────────────────────────────────────────────────────────

insert into watch_models (id, brand, reference, nickname, retail_price_usd, ebay_queries, active) values

-- ── Retail under $400 ──────────────────────────────────────────────────────────
-- Thin absolute margins, but fast handling and near-zero dispute exposure. Good
-- place to learn the pipeline where a mistake costs $40.
('casio-dw5600',        'Casio',    'DW-5600E',   'G-Shock Square',      70,  array['casio g-shock dw5600','g shock square dw-5600'], true),
('seiko-5-snk809',      'Seiko',    'SNK809',     'Seiko 5 Field',       125, array['seiko 5 snk809','seiko snk809 field'], true),
('orient-bambino-v4',   'Orient',   'FAC08',      'Bambino V4',          150, array['orient bambino version 4','orient bambino fac08'], true),
('timex-marlin-hand',   'Timex',    'TW2T18000',  'Marlin Hand-Wound',   229, array['timex marlin hand wound'], true),
('orient-kamasu',       'Orient',   'RA-AA0004',  'Kamasu',              300, array['orient kamasu','orient ra-aa0004'], true),
('citizen-promaster',   'Citizen',  'BN0151',     'Promaster Diver',     350, array['citizen promaster diver bn0151'], true),

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

-- ── Retail $1,000–2,500 ────────────────────────────────────────────────────────
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
('seiko-gs-sbgx261',    'Grand Seiko','SBGX261',  'GS Quartz 9F',        2300, array['grand seiko sbgx261'], true),

-- ── Retail $2,500 and above ────────────────────────────────────────────────────
-- Free Authenticity Guarantee applies above a $2,000 SOURCE price, which is not
-- the same as $2,000 retail — most of these source well below it. Where a unit
-- does list above $2,500, tiers.ts moves it to ACH-preferred on its own.
('oris-aquis-41',       'Oris',     '01 733 7766','Aquis Date 41.5mm',   2500, array['oris aquis date 41.5','oris aquis 733 7766'], true),
('tag-carrera-39',      'TAG Heuer','WBN2110',    'Carrera 39mm',        3050, array['tag heuer carrera wbn2110'], true),
('oris-prodiver',       'Oris',     '01 748 7748','ProDiver Titanium',   3800, array['oris prodiver titanium 748 7748'], true),
('tudor-bb58-blue',     'Tudor',    'M79030B',    'Black Bay 58 Blue',   3900, array['tudor black bay 58 blue 79030b'], true),
('tudor-bb58-black',    'Tudor',    'M79030N',    'Black Bay 58 Black',  3900, array['tudor black bay 58 79030n'], true),
('breitling-superocean','Breitling','A17376',     'Superocean 42',       4500, array['breitling superocean 42 a17376'], true),
('omega-seamaster-300m','Omega',    '210.30.42',  'Seamaster 300M',      5600, array['omega seamaster 300m 210.30.42'], true),
('omega-aqua-terra',    'Omega',    '220.10.38',  'Aqua Terra 38mm',     5900, array['omega aqua terra 38mm 220.10'], true),
('gs-sbga211',          'Grand Seiko','SBGA211',  'Snowflake',           6400, array['grand seiko snowflake sbga211'], true)

on conflict (id) do update set
  nickname          = excluded.nickname,
  retail_price_usd  = excluded.retail_price_usd,
  ebay_queries      = excluded.ebay_queries;
