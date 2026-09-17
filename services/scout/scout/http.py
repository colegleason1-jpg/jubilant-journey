"""Minimal HTTP on the standard library.

Deliberately no `requests`. The scout has ZERO runtime dependencies, so the GitHub
Actions job skips `pip install` entirely — worth 15-30 seconds of a 60-second budget
(docs/11). BeautifulSoup is imported lazily and only by the optional scrape adapter.
"""

from __future__ import annotations

import base64
import gzip
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

USER_AGENT = "gleason-timepiece-scout/0.1 (+https://gleasontimepiece.org)"


class HttpError(RuntimeError):
    def __init__(self, status: int, url: str, body: str):
        super().__init__(f"HTTP {status} from {url}: {body[:300]}")
        self.status = status
        self.url = url
        self.body = body


def basic_auth(user: str, password: str) -> str:
    raw = f"{user}:{password}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    json_body: Any | None = None,
    form_body: dict[str, str] | None = None,
    timeout: float = 10.0,
) -> Any:
    """Perform a request and return parsed JSON (or raw text when not JSON)."""
    hdrs = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip", **(headers or {})}
    data: bytes | None = None

    if json_body is not None:
        data = json.dumps(json_body).encode()
        hdrs.setdefault("Content-Type", "application/json")
    elif form_body is not None:
        data = urllib.parse.urlencode(form_body).encode()
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")

    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                payload = gzip.decompress(payload)
            text = payload.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:  # noqa: PERF203
        body = exc.read().decode("utf-8", errors="replace")
        raise HttpError(exc.code, url, body) from exc

    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text
