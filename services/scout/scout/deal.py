"""Deal gates — a port of packages/core/src/deal.ts.

Binary, not weighted: a candidate must clear EVERY gate to reach your inbox. The bias
is toward rejection, because there is always another watch tomorrow and one bad
purchase costs more than six good ones make.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import pricing
from .ebay import Listing


@dataclass
class Evaluation:
    listing: Listing
    market_usd: float
    list_usd: float
    max_bid_usd: float
    discount_pct: float
    projection: pricing.Projection
    gates_failed: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    offer_ladder: list[pricing.OfferRung] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.gates_failed

    def to_alert(self) -> dict[str, Any]:
        return {
            "title": self.listing.title,
            "url": self.listing.item_url,
            "asking_usd": self.listing.price_usd,
            "shipping_usd": self.listing.shipping_usd,
            "landed_usd": self.listing.landed_source_usd,
            "market_usd": self.market_usd,
            "list_usd": self.list_usd,
            "max_bid_usd": self.max_bid_usd,
            "discount_pct": self.discount_pct,
            "margin_pct": self.projection.margin_pct,
            "gross_profit_usd": self.projection.gross_profit_usd,
            "seller": self.listing.seller_username,
            "seller_feedback": self.listing.seller_feedback_score,
            "seller_positive": self.listing.seller_positive_pct,
            "warnings": self.warnings,
            "offer_ladder": [
                {
                    "offer_usd": r.offer_usd,
                    "discount_from_ask": r.discount_from_ask,
                    "margin_pct_if_accepted": r.margin_pct_if_accepted,
                    "viable": r.viable,
                }
                for r in self.offer_ladder
            ],
        }

    def to_row(self, model_id: str) -> dict[str, Any]:
        return {
            "ebay_item_id": self.listing.ebay_item_id,
            "model_id": model_id,
            "title": self.listing.title,
            "price_usd": self.listing.price_usd,
            "shipping_usd": self.listing.shipping_usd,
            "landed_source_usd": self.listing.landed_source_usd,
            "condition": self.listing.condition,
            "item_url": self.listing.item_url,
            "image_urls": self.listing.image_urls[:12],
            "seller_feedback_score": self.listing.seller_feedback_score,
            "seller_positive_pct": self.listing.seller_positive_pct,
            "seller_country": self.listing.item_location_country,
            "seller_returns_accepted": True,  # server-side filter guarantees it
            "accepts_offers": self.listing.accepts_offers,
            "passed": self.passed,
            "gates_failed": self.gates_failed,
            "warnings": self.warnings,
            "market_price_usd": self.market_usd,
            "list_price_usd": self.list_usd,
            "max_bid_usd": self.max_bid_usd,
            "projected_margin_pct": self.projection.margin_pct,
            "discount_to_market_pct": self.discount_pct,
        }


def _blocklist_hits(title: str, blocklist: tuple[str, ...]) -> list[str]:
    lower = title.lower()
    # Whole-word match so "mod" doesn't fire on "model" and "rep" doesn't fire on
    # "reputable".
    return [t for t in blocklist if re.search(rf"\b{re.escape(t)}\b", lower)]


def evaluate(listing: Listing, market_usd: float, cfg) -> Evaluation:
    gates, warnings = [], []
    g, p = cfg.gates, cfg.pricing

    # Shipping is part of the buy price, never an afterthought.
    landed = listing.landed_source_usd
    list_usd = pricing.solve_list_price(market_usd, p)
    max_bid = pricing.max_viable_source_price(list_usd, p)
    projection = pricing.project_margin(landed, list_usd, p)
    discount = pricing.discount_to_market(landed, market_usd)

    if landed < g.min_source_price_usd or landed > g.max_source_price_usd:
        gates.append("PRICE_BAND")

    # Our entire "not as described" defence rests on third-party authentication.
    if pricing.auth_tier(landed) == "NONE":
        gates.append("AUTHENTICATION_ELIGIBLE")

    if discount < g.min_discount_to_market_pct:
        gates.append("DISCOUNT_TO_MARKET")

    # Both tier floors: the percentage (protects cheap units from not being worth the
    # handling) and the absolute dollars (protects expensive ones from a flattering
    # percentage). See tiers.py.
    floor_failures = pricing.meets_floors(projection, p)
    if floor_failures:
        gates.append("MARGIN")
        warnings.append(f"margin floors failed: {', '.join(floor_failures)}")

    if (
        listing.seller_feedback_score < g.min_seller_feedback_score
        or listing.seller_positive_pct < g.min_seller_positive_pct
        or listing.item_location_country not in g.allowed_countries
    ):
        gates.append("SELLER_QUALITY")

    hits = _blocklist_hits(listing.title, g.title_blocklist)
    if hits:
        gates.append("TITLE_BLOCKLIST")
        warnings.append(f"blocklist: {', '.join(hits)}")

    # A genuine watch 50% under market is usually stolen, fake, broken, or a seller
    # about to cancel. Treat it as a warning, not a win.
    if discount > g.suspicious_discount_pct:
        gates.append("TOO_GOOD_TO_BE_TRUE")
        warnings.append(f"{discount * 100:.0f}% under market — verify before trusting")

    if len(listing.image_urls) < 4:
        warnings.append("few photos — ask the seller for more before buying")
    if listing.shipping_usd > 25:
        warnings.append(f"high inbound shipping (${listing.shipping_usd:.2f})")

    ladder = (
        pricing.build_offer_ladder(landed, list_usd, p) if listing.accepts_offers else []
    )

    return Evaluation(
        listing=listing,
        market_usd=market_usd,
        list_usd=list_usd,
        max_bid_usd=max_bid,
        discount_pct=discount,
        projection=projection,
        gates_failed=gates,
        warnings=warnings,
        offer_ladder=ladder,
    )
