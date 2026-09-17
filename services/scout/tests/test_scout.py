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

from scout import config, deal, pricing  # noqa: E402
from scout.ebay import Listing, _normalise_condition  # noqa: E402
from scout.scrape import ScrapeNotPermitted, assert_permitted  # noqa: E402
from scout.tiers import processing_fee, resolve_rail, tier_for  # noqa: E402

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
    """Same numbers as packages/core/test/pricing.test.ts."""

    def test_authenticity_guarantee_bands(self):
        self.assertEqual(pricing.auth_tier(499.99), "NONE")
        self.assertEqual(pricing.auth_tier(500), "ADDON")
        self.assertEqual(pricing.auth_tier(1999.99), "ADDON")
        self.assertEqual(pricing.auth_tier(2000), "FREE")

    def test_shipping_bands(self):
        # A cheap watch is not charged luxury logistics.
        self.assertEqual(pricing.outbound_shipping(40), 7.50)
        self.assertEqual(pricing.outbound_shipping(800), 22.0)
        self.assertEqual(pricing.outbound_shipping(1035), 40.0)
        self.assertEqual(pricing.outbound_shipping(9000), 110.0)

    def test_worked_example(self):
        p = pricing.project_margin(720, 1035, P)
        self.assertEqual(p.gross_profit_usd, 166.42)
        self.assertEqual(p.processing_fee_usd, 30.39)
        self.assertEqual(p.epn_credit_usd, 10.80)
        self.assertAlmostEqual(p.margin_pct, 0.1608, places=4)
        self.assertEqual(p.tier_label, "CORE")
        self.assertEqual(p.rail, "CARD")

    def test_bid_ceiling(self):
        self.assertEqual(pricing.max_viable_source_price(1035, P), 762.86)

    def test_buying_at_the_ceiling_sits_on_the_binding_floor(self):
        for list_price in (27, 180, 810, 1035, 3200, 9000):
            ceiling = pricing.max_viable_source_price(list_price, P)
            proj = pricing.project_margin(ceiling, list_price, P)
            self.assertEqual(pricing.meets_floors(proj, P), [], f"list {list_price}")
            over = pricing.project_margin(ceiling + 1, list_price, P)
            self.assertNotEqual(pricing.meets_floors(over, P), [], f"list {list_price}")

    def test_resale_certificate_is_worth_the_whole_margin(self):
        import dataclasses

        no_cert = dataclasses.replace(P, has_resale_certificate=False)
        self.assertLess(pricing.project_margin(840, 1035, no_cert).gross_profit_usd, 0)
        self.assertGreater(pricing.project_margin(840, 1035, P).gross_profit_usd, 0)


class TestFluidBuyBand(unittest.TestCase):
    def test_buying_at_90_to_95_percent_loses_in_the_everyday_bands(self):
        for market in (200, 600, 1000, 2600):
            for frac in (0.90, 0.95):
                self.assertIsNone(
                    pricing.max_customer_discount(market, market * frac, P),
                    f"market {market} at {frac:.0%} should have no viable list price",
                )

    def test_but_the_same_90_percent_is_a_good_trade_at_high_value(self):
        # 1% of $10,000 is $100 -- a real profit -- and the cheap wire rail is what
        # makes it reachable. A flat percentage floor gets this backwards.
        self.assertGreater(pricing.max_customer_discount(10000, 9000, P), 0.05)
        self.assertGreater(pricing.max_customer_discount(18000, 16200, P), 0.05)

    def test_a_30_dollar_watch_is_tradeable(self):
        list_price = pricing.solve_list_price(30, P)
        ceiling = pricing.max_viable_source_price(list_price, P)
        proj = pricing.project_margin(ceiling, list_price, P)
        self.assertGreater(ceiling, 12)
        self.assertEqual(proj.tier_label, "MICRO")
        self.assertGreaterEqual(proj.gross_profit_usd, 10)
        self.assertGreater(proj.effective_hourly_usd, 60)

    def test_the_required_discount_narrows_as_value_rises(self):
        def buy_fraction(market):
            lp = pricing.solve_list_price(market, P)
            return pricing.max_viable_source_price(lp, P) / market

        self.assertLess(buy_fraction(30), 0.55)
        self.assertGreater(buy_fraction(10000), 0.85)
        self.assertGreater(buy_fraction(10000), buy_fraction(30) + 0.3)

    def test_a_1000_dollar_watch_bought_at_925_still_loses(self):
        self.assertLess(pricing.project_margin(925, 900, P).gross_profit_usd, -140)


class TestTiers(unittest.TestCase):
    def test_tier_assignment(self):
        self.assertEqual(tier_for(40).label, "MICRO")
        self.assertEqual(tier_for(1035).label, "CORE")
        self.assertEqual(tier_for(10000).label, "HIGH")
        self.assertEqual(tier_for(40000).label, "ULTRA")

    def test_margin_floor_falls_as_value_rises(self):
        floors = [tier_for(v).min_margin_pct for v in (40, 250, 800, 1035, 5000, 10000)]
        for a, b in zip(floors, floors[1:]):
            self.assertLessEqual(b, a)

    def test_ach_is_capped_at_five_dollars(self):
        self.assertEqual(processing_fee(500, "ACH", P), 4.0)
        self.assertEqual(processing_fee(10000, "ACH", P), 5.0)

    def test_card_is_uncapped_and_that_is_the_problem_up_high(self):
        self.assertAlmostEqual(processing_fee(10000, "CARD", P), 290.37, places=2)
        self.assertGreater(processing_fee(10000, "CARD", P), 100)

    def test_high_tiers_refuse_cards(self):
        self.assertIsNone(resolve_rail(10000, "CARD"))
        self.assertEqual(resolve_rail(10000, "WIRE"), "WIRE")
        self.assertEqual(resolve_rail(1035, "CARD"), "CARD")

    def test_wire_versus_card_is_the_difference_between_yes_and_no(self):
        on_card = pricing.project_margin(8903.55, 9000, P, rail="CARD")
        on_wire = pricing.project_margin(8903.55, 9000, P, rail="WIRE")
        self.assertLess(on_card.gross_profit_usd, 0)
        self.assertGreaterEqual(on_wire.gross_profit_usd, 100)

    def test_cheap_tiers_pass_postage_through(self):
        micro = pricing.project_margin(14, 27, P)
        self.assertEqual(micro.shipping_collected_usd, 7.50)
        self.assertEqual(micro.revenue_usd, 34.50)
        core = pricing.project_margin(720, 1035, P)
        self.assertEqual(core.shipping_collected_usd, 0.0)

    def test_a_cheap_order_is_never_charged_the_80_dollar_addon(self):
        ceiling = pricing.max_viable_source_price(27, P)
        self.assertGreater(ceiling, 0)
        self.assertEqual(pricing.auth_tier(ceiling), "NONE")
        self.assertEqual(pricing.project_margin(ceiling, 27, P).authentication_usd, 0)

    def test_both_floors_are_enforced(self):
        # 33% of a $20 order is $9: a fine ratio, not worth the handling.
        proj = pricing.project_margin(8.46, 20, P)
        self.assertGreater(proj.margin_pct, 0.30)
        self.assertLess(proj.gross_profit_usd, 10)
        self.assertEqual(pricing.meets_floors(proj, P), ["MARGIN_ABSOLUTE"])


class TestOfferLadder(unittest.TestCase):
    def test_ten_then_five_then_ask(self):
        ladder = pricing.build_offer_ladder(800, 1035, P)
        self.assertEqual([r.offer_usd for r in ladder], [720.0, 760.0, 800.0])
        self.assertEqual([r.discount_from_ask for r in ladder], [0.10, 0.05, 0.0])

    def test_margin_falls_as_we_climb(self):
        ladder = pricing.build_offer_ladder(800, 1035, P)
        self.assertGreater(ladder[0].margin_pct_if_accepted, ladder[1].margin_pct_if_accepted)
        self.assertGreater(ladder[1].margin_pct_if_accepted, ladder[2].margin_pct_if_accepted)

    def test_marks_unviable_rungs(self):
        ladder = pricing.build_offer_ladder(980, 1035, P)
        self.assertTrue(all(not r.viable for r in ladder))

    def test_partial_ladder_when_only_the_deep_offer_works(self):
        ladder = pricing.build_offer_ladder(790, 1035, P)
        viable = [r for r in ladder if r.viable]
        self.assertTrue(0 < len(viable) < len(ladder))


class TestGates(unittest.TestCase):
    def test_a_good_candidate_passes(self):
        ev = deal.evaluate(listing(), 1150.0, CFG)
        self.assertEqual(ev.gates_failed, [])
        self.assertTrue(ev.passed)
        self.assertEqual(ev.list_usd, 1035)
        self.assertEqual(ev.projection.gross_profit_usd, 166.42)

    def test_shipping_counts_toward_the_buy_price(self):
        """'No more than $95 after shipping' — shipping is part of the buy price."""
        ev = deal.evaluate(listing(price_usd=700, shipping_usd=45), 1150.0, CFG)
        self.assertEqual(ev.listing.landed_source_usd, 745.0)
        self.assertTrue(ev.passed)
        self.assertTrue(any("shipping" in w for w in ev.warnings))

    def test_shipping_can_sink_an_otherwise_fine_deal(self):
        ev = deal.evaluate(listing(price_usd=750, shipping_usd=60), 1150.0, CFG)
        self.assertEqual(ev.listing.landed_source_usd, 810.0)
        self.assertIn("MARGIN", ev.gates_failed)

    def test_rejects_below_the_authentication_floor(self):
        ev = deal.evaluate(listing(price_usd=420), 700.0, CFG)
        self.assertIn("AUTHENTICATION_ELIGIBLE", ev.gates_failed)
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
