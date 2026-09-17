"""Price tiers — the fluid cost and margin model.

A port of packages/core/src/tiers.ts. See that file for the full reasoning; the short
version:

  • COSTS scale with value. A $30 watch ships in a $7.50 padded envelope, not insured
    Express for $40. Applying luxury logistics to a cheap watch invents a loss.

  • REQUIRED MARGIN % FALLS as value rises, because what must be covered is an
    absolute number — handling time and risk — not a percentage. 30% of a $34 order
    is $10. 1% of a $10,000 order is $100. The second is the better trade and a flat
    percentage floor says the opposite.

  • THE RAIL MAKES THE TOP END POSSIBLE. Card is 2.9% + $0.30 uncapped: $290 on a
    $10,000 order, nearly three times a 1% gross margin. Stripe ACH is 0.8% capped at
    $5. Thin high-value margins are created by the rail, which is why the top tiers
    require ACH or wire rather than merely preferring it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

CARD = "CARD"
ACH = "ACH"
WIRE = "WIRE"


@dataclass(frozen=True)
class PriceTier:
    label: str
    min_order_usd: float
    max_order_usd: float
    outbound_shipping_usd: float
    packaging_usd: float
    min_margin_pct: float
    min_gross_profit_usd: float
    handling_minutes: int
    allowed_rails: tuple[str, ...]
    preferred_rail: str
    # Cheap tiers collect postage on top of the item price; expensive tiers absorb it.
    # $7.50 of postage on a $27 watch is 28% of the sale — absorbing it makes the tier
    # look unviable when it simply isn't.
    shipping_charged_to_customer: bool
    notes: str = ""


PRICE_TIERS: tuple[PriceTier, ...] = (
    PriceTier("MICRO", 0, 150, 7.50, 1.50, 0.30, 10, 8, (CARD,), CARD, True,
              "Ground Advantage, tracking + $100 insurance included. No authentication "
              "available or needed. 5 photos, no video. Gated on $/hour, not margin."),
    PriceTier("BUDGET", 150, 400, 11.0, 3.0, 0.22, 35, 15, (CARD,), CARD, True,
              "Ground Advantage with added insurance. Signature optional. 10 photos."),
    PriceTier("ENTRY", 400, 1000, 22.0, 6.0, 0.15, 90, 30, (CARD,), CARD, False,
              "Priority Mail, signature, insured. Authenticity Guarantee add-on once "
              "the SOURCE price clears $500. Full intake SOP starts here."),
    PriceTier("CORE", 1000, 2500, 40.0, 9.0, 0.12, 120, 35, (CARD, ACH), CARD, False,
              "Priority Express, adult signature, insured. The bread-and-butter band."),
    PriceTier("UPPER", 2500, 7500, 55.0, 12.0, 0.06, 300, 45, (CARD, ACH), ACH, False,
              "Authenticity Guarantee free at $2,000+. Card fees bite hard here — "
              "offer an ACH discount and most buyers take it."),
    PriceTier("HIGH", 7500, 25000, 110.0, 20.0, 0.01, 100, 60, (ACH, WIRE), WIRE, False,
              "Registered Mail or Parcel Pro. CARD NOT PERMITTED: 2.9% uncapped would "
              "exceed the entire gross margin. 1% of $10,000 is $100 and that is real "
              "profit — it works because the rail is cheap and hard to reverse."),
    PriceTier("ULTRA", 25000, float("inf"), 200.0, 30.0, 0.01, 250, 90, (WIRE,), WIRE, False,
              "Wire only, funds cleared before the watch moves. Every unit is bespoke."),
)


def tier_for(order_value_usd: float) -> PriceTier:
    for t in PRICE_TIERS:
        if t.min_order_usd <= order_value_usd < t.max_order_usd:
            return t
    return PRICE_TIERS[0]


def processing_fee(order_value_usd: float, rail: str, cfg) -> float:
    """Processing cost for an order value on a given rail."""
    if rail == ACH:
        # 0.8% capped at $5 — the cap binds above $625.
        return min(order_value_usd * cfg.ach_percent, cfg.ach_cap_usd)
    if rail == WIRE:
        return cfg.wire_fee_usd
    return order_value_usd * cfg.card_percent + cfg.card_fixed_usd + cfg.radar_per_txn_usd


def resolve_rail(order_value_usd: float, requested: str | None = None) -> str | None:
    """The rail to actually use. None means the requested rail is banned at this value."""
    tier = tier_for(order_value_usd)
    if requested is None:
        return tier.preferred_rail
    return requested if requested in tier.allowed_rails else None
