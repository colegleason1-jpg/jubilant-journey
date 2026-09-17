"""Shippo client — real carrier rates, and label purchase.

WHY THIS EXISTS
---------------
The shipping curve in economics.py was fitted to USPS RETAIL rates, because that is
what is published. We do not pay retail. Shippo gives discounted commercial rates
with no minimum volume, and shipping sits on every single unit, so the curve being
wrong is wrong everywhere at once.

That makes it exactly the mistake CLAUDE.md is about: a number reasoned toward rather
than measured. "Up to 90% off" is Shippo's marketing; the real discount for a
low-volume account is closer to USPS Commercial Pricing. So this module does not
assume a discount. It fetches actual quotes and `fit_shipping.py` turns them into
curve constants.

Until real quotes exist, economics.py keeps the retail numbers, which understate
contribution. Conservative in the right direction.

COST
----
Free to 30 labels/month, then $0.05/label. At our volume the integration is free.

API
---
    POST /shipments/     address_from + address_to + parcel -> list of rates
    POST /transactions/  a chosen rate object_id -> a label
    Auth: `Authorization: ShippoToken <token>`
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from .http import request

SHIPPO_BASE = "https://api.goshippo.com"


@dataclass(frozen=True)
class Parcel:
    """A packed watch.

    Two presets, because they price very differently and averaging them overstates
    cost on the band where a few dollars is most of the contribution:

        ENVELOPE  under $50 -- padded mailer, under 8oz
        BOX       $50 and up -- travel case, boxed, inside an outer box with padding,
                  which is what the intake SOP specifies

    Dimensions and zone drive most of the price; weight matters less than expected
    below a pound.
    """

    length_in: float = 8.0
    width_in: float = 6.0
    height_in: float = 4.0
    weight_lb: float = 1.5

    def to_payload(self) -> dict[str, Any]:
        return {
            "length": str(self.length_in),
            "width": str(self.width_in),
            "height": str(self.height_in),
            "distance_unit": "in",
            "weight": str(self.weight_lb),
            "mass_unit": "lb",
        }


#: Padded mailer for cheap watches.
ENVELOPE = Parcel(length_in=9.0, width_in=6.0, height_in=1.0, weight_lb=0.5)

#: Boxed watch: travel case, bubble, inner box, outer box.
BOX = Parcel(length_in=8.0, width_in=6.0, height_in=4.0, weight_lb=1.5)

#: Declared value at or above which we box rather than use a mailer.
ENVELOPE_THRESHOLD_USD = 50.0


def parcel_for(declared_value_usd: float) -> Parcel:
    """Mirrors the curve in economics.py -- envelope below $50, box above."""
    return ENVELOPE if declared_value_usd < ENVELOPE_THRESHOLD_USD else BOX


@dataclass(frozen=True)
class Address:
    name: str
    street1: str
    city: str
    state: str
    zip: str
    country: str = "US"
    phone: str = ""
    email: str = ""

    def to_payload(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "street1": self.street1,
            "city": self.city,
            "state": self.state,
            "zip": self.zip,
            "country": self.country,
            "phone": self.phone,
            "email": self.email,
        }


@dataclass(frozen=True)
class Rate:
    provider: str
    service: str
    amount_usd: float
    estimated_days: int | None
    rate_id: str
    #: What the declared-value insurance added, when requested.
    insurance_usd: float = 0.0

    @property
    def total_usd(self) -> float:
        return round(self.amount_usd + self.insurance_usd, 2)


@dataclass
class ShippoClient:
    token: str = field(default_factory=lambda: os.environ.get("SHIPPO_API_TOKEN", ""))
    timeout: float = 20.0

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"ShippoToken {self.token}",
            "Content-Type": "application/json",
        }

    def rates(
        self,
        address_from: Address,
        address_to: Address,
        parcel: Parcel,
        *,
        declared_value_usd: float | None = None,
        signature: str | None = None,
    ) -> list[Rate]:
        """Quote a shipment.

        `signature` is "STANDARD" or "ADULT". `declared_value_usd` requests insurance
        -- carrier liability on watches is otherwise near useless, so for anything we
        actually ship this should always be set.
        """
        extra: dict[str, Any] = {}
        if signature:
            extra["signature_confirmation"] = signature
        if declared_value_usd:
            extra["insurance"] = {
                "amount": f"{declared_value_usd:.2f}",
                "currency": "USD",
                "content": "Wristwatch",
            }

        payload: dict[str, Any] = {
            "address_from": address_from.to_payload(),
            "address_to": address_to.to_payload(),
            "parcels": [parcel.to_payload()],
            "async": False,
        }
        if extra:
            payload["extra"] = extra

        body = request(
            f"{SHIPPO_BASE}/shipments/",
            method="POST",
            headers=self._headers(),
            json_body=payload,
            timeout=self.timeout,
        )
        return [_parse_rate(r) for r in (body or {}).get("rates", [])]

    def buy_label(self, rate_id: str, *, label_format: str = "PDF_4x6") -> dict[str, Any]:
        """Purchase a label for a quoted rate.

        Deliberately takes a rate_id rather than re-quoting: the price you were shown
        is the price you buy, with no chance of a silent change between the two.
        """
        return request(
            f"{SHIPPO_BASE}/transactions/",
            method="POST",
            headers=self._headers(),
            json_body={"rate": rate_id, "label_file_type": label_format, "async": False},
            timeout=self.timeout,
        )


def _parse_rate(raw: dict[str, Any]) -> Rate:
    service = (raw.get("servicelevel") or {}).get("name", raw.get("servicelevel_name", ""))
    insurance = 0.0
    for line in raw.get("included_insurance_price", []) or []:
        try:
            insurance += float(line)
        except (TypeError, ValueError):
            pass
    return Rate(
        provider=raw.get("provider", ""),
        service=service,
        amount_usd=float(raw.get("amount", 0) or 0),
        estimated_days=raw.get("estimated_days"),
        rate_id=raw.get("object_id", ""),
        insurance_usd=insurance,
    )


def cheapest_acceptable(rates: list[Rate], *, max_days: int | None = None) -> Rate | None:
    """Cheapest rate that still arrives in time.

    Not simply the cheapest: a watch crawling across the country for nine days is how
    "item not received" disputes start, and the few dollars saved are not worth it.
    """
    usable = [
        r
        for r in rates
        if r.amount_usd > 0
        and (max_days is None or r.estimated_days is None or r.estimated_days <= max_days)
    ]
    return min(usable, key=lambda r: r.total_usd) if usable else None
