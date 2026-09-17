"""Scout entrypoint.

    python -m scout.main --replay          scan recorded fixtures, no credentials
    python -m scout.main --shadow          live scan, record decisions, no email
    python -m scout.main --smoke           verify credentials reach the Browse API
    python -m scout.main                   live scan, alert on new deals

BUDGET
------
GitHub Actions bills every job rounded UP to a whole minute, so a 61-second run costs
exactly double a 59-second one. At a 30-minute cadence over 16 waking hours that is
~1,020 runs/month against a 2,000-minute free allowance -- comfortable at 1 minute
per run, over budget at 2. The deadline is enforced rather than hoped for: when the
clock runs out we report what we have and exit cleanly.

WHAT THIS DOES NOT DO
---------------------
It does not buy anything. eBay's User Agreement prohibits automated ordering,
including Best Offers. The scout finds, prices and ranks; you click buy.
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from . import config, deal, fixtures, notify, shadow
from .db import Db
from .ebay import EbayClient, Listing, _parse


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


class FixtureClient:
    """Stands in for EbayClient, serving recorded responses.

    Lets the entire pipeline -- search, parse, gate, price, rank -- run end to end
    with no credentials and no network. If a repo only runs with live secrets, nobody
    ever runs it.
    """

    token = "fixture-token"
    token_expires_at = 0.0

    def search(self, query: str, *, min_usd: float, max_usd: float) -> list[Listing]:
        items = fixtures.load(query)
        listings = [_parse(i) for i in items]
        return [l for l in listings if min_usd <= l.price_usd <= max_usd]

    def is_still_available(self, ebay_item_id: str) -> bool:
        return True


def run(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    cfg = config.load()
    budget = Budget(cfg.runtime.deadline_seconds)

    if args.smoke:
        return _smoke(cfg)

    if args.replay:
        return _scan(cfg, budget, FixtureClient(), models=fixtures.FIXTURE_MODELS,
                     market_prices=fixtures.FIXTURE_MARKET_PRICES, db=None,
                     shadow_mode=True, label="REPLAY (fixtures, nothing written)")

    missing = cfg.secrets.missing()
    if missing:
        print(f"::error::missing required secrets: {', '.join(missing)}", file=sys.stderr)
        print("hint: run with --replay to exercise the pipeline without credentials",
              file=sys.stderr)
        return 1

    db = Db(cfg)
    models = db.active_models()
    market_prices = db.latest_market_prices()
    cached_token, cached_expiry = db.get_cached_token()
    client = EbayClient(cfg, token=cached_token, token_expires_at=cached_expiry)

    return _scan(cfg, budget, client, models=models, market_prices=market_prices, db=db,
                 shadow_mode=args.shadow,
                 label="SHADOW (recording, no alerts)" if args.shadow else "LIVE")


def _scan(cfg, budget: Budget, client, *, models, market_prices, db, shadow_mode: bool,
          label: str) -> int:
    print(f"mode: {label}")
    print(f"watchlist: {len(models)} models, {len(market_prices)} with a market price")

    jobs: list[tuple[dict[str, Any], str, float]] = []
    for model in models:
        market = market_prices.get(model["id"])
        if not market:
            continue  # no comp, no opinion -- never guess at a market price
        for query in model.get("ebay_queries") or [f"{model['brand']} {model['reference']}"]:
            jobs.append((model, query, market))

    if not jobs:
        print("nothing to scan -- seed watch_models and comp_snapshots first")
        return 0

    evaluations: list[tuple[str, deal.Evaluation]] = []
    screened = 0
    truncated = False

    with ThreadPoolExecutor(max_workers=cfg.runtime.max_workers) as pool:
        futures = {
            pool.submit(_scan_one, client, model, query, market, cfg): (model, query)
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
            evaluations.extend(results)

    # Best result per item wins; a listing can match several watchlist queries.
    best: dict[str, tuple[str, deal.Evaluation]] = {}
    for model_id, ev in evaluations:
        key = ev.listing.ebay_item_id
        if key not in best or ev.rank_score > best[key][1].rank_score:
            best[key] = (model_id, ev)

    passed = [(m, e) for m, e in best.values() if e.passed]
    passed.sort(key=lambda t: t[1].rank_score, reverse=True)

    print(
        f"screened {screened} listings in {budget.elapsed:.1f}s -> "
        f"{len(passed)} passed, {len(best) - len(passed)} rejected"
        + (" (TRUNCATED by deadline)" if truncated else "")
    )

    # EVERY decision is recorded, pass or fail. A gate that is too tight leaves no
    # trace except the deals it silently refused.
    decisions = [shadow.decision_from_evaluation(ev, model_id)
                 for model_id, ev in best.values()]

    _print_decisions(best)

    if db is not None:
        db.upsert("candidates", [ev.to_row(m) for m, ev in best.values()],
                  on_conflict="ebay_item_id")
        db.insert("shadow_decisions", [d.to_row() for d in decisions])
        if getattr(client, "token_expires_at", 0):
            db.put_cached_token(client.token, client.token_expires_at)

    if shadow_mode:
        print(f"\nrecorded {len(decisions)} decisions. No alerts sent.")
        print("Re-run scout.calibrate once these listings resolve to grade the model.")
        return 0

    seen = db.known_candidate_ids() if db else set()
    fresh = [(m, e) for m, e in passed if e.listing.ebay_item_id not in seen]
    if fresh:
        notify.send_digest(
            cfg, [ev.to_alert() for _, ev in fresh],
            {"screened": screened, "models": len(models), "elapsed": budget.elapsed},
        )
        print(f"emailed {len(fresh)} deal(s) to {cfg.secrets.alert_to}")
    print(f"::notice::{len(fresh)} new deals, {budget.elapsed:.1f}s elapsed")
    return 0


def _print_decisions(best: dict[str, tuple[str, deal.Evaluation]]) -> None:
    ordered = sorted(best.values(), key=lambda t: (not t[1].passed, -t[1].rank_score))
    for model_id, ev in ordered:
        mark = "PASS" if ev.passed else "----"
        detail = (
            f"landed ${ev.listing.landed_source_usd:>8,.2f}  "
            f"market ${ev.market_usd:>8,.2f}  "
            f"list ${ev.list_usd:>8,.2f}  "
            f"contrib ${ev.econ.contribution_usd:>8,.2f}"
        )
        print(f"  [{mark}] {ev.listing.title[:52]:<52} {detail}")
        if not ev.passed:
            print(f"         rejected: {', '.join(ev.gates_failed)}")
        for w in ev.warnings[:2]:
            print(f"         warn: {w[:88]}")


def _scan_one(client, model, query: str, market: float, cfg):
    listings = client.search(
        query,
        min_usd=cfg.gates.min_source_price_usd,
        max_usd=cfg.gates.max_source_price_usd,
    )
    return len(listings), [(model["id"], deal.evaluate(l, market, cfg)) for l in listings]


def _smoke(cfg) -> int:
    """Verify credentials actually reach the Browse API before anything depends on it."""
    missing = cfg.secrets.missing()
    if missing:
        print(f"FAIL: missing {', '.join(missing)}", file=sys.stderr)
        return 1

    client = EbayClient(cfg)
    try:
        token = client.token
        print(f"OK   OAuth token acquired ({len(token)} chars, expires in "
              f"{int(client.token_expires_at - time.time())}s)")
    except Exception as exc:
        print(f"FAIL OAuth: {exc}", file=sys.stderr)
        return 1

    try:
        results = client.search("longines hydroconquest", min_usd=300, max_usd=3500)
        print(f"OK   Browse API returned {len(results)} listings")
        if results:
            r = results[0]
            print(f"     sample: {r.title[:60]}")
            print(f"             ${r.price_usd:.2f} + ${r.shipping_usd:.2f} shipping "
                  f"= ${r.landed_source_usd:.2f} landed")
            print(f"             seller {r.seller_feedback_score} / {r.seller_positive_pct}%  "
                  f"{r.condition}  offers={r.accepts_offers}")
        else:
            print("WARN no listings returned -- check the query and filters")
    except Exception as exc:
        print(f"FAIL Browse API: {exc}", file=sys.stderr)
        return 1

    print("\nCredentials work. Next: load the Supabase migrations, seed watch_models,")
    print("then run with --shadow on the cron for three weeks.")
    return 0


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="scout", description=__doc__)
    p.add_argument("--replay", action="store_true",
                   help="scan recorded fixtures; no credentials, no network, no writes")
    p.add_argument("--shadow", action="store_true",
                   help="live scan, record every decision, send no alerts")
    p.add_argument("--smoke", action="store_true",
                   help="verify credentials reach the Browse API, then exit")
    return p.parse_args(argv)


if __name__ == "__main__":
    sys.exit(run())
