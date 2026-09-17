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
        out = emit_constants(
            {30: 4.60, 60: 8.20, 300: 12.40, 800: 15.90, 1500: 24.30, 8000: 68.20}
        )
        self.assertIn("DEFAULT_SHIPPING", out)
        # The sub-$50 quote fits the envelope; the $60 one fits Ground Advantage.
        self.assertIn("envelopeUsd: 4.60", out)
        self.assertIn("groundAdvantageUsd: 8.20", out)
        self.assertIn("ground_advantage_usd", out)

    def test_constants_stay_monotonic_by_service_level(self):
        out = emit_constants(
            {30: 4.60, 60: 8.20, 300: 12.40, 800: 15.90, 1500: 24.30, 8000: 68.20}
        )
        def val(key: str) -> float:
            line = next(l for l in out.splitlines() if key in l)
            return float(line.split(":")[1].strip().rstrip(","))
        self.assertLessEqual(val("envelopeUsd"), val("groundAdvantageUsd"))
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


class TestManualQuoteEntry(unittest.TestCase):
    """The path that needs no account, no token and no integration."""

    def test_parses_the_basic_form(self):
        from scout.fit_shipping import parse_quotes
        self.assertEqual(parse_quotes("30=6.10,300=12.40"), {30: 6.10, 300: 12.40})

    def test_forgives_dollar_signs_spaces_and_semicolons(self):
        from scout.fit_shipping import parse_quotes
        self.assertEqual(
            parse_quotes(" $30 = $6.10 ; 1500=$24.30 , "),
            {30: 6.10, 1500: 24.30},
        )

    def test_refuses_to_guess_at_a_thousands_separator(self):
        from scout.fit_shipping import parse_quotes
        # "1,500=24.30" is ambiguous — the comma is also the delimiter. Guessing
        # would silently misparse a cost and poison every threshold downstream, so
        # it errors and says what to type.
        with self.assertRaises(ValueError) as ctx:
            parse_quotes("1,500=24.30")
        self.assertIn("1500, not 1,500", str(ctx.exception))

    def test_rejects_nonsense_clearly(self):
        from scout.fit_shipping import parse_quotes
        for bad in ["", "30", "30=0", "30=-4", "0=5", "abc=def"]:
            with self.assertRaises(ValueError):
                parse_quotes(bad)

    def test_flag_is_read_in_both_spellings(self):
        from scout.fit_shipping import _quotes_flag
        self.assertEqual(_quotes_flag(["--quotes", "30=6"]), "30=6")
        self.assertEqual(_quotes_flag(["--quotes=30=6"]), "30=6")
        self.assertIsNone(_quotes_flag(["--demo"]))

    def test_a_partial_sweep_still_produces_constants(self):
        from scout.fit_shipping import emit_constants, parse_quotes
        # Somebody quotes three bands and stops. That should still be useful.
        self.assertIn("DEFAULT_SHIPPING", emit_constants(parse_quotes("30=6,300=12,1500=24")))


class TestParcelPresets(unittest.TestCase):
    def test_parcel_tracks_what_comes_with_the_watch(self):
        from scout.shipping import BOX_FULL_SET, BOX_LIGHT, BOX_STANDARD, ENVELOPE, parcel_for
        self.assertEqual(parcel_for(30), ENVELOPE)
        self.assertEqual(parcel_for(49.99), ENVELOPE)
        self.assertEqual(parcel_for(50), BOX_LIGHT)       # travel case only
        self.assertEqual(parcel_for(299), BOX_LIGHT)
        self.assertEqual(parcel_for(300), BOX_STANDARD)   # original box + papers
        self.assertEqual(parcel_for(1000), BOX_FULL_SET)  # presentation box

    def test_weight_rises_monotonically_with_value(self):
        from scout.shipping import parcel_for
        weights = [parcel_for(v).weight_lb for v in (30, 60, 400, 1500, 8000)]
        for a, b in zip(weights, weights[1:]):
            self.assertLessEqual(a, b)

    def test_the_light_box_stays_under_a_pound(self):
        from scout.shipping import BOX_LIGHT, usps_weight_tier
        # Under 16 oz keeps this band on ounce tiers instead of pound rates.
        self.assertLess(BOX_LIGHT.weight_lb, 1.0)
        self.assertNotIn("lb", usps_weight_tier(BOX_LIGHT.weight_lb))

    def test_the_envelope_is_lighter_and_flatter(self):
        from scout.shipping import BOX_STANDARD, ENVELOPE
        self.assertLess(ENVELOPE.weight_lb, BOX_STANDARD.weight_lb)
        self.assertLess(ENVELOPE.height_in, BOX_STANDARD.height_in)


class TestWeightTiers(unittest.TestCase):
    def test_usps_rounds_up_to_ounce_tiers_under_a_pound(self):
        from scout.shipping import usps_weight_tier
        self.assertEqual(usps_weight_tier(3.5 / 16), "4oz")
        self.assertEqual(usps_weight_tier(4.2 / 16), "8oz")   # pays the 8oz price
        self.assertEqual(usps_weight_tier(8.5 / 16), "12oz")  # half an ounce = a tier
        self.assertEqual(usps_weight_tier(7.9 / 16), "8oz")

    def test_sixteen_ounces_is_a_cliff(self):
        from scout.shipping import usps_weight_tier
        self.assertEqual(usps_weight_tier(15.9 / 16), "15.999oz")
        self.assertEqual(usps_weight_tier(16.1 / 16), "2lb")

    def test_pound_rates_round_up(self):
        from scout.shipping import usps_weight_tier
        self.assertEqual(usps_weight_tier(2.0), "2lb")
        self.assertEqual(usps_weight_tier(2.1), "3lb")

    def test_the_sweep_straddles_the_switch(self):
        from scout.fit_shipping import BANDS
        self.assertTrue(any(b < 50 for b in BANDS))
        self.assertIn(60, BANDS)

    def test_emitted_constants_include_the_envelope(self):
        from scout.fit_shipping import emit_constants
        out = emit_constants({30: 4.60, 60: 8.20, 300: 12.40, 1500: 24.30})
        self.assertIn("envelopeUsd: 4.60", out)
        self.assertIn("envelope_usd: float = 4.60", out)


class TestBillableWeight(unittest.TestCase):
    """USPS bills the greater of actual and dimensional -- but only above 1 cu ft."""

    def test_dimensional_never_applies_to_a_watch_parcel(self):
        from scout.shipping import billable_weight_lb, parcel_for
        for value in (25, 60, 300, 1500, 8000):
            parcel = parcel_for(value)
            weight, basis = billable_weight_lb(parcel)
            self.assertEqual(weight, parcel.weight_lb, f"${value}")
            self.assertIn("actual", basis)

    def test_every_parcel_is_well_under_the_threshold(self):
        from scout.shipping import USPS_DIM_THRESHOLD_CU_IN, cubic_inches, parcel_for
        for value in (25, 60, 300, 1500):
            self.assertLess(cubic_inches(parcel_for(value)), USPS_DIM_THRESHOLD_CU_IN / 3)

    def test_dimensional_does_apply_to_something_genuinely_bulky(self):
        from scout.shipping import Parcel, billable_weight_lb
        # 20x20x20 = 8000 cu in, well over a cubic foot, and nearly weightless.
        weight, basis = billable_weight_lb(Parcel(20, 20, 20, weight_lb=2.0))
        self.assertGreater(weight, 2.0)
        self.assertIn("dimensional", basis)

    def test_uses_the_2026_divisor(self):
        from scout.shipping import USPS_DIM_DIVISOR, Parcel, dim_weight_lb
        self.assertEqual(USPS_DIM_DIVISOR, 139.0)  # was 166 before 2026-07-12
        self.assertAlmostEqual(dim_weight_lb(Parcel(10, 10, 10, 1)), 1000 / 139, places=2)

    def test_fractional_dimensions_round_up(self):
        from scout.shipping import Parcel, cubic_inches
        self.assertEqual(cubic_inches(Parcel(8.1, 6.2, 4.3, 1)), 9 * 7 * 5)


class TestCubicPricing(unittest.TestCase):
    """Cubic ignores weight under 20 lb -- the lever becomes box volume."""

    def test_every_watch_parcel_qualifies(self):
        from scout.shipping import cubic_eligible, parcel_for
        for value in (25, 60, 300, 1500, 8000):
            self.assertTrue(cubic_eligible(parcel_for(value)), f"${value}")

    def test_tiers_step_by_volume_not_weight(self):
        from scout.shipping import cubic_tier, parcel_for
        self.assertEqual(cubic_tier(parcel_for(25)), "0.1 cu ft")
        self.assertEqual(cubic_tier(parcel_for(1500)), "0.3 cu ft")

    def test_a_heavier_watch_in_the_same_box_is_the_same_tier(self):
        from scout.shipping import Parcel, cubic_tier
        light = Parcel(9, 7, 5, weight_lb=1.0)
        heavy = Parcel(9, 7, 5, weight_lb=12.0)
        self.assertEqual(cubic_tier(light), cubic_tier(heavy))

    def test_too_bulky_or_too_heavy_is_not_eligible(self):
        from scout.shipping import Parcel, cubic_eligible
        self.assertFalse(cubic_eligible(Parcel(14, 12, 10, weight_lb=2)))   # > 0.5 cu ft
        self.assertFalse(cubic_eligible(Parcel(8, 6, 4, weight_lb=25)))     # > 20 lb
        self.assertFalse(cubic_eligible(Parcel(24, 4, 4, weight_lb=2)))     # side > 22 in
