"""Supabase access over PostgREST.

Plain HTTP rather than supabase-py, for the same reason as scout/http.py: no runtime
dependencies means no `pip install` step in CI.

⚠️ Supabase free-tier projects pause after 7 days with no database activity. The
scout running on a schedule is what keeps the project awake — if you ever disable the
workflow, the database goes offline until you resume it manually. See docs/11.
"""

from __future__ import annotations

import json
from typing import Any

from .http import request


class Db:
    def __init__(self, cfg):
        self._url = cfg.secrets.supabase_url
        self._timeout = cfg.runtime.http_timeout_seconds
        self._headers = {
            "apikey": cfg.secrets.supabase_key,
            "Authorization": f"Bearer {cfg.secrets.supabase_key}",
            "Content-Type": "application/json",
        }

    def _rest(self, path: str) -> str:
        return f"{self._url}/rest/v1/{path}"

    def select(self, table: str, query: str = "select=*") -> list[dict[str, Any]]:
        return request(self._rest(f"{table}?{query}"), headers=self._headers, timeout=self._timeout) or []

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
        """One request per table. Batching matters inside a 45-second budget."""
        if not rows:
            return
        request(
            self._rest(f"{table}?on_conflict={on_conflict}"),
            method="POST",
            headers={
                **self._headers,
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json_body=rows,
            timeout=self._timeout,
        )

    def insert(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        request(
            self._rest(table),
            method="POST",
            headers={**self._headers, "Prefer": "return=minimal"},
            json_body=rows,
            timeout=self._timeout,
        )

    # ── watchlist & comps ───────────────────────────────────────────────────────

    def active_models(self) -> list[dict[str, Any]]:
        return self.select(
            "watch_models",
            "select=id,brand,reference,nickname,ebay_queries&active=is.true",
        )

    def latest_market_prices(self) -> dict[str, float]:
        """model_id -> most recent market price.

        One request for the whole watchlist. `distinct_market_price` is a view
        defined in migration 0002 that keeps this to a single round trip.
        """
        rows = self.select("distinct_market_price", "select=model_id,market_price_usd")
        return {r["model_id"]: float(r["market_price_usd"]) for r in rows}

    def known_candidate_ids(self) -> set[str]:
        rows = self.select("candidates", "select=ebay_item_id")
        return {r["ebay_item_id"] for r in rows}

    # ── token cache ─────────────────────────────────────────────────────────────

    def get_cached_token(self) -> tuple[str | None, float]:
        rows = self.select("service_state", "select=value&key=eq.ebay_oauth_token")
        if not rows:
            return None, 0.0
        try:
            blob = rows[0]["value"]
            if isinstance(blob, str):
                blob = json.loads(blob)
            return blob.get("token"), float(blob.get("expires_at", 0))
        except Exception:
            return None, 0.0

    def put_cached_token(self, token: str, expires_at: float) -> None:
        self.upsert(
            "service_state",
            [{"key": "ebay_oauth_token", "value": {"token": token, "expires_at": expires_at}}],
            on_conflict="key",
        )

    def record_api_calls(self, api: str, endpoint: str, count: int) -> None:
        """Best-effort call accounting against the 5,000/day eBay budget."""
        if count <= 0:
            return
        try:
            request(
                f"{self._url}/rest/v1/rpc/bump_api_calls",
                method="POST",
                headers=self._headers,
                json_body={"p_api": api, "p_endpoint": endpoint, "p_count": count},
                timeout=self._timeout,
            )
        except Exception:
            pass  # accounting must never fail a scan
