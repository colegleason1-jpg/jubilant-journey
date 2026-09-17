"""Scout entrypoint — one consolidated scan per run.

BUDGET
------
GitHub Actions bills every job rounded UP to a whole minute, so a 61-second run costs
exactly double a 59-second one. At a 30-minute cadence over 16 waking hours that is
960 runs/month against a 2,000-minute free allowance — comfortable at 1 minute per
run, over budget at 2.

So the deadline is enforced rather than hoped for: when the clock runs out we report
what we have and exit cleanly. A partial scan is fine; the next one is 30 minutes
away. See docs/11.

WHAT THIS DOES NOT DO
---------------------
It does not buy anything. eBay's User Agreement prohibits automated ordering,
including Best Offers. The scout finds, prices and ranks; you click buy. That is
~90 seconds of your day and it is what keeps the buying account alive. See docs/01.
"""

from __future__ import annotations

import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from . import config, deal, notify
from .db import Db
from .ebay import EbayClient


class Budget:
    """A wall clock the scan actually respects."""

    def __init__(self, seconds: float):
        self._start = time.monotonic()
        self._limit = seconds

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self._start

    @property
    def remaining(self) -> float:
        return self._limit - self.elapsed

    def exhausted(self) -> bool:
        return self.remaining <= 0


def run() -> int:
    cfg = config.load()
    budget = Budget(cfg.runtime.deadline_seconds)

    missing = cfg.secrets.missing()
    if missing:
        print(f"::error::missing required secrets: {', '.join(missing)}", file=sys.stderr)
        return 1

    db = Db(cfg)

    # One round trip each for the watchlist, the comps and the seen-set.
    models = db.active_models()
    market_prices = db.latest_market_prices()
    seen = db.known_candidate_ids()
    print(f"watchlist: {len(models)} models, {len(market_prices)} with a market price")

    cached_token, cached_expiry = db.get_cached_token()
    ebay = EbayClient(cfg, token=cached_token, token_expires_at=cached_expiry)

    jobs: list[tuple[dict[str, Any], str, float]] = []
    for model in models:
        market = market_prices.get(model["id"])
        if not market:
            continue  # no comp, no opinion — never guess at a market price
        for query in model.get("ebay_queries") or [f"{model['brand']} {model['reference']}"]:
            jobs.append((model, query, market))

    if not jobs:
        print("nothing to scan — seed watch_models and comp_snapshots first")
        return 0

    evaluations: list[tuple[str, deal.Evaluation]] = []
    screened = 0
    calls = 0
    truncated = False

    with ThreadPoolExecutor(max_workers=cfg.runtime.max_workers) as pool:
        futures = {
            pool.submit(_scan_one, ebay, model, query, market, cfg): (model, query)
            for model, query, market in jobs
        }
        for future in as_completed(futures, timeout=max(budget.remaining, 1)):
            if budget.exhausted():
                truncated = True
                break
            try:
                count, results = future.result()
            except Exception as exc:  # one bad query must not sink the scan
                model, query = futures[future]
                print(f"::warning::query failed for {model['id']} ({query}): {exc}")
                continue
            screened += count
            calls += 1
            evaluations.extend(results)

    # Best deal per item wins; a listing can match several watchlist queries.
    best: dict[str, tuple[str, deal.Evaluation]] = {}
    for model_id, ev in evaluations:
        key = ev.listing.ebay_item_id
        if key not in best or ev.rank_score > best[key][1].rank_score:
            best[key] = (model_id, ev)

    passed = [(m, e) for m, e in best.values() if e.passed]
    # Rank on adjusted contribution per hour: what an hour of your life is worth
    # here, counting the customer acquired, not just the watch flipped.
    passed.sort(key=lambda t: t[1].rank_score, reverse=True)

    # Only alert on genuinely new finds. Resend's free tier caps at 100 emails/day and
    # an alert you have already seen is how people learn to ignore alerts.
    fresh = [(m, e) for m, e in passed if e.listing.ebay_item_id not in seen]

    print(
        f"screened {screened} listings / {calls} queries in {budget.elapsed:.1f}s "
        f"-> {len(passed)} passed, {len(fresh)} new"
        + (" (TRUNCATED by deadline)" if truncated else "")
    )

    if cfg.runtime.dry_run:
        for model_id, ev in passed[:20]:
            print(
                f"  [{model_id}] {ev.listing.title[:64]!r} "
                f"landed ${ev.listing.landed_source_usd:.2f} / market ${ev.market_usd:.2f} "
                f"-> list ${ev.list_usd:.2f}, contribution ${ev.econ.contribution_usd:.2f} "
                f"(${ev.econ.contribution_per_hour_usd:.0f}/hr, {ev.econ.rail})"
            )
        return 0

    _persist(db, ebay, best, cfg)

    if fresh:
        notify.send_digest(
            cfg,
            [ev.to_alert() for _, ev in fresh],
            {"screened": screened, "models": len(models), "elapsed": budget.elapsed},
        )
        print(f"emailed {len(fresh)} deal(s) to {cfg.secrets.alert_to}")

    # Surfaces in the Actions run summary without failing the job.
    print(f"::notice::{len(fresh)} new deals, {budget.elapsed:.1f}s elapsed")
    return 0


def _scan_one(ebay: EbayClient, model, query: str, market: float, cfg):
    """Search one query and evaluate everything it returns."""
    listings = ebay.search(
        query,
        min_usd=cfg.gates.min_source_price_usd,
        max_usd=cfg.gates.max_source_price_usd,
    )
    results = [(model["id"], deal.evaluate(l, market, cfg)) for l in listings]
    return len(listings), results


def _persist(db: Db, ebay: EbayClient, best, cfg) -> None:
    """Two writes total. Round trips are the expensive part of the budget."""
    rows = [ev.to_row(model_id) for model_id, ev in best.values()]
    db.upsert("candidates", rows, on_conflict="ebay_item_id")
    if ebay.token_expires_at:
        db.put_cached_token(ebay.token, ebay.token_expires_at)
    db.record_api_calls("EBAY_BROWSE", "item_summary/search", len(rows) and 1 or 0)


if __name__ == "__main__":
    sys.exit(run())
