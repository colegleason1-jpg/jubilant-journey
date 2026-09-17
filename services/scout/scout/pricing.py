"""Landed cost, bid ceiling and the offer ladder.

A faithful port of packages/core/src/pricing.ts and offers.ts. The parity tests in
tests/test_pricing.py assert the same worked examples as the TypeScript suite, so the
two implementations cannot drift silently.

THE MODEL IS FLUID
------------------
There is no single right buy discount. The required discount NARROWS as value rises,
because the absolute dollars get large enough to be worth having:

    market $30      buy <= 47% of market  ->  $10 gross at 30%   (~$78/hour)
    market $900     buy <= 63% of market  ->  $122 gross at 15%
    market $2,600   buy <= 73% of market  ->  $281 gross at 12%
    market $10,000  buy <= 89% of market  ->  $100 gross at 1.1% (wire, not card)

So "buy at 90% of market" loses money on a $1,000 watch and is a perfectly good trade
on a $10,000 one. Costs, margin floors and payment rails all come from tiers.py.
See docs/12.
"""

from __future__ import annotations

from dataclasses import dataclass

from .tiers import PriceTier, processing_fee, tier_for


def auth_tier(source_price_usd: float) -> str:
    """eBay Authenticity Guarantee bands: free at $2,000+, $80 add-on $500-$1,999."""
    if source_price_usd >= 2000:
        return "FREE"
    if source_price_usd >= 500:
        return "ADDON"
    return "NONE"


def authentication_cost(source_price_usd: float, cfg) -> float:
    return cfg.auth_addon_usd if auth_tier(source_price_usd) == "ADDON" else 0.0


def outbound_shipping(order_value_usd: float) -> float:
    return tier_for(order_value_usd).outbound_shipping_usd


def min_margin_pct_for(tier: PriceTier, cfg) -> float:
    return (
        cfg.min_margin_pct_override
        if cfg.min_margin_pct_override is not None
        else tier.min_margin_pct
    )


def min_gross_profit_for(tier: PriceTier, cfg) -> float:
    return (
        cfg.min_gross_profit_usd_override
        if cfg.min_gross_profit_usd_override is not None
        else tier.min_gross_profit_usd
    )


@dataclass(frozen=True)
class Projection:
    list_price_usd: float
    shipping_collected_usd: float
    revenue_usd: float
    fixed_cost_usd: float
    sales_tax_usd: float
    authentication_usd: float
    outbound_shipping_usd: float
    processing_fee_usd: float
    epn_credit_usd: float
    gross_profit_usd: float
    margin_pct: float
    rail: str
    tier_label: str
    effective_hourly_usd: float


def project_margin(source_price_usd: float, list_price_usd: float, cfg, rail: str | None = None) -> Projection:
    tier = tier_for(list_price_usd)
    used_rail = rail or tier.preferred_rail

    sales_tax = 0.0 if cfg.has_resale_certificate else source_price_usd * cfg.sales_tax_rate
    authentication = authentication_cost(source_price_usd, cfg)

    shipping_collected = tier.outbound_shipping_usd if tier.shipping_charged_to_customer else 0.0
    revenue = list_price_usd + shipping_collected

    fixed = (
        source_price_usd
        + sales_tax
        + authentication
        + cfg.inbound_shipping_usd
        + tier.outbound_shipping_usd
        + tier.packaging_usd
    )
    processing = processing_fee(revenue, used_rail, cfg)
    epn = source_price_usd * cfg.epn_commission_rate
    gross = revenue - fixed - processing + epn

    return Projection(
        list_price_usd=round(list_price_usd, 2),
        shipping_collected_usd=round(shipping_collected, 2),
        revenue_usd=round(revenue, 2),
        fixed_cost_usd=round(fixed, 2),
        sales_tax_usd=round(sales_tax, 2),
        authentication_usd=round(authentication, 2),
        outbound_shipping_usd=round(tier.outbound_shipping_usd, 2),
        processing_fee_usd=round(processing, 2),
        epn_credit_usd=round(epn, 2),
        gross_profit_usd=round(gross, 2),
        margin_pct=round(gross / revenue, 4) if revenue > 0 else 0.0,
        rail=used_rail,
        tier_label=tier.label,
        effective_hourly_usd=round(gross / (tier.handling_minutes / 60), 2),
    )


def meets_floors(projection: Projection, cfg) -> list[str]:
    """Both tier floors. Empty list means the deal clears.

    The percentage floor protects cheap units (12% of $40 is not worth the handling).
    The dollar floor protects expensive ones (a great-looking 8% must still beat your
    time and risk). Neither alone is sufficient.
    """
    tier = tier_for(projection.list_price_usd)
    failures = []
    if projection.margin_pct < min_margin_pct_for(tier, cfg):
        failures.append("MARGIN_PCT")
    if projection.gross_profit_usd < min_gross_profit_for(tier, cfg):
        failures.append("MARGIN_ABSOLUTE")
    return failures


def solve_list_price(market_price_usd: float, cfg) -> float:
    raw = market_price_usd * (1 - cfg.target_discount_to_market)
    # $5 steps above $100; $1 steps below, where $5 is a 5% swing.
    return round(raw / 5) * 5 if raw >= 100 else round(raw)


def max_viable_source_price(list_price_usd: float, cfg, target_margin: float | None = None,
                            rail: str | None = None) -> float:
    """The bid ceiling. Two constraints, take the lower:

        percentage:  S <= [ R(1-m) - overhead ] / (1 + tau - epn)
        absolute:    S <= [ R - overhead - G  ] / (1 + tau - epn)

    where R is revenue (list + any collected postage). Authentication cost is a step
    function of S, so we evaluate both assumptions and keep the self-consistent ones —
    a $27 order must never be charged the $80 add-on.
    """
    tier = tier_for(list_price_usd)
    m = target_margin if target_margin is not None else min_margin_pct_for(tier, cfg)
    g = min_gross_profit_for(tier, cfg)
    tau = 0.0 if cfg.has_resale_certificate else cfg.sales_tax_rate
    denominator = 1 + tau - cfg.epn_commission_rate

    shipping_collected = tier.outbound_shipping_usd if tier.shipping_charged_to_customer else 0.0
    revenue = list_price_usd + shipping_collected
    processing = processing_fee(revenue, rail or tier.preferred_rail, cfg)

    def solve(auth_usd: float) -> float:
        overhead = (
            processing + auth_usd + cfg.inbound_shipping_usd
            + tier.outbound_shipping_usd + tier.packaging_usd
        )
        by_percent = (revenue * (1 - m) - overhead) / denominator
        by_absolute = (revenue - overhead - g) / denominator
        return min(by_percent, by_absolute)

    zero_auth = solve(0.0)
    with_addon = solve(cfg.auth_addon_usd)

    consistent = []
    if zero_auth < 500:
        consistent.append(zero_auth)          # NONE band
    if 500 <= with_addon < 2000:
        consistent.append(with_addon)         # ADDON band
    if zero_auth >= 2000:
        consistent.append(zero_auth)          # FREE band

    if consistent:
        return round(max(consistent), 2)
    # No self-consistent solution: buying just under $500 avoids the add-on entirely.
    return round(min(zero_auth, 499.99), 2)


def max_customer_discount(market_price_usd: float, source_price_usd: float, cfg,
                          target_margin: float | None = None) -> float | None:
    """Deepest discount we can advertise while clearing BOTH tier floors, or None."""
    if market_price_usd <= 0 or source_price_usd <= 0:
        return None
    steps = int(0.60 / 0.0025)
    for i in range(steps + 1):
        d = 0.60 - i * 0.0025
        raw = market_price_usd * (1 - d)
        list_price = round(raw / 5) * 5 if raw >= 100 else round(raw)
        if list_price <= 0:
            continue
        tier = tier_for(list_price)
        m = target_margin if target_margin is not None else min_margin_pct_for(tier, cfg)
        p = project_margin(source_price_usd, list_price, cfg)
        if p.margin_pct >= m and p.gross_profit_usd >= min_gross_profit_for(tier, cfg):
            return round(max(0.0, d), 4)
    return None


def discount_to_market(source_price_usd: float, market_price_usd: float) -> float:
    if market_price_usd <= 0:
        return 0.0
    return round((market_price_usd - source_price_usd) / market_price_usd, 4)


@dataclass(frozen=True)
class OfferRung:
    step: int
    discount_from_ask: float
    offer_usd: float
    margin_pct_if_accepted: float
    gross_profit_if_accepted_usd: float
    viable: bool


def build_offer_ladder(asking_price_usd: float, list_price_usd: float, cfg,
                       rungs: tuple[float, ...] = (0.10, 0.05)) -> list[OfferRung]:
    """10% below ask, then 5%, then pay the ask.

    eBay caps buyer offers per listing (commonly 3, and rejected/expired offers count
    against it), so this ladder is exactly the budget. Do not add rungs.

    WARNING: YOU SEND THESE BY HAND. eBay prohibits automated order placement and that
    includes offers. This function decides the numbers; the clicking is yours.

    WARNING: STOCKED BUYING ONLY. A seller has up to 48 hours to answer, so two rungs
    can burn four days -- which does not fit inside a 7-day card authorization with
    shipping still to come. For an order already placed on our site, buy at the ask
    immediately. See docs/12.
    """
    ladder: list[OfferRung] = []
    for i, d in enumerate([*rungs, 0.0]):
        offer = round(asking_price_usd * (1 - d), 2)
        p = project_margin(offer, list_price_usd, cfg)
        ladder.append(
            OfferRung(
                step=i + 1,
                discount_from_ask=d,
                offer_usd=offer,
                margin_pct_if_accepted=p.margin_pct,
                gross_profit_if_accepted_usd=p.gross_profit_usd,
                viable=not meets_floors(p, cfg),
            )
        )
    return ladder
