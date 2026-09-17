"""Replace guessed shipping constants with measured ones.

    python -m scout.fit_shipping --demo     show the report shape, no token
    python -m scout.fit_shipping            live rate sweep, emits new constants

WHAT IT DOES
------------
Quotes a real shipment at each price band we trade, across several destination zones,
then prints the fitted constants for economics.ts and economics.py plus the
contribution impact of switching.

WHY IT MATTERS MORE THAN IT SOUNDS
----------------------------------
Shipping sits on every unit, so an error in the curve is an error everywhere. The
current constants were fitted to USPS RETAIL rates because that is what is published,
and we do not pay retail. But the fix is NOT to apply an assumed discount -- "up to
90% off" is marketing, and inventing a 45% haircut would just be the same mistake in
the other direction.

So: measure it. That is the entire point of this file.
"""

from __future__ import annotations

import os
import statistics
import sys

from . import config
from .economics import compute_economics, shipping_cost
from .shipping import Address, Parcel, ShippoClient, cheapest_acceptable

#: Declared values to quote, one per band the engine trades.
BANDS = [30, 100, 300, 800, 1500, 3000, 8000]

#: Destinations sampled to average across zones. Same-state, mid, and coast-to-coast.
SAMPLE_DESTINATIONS = [
    Address("Sample One", "1 Market St", "Grand Rapids", "MI", "49503"),
    Address("Sample Two", "1 Main St", "Austin", "TX", "78701"),
    Address("Sample Three", "1 Market St", "San Francisco", "CA", "94105"),
]


def signature_for(value: float) -> str | None:
    """Mirrors the curve: none below $250, standard to $1,000, adult above."""
    if value < 250:
        return None
    return "STANDARD" if value < 1000 else "ADULT"


def max_days_for(value: float) -> int:
    """A cheap slow label on an expensive watch is a dispute waiting to happen."""
    return 5 if value < 1000 else 3


def sweep(client: ShippoClient, origin: Address, parcel: Parcel) -> dict[int, float]:
    """Median real quote per band, across the sampled zones."""
    fitted: dict[int, float] = {}
    for value in BANDS:
        quotes: list[float] = []
        for dest in SAMPLE_DESTINATIONS:
            try:
                rates = client.rates(
                    origin, dest, parcel,
                    declared_value_usd=value, signature=signature_for(value),
                )
            except Exception as exc:
                print(f"  ! {value:>6} -> {dest.state}: {exc}", file=sys.stderr)
                continue
            best = cheapest_acceptable(rates, max_days=max_days_for(value))
            if best:
                quotes.append(best.total_usd)
                print(f"  {value:>6} -> {dest.state}: ${best.total_usd:>7.2f}  "
                      f"{best.provider} {best.service}")
        if quotes:
            fitted[value] = round(statistics.median(quotes), 2)
    return fitted


def _demo_quotes() -> dict[int, float]:
    """Illustrative only. Real numbers replace these; do not copy them into config."""
    return {30: 6.10, 100: 6.85, 300: 12.40, 800: 15.90,
            1500: 24.30, 3000: 31.75, 8000: 68.20}


def report(fitted: dict[int, float], cfg) -> str:
    lines = [
        "SHIPPING CURVE — measured vs modelled",
        "=" * 70,
        f"{'band':>8} {'modelled':>10} {'measured':>10} {'delta':>9}   contribution effect",
        "-" * 70,
    ]
    deltas: list[float] = []
    for value, measured in sorted(fitted.items()):
        modelled = shipping_cost(value, cfg.pricing)
        delta = modelled - measured
        deltas.append(delta)
        source = value * 0.75
        before = compute_economics(source, value, cfg.pricing).contribution_usd
        after = before + delta
        lines.append(
            f"{value:>8} {modelled:>10.2f} {measured:>10.2f} {delta:>+9.2f}   "
            f"${before:>8.2f} -> ${after:>8.2f}"
        )

    median_delta = statistics.median(deltas) if deltas else 0.0
    lines += [
        "-" * 70,
        f"median per-unit delta: ${median_delta:+.2f}",
        "",
    ]
    if median_delta > 0:
        lines.append(
            f"The modelled curve OVERSTATES shipping by ~${median_delta:.2f}/unit. "
            "Every deal is better than the engine currently believes."
        )
    elif median_delta < 0:
        lines.append(
            f"The modelled curve UNDERSTATES shipping by ~${abs(median_delta):.2f}/unit. "
            "The engine has been approving deals that are thinner than it thought — "
            "fix this before spending."
        )
    else:
        lines.append("Modelled and measured agree. Leave it alone.")
    return "\n".join(lines)


def emit_constants(fitted: dict[int, float]) -> str:
    """Curve constants, derived from the measured points.

    The curve shape stays -- postage by service level, signature, insurance above the
    included $100 -- because it reflects how carriers actually price. Only the
    magnitudes are re-fitted.
    """
    def at(band: int, default: float) -> float:
        return fitted.get(band, default)

    ground = at(30, 8.5)
    priority = max(at(300, 11.0) - 2.65, ground)
    express = max(at(1500, 28.0) - 12.6, priority)
    registered = max(at(8000, 45.0) - 40.0, express)
    per100 = round(max((at(800, 20.0) - at(300, 12.0)) / 5.0, 0.25), 2)

    return "\n".join([
        "// packages/core/src/economics.ts — measured, not assumed",
        "export const DEFAULT_SHIPPING: ShippingCurve = {",
        f"  groundAdvantageUsd: {ground:.2f},",
        f"  priorityUsd: {priority:.2f},",
        f"  priorityExpressUsd: {express:.2f},",
        f"  registeredUsd: {registered:.2f},",
        "  signatureConfirmationUsd: 4.15,",
        "  adultSignatureUsd: 10.05,",
        "  includedInsuranceUsd: 100,",
        "  insuranceBaseUsd: 2.65,",
        f"  insurancePer100Usd: {per100:.2f},",
        "  registeredThresholdUsd: 5000,",
        "  registeredRatePct: 0.005,",
        "};",
        "",
        "# services/scout/scout/config.py — keep both engines in step",
        f"    ground_advantage_usd: float = {ground:.2f}",
        f"    priority_usd: float = {priority:.2f}",
        f"    priority_express_usd: float = {express:.2f}",
        f"    registered_usd: float = {registered:.2f}",
        f"    insurance_per_100_usd: float = {per100:.2f}",
    ])


def run(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    cfg = config.load()

    if "--demo" in argv:
        print("(demo numbers — illustrative only, do NOT copy into config)\n")
        fitted = _demo_quotes()
    else:
        client = ShippoClient()
        if not client.configured:
            print("SHIPPO_API_TOKEN is not set.", file=sys.stderr)
            print("Get one free at goshippo.com (Starter: 30 labels/month, no card).",
                  file=sys.stderr)
            print("Then: export SHIPPO_API_TOKEN=shippo_live_... "
                  "(or shippo_test_... to dry-run)", file=sys.stderr)
            print("\nMeanwhile: --demo shows the report shape.", file=sys.stderr)
            return 1

        origin = _origin_from_env()
        if origin is None:
            print("Set the origin address so quotes reflect your actual zone:",
                  file=sys.stderr)
            print("  SHIP_FROM_NAME, SHIP_FROM_STREET, SHIP_FROM_CITY, "
                  "SHIP_FROM_STATE, SHIP_FROM_ZIP", file=sys.stderr)
            return 1

        parcel = Parcel(
            length_in=float(os.environ.get("PARCEL_LENGTH_IN", 8)),
            width_in=float(os.environ.get("PARCEL_WIDTH_IN", 6)),
            height_in=float(os.environ.get("PARCEL_HEIGHT_IN", 4)),
            weight_lb=float(os.environ.get("PARCEL_WEIGHT_LB", 1.5)),
        )
        print(f"Quoting {parcel.weight_lb} lb, "
              f"{parcel.length_in}x{parcel.width_in}x{parcel.height_in} in, "
              f"from {origin.city} {origin.state} {origin.zip}\n")
        fitted = sweep(client, origin, parcel)
        if not fitted:
            print("No quotes returned. Check the token and the origin address.",
                  file=sys.stderr)
            return 1
        print()

    print(report(fitted, cfg))
    print()
    print("PROPOSED CONSTANTS")
    print("=" * 70)
    print(emit_constants(fitted))
    print()
    print("Change BOTH engines together, then run both test suites — the Python")
    print("tests assert the same worked examples as the TypeScript ones.")
    return 0


def _origin_from_env() -> Address | None:
    required = ["SHIP_FROM_STREET", "SHIP_FROM_CITY", "SHIP_FROM_STATE", "SHIP_FROM_ZIP"]
    if not all(os.environ.get(k) for k in required):
        return None
    return Address(
        name=os.environ.get("SHIP_FROM_NAME", "Gleason Timepiece"),
        street1=os.environ["SHIP_FROM_STREET"],
        city=os.environ["SHIP_FROM_CITY"],
        state=os.environ["SHIP_FROM_STATE"],
        zip=os.environ["SHIP_FROM_ZIP"],
        phone=os.environ.get("SHIP_FROM_PHONE", ""),
        email=os.environ.get("SHIP_FROM_EMAIL", ""),
    )


if __name__ == "__main__":
    sys.exit(run())
