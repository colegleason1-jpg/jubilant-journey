"""Grade the model against what actually happened.

    python -m scout.calibrate            read from Supabase, print the report
    python -m scout.calibrate --demo     run against a worked example

Run this after three weeks of shadow mode, then again monthly. It answers two
questions, in order of importance:

    1. Is the market estimate right? If not, nothing downstream can be tuned,
       because every gate is measured against that number.
    2. Are the gates passing the right things, and — the half that is easy to
       miss — rejecting the right things?

A gate that is too tight produces no error and no alert. It produces a quiet month
that looks like bad luck. The only way to see it is to check what the rejections went
on to sell for.
"""

from __future__ import annotations

import sys

from . import config, shadow
from .db import Db

#: PostgREST caps a response at 1,000 rows by default; page at that size.
_PAGE = 1000


def _load_from_db(cfg) -> tuple[list[shadow.ShadowDecision], dict[str, shadow.Outcome]]:
    db = Db(cfg)
    # Page through every decision. This used to be a single
    # `order=captured_at.desc&limit=5000`, which silently took the NEWEST 5,000 rows
    # -- so a three-week report covered only its tail, and said nothing about the
    # truncation. The scanner re-records its best candidate per model on every run,
    # so the row count runs well past 5,000 within days. shadow.py groups these to
    # one decision per listing; this function's job is just to not lose any.
    rows: list[dict] = []
    page = 0
    while True:
        batch = db.select(
            "shadow_decisions",
            f"select=*&order=captured_at.asc&limit={_PAGE}&offset={page * _PAGE}",
        )
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        page += 1
    decisions = [
        shadow.ShadowDecision(
            captured_at=str(r.get("captured_at")),
            ebay_item_id=r["ebay_item_id"],
            model_id=r["model_id"],
            title=r.get("title", ""),
            landed_source_usd=float(r.get("landed_source_usd") or 0),
            market_estimate_usd=float(r.get("market_estimate_usd") or 0),
            comp_confidence=float(r.get("comp_confidence") or 0),
            comp_sample_size=int(r.get("comp_sample_size") or 0),
            liquidity_qualified=bool(r.get("liquidity_qualified")),
            list_price_usd=float(r.get("list_price_usd") or 0),
            max_bid_usd=float(r.get("max_bid_usd") or 0),
            projected_contribution_usd=float(r.get("projected_contribution_usd") or 0),
            contribution_per_hour_usd=float(r.get("contribution_per_hour_usd") or 0),
            discount_to_market_pct=float(r.get("discount_to_market_pct") or 0),
            passed=bool(r.get("passed")),
            gates_failed=list(r.get("gates_failed") or []),
            rank_score=float(r.get("rank_score") or 0),
        )
        for r in rows
    ]

    outcome_rows: list[dict] = []
    page = 0
    while True:
        batch = db.select("shadow_outcomes", f"select=*&limit={_PAGE}&offset={page * _PAGE}")
        outcome_rows.extend(batch)
        if len(batch) < _PAGE:
            break
        page += 1
    outcomes = {
        r["ebay_item_id"]: shadow.Outcome(
            ebay_item_id=r["ebay_item_id"],
            sold=bool(r.get("sold")),
            sold_price_usd=float(r["sold_price_usd"]) if r.get("sold_price_usd") else None,
            days_to_sell=r.get("days_to_sell"),
        )
        for r in outcome_rows
    }
    return decisions, outcomes


def _demo() -> tuple[list[shadow.ShadowDecision], dict[str, shadow.Outcome]]:
    """A worked example showing what a biased comp engine looks like in the report."""
    def d(item, estimate, landed, passed=True, gates=None):
        return shadow.ShadowDecision(
            captured_at="2026-09-01T00:00:00+00:00", ebay_item_id=item, model_id="demo",
            title=f"demo watch {item}", landed_source_usd=landed,
            market_estimate_usd=estimate, comp_confidence=0.85, comp_sample_size=18,
            liquidity_qualified=True, list_price_usd=estimate * 0.9,
            max_bid_usd=estimate * 0.8, projected_contribution_usd=estimate * 0.9 - landed,
            contribution_per_hour_usd=120.0,
            discount_to_market_pct=(estimate - landed) / estimate,
            passed=passed, gates_failed=gates or [],
        )

    decisions = [d(f"p{n}", 1150, 800) for n in range(6)]
    # The rejects landed at $900 until the grader started subtracting real costs.
    # Against a $1,050 sale that is +$45 each by the old `sold * 0.90 - landed`
    # formula, and -$14.03 each once shipping, the rail fee and packaging come out.
    # So the demo used to report "5 profitable rejects worth $225, gates are TOO
    # TIGHT" about five deals that each LOST money -- advice to loosen the gates,
    # derived entirely from costs the grader forgot. $820 is a reject that is
    # genuinely profitable (+$65.97 net), which is what the demo means to show.
    decisions += [d(f"r{n}", 1150, 820, passed=False, gates=["DISCOUNT_TO_MARKET"])
                  for n in range(5)]
    # Reality: they sell for ~$1,050, not $1,150. We are ~10% high.
    outcomes = {dd.ebay_item_id: shadow.Outcome(dd.ebay_item_id, True, 1050.0)
                for dd in decisions}
    return decisions, outcomes


def run(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]

    if "--demo" in argv:
        decisions, outcomes = _demo()
        print("(demo data — a comp engine running ~10% high, and a gate set too tight)\n")
    else:
        cfg = config.load()
        missing = cfg.secrets.missing()
        if missing:
            print(f"::error::missing secrets: {', '.join(missing)}", file=sys.stderr)
            print("hint: --demo shows the report shape without credentials", file=sys.stderr)
            return 1
        decisions, outcomes = _load_from_db(cfg)

    if not decisions:
        print("No shadow decisions recorded yet. Run: python -m scout.main --shadow")
        return 0

    print(shadow.calibration_report(decisions, outcomes))

    pending = sum(1 for d in decisions if d.ebay_item_id not in outcomes)
    if pending:
        print(f"{pending} decisions still awaiting an outcome.")
        print("Fill shadow_outcomes for those listings — the report is only as good")
        print("as the share of decisions that have resolved.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
