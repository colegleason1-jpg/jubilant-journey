"""Recorded eBay responses, so the whole pipeline runs without credentials.

Two jobs:

  1. Let anyone clone this repo and watch a full scan execute end to end before
     signing up for anything. If the pipeline only runs with live secrets, nobody
     ever runs it.
  2. Give the deal engine a stable input so a threshold change can be evaluated
     against a fixed set of candidates rather than whatever eBay happens to be
     showing that minute.

Fixtures are shaped exactly like Browse API `itemSummaries` entries. When you start
running live, `--record` writes real responses here and they become regression
inputs.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

FIXTURE_DIR = pathlib.Path(__file__).resolve().parents[1] / "fixtures"


def _item(
    item_id: str,
    title: str,
    price: float,
    *,
    shipping: float = 0.0,
    condition: str = "Pre-owned",
    feedback: int = 480,
    positive: float = 99.6,
    country: str = "US",
    images: int = 6,
    best_offer: bool = False,
) -> dict[str, Any]:
    options = ["FIXED_PRICE"] + (["BEST_OFFER"] if best_offer else [])
    return {
        "itemId": item_id,
        "title": title,
        "price": {"value": f"{price:.2f}", "currency": "USD"},
        "shippingOptions": [
            {"shippingCost": {"value": f"{shipping:.2f}", "currency": "USD"}}
        ],
        "condition": condition,
        "itemWebUrl": f"https://www.ebay.com/itm/{item_id}",
        "image": {"imageUrl": "https://i.ebayimg.com/images/g/fixture/s-l1600.jpg"},
        "additionalImages": [
            {"imageUrl": f"https://i.ebayimg.com/images/g/fix{n}/s-l1600.jpg"}
            for n in range(max(0, images - 1))
        ],
        "seller": {
            "username": "fixture_seller",
            "feedbackScore": feedback,
            "feedbackPercentage": f"{positive}",
        },
        "itemLocation": {"country": country},
        "buyingOptions": options,
        "itemCreationDate": "2026-09-15T12:00:00.000Z",
    }


#: A deliberately mixed batch: a few real deals, and a lot of the noise the gates
#: exist to reject. Market price for this reference is treated as $1,150.
LONGINES_HYDROCONQUEST: list[dict[str, Any]] = [
    # Should pass: well under market, good seller, clean title.
    _item("v1|fixture-001|0", "Longines HydroConquest 41mm Automatic L3.781.4 Blue", 795.0, best_offer=True),
    # Should pass, but shipping eats into it.
    _item("v1|fixture-002|0", "Longines HydroConquest 41mm Ceramic Bezel Blue Dial", 780.0, shipping=45.0),
    # Too close to market — no room.
    _item("v1|fixture-003|0", "Longines HydroConquest 41mm Automatic Box & Papers", 1075.0),
    # Too good to be true — a 55% discount is a warning, not a win.
    _item("v1|fixture-004|0", "Longines HydroConquest 41mm BLUE DIAL AUTOMATIC", 515.0),
    # Blocklisted title.
    _item("v1|fixture-005|0", "Longines HydroConquest homage - for parts or repair", 610.0),
    # Seller with no track record.
    _item("v1|fixture-006|0", "Longines HydroConquest 41mm Automatic", 820.0, feedback=4, positive=88.0),
    # Not US.
    _item("v1|fixture-007|0", "Longines HydroConquest 41mm Automatic Blue", 760.0, country="HK"),
    # Thin photography — passes, but warns.
    _item("v1|fixture-008|0", "Longines HydroConquest 41mm L3.781.4", 830.0, images=2),
]

SEIKO_ALPINIST: list[dict[str, Any]] = [
    _item("v1|fixture-101|0", "Seiko Alpinist SPB121 Green Dial Automatic", 430.0, best_offer=True),
    _item("v1|fixture-102|0", "Seiko Alpinist SPB121J1 Green Sunburst", 520.0),
    _item("v1|fixture-103|0", "Seiko Alpinist SARB017 Discontinued Green", 395.0, shipping=18.0),
]

FIXTURES: dict[str, list[dict[str, Any]]] = {
    "longines hydroconquest 41": LONGINES_HYDROCONQUEST,
    "seiko alpinist spb121": SEIKO_ALPINIST,
}

#: Market prices the fixture scan assumes, standing in for comp_snapshots.
FIXTURE_MARKET_PRICES: dict[str, float] = {
    "longines-hydroconquest-41": 1150.0,
    "seiko-alpinist-spb121": 620.0,
}

FIXTURE_MODELS: list[dict[str, Any]] = [
    {
        "id": "longines-hydroconquest-41",
        "brand": "Longines",
        "reference": "L3.781.4",
        "nickname": "HydroConquest 41mm",
        "ebay_queries": ["longines hydroconquest 41"],
    },
    {
        "id": "seiko-alpinist-spb121",
        "brand": "Seiko",
        "reference": "SPB121",
        "nickname": "Alpinist",
        "ebay_queries": ["seiko alpinist spb121"],
    },
]


def load(query: str) -> list[dict[str, Any]]:
    """Recorded response for a query. Falls back to an on-disk file if present."""
    key = query.strip().lower()
    if key in FIXTURES:
        return FIXTURES[key]

    path = FIXTURE_DIR / f"{key.replace(' ', '_')}.json"
    if path.exists():
        return json.loads(path.read_text()).get("itemSummaries", [])
    return []


def record(query: str, payload: dict[str, Any]) -> pathlib.Path:
    """Persist a live response so it becomes a regression input."""
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    path = FIXTURE_DIR / f"{query.strip().lower().replace(' ', '_')}.json"
    path.write_text(json.dumps(payload, indent=2))
    return path
