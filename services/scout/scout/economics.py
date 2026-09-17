"""Deal economics — contribution, not margin percentage.

Port of packages/core/src/economics.ts. See that file for the full reasoning.

The short version: the previous model declared a margin floor per price band and
rejected anything below it. On a $2,600 watch that demanded buying at $1,890 (27%
off) and clearing $280. That threw away real money -- the same watch bought at $2,300
and listed at $2,450 contributes +$70 on ACH, and brings a customer.

Paid acquisition costs $156-782 per customer at our price points. A sale that
contributes $1 and acquires a customer is therefore not a marginal deal; it is the
cheapest customer acquisition available. So the only HARD floor is: does this cover
its own cash costs? Everything above that is a capacity question -- time (~14
hrs/month) and float ($4-5k) are what is scarce, not margin.
"""

from __future__ import annotations

from dataclasses import dataclass

from .tiers import operational_profile, processing_fee


def auth_tier(source_price_usd: float) -> str:
    """eBay Authenticity Guarantee bands, keyed on the SOURCE price.

        FREE   $2,000+           automatic, eBay pays for both sides
        ADDON  $500 - $1,999.99  OPTIONAL, $80, elected and paid by the BUYER
        NONE   under $500        not offered

    The programme covers sneakers, watches, handbags, jewellery, streetwear and
    trading cards -- it is eBay's collector-item authentication system.
    """
    if source_price_usd >= 2000:
        return "FREE"
    if source_price_usd >= 500:
        return "ADDON"
    return "NONE"


def authentication_cost(source_price_usd: float, elect: bool = False,
                        addon_usd: float = 80.0) -> float:
    """What authentication costs US.

    DEFAULT ZERO in the ADDON band, deliberately. The $80 is buyer-elected and we are
    the buyer; paying it by default cost ~9% of a $900 order and made that band the
    tightest in the whole range for no reason.

    We do not need to buy it: eBay Money Back Guarantee already covers counterfeit
    and not-as-described on every purchase for 30 days, overriding the seller's own
    return policy. And above $2,000 Authenticity Guarantee is automatic and free, so
    the certificate costs nothing exactly where the stakes are highest.

    Elect it per-unit when the certificate is worth $80 on that specific watch -- a
    marginal seller, a commonly-faked reference, a customer who asks. Not by policy.
    """
    return addon_usd if (elect and auth_tier(source_price_usd) == "ADDON") else 0.0


def shipping_cost(declared_value_usd: float, cfg) -> float:
    """Outbound shipping as a CURVE over declared value, not seven hand-picked bands.

    Components are the real published pieces: postage by service level, signature
    confirmation, and insurance above the included $100. Constants are fitted to
    published USPS retail rates -- re-fit them to your own commercial rates, which is
    the easiest way to widen every deal in the book.
    """
    v = max(0.0, declared_value_usd)

    if v < 250:
        postage = cfg.ground_advantage_usd
    elif v < 1000:
        postage = cfg.priority_usd
    elif v < cfg.registered_threshold_usd:
        postage = cfg.priority_express_usd
    else:
        postage = cfg.registered_usd

    if v < 250:
        signature = 0.0
    elif v < 1000:
        signature = cfg.signature_confirmation_usd
    else:
        signature = cfg.adult_signature_usd

    insurance = 0.0
    if v > cfg.included_insurance_usd:
        if v >= cfg.registered_threshold_usd:
            insurance = v * cfg.registered_rate_pct
        else:
            steps = -(-(v - cfg.included_insurance_usd) // 100)  # ceil division
            insurance = cfg.insurance_base_usd + cfg.insurance_per_100_usd * steps

    return round(postage + signature + insurance, 2)


def packaging_cost(order_value_usd: float) -> float:
    """A mailer, then a box, then a box in a box."""
    if order_value_usd < 250:
        return 1.5
    if order_value_usd < 1000:
        return 4.0
    if order_value_usd < 5000:
        return 9.0
    return 18.0


def new_customer_credit(cfg) -> float:
    """What a NEW customer is worth beyond this transaction.

    Sourced rather than invented (docs/12): jewellery/watch repeat purchase rate is
    9-20% (we use 12%), second-purchase AOV runs 1.3-1.6x (we use 1.4x), luxury
    referral rates run 20-30% (we count 0.15 converted). The cross-check: this lands
    near the published ~$48 CAC benchmark for >$200-AOV ecommerce. Acquiring a
    customer is worth roughly what acquiring one costs.
    """
    repeat = cfg.repeat_rate * cfg.average_future_contribution_usd * cfg.second_order_aov_multiplier
    referral = cfg.expected_referrals * cfg.average_future_contribution_usd
    return round(repeat + referral + cfg.review_credit_usd, 2)


@dataclass(frozen=True)
class DealEconomics:
    revenue_usd: float
    shipping_collected_usd: float
    source_cost_usd: float
    sales_tax_usd: float
    authentication_usd: float
    outbound_shipping_usd: float
    packaging_usd: float
    processing_fee_usd: float
    epn_credit_usd: float
    contribution_usd: float
    contribution_margin_pct: float
    handling_minutes: int
    contribution_per_hour_usd: float
    float_required_usd: float
    return_on_float_pct: float
    strategic_credit_usd: float
    adjusted_contribution_usd: float
    rail: str
    profile_label: str


def compute_economics(source_price_usd: float, list_price_usd: float, cfg,
                      inbound_shipping_usd: float = 0.0, rail: str | None = None,
                      is_new_customer: bool = True, elect_authenticity: bool = False,
                      authentication_usd: float | None = None) -> DealEconomics:
    profile = operational_profile(list_price_usd)
    used_rail = rail or profile.preferred_rail

    shipping_collected = (
        shipping_cost(list_price_usd, cfg) if profile.shipping_charged_to_customer else 0.0
    )
    revenue = list_price_usd + shipping_collected

    landed_source = source_price_usd + inbound_shipping_usd
    sales_tax = 0.0 if cfg.has_resale_certificate else source_price_usd * cfg.sales_tax_rate
    # Derived consistently everywhere (an explicit override still wins), so the bid
    # ceiling and the gate can never disagree about it.
    auth = (
        authentication_usd
        if authentication_usd is not None
        else authentication_cost(source_price_usd, elect_authenticity, cfg.auth_addon_usd)
    )
    outbound = shipping_cost(list_price_usd, cfg)
    packaging = packaging_cost(list_price_usd)
    processing = processing_fee(revenue, used_rail, cfg)
    epn = source_price_usd * cfg.epn_commission_rate

    contribution = (
        revenue - landed_source - sales_tax - auth - outbound - packaging - processing + epn
    )
    float_required = landed_source + sales_tax + auth
    strategic = new_customer_credit(cfg) if is_new_customer else 0.0

    return DealEconomics(
        revenue_usd=round(revenue, 2),
        shipping_collected_usd=round(shipping_collected, 2),
        source_cost_usd=round(landed_source, 2),
        sales_tax_usd=round(sales_tax, 2),
        authentication_usd=round(auth, 2),
        outbound_shipping_usd=round(outbound, 2),
        packaging_usd=round(packaging, 2),
        processing_fee_usd=round(processing, 2),
        epn_credit_usd=round(epn, 2),
        contribution_usd=round(contribution, 2),
        contribution_margin_pct=round(contribution / revenue, 4) if revenue > 0 else 0.0,
        handling_minutes=profile.handling_minutes,
        contribution_per_hour_usd=round(contribution / (profile.handling_minutes / 60), 2),
        float_required_usd=round(float_required, 2),
        return_on_float_pct=round(contribution / float_required, 4) if float_required > 0 else 0.0,
        strategic_credit_usd=round(strategic, 2),
        adjusted_contribution_usd=round(contribution + strategic, 2),
        rail=used_rail,
        profile_label=profile.label,
    )


def judge_deal(e: DealEconomics, cfg) -> tuple[bool, list[str], float]:
    """(accept, reasons, rank_score).

    Capacity -- not margin -- decides whether a thin deal is good. With spare hours
    and float, a $1 contribution plus a customer beats an idle hour. When hours are
    the binding resource, every thin deal occupies an hour a fatter deal wanted.
    """
    reasons: list[str] = []
    basis = (
        e.adjusted_contribution_usd
        if cfg.count_strategic_credit_toward_floor
        else e.contribution_usd
    )

    if basis < cfg.min_contribution_usd:
        reasons.append(f"contribution ${basis:.2f} below the ${cfg.min_contribution_usd} floor")

    if cfg.capacity == "CONSTRAINED":
        if e.contribution_per_hour_usd < cfg.min_contribution_per_hour_usd:
            reasons.append(
                f"${e.contribution_per_hour_usd:.2f}/hr below "
                f"${cfg.min_contribution_per_hour_usd}/hr -- an hour is scarce right now"
            )
        if e.return_on_float_pct < cfg.min_return_on_float_pct:
            reasons.append(
                f"{e.return_on_float_pct * 100:.2f}% return on float below "
                f"{cfg.min_return_on_float_pct * 100:.2f}% -- float is scarce right now"
            )

    # Rank on adjusted contribution per hour: what an hour of your life is worth on
    # this deal, counting the customer it acquires, not just the watch it flips.
    rank = round(e.adjusted_contribution_usd / (e.handling_minutes / 60), 2)
    return (not reasons), reasons, rank


def solve_list_price(market_price_usd: float, cfg) -> float:
    raw = market_price_usd * (1 - cfg.target_discount_to_market)
    return round(raw / 5) * 5 if raw >= 100 else round(raw)


def max_source_price(list_price_usd: float, cfg, rail: str | None = None) -> float:
    """Highest source price that still clears the policy floor.

    Bisection, not algebra: shipping, packaging, the rail and handling time are all
    step functions of value, so there is no clean closed form -- and pretending
    otherwise is how the previous version acquired constants nobody could justify.
    """
    def clears(source: float) -> bool:
        e = compute_economics(source, list_price_usd, cfg, rail=rail)
        return judge_deal(e, cfg)[0]

    if not clears(0):
        return 0.0
    lo, hi = 0.0, list_price_usd * 1.5
    for _ in range(60):
        mid = (lo + hi) / 2
        if clears(mid):
            lo = mid
        else:
            hi = mid
    # Floor to the cent: rounding up can push the answer past the floor it respects.
    return int(lo * 100) / 100


def discount_to_market(source_price_usd: float, market_price_usd: float) -> float:
    if market_price_usd <= 0:
        return 0.0
    return round((market_price_usd - source_price_usd) / market_price_usd, 4)
