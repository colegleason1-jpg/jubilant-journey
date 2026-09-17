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
    """Mirror of DEFAULT_PRICING in packages/core/src/pricing.ts.

    Note what is NOT here: a margin floor. Floors live per-tier in tiers.py, because a
    single percentage gets both ends of the price range wrong. Overrides below exist
    for experiments, not for normal operation.
    """

    sales_tax_rate: float = field(default_factory=lambda: _f("HOME_STATE_SALES_TAX_RATE", 0.075))
    has_resale_certificate: bool = field(default_factory=lambda: _b("HAS_RESALE_CERTIFICATE", True))
    inbound_shipping_usd: float = 0.0
    card_percent: float = 0.029
    card_fixed_usd: float = 0.30
    radar_per_txn_usd: float = 0.07
    ach_percent: float = 0.008
    ach_cap_usd: float = 5.0
    wire_fee_usd: float = 0.0
    epn_commission_rate: float = 0.015
    auth_addon_usd: float = 80.0
    target_discount_to_market: float = field(
        default_factory=lambda: _f("TARGET_DISCOUNT_TO_MARKET", 0.10)
    )
    #: Optional global overrides of the per-tier floors. Leave as None in production.
    min_margin_pct_override: float | None = field(
        default_factory=lambda: _fo("MIN_MARGIN_PCT_OVERRIDE")
    )
    min_gross_profit_usd_override: float | None = field(
        default_factory=lambda: _fo("MIN_GROSS_PROFIT_USD_OVERRIDE")
    )


@dataclass(frozen=True)
class Gates:
    """Mirror of DEFAULT_DEAL_CONFIG. See packages/core/src/deal.ts."""

    min_source_price_usd: float = field(default_factory=lambda: _f("MIN_SOURCE_PRICE_USD", 500))
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
