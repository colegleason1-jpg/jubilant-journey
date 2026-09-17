"""eBay Browse API client.

WHY THIS IS AN API CLIENT AND NOT A BEAUTIFULSOUP SCRAPER
---------------------------------------------------------
eBay's User Agreement, effective 2026-02-20, prohibits "any robot, spider, scraper,
data mining tools, data gathering and extraction tools, or other automated means
(including buy-for-me agents, LLM-driven bots, or any end-to-end flow that attempts
to place orders without human review)". Their robots.txt (updated December 2025)
blocks scrapers by name.

The buying account is the entire business — if it is banned there is no pipeline, no
inventory, no Authenticity Guarantee and no product. The Browse API is free (~5,000
calls/day), returns real-time price and availability, is faster than parsing HTML,
and is explicitly intended for this. There is no upside to scraping and the downside
is the company.

See docs/01 and docs/04.
"""

from __future__ import annotations

import time
import urllib.parse
from dataclasses import dataclass
from typing import Any

from .http import basic_auth, request

OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
BROWSE_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item/"
SCOPE = "https://api.ebay.com/oauth/api_scope"

WRISTWATCH_CATEGORY_ID = "31387"


@dataclass
class Listing:
    ebay_item_id: str
    title: str
    price_usd: float
    shipping_usd: float
    condition: str
    item_url: str
    image_urls: list[str]
    seller_username: str
    seller_feedback_score: int
    seller_positive_pct: float
    item_location_country: str
    buying_options: list[str]
    listed_at: str | None

    @property
    def landed_source_usd(self) -> float:
        """What the watch actually costs us to get, including inbound shipping.

        The user's spec says "no more than $95 after shipping" — shipping is part of
        the buy price, never an afterthought.
        """
        return round(self.price_usd + self.shipping_usd, 2)

    @property
    def accepts_offers(self) -> bool:
        return "BEST_OFFER" in self.buying_options


class EbayClient:
    def __init__(self, cfg, token: str | None = None, token_expires_at: float = 0.0):
        self._cfg = cfg
        self._token = token
        self._token_expires_at = token_expires_at

    # ── auth ────────────────────────────────────────────────────────────────────

    @property
    def token(self) -> str:
        """Client-credentials token, valid ~2 hours.

        Cached in Supabase between runs so a scan every 30 minutes does not spend a
        round trip re-authenticating four times an hour.
        """
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token
        s = self._cfg.secrets
        payload = request(
            OAUTH_URL,
            method="POST",
            headers={"Authorization": basic_auth(s.ebay_client_id, s.ebay_client_secret)},
            form_body={"grant_type": "client_credentials", "scope": SCOPE},
            timeout=self._cfg.runtime.http_timeout_seconds,
        )
        self._token = payload["access_token"]
        self._token_expires_at = time.time() + int(payload.get("expires_in", 7200))
        return self._token

    @property
    def token_expires_at(self) -> float:
        return self._token_expires_at

    def _headers(self) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self.token}",
            "X-EBAY-C-MARKETPLACE-ID": self._cfg.secrets.ebay_marketplace_id,
        }
        # Attributes the referral to eBay Partner Network so our own purchases earn
        # commission back. Costs nothing, worth ~1.5% of COGS.
        if self._cfg.secrets.ebay_epn_campaign_id:
            h["X-EBAY-C-ENDUSERCTX"] = (
                f"affiliateCampaignId={self._cfg.secrets.ebay_epn_campaign_id}"
            )
        return h

    # ── search ──────────────────────────────────────────────────────────────────

    def search(self, query: str, *, min_usd: float, max_usd: float) -> list[Listing]:
        """One search call per watchlist query.

        Filters are applied SERVER-SIDE wherever eBay supports it. Every listing
        rejected by eBay is a listing we neither transfer nor parse, which is most of
        the runtime budget.

        `returnsAccepted:true` is a hard gate: if the seller will not take a return,
        our only recourse on a bad watch is a slow adversarial claim. See docs/04.
        """
        filters = ",".join(
            [
                f"price:[{min_usd}..{max_usd}]",
                "priceCurrency:USD",
                "buyingOptions:{FIXED_PRICE|BEST_OFFER}",
                "conditions:{USED|NEW_OTHER|NEW}",
                "itemLocationCountry:US",
                "deliveryCountry:US",
                "returnsAccepted:true",
            ]
        )
        params = {
            "q": query,
            "category_ids": WRISTWATCH_CATEGORY_ID,
            "filter": filters,
            "sort": "price",
            "limit": str(self._cfg.runtime.ebay_page_limit),
        }
        url = f"{BROWSE_SEARCH_URL}?{urllib.parse.urlencode(params)}"
        payload = request(
            url, headers=self._headers(), timeout=self._cfg.runtime.http_timeout_seconds
        )
        return [_parse(item) for item in (payload or {}).get("itemSummaries", []) or []]

    def is_still_available(self, ebay_item_id: str) -> bool:
        """Real-time availability check.

        Called at checkout before we capture a payment, and by the delist sweep. This
        is the check that makes the eBay race condition unlosable (docs/06).
        """
        try:
            payload = request(
                BROWSE_ITEM_URL + urllib.parse.quote(ebay_item_id, safe=""),
                headers=self._headers(),
                timeout=self._cfg.runtime.http_timeout_seconds,
            )
        except Exception:
            # Fail CLOSED: an item we cannot verify is treated as gone. Voiding an
            # authorization costs an apology; capturing for a watch we cannot buy
            # costs the watch.
            return False
        est = (payload or {}).get("estimatedAvailabilities") or [{}]
        status = est[0].get("estimatedAvailabilityStatus", "OUT_OF_STOCK")
        return status in ("IN_STOCK", "LIMITED_STOCK")


def _parse(item: dict[str, Any]) -> Listing:
    price = float((item.get("price") or {}).get("value", 0) or 0)

    shipping = 0.0
    for opt in item.get("shippingOptions") or []:
        cost = (opt.get("shippingCost") or {}).get("value")
        if cost is not None:
            shipping = float(cost)
            break

    seller = item.get("seller") or {}
    images = []
    if item.get("image", {}).get("imageUrl"):
        images.append(item["image"]["imageUrl"])
    images += [
        img["imageUrl"] for img in (item.get("additionalImages") or []) if img.get("imageUrl")
    ]

    return Listing(
        ebay_item_id=item.get("itemId", ""),
        title=item.get("title", ""),
        price_usd=price,
        shipping_usd=shipping,
        condition=_normalise_condition(item.get("condition", "")),
        item_url=item.get("itemAffiliateWebUrl") or item.get("itemWebUrl", ""),
        image_urls=images,
        seller_username=seller.get("username", ""),
        seller_feedback_score=int(seller.get("feedbackScore", 0) or 0),
        seller_positive_pct=float(seller.get("feedbackPercentage", 0) or 0),
        item_location_country=(item.get("itemLocation") or {}).get("country", ""),
        buying_options=item.get("buyingOptions") or [],
        listed_at=item.get("itemCreationDate"),
    )


_CONDITION_MAP = {
    "new": "NEW",
    "new with tags": "NEW",
    "new without tags": "NEW",
    "new other": "NEW_OTHER",
    "open box": "NEW_OTHER",
    "certified refurbished": "EXCELLENT",
    "excellent": "EXCELLENT",
    "very good": "EXCELLENT",
    "pre-owned": "GOOD",
    "used": "GOOD",
    "good": "GOOD",
    "acceptable": "FAIR",
    "for parts or not working": "FAIR",
}


def _normalise_condition(raw: str) -> str:
    return _CONDITION_MAP.get((raw or "").strip().lower(), "GOOD")
