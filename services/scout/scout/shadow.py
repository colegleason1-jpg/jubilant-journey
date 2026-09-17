"""Shadow mode: record what the engine WOULD have done, then grade it.

Recording alone is not the point. The point is the comparison afterwards, because
every threshold in this system is a number someone reasoned their way to rather than
measured -- the 18% discount gate, the liquidity rule, the $1 floor, the 60-day
drought window. Reasoning is how the earlier "$800 floor" and the flat margin gate
got written, and both were wrong.

So the loop is:

    1. Scan normally. Record the full decision for EVERY candidate, pass or fail.
    2. Wait. Three weeks is enough to see most of them resolve.
    3. Look up what those watches actually sold for.
    4. Score the model: were the comps accurate, and were the gates set right?
    5. Move the thresholds to where the data says, not where the argument said.

Rejections are recorded as carefully as passes. "What did we turn down, and what did
it go on to sell for" is the only way to find a gate that is too tight, and a gate
that is too tight is invisible otherwise -- it just looks like a quiet month.
"""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable


@dataclass
class ShadowDecision:
    """Everything needed to grade one decision later."""

    captured_at: str
    ebay_item_id: str
    model_id: str
    title: str
    landed_source_usd: float
    #: What we BELIEVED the watch was worth at decision time. The claim under test.
    market_estimate_usd: float
    comp_confidence: float
    comp_sample_size: int
    liquidity_qualified: bool
    list_price_usd: float
    max_bid_usd: float
    projected_contribution_usd: float
    contribution_per_hour_usd: float
    discount_to_market_pct: float
    passed: bool
    gates_failed: list[str] = field(default_factory=list)
    rank_score: float = 0.0

    def to_row(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Outcome:
    """What actually happened to that listing."""

    ebay_item_id: str
    sold: bool
    sold_price_usd: float | None = None
    days_to_sell: int | None = None


def decision_from_evaluation(ev, model_id: str, now: datetime | None = None) -> ShadowDecision:
    """Build a shadow record from a deal.Evaluation."""
    stamp = (now or datetime.now(timezone.utc)).isoformat()
    return ShadowDecision(
        captured_at=stamp,
        ebay_item_id=ev.listing.ebay_item_id,
        model_id=model_id,
        title=ev.listing.title,
        landed_source_usd=ev.listing.landed_source_usd,
        market_estimate_usd=ev.market_usd,
        comp_confidence=getattr(ev, "comp_confidence", 0.0),
        comp_sample_size=getattr(ev, "comp_sample_size", 0),
        liquidity_qualified=getattr(ev, "liquidity_qualified", True),
        list_price_usd=ev.list_usd,
        max_bid_usd=ev.max_bid_usd,
        projected_contribution_usd=ev.econ.contribution_usd,
        contribution_per_hour_usd=ev.econ.contribution_per_hour_usd,
        discount_to_market_pct=ev.discount_pct,
        passed=ev.passed,
        gates_failed=list(ev.gates_failed),
        rank_score=ev.rank_score,
    )


# ─────────────────────────────── calibration ────────────────────────────────────


@dataclass
class CompAccuracy:
    """How close our market estimate was to what things actually sold for."""

    sample_size: int
    #: Median |estimate - actual| / actual. The headline number.
    median_abs_pct_error: float
    #: Median signed error. Positive means we systematically OVERVALUE.
    median_signed_pct_error: float
    within_5pct: float
    within_10pct: float
    within_20pct: float
    verdict: str


def score_comps(
    decisions: Iterable[ShadowDecision], outcomes: dict[str, Outcome]
) -> CompAccuracy:
    """Grade the comp engine against realised sale prices.

    This is the single most important number in shadow mode. If the market estimate
    is systematically wrong, every downstream threshold is tuned against a fiction,
    and no amount of gate adjustment will fix it.
    """
    errors: list[float] = []
    signed: list[float] = []

    for d in decisions:
        o = outcomes.get(d.ebay_item_id)
        if not o or not o.sold or not o.sold_price_usd:
            continue
        if o.sold_price_usd <= 0:
            continue
        err = (d.market_estimate_usd - o.sold_price_usd) / o.sold_price_usd
        signed.append(err)
        errors.append(abs(err))

    if not errors:
        return CompAccuracy(0, 0.0, 0.0, 0.0, 0.0, 0.0, "no resolved sales yet")

    median_abs = statistics.median(errors)
    median_signed = statistics.median(signed)
    within = lambda t: round(sum(1 for e in errors if e <= t) / len(errors), 3)  # noqa: E731

    if median_abs <= 0.05:
        verdict = "comps are trustworthy — tune gates against them"
    elif median_abs <= 0.12:
        verdict = "comps are usable but loose — widen the margin floor to absorb the error"
    else:
        verdict = (
            "comps are NOT reliable — fix the comp engine before trusting any gate. "
            "A threshold tuned against a bad estimate is tuned against nothing."
        )
    if abs(median_signed) > 0.05:
        direction = "OVER" if median_signed > 0 else "UNDER"
        verdict += f" Systematic bias: we {direction}value by {abs(median_signed) * 100:.1f}%."

    return CompAccuracy(
        sample_size=len(errors),
        median_abs_pct_error=round(median_abs, 4),
        median_signed_pct_error=round(median_signed, 4),
        within_5pct=within(0.05),
        within_10pct=within(0.10),
        within_20pct=within(0.20),
        verdict=verdict,
    )


@dataclass
class GateReport:
    """Did the gates let through the right things, and reject the right things?"""

    passed_count: int
    rejected_count: int
    #: Of the ones we PASSED that sold, how many cleared the contribution floor?
    passed_and_profitable: int
    passed_and_unprofitable: int
    #: Of the ones we REJECTED that sold, how many would have been profitable?
    missed_opportunities: int
    #: Rejections grouped by which gate stopped them, with the money left behind.
    missed_by_gate: dict[str, int]
    forgone_contribution_usd: float
    verdict: str


def score_gates(
    decisions: Iterable[ShadowDecision],
    outcomes: dict[str, Outcome],
    min_contribution_usd: float = 1.0,
) -> GateReport:
    """Grade the gates.

    The interesting half is the rejections. A gate that is too tight produces no
    error, no alert and no evidence -- it just produces a quiet month that looks like
    bad luck. The only way to see it is to check what the rejected listings went on
    to sell for.
    """
    decisions = list(decisions)
    passed_profitable = passed_unprofitable = missed = 0
    missed_by_gate: dict[str, int] = {}
    forgone = 0.0

    for d in decisions:
        o = outcomes.get(d.ebay_item_id)
        if not o or not o.sold or not o.sold_price_usd:
            continue

        # What we'd actually have cleared, using the realised price as the market.
        realised_list = o.sold_price_usd * (1 - 0.10)
        realised_contribution = realised_list - d.landed_source_usd

        if d.passed:
            if realised_contribution >= min_contribution_usd:
                passed_profitable += 1
            else:
                passed_unprofitable += 1
        elif realised_contribution >= min_contribution_usd:
            missed += 1
            forgone += realised_contribution
            for gate in d.gates_failed:
                missed_by_gate[gate] = missed_by_gate.get(gate, 0) + 1

    passed_count = sum(1 for d in decisions if d.passed)
    rejected_count = len(decisions) - passed_count

    graded = passed_profitable + passed_unprofitable
    precision = passed_profitable / graded if graded else 0.0

    if graded == 0:
        verdict = "no graded passes yet"
    elif precision >= 0.9 and missed <= graded * 0.5:
        verdict = "gates are well set"
    elif precision < 0.7:
        verdict = (
            f"gates are TOO LOOSE — {passed_unprofitable} of {graded} passes would "
            "have lost money. Raise the contribution floor or the discount gate."
        )
    else:
        verdict = (
            f"gates are TOO TIGHT — rejected {missed} profitable listings worth "
            f"${forgone:,.0f}. Check which gate: {_top_gate(missed_by_gate)}."
        )

    return GateReport(
        passed_count=passed_count,
        rejected_count=rejected_count,
        passed_and_profitable=passed_profitable,
        passed_and_unprofitable=passed_unprofitable,
        missed_opportunities=missed,
        missed_by_gate=dict(sorted(missed_by_gate.items(), key=lambda kv: -kv[1])),
        forgone_contribution_usd=round(forgone, 2),
        verdict=verdict,
    )


def _top_gate(missed_by_gate: dict[str, int]) -> str:
    if not missed_by_gate:
        return "none"
    gate, count = max(missed_by_gate.items(), key=lambda kv: kv[1])
    return f"{gate} blocked {count}"


def calibration_report(
    decisions: Iterable[ShadowDecision],
    outcomes: dict[str, Outcome],
    min_contribution_usd: float = 1.0,
) -> str:
    """The thing you read after three weeks of shadow mode."""
    decisions = list(decisions)
    comps = score_comps(decisions, outcomes)
    gates = score_gates(decisions, outcomes, min_contribution_usd)
    resolved = sum(1 for d in decisions if outcomes.get(d.ebay_item_id, Outcome("", False)).sold)

    lines = [
        "SHADOW MODE CALIBRATION",
        "=" * 64,
        f"decisions recorded : {len(decisions)}",
        f"resolved (sold)    : {resolved}",
        "",
        "COMP ACCURACY  — is our market estimate right?",
        "-" * 64,
        f"  sample              : {comps.sample_size}",
        f"  median abs error    : {comps.median_abs_pct_error * 100:.1f}%",
        f"  median signed error : {comps.median_signed_pct_error * 100:+.1f}%",
        f"  within 5/10/20%     : {comps.within_5pct:.0%} / {comps.within_10pct:.0%} / {comps.within_20pct:.0%}",
        f"  -> {comps.verdict}",
        "",
        "GATES  — are we passing the right things?",
        "-" * 64,
        f"  passed / rejected   : {gates.passed_count} / {gates.rejected_count}",
        f"  passes profitable   : {gates.passed_and_profitable}",
        f"  passes unprofitable : {gates.passed_and_unprofitable}",
        f"  profitable rejects  : {gates.missed_opportunities}  (${gates.forgone_contribution_usd:,.2f} left behind)",
    ]
    if gates.missed_by_gate:
        lines.append(f"  blocked by          : {gates.missed_by_gate}")
    lines += [f"  -> {gates.verdict}", ""]
    return "\n".join(lines)
