"""Tests for shadow mode calibration."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scout.shadow import (  # noqa: E402
    Outcome,
    ShadowDecision,
    calibration_report,
    score_comps,
    score_gates,
)


def decision(item: str, *, estimate: float, landed: float, passed: bool = True,
             gates: list[str] | None = None) -> ShadowDecision:
    return ShadowDecision(
        captured_at="2026-09-01T00:00:00+00:00",
        ebay_item_id=item,
        model_id="m1",
        title="test watch",
        landed_source_usd=landed,
        market_estimate_usd=estimate,
        comp_confidence=0.9,
        comp_sample_size=20,
        liquidity_qualified=True,
        list_price_usd=estimate * 0.9,
        max_bid_usd=estimate * 0.8,
        projected_contribution_usd=estimate * 0.9 - landed,
        contribution_per_hour_usd=100.0,
        discount_to_market_pct=(estimate - landed) / estimate,
        passed=passed,
        gates_failed=gates or [],
    )


class TestCompAccuracy(unittest.TestCase):
    def test_reports_nothing_useful_until_sales_resolve(self):
        r = score_comps([decision("a", estimate=1000, landed=700)], {})
        self.assertEqual(r.sample_size, 0)
        self.assertIn("no resolved sales", r.verdict)

    def test_accurate_comps_are_called_trustworthy(self):
        decisions = [decision(f"i{n}", estimate=1000, landed=700) for n in range(10)]
        outcomes = {f"i{n}": Outcome(f"i{n}", True, 1020.0) for n in range(10)}
        r = score_comps(decisions, outcomes)
        self.assertLess(r.median_abs_pct_error, 0.05)
        self.assertIn("trustworthy", r.verdict)

    def test_detects_systematic_overvaluation(self):
        # We say $1,000; they sell for $800. We are 25% high, every time.
        decisions = [decision(f"i{n}", estimate=1000, landed=600) for n in range(10)]
        outcomes = {f"i{n}": Outcome(f"i{n}", True, 800.0) for n in range(10)}
        r = score_comps(decisions, outcomes)
        self.assertGreater(r.median_signed_pct_error, 0.2)
        self.assertIn("OVERvalue", r.verdict)
        self.assertIn("NOT reliable", r.verdict)

    def test_detects_systematic_undervaluation(self):
        decisions = [decision(f"i{n}", estimate=800, landed=500) for n in range(10)]
        outcomes = {f"i{n}": Outcome(f"i{n}", True, 1000.0) for n in range(10)}
        r = score_comps(decisions, outcomes)
        self.assertLess(r.median_signed_pct_error, -0.1)
        self.assertIn("UNDERvalue", r.verdict)

    def test_unsold_listings_are_excluded(self):
        decisions = [decision("a", estimate=1000, landed=700),
                     decision("b", estimate=1000, landed=700)]
        outcomes = {"a": Outcome("a", True, 1000.0), "b": Outcome("b", False)}
        self.assertEqual(score_comps(decisions, outcomes).sample_size, 1)


class TestGateScoring(unittest.TestCase):
    def test_flags_gates_that_are_too_loose(self):
        # Every pass turns out to lose money once the real price is known.
        decisions = [decision(f"i{n}", estimate=1000, landed=980) for n in range(10)]
        outcomes = {f"i{n}": Outcome(f"i{n}", True, 1000.0) for n in range(10)}
        r = score_gates(decisions, outcomes)
        self.assertEqual(r.passed_and_profitable, 0)
        self.assertIn("TOO LOOSE", r.verdict)

    def test_flags_gates_that_are_too_tight(self):
        # Rejections that would each have cleared good money.
        decisions = [
            decision(f"i{n}", estimate=1000, landed=500, passed=False,
                     gates=["DISCOUNT_TO_MARKET"])
            for n in range(8)
        ] + [decision("good", estimate=1000, landed=600)]
        outcomes = {d.ebay_item_id: Outcome(d.ebay_item_id, True, 1000.0) for d in decisions}
        r = score_gates(decisions, outcomes)
        self.assertEqual(r.missed_opportunities, 8)
        self.assertGreater(r.forgone_contribution_usd, 3000)
        self.assertIn("TOO TIGHT", r.verdict)
        self.assertIn("DISCOUNT_TO_MARKET", r.verdict)

    def test_names_the_gate_responsible_for_the_misses(self):
        decisions = [
            decision("a", estimate=1000, landed=500, passed=False, gates=["MARGIN"]),
            decision("b", estimate=1000, landed=500, passed=False, gates=["MARGIN"]),
            decision("c", estimate=1000, landed=500, passed=False, gates=["SELLER_QUALITY"]),
        ]
        outcomes = {d.ebay_item_id: Outcome(d.ebay_item_id, True, 1000.0) for d in decisions}
        r = score_gates(decisions, outcomes)
        self.assertEqual(r.missed_by_gate["MARGIN"], 2)
        self.assertEqual(r.missed_by_gate["SELLER_QUALITY"], 1)

    def test_well_set_gates_are_left_alone(self):
        decisions = [decision(f"g{n}", estimate=1000, landed=600) for n in range(10)]
        decisions += [
            decision(f"b{n}", estimate=1000, landed=950, passed=False, gates=["MARGIN"])
            for n in range(5)
        ]
        outcomes = {d.ebay_item_id: Outcome(d.ebay_item_id, True, 1000.0) for d in decisions}
        r = score_gates(decisions, outcomes)
        self.assertEqual(r.passed_and_profitable, 10)
        self.assertEqual(r.missed_opportunities, 0)
        self.assertIn("well set", r.verdict)


class TestReport(unittest.TestCase):
    def test_renders_both_halves(self):
        decisions = [decision(f"i{n}", estimate=1000, landed=700) for n in range(5)]
        outcomes = {f"i{n}": Outcome(f"i{n}", True, 1010.0) for n in range(5)}
        text = calibration_report(decisions, outcomes)
        self.assertIn("COMP ACCURACY", text)
        self.assertIn("GATES", text)
        self.assertIn("decisions recorded : 5", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
