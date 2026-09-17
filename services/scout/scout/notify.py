"""Email alerts via Resend.

Email rather than Discord, per the brief. It also happens to be the better choice: a
deal alert is worth acting on within the hour, and email reaches you on a phone, a
watch and a laptop without a third-party app in the path.

Resend free tier: 3,000 emails/month, 100/day, one verified sending domain. The daily
cap is the binding one, and a 30-minute scan that alerted on every run would blow it —
which is why we only email when something actually passed the gates. See docs/11.
"""

from __future__ import annotations

import html
from typing import Any

from .http import request

RESEND_URL = "https://api.resend.com/emails"


def _fmt_usd(x: float) -> str:
    return f"${x:,.2f}"


def _deal_row(d: dict[str, Any]) -> str:
    ladder = d.get("offer_ladder") or []
    ladder_html = "".join(
        f"<li>Offer {_fmt_usd(r['offer_usd'])} "
        f"({int(r['discount_from_ask'] * 100)}% below ask) &rarr; "
        f"{r['margin_pct_if_accepted'] * 100:.1f}% margin"
        f"{'' if r['viable'] else ' <b>(below floor — do not send)</b>'}</li>"
        for r in ladder
    )
    return f"""
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e5e5e5">
        <div style="font-size:16px;font-weight:600">{html.escape(d['title'][:110])}</div>
        <div style="margin:6px 0;color:#444">
          Asking <b>{_fmt_usd(d['asking_usd'])}</b> + {_fmt_usd(d['shipping_usd'])} shipping
          = <b>{_fmt_usd(d['landed_usd'])}</b> landed<br>
          Market <b>{_fmt_usd(d['market_usd'])}</b> &middot;
          we list at <b>{_fmt_usd(d['list_usd'])}</b><br>
          Discount to market <b>{d['discount_pct'] * 100:.1f}%</b> &middot;
          projected margin <b>{d['margin_pct'] * 100:.1f}%</b>
          (<b>{_fmt_usd(d['gross_profit_usd'])}</b> gross)<br>
          <span style="color:#666">Bid ceiling: <b>{_fmt_usd(d['max_bid_usd'])}</b> —
          do not pay more</span>
        </div>
        {f'<ul style="margin:6px 0;color:#444">{ladder_html}</ul>' if ladder_html else
         '<div style="color:#666;margin:6px 0">No Best Offer — buy at the ask or pass.</div>'}
        <div style="margin:4px 0;color:#666;font-size:13px">
          Seller {html.escape(d['seller'])} &middot;
          {d['seller_feedback']:,} feedback &middot; {d['seller_positive']}% positive
        </div>
        {''.join(f'<div style="color:#b45309;font-size:13px">&#9888; {html.escape(w)}</div>'
                 for w in d.get('warnings', []))}
        <a href="{html.escape(d['url'])}"
           style="display:inline-block;margin-top:10px;padding:9px 16px;background:#111;
                  color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Open on eBay &rarr;
        </a>
      </td>
    </tr>"""


def build_digest_html(deals: list[dict[str, Any]], stats: dict[str, Any]) -> str:
    return f"""<!doctype html><html><body style="margin:0;padding:24px;
      font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
      <div style="max-width:640px;margin:0 auto">
        <h1 style="font-size:20px;margin:0 0 4px">
          {len(deals)} deal{'' if len(deals) == 1 else 's'} passed every gate
        </h1>
        <p style="color:#666;margin:0 0 20px;font-size:14px">
          Screened {stats.get('screened', 0)} listings across
          {stats.get('models', 0)} references in {stats.get('elapsed', 0):.1f}s.
        </p>
        <table style="width:100%;border-collapse:collapse">
          {''.join(_deal_row(d) for d in deals)}
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;line-height:1.6">
          You buy these by hand — eBay's User Agreement prohibits automated ordering,
          and the buying account is the business. Check the photos and the seller
          before you commit. When in doubt, pass; there is another deal tomorrow.
        </p>
      </div></body></html>"""


def send_digest(cfg, deals: list[dict[str, Any]], stats: dict[str, Any]) -> bool:
    """Send the digest. Returns False when not configured or nothing to say."""
    s = cfg.secrets
    if not deals or not s.resend_api_key or not s.alert_to:
        return False
    subject = (
        f"{len(deals)} watch deal{'' if len(deals) == 1 else 's'} — "
        f"{_fmt_usd(sum(d['gross_profit_usd'] for d in deals))} potential gross"
    )
    request(
        RESEND_URL,
        method="POST",
        headers={"Authorization": f"Bearer {s.resend_api_key}"},
        json_body={
            "from": f"Gleason Scout <{s.alert_from}>",
            "to": [addr.strip() for addr in s.alert_to.split(",") if addr.strip()],
            "subject": subject,
            "html": build_digest_html(deals, stats),
        },
        timeout=cfg.runtime.http_timeout_seconds,
    )
    return True
