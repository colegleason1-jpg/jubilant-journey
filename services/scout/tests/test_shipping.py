"""Tests for the Shippo client and the curve-fitting tool."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scout import config  # noqa: E402
from scout.fit_shipping import emit_constants, max_days_for, report, signature_for  # noqa: E402
from scout.shipping import (  # noqa: E402
    Address,
    Parcel,
    Rate,
    ShippoClient,
    _parse_rate,
    cheapest_acceptable,
)


class TestParcelAndAddress(unittest.TestCase):
    def test_parcel_defaults_describe_a_boxed_watch(self):
        p = Parcel()
        self.assertEqual(p.weight_lb, 1.5)
        payload = p.to_payload()
        self.assertEqual(payload["distance_unit"], "in")
        self.assertEqual(payload["mass_unit"], "lb")

    def test_address_payload_has_what_shippo_needs(self):
        a = Address("Test", "1 Main St", "Rockford", "MI", "49341")
        for key in ("name", "street1", "city", "state", "zip", "country"):
            self.assertIn(key, a.to_payload())


class TestRateParsing(unittest.TestCase):
    def test_parses_a_shippo_rate(self):
        r = _parse_rate({
            "provider": "USPS",
            "servicelevel": {"name": "Priority Mail"},
            "amount": "11.45",
            "estimated_days": 2,
            "object_id": "rate_abc",
        })
        self.assertEqual(r.provider, "USPS")
        self.assertEqual(r.service, "Priority Mail")
        self.assertEqual(r.amount_usd, 11.45)
        self.assertEqual(r.total_usd, 11.45)

    def test_insurance_is_added_to_the_total(self):
        r = _parse_rate({
            "provider": "USPS", "servicelevel": {"name": "Priority Mail Express"},
            "amount": "28.00", "object_id": "r1",
            "included_insurance_price": ["4.50", "2.00"],
        })
        self.assertEqual(r.insurance_usd, 6.5)
        self.assertEqual(r.total_usd, 34.5)

    def test_survives_a_malformed_rate(self):
        r = _parse_rate({"object_id": "r"})
        self.assertEqual(r.amount_usd, 0.0)


class TestCheapestAcceptable(unittest.TestCase):
    def rates(self):
        return [
            Rate("USPS", "Ground Advantage", 8.10, 6, "slow"),
            Rate("USPS", "Priority Mail", 12.40, 2, "mid"),
            Rate("UPS", "Next Day Air", 68.00, 1, "fast"),
        ]

    def test_picks_the_cheapest_when_speed_does_not_matter(self):
        self.assertEqual(cheapest_acceptable(self.rates()).rate_id, "slow")

    def test_excludes_anything_too_slow(self):
        # A watch crawling for six days is how "item not received" disputes start.
        self.assertEqual(cheapest_acceptable(self.rates(), max_days=3).rate_id, "mid")

    def test_returns_none_when_nothing_qualifies(self):
        self.assertIsNone(cheapest_acceptable(self.rates(), max_days=0))
        self.assertIsNone(cheapest_acceptable([]))

    def test_ignores_zero_priced_rates(self):
        self.assertIsNone(cheapest_acceptable([Rate("X", "Y", 0.0, 1, "bad")]))

    def test_compares_on_the_insured_total_not_the_base(self):
        rates = [
            Rate("A", "cheap base", 10.0, 2, "a", insurance_usd=20.0),  # 30.00
            Rate("B", "dearer base", 15.0, 2, "b", insurance_usd=2.0),  # 17.00
        ]
        self.assertEqual(cheapest_acceptable(rates).rate_id, "b")


class TestSweepPolicy(unittest.TestCase):
    def test_signature_escalates_with_value(self):
        self.assertIsNone(signature_for(100))
        self.assertEqual(signature_for(300), "STANDARD")
        self.assertEqual(signature_for(1500), "ADULT")

    def test_expensive_watches_get_a_tighter_transit_limit(self):
        self.assertEqual(max_days_for(500), 5)
        self.assertEqual(max_days_for(2500), 3)


class TestReportAndConstants(unittest.TestCase):
    CFG = config.Config()

    def test_report_flags_an_overstated_curve(self):
        fitted = {30: 4.0, 300: 8.0, 1500: 15.0}
        text = report(fitted, self.CFG)
        self.assertIn("OVERSTATES", text)
        self.assertIn("contribution effect", text)

    def test_report_flags_an_understated_curve_as_urgent(self):
        fitted = {30: 40.0, 300: 60.0, 1500: 120.0}
        text = report(fitted, self.CFG)
        self.assertIn("UNDERSTATES", text)
        self.assertIn("before spending", text)

    def test_emits_constants_for_both_engines(self):
        out = emit_constants({30: 6.10, 300: 12.40, 800: 15.90, 1500: 24.30, 8000: 68.20})
        self.assertIn("DEFAULT_SHIPPING", out)
        self.assertIn("groundAdvantageUsd: 6.10", out)
        self.assertIn("ground_advantage_usd", out)

    def test_constants_stay_monotonic_by_service_level(self):
        out = emit_constants({30: 6.10, 300: 12.40, 800: 15.90, 1500: 24.30, 8000: 68.20})
        def val(key: str) -> float:
            line = next(l for l in out.splitlines() if key in l)
            return float(line.split(":")[1].strip().rstrip(","))
        self.assertLessEqual(val("groundAdvantageUsd"), val("priorityUsd"))
        self.assertLessEqual(val("priorityUsd"), val("priorityExpressUsd"))
        self.assertLessEqual(val("priorityExpressUsd"), val("registeredUsd"))

    def test_handles_a_partial_sweep(self):
        # A zone that fails to quote must not produce nonsense constants.
        self.assertIn("DEFAULT_SHIPPING", emit_constants({30: 6.10}))


class TestClientConfiguration(unittest.TestCase):
    def test_reports_when_no_token_is_present(self):
        self.assertFalse(ShippoClient(token="").configured)
        self.assertTrue(ShippoClient(token="shippo_test_x").configured)

    def test_auth_header_uses_shippo_scheme(self):
        h = ShippoClient(token="shippo_test_x")._headers()
        self.assertEqual(h["Authorization"], "ShippoToken shippo_test_x")


if __name__ == "__main__":
    unittest.main(verbosity=2)
