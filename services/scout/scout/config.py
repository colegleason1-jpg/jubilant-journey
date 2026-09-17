"""Configuration, loaded from environment (GitHub Actions secrets in production).

Every threshold that decides money lives here, so retuning never means editing logic.
Defaults mirror packages/core so the Python scout and the TypeScript engine agree.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _f(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw not in (None, "") else default


def _i(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


def _fo(name: str) -> float | None:
    raw = os.environ.get(name)
    return float(raw) if raw not in (None, "") else None


def _b(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    return raw.strip().lower() in ("1", "true", "yes", "y", "on")


@dataclass(frozen=True)
class Pricing:
    """Cost curve, payment rails, LTV assumptions and the contribution floor.

    Note what is NOT here: a margin percentage floor. The only hard floor is positive
    contribution after real cash costs; whether a thin deal is worth doing is a
    capacity question. See economics.py.
    """

    sales_tax_rate: float = field(default_factory=lambda: _f("HOME_STATE_SALES_TAX_RATE", 0.075))
    has_resale_certificate: bool = field(default_factory=lambda: _b("HAS_RESALE_CERTIFICATE", True))
    card_percent: float = 0.029
    card_fixed_usd: float = 0.30
    radar_per_txn_usd: float = 0.07
    ach_percent: float = 0.008
    ach_cap_usd: float = 5.0
    wire_fee_usd: float = 0.0
    auth_addon_usd: float = 80.0
    target_discount_to_market: float = field(
        default_factory=lambda: _f("TARGET_DISCOUNT_TO_MARKET", 0.10)
    )

    # ⚠️ ZERO BY DEFAULT. eBay Partner Network is built for driving EXTERNAL traffic,
    # and affiliate programmes generally prohibit commission on your own purchases.
    # Unconfirmed, so it is not in the base case: at the thin contributions we now
    # target, a phantom 1.5% is what turns a real $1 profit into a real loss.
    epn_commission_rate: float = field(default_factory=lambda: _f("EPN_COMMISSION_RATE", 0.0))

    # ── shipping cost curve, fitted to published USPS rates ──────────────────────
    #: Padded mailer for cheap watches; roughly half a boxed 1.5 lb parcel.
    envelope_usd: float = 4.75
    envelope_threshold_usd: float = 50.0
    ground_advantage_usd: float = 8.50
    priority_usd: float = 11.00
    priority_express_usd: float = 28.00
    registered_usd: float = 45.00
    signature_confirmation_usd: float = 4.15
    adult_signature_usd: float = 10.05
    included_insurance_usd: float = 100.0
    insurance_base_usd: float = 2.65
    insurance_per_100_usd: float = 1.05
    registered_threshold_usd: float = 5000.0
    registered_rate_pct: float = 0.005

    # ── what a new customer is worth (sourced; see docs/12) ──────────────────────
    repeat_rate: float = field(default_factory=lambda: _f("REPEAT_RATE", 0.12))
    second_order_aov_multiplier: float = 1.4
    expected_referrals: float = field(default_factory=lambda: _f("EXPECTED_REFERRALS", 0.15))
    average_future_contribution_usd: float = field(
        default_factory=lambda: _f("AVG_FUTURE_CONTRIBUTION_USD", 150.0)
    )
    review_credit_usd: float = 0.0

    # ── the decision policy ──────────────────────────────────────────────────────
    #: The only hard floor. Default $1 -- "if I make a damn dollar that's fine".
    min_contribution_usd: float = field(default_factory=lambda: _f("MIN_CONTRIBUTION_USD", 1.0))
    #: Enforced ONLY when capacity is CONSTRAINED.
    min_contribution_per_hour_usd: float = field(
        default_factory=lambda: _f("MIN_CONTRIBUTION_PER_HOUR_USD", 25.0)
    )
    min_return_on_float_pct: float = field(
        default_factory=lambda: _f("MIN_RETURN_ON_FLOAT_PCT", 0.015)
    )
    #: ABUNDANT = spare hours and float, take anything that pays for itself.
    #: CONSTRAINED = hours or float are binding, so thin deals crowd out better ones.
    capacity: str = field(default_factory=lambda: os.environ.get("SCOUT_CAPACITY", "ABUNDANT"))
    #: Keep the floor cash-real by default; do not let LTV credit mask a cash loss.
    count_strategic_credit_toward_floor: bool = field(
        default_factory=lambda: _b("COUNT_LTV_TOWARD_FLOOR", False)
    )


@dataclass(frozen=True)
class Gates:
    """Mirror of DEFAULT_DEAL_CONFIG. See packages/core/src/deal.ts."""

    #: Was 500, inherited from the old "only source Authenticity-Guarantee-eligible
    #: watches" rule. That rule is gone -- the $80 add-on is optional and eBay Money
    #: Back Guarantee covers the purchase regardless -- so a $500 floor was silently
    #: filtering out the entire MICRO/BUDGET band before the engine ever saw it.
    min_source_price_usd: float = field(default_factory=lambda: _f("MIN_SOURCE_PRICE_USD", 50))
    max_source_price_usd: float = field(default_factory=lambda: _f("MAX_SOURCE_PRICE_USD", 3500))
    min_discount_to_market_pct: float = field(
        default_factory=lambda: _f("MIN_DISCOUNT_TO_MARKET_PCT", 0.18)
    )
    #: Below this order value we skip the full intake SOP; see tiers.py MICRO/BUDGET.
    # Above this, treat it as a red flag rather than a bargain.
    suspicious_discount_pct: float = 0.45
    min_seller_feedback_score: int = 50
    min_seller_positive_pct: float = 98.5
    min_seller_account_age_days: int = 365
    allowed_countries: tuple[str, ...] = ("US",)
    title_blocklist: tuple[str, ...] = (
        "homage", "replica", "rep", "aftermarket", "franken", "frankenwatch",
        "parts", "repair", "not working", "as-is", "as is", "custom dial",
        "mod", "modded", "project", "read description",
    )


@dataclass(frozen=True)
class Runtime:
    """Execution budget.

    GitHub Actions bills every job rounded UP to a whole minute, so a run that takes
    61 seconds costs exactly double one that takes 59. The deadline is enforced, not
    aspirational: we return partial results rather than overrun. See docs/11.
    """

    deadline_seconds: float = field(default_factory=lambda: _f("SCOUT_DEADLINE_SECONDS", 45.0))
    max_workers: int = field(default_factory=lambda: _i("SCOUT_MAX_WORKERS", 8))
    http_timeout_seconds: float = 10.0
    ebay_page_limit: int = 200
    dry_run: bool = field(default_factory=lambda: _b("SCOUT_DRY_RUN", False))


@dataclass(frozen=True)
class Secrets:
    ebay_client_id: str = field(default_factory=lambda: os.environ.get("EBAY_CLIENT_ID", ""))
    ebay_client_secret: str = field(default_factory=lambda: os.environ.get("EBAY_CLIENT_SECRET", ""))
    ebay_marketplace_id: str = field(
        default_factory=lambda: os.environ.get("EBAY_MARKETPLACE_ID", "EBAY_US")
    )
    ebay_epn_campaign_id: str = field(
        default_factory=lambda: os.environ.get("EBAY_EPN_CAMPAIGN_ID", "")
    )
    supabase_url: str = field(default_factory=lambda: os.environ.get("SUPABASE_URL", "").rstrip("/"))
    supabase_key: str = field(
        default_factory=lambda: os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    )
    resend_api_key: str = field(default_factory=lambda: os.environ.get("RESEND_API_KEY", ""))
    alert_from: str = field(
        default_factory=lambda: os.environ.get("ALERT_FROM_EMAIL", "scout@gleasontimepiece.org")
    )
    alert_to: str = field(default_factory=lambda: os.environ.get("ALERT_TO_EMAIL", ""))

    def missing(self) -> list[str]:
        required = {
            "EBAY_CLIENT_ID": self.ebay_client_id,
            "EBAY_CLIENT_SECRET": self.ebay_client_secret,
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_key,
        }
        return [k for k, v in required.items() if not v]


@dataclass(frozen=True)
class Config:
    pricing: Pricing = field(default_factory=Pricing)
    gates: Gates = field(default_factory=Gates)
    runtime: Runtime = field(default_factory=Runtime)
    secrets: Secrets = field(default_factory=Secrets)


def load() -> Config:
    return Config()
