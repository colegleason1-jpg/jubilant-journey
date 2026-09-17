"""Scout tests, including parity with the TypeScript engine in packages/core.

The parity cases assert the exact same worked examples as
packages/core/test/pricing.test.ts and offers.test.ts, so the two implementations
cannot drift apart without a test going red.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scout import config, deal, economics  # noqa: E402
from scout.ebay import Listing, _normalise_condition  # noqa: E402
from scout.scrape import ScrapeNotPermitted, assert_permitted  # noqa: E402
from scout.tiers import operational_profile, processing_fee, resolve_rail  # noqa: E402

CFG = config.Config()
P = CFG.pricing


def listing(**kw) -> Listing:
    base = dict(
        ebay_item_id="v1|123|0",
        title="Longines HydroConquest 41mm Automatic L3.781.4 Blue Dial",
        price_usd=720.0,
        shipping_usd=0.0,
        condition="EXCELLENT",
        item_url="https://www.ebay.com/itm/123",
        image_urls=["a", "b", "c", "d", "e"],
        seller_username="watchguy",
        seller_feedback_score=480,
        seller_positive_pct=99.6,
        item_location_country="US",
        buying_options=["FIXED_PRICE"],
        listed_at=None,
    )
    base.update(kw)
    return Listing(**base)


class TestParityWithCore(unittest.TestCase):
    """Same numbers as packages/core/test/economics.test.ts."""

    def test_authenticity_guarantee_bands(self):
        self.assertEqual(economics.auth_tier(499.99), "NONE")
        self.assertEqual(economics.auth_tier(500), "ADDON")
        self.assertEqual(economics.auth_tier(2000), "FREE")

    def test_shipping_is_a_curve_not_buckets(self):
        costs = [economics.shipping_cost(v, P) for v in (30, 150, 300, 800, 1500, 3000, 8000)]
        for a, b in zip(costs, costs[1:]):
            self.assertGreater(b, a)
        self.assertLess(economics.shipping_cost(30, P), 10)

    def test_new_customer_credit_lands_near_the_cac_benchmark(self):
        self.assertTrue(35 < economics.new_customer_credit(P) < 60)

    def test_ach_is_capped_at_five_dollars(self):
        self.assertEqual(processing_fee(500, "ACH", P), 4.0)
        self.assertEqual(processing_fee(10000, "ACH", P), 5.0)

    def test_card_is_uncapped_and_that_is_the_problem_up_high(self):
        self.assertAlmostEqual(processing_fee(10000, "CARD", P), 290.37, places=2)

    def test_high_tiers_refuse_cards(self):
        self.assertIsNone(resolve_rail(10000, "CARD"))
        self.assertEqual(resolve_rail(1035, "CARD"), "CARD")

    def test_epn_credit_is_zero_by_default(self):
        e = economics.compute_economics(720, 1035, P)
        self.assertEqual(e.epn_credit_usd, 0.0)


class TestTheCaseTheMarginModelThrewAway(unittest.TestCase):
    def test_a_2600_watch_bought_at_2300_is_profitable(self):
        card = economics.compute_economics(2300, 2450, P, rail="CARD", authentication_usd=0)
        ach = economics.compute_economics(2300, 2450, P, rail="ACH", authentication_usd=0)
        self.assertGreater(card.contribution_usd, 1)
        self.assertGreater(ach.contribution_usd, card.contribution_usd * 10)
        self.assertTrue(economics.judge_deal(ach, P)[0])

    def test_a_dollar_on_a_30_dollar_watch_is_accepted(self):
        e = economics.compute_economics(25, 29, P, authentication_usd=0)
        self.assertGreaterEqual(e.contribution_usd, 1)
        self.assertTrue(economics.judge_deal(e, P)[0])
        self.assertGreater(e.shipping_collected_usd, 0)

    def test_a_cash_loss_is_still_refused(self):
        e = economics.compute_economics(1000, 900, P)
        self.assertLess(e.contribution_usd, 0)
        self.assertFalse(economics.judge_deal(e, P)[0])

    def test_the_required_discount_is_modest_everywhere(self):
        for m in (30, 100, 900, 2600, 10000, 18000):
            lp = economics.solve_list_price(m, P)
            req = 1 - economics.max_source_price(lp, P) / m
            self.assertLessEqual(req, 0.26, f"${m} needs {req*100:.1f}% off")

    def test_capacity_not_margin_rejects_a_thin_deal(self):
        import dataclasses

        thin = economics.compute_economics(2300, 2450, P, rail="CARD", authentication_usd=0)
        self.assertTrue(economics.judge_deal(thin, P)[0], "abundant capacity takes it")
        constrained = dataclasses.replace(
            P, capacity="CONSTRAINED", min_contribution_per_hour_usd=60
        )
        accept, reasons, _ = economics.judge_deal(thin, constrained)
        self.assertFalse(accept)
        self.assertTrue(any("scarce" in r for r in reasons))

    def test_ltv_credit_does_not_mask_a_cash_loss_by_default(self):
        import dataclasses

        e = economics.compute_economics(400, 420, P)
        self.assertLess(e.contribution_usd, 0)
        self.assertGreater(e.adjusted_contribution_usd, 0)
        self.assertFalse(economics.judge_deal(e, P)[0])
        opted_in = dataclasses.replace(P, count_strategic_credit_toward_floor=True)
        self.assertTrue(economics.judge_deal(e, opted_in)[0])

    def test_repeat_customers_get_no_acquisition_credit(self):
        e = economics.compute_economics(720, 1035, P, is_new_customer=False)
        self.assertEqual(e.strategic_credit_usd, 0.0)


class TestGates(unittest.TestCase):
    def test_a_good_candidate_passes(self):
        ev = deal.evaluate(listing(), 1150.0, CFG)
        self.assertEqual(ev.gates_failed, [])
        self.assertTrue(ev.passed)
        self.assertEqual(ev.list_usd, 1035)
        self.assertGreater(ev.econ.contribution_usd, 0)
        self.assertGreater(ev.rank_score, 0)

    def test_shipping_counts_toward_the_buy_price(self):
        """'No more than $95 after shipping' — shipping is part of the buy price."""
        ev = deal.evaluate(listing(price_usd=700, shipping_usd=45), 1150.0, CFG)
        self.assertEqual(ev.listing.landed_source_usd, 745.0)
        self.assertTrue(ev.passed)
        self.assertTrue(any("shipping" in w for w in ev.warnings))

    def test_shipping_comes_straight_off_the_contribution(self):
        free = deal.evaluate(listing(price_usd=750, shipping_usd=0), 1150.0, CFG)
        paid = deal.evaluate(listing(price_usd=750, shipping_usd=60), 1150.0, CFG)
        self.assertEqual(paid.listing.landed_source_usd, 810.0)
        # Within a cent of the inbound shipping: it is a straight subtraction.
        self.assertAlmostEqual(
            free.econ.contribution_usd - paid.econ.contribution_usd, 60.0, delta=0.05
        )

    def test_enough_inbound_shipping_does_sink_a_deal(self):
        ev = deal.evaluate(listing(price_usd=880, shipping_usd=90), 1150.0, CFG)
        self.assertLess(ev.econ.contribution_usd, 0)
        self.assertIn("MARGIN", ev.gates_failed)

    def test_a_cheap_watch_is_no_longer_filtered_before_the_engine_sees_it(self):
        # The old $500 floor came from the "only source AG-eligible watches" rule and
        # silently removed the whole cheap band before anything was evaluated.
        ev = deal.evaluate(listing(price_usd=420), 700.0, CFG)
        self.assertNotIn("PRICE_BAND", ev.gates_failed)
        self.assertGreater(ev.econ.contribution_usd, 0)

    def test_still_rejects_below_the_configured_floor(self):
        ev = deal.evaluate(listing(price_usd=25), 700.0, CFG)
        self.assertIn("PRICE_BAND", ev.gates_failed)

    def test_rejects_thin_discount(self):
        ev = deal.evaluate(listing(price_usd=1050), 1150.0, CFG)
        self.assertIn("DISCOUNT_TO_MARKET", ev.gates_failed)

    def test_treats_an_implausible_bargain_as_a_red_flag(self):
        ev = deal.evaluate(listing(price_usd=550), 1150.0, CFG)
        self.assertIn("TOO_GOOD_TO_BE_TRUE", ev.gates_failed)

    def test_rejects_low_reputation_sellers(self):
        ev = deal.evaluate(listing(seller_feedback_score=3, seller_positive_pct=91.0), 1150.0, CFG)
        self.assertIn("SELLER_QUALITY", ev.gates_failed)

    def test_blocklist_matches_whole_words_only(self):
        ok = deal.evaluate(
            listing(title="Longines model L3.781.4 from a reputable modern seller"), 1150.0, CFG
        )
        self.assertNotIn("TITLE_BLOCKLIST", ok.gates_failed)

        bad = deal.evaluate(listing(title="Longines HydroConquest homage - for parts"), 1150.0, CFG)
        self.assertIn("TITLE_BLOCKLIST", bad.gates_failed)

    def test_offer_ladder_only_when_the_listing_takes_offers(self):
        self.assertEqual(deal.evaluate(listing(), 1150.0, CFG).offer_ladder, [])
        with_offers = deal.evaluate(
            listing(buying_options=["FIXED_PRICE", "BEST_OFFER"]), 1150.0, CFG
        )
        self.assertEqual(len(with_offers.offer_ladder), 3)
        self.assertGreater(
            with_offers.offer_ladder[0]["contribution_if_accepted_usd"],
            with_offers.offer_ladder[2]["contribution_if_accepted_usd"],
        )


class TestScrapeGuard(unittest.TestCase):
    def test_refuses_ebay_regardless_of_how_it_is_spelled(self):
        for url in (
            "https://www.ebay.com/sch/i.html?_nkw=rolex",
            "https://ebay.com/itm/123",
            "https://m.ebay.com/itm/123",
            "https://www.ebay.co.uk/itm/123",
        ):
            with self.assertRaises(ScrapeNotPermitted):
                assert_permitted(url)

    def test_the_error_points_at_the_api(self):
        with self.assertRaises(ScrapeNotPermitted) as ctx:
            assert_permitted("https://www.ebay.com/itm/1")
        self.assertIn("official API", str(ctx.exception))


class TestConditionMapping(unittest.TestCase):
    def test_maps_ebay_condition_strings(self):
        self.assertEqual(_normalise_condition("Pre-owned"), "GOOD")
        self.assertEqual(_normalise_condition("New with tags"), "NEW")
        self.assertEqual(_normalise_condition("Open box"), "NEW_OTHER")
        self.assertEqual(_normalise_condition("something unexpected"), "GOOD")


if __name__ == "__main__":
    unittest.main(verbosity=2)
