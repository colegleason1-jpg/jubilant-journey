"""Optional BeautifulSoup adapter for sources whose terms permit automated access.

This exists because HTML parsing is genuinely the right tool for some inputs — a
forum's public "want to buy" board, a dealer's own feed page, our own storefront.

It is NOT the right tool for eBay, and the denylist below enforces that in code
rather than trusting a comment. eBay's User Agreement (effective 2026-02-20)
prohibits scrapers and their robots.txt blocks them by name; the buying account is
the whole business. Use `scout.ebay.EbayClient` instead — it is free, faster, and
returns structured data.

BeautifulSoup is imported lazily so the common path (eBay Browse API) has zero
runtime dependencies and the CI job can skip `pip install` entirely. See docs/11.
"""

from __future__ import annotations

import urllib.parse
import urllib.robotparser
from functools import lru_cache

from .http import USER_AGENT, request

#: Domains we will never parse, whatever the caller asks for.
SCRAPE_DENYLIST = frozenset(
    {"ebay.com", "www.ebay.com", "m.ebay.com", "ebay.co.uk", "ebay.de"}
)


class ScrapeNotPermitted(RuntimeError):
    pass


def _registrable(host: str) -> str:
    parts = host.lower().split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host.lower()


@lru_cache(maxsize=64)
def _robots(origin: str) -> urllib.robotparser.RobotFileParser:
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(f"{origin}/robots.txt")
    try:
        rp.read()
    except Exception:
        # Unreadable robots.txt is treated as disallow — fail closed.
        rp.disallow_all = True
    return rp


def assert_permitted(url: str) -> None:
    """Raise unless this URL is both off the denylist and allowed by robots.txt."""
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.lower()
    if host in SCRAPE_DENYLIST or _registrable(host) in SCRAPE_DENYLIST:
        raise ScrapeNotPermitted(
            f"{host} is on the scrape denylist. Use the official API. See docs/01."
        )
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if not _robots(origin).can_fetch(USER_AGENT, url):
        raise ScrapeNotPermitted(f"robots.txt at {origin} disallows {url}")


def fetch_soup(url: str, *, timeout: float = 10.0):
    """Fetch and parse a permitted page. Requires `pip install beautifulsoup4`."""
    assert_permitted(url)
    try:
        from bs4 import BeautifulSoup  # noqa: PLC0415 — lazy: keeps the hot path dep-free
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "beautifulsoup4 is required for the scrape adapter: pip install beautifulsoup4"
        ) from exc

    html = request(url, timeout=timeout)
    if not isinstance(html, str):
        raise TypeError(f"expected HTML from {url}, got {type(html).__name__}")
    return BeautifulSoup(html, "html.parser")
