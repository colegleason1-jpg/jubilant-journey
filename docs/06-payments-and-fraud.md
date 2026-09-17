# 06 — Payments, Fraud & Chargebacks

You lost a watch in 2022 to a stolen card and a chargeback. This document is the
system that makes that specific loss, and the "sold on eBay first" loss, structurally
very hard to repeat.

---

## Part 1 — The order state machine (kills the eBay race condition)

The central idea: **the customer's card is authorized, not charged, until we have
actually secured the watch.**

Stripe holds a card authorization for about **7 days** for card-not-present
transactions (Visa customer-initiated 7 days — Stripe works to a 4d18h buffer to leave
room for clearing; Mastercard, Amex and Discover 7 days). The exact deadline is on the
charge object at `payment_method_details.card.capture_before`. Extended authorizations
can reach 30 days for eligible categories.

We need about **twenty minutes**, not seven days.

```
  CHECKOUT
     │  PaymentIntent created with capture_method: 'manual'
     │  3DS forced · Radar rules applied
     ▼
  AUTHORIZED ───────────────────────────────────────────┐
     │  money is RESERVED on the customer's card,        │
     │  nothing has been taken                           │
     │                                                   │
     │  [auto, <5s]  re-verify source listing            │
     │  Browse API getItem → still available?            │
     │                                                   │
     ├── NO ──────────────────────────────────────────►  │
     │                                          VOIDED ◄─┘
     │                                     customer never charged.
     │                                     apology + 3 alternatives email.
     │                                     TOTAL LOSS: $0.00
     ▼
  SOURCING  ── Telegram push to you: "BUY THIS NOW" + direct eBay link
     │           you tap, you buy on eBay (90 seconds, human-in-the-loop)
     │
     │  eBay order confirmed?
     ├── NO / timeout 4h ──────────────────────────────► VOIDED
     ▼
  SECURED  ◄── ★ CAPTURE HAPPENS HERE ★
     │           We own the watch. The race is over. We cannot lose it now.
     │           Typical elapsed time from AUTHORIZED: 10–30 minutes.
     ▼
  IN_TRANSIT_INBOUND → (Authenticity Guarantee inspection) → RECEIVED
     │           we photograph, inspect, log serial, re-verify against listing
     │
     │  matches description?
     ├── NO ───► eBay return (seller accepts returns — hard gate in docs/04)
     │           + full refund to customer + apology. Loss: shipping only.
     ▼
  SHIPPED → DELIVERED → (30-day return window) → CLOSED
```

**Why capture at SECURED and not at SHIPPED:** the moment the eBay order is confirmed,
the only risk left is the watch being wrong — and that risk is covered by the seller's
return policy and by Authenticity Guarantee. Capturing at SECURED keeps us far inside
the 7-day authorization window even when Authenticity Guarantee adds days of transit.

**What the customer sees:** *"Reserved — we're confirming with our sourcing partner.
Usually under 30 minutes. Your card is authorized but not charged until we confirm."*

Transparency here is not a weakness. It is the differentiator, and it is also
chargeback evidence that the terms were disclosed.

Implemented in [`packages/core/src/orderflow.ts`](../packages/core/src/orderflow.ts).

> ### ⚖️ FTC Mail Order Rule
> Because we don't hold the item at the moment of sale, the FTC's Mail, Internet, or
> Telephone Order Merchandise Rule applies squarely. You must ship within the time you
> state, or within 30 days if you state none, and you must offer a delayed-shipment
> notice with the right to cancel if you can't. **State a handling time of 5–7 business
> days on every product page and in the Terms of Sale.** Our actual median will be 3–5
> days. Under-promise, and the rule is satisfied automatically.

---

## Part 2 — Fraud prevention (the stolen card)

### The layered stack

| Layer | Control | Cost | Stops |
|---|---|---|---|
| 1 | **Radar for Fraud Teams** custom rules | $0.07/txn | Known-bad patterns, velocity, mismatches |
| 2 | **3D Secure forced on every order** | included | **Shifts fraud liability to the issuer** |
| 3 | **Block if no liability shift** | rule | Cards that fail/skip 3DS |
| 4 | **Stripe Identity** on first order > $1,500 | $1.50/verification | Synthetic identities |
| 5 | **Billing = shipping, strictly enforced** | rule | The single strongest signal in card fraud |
| 6 | **Signature + adult signature on delivery** | ~$7 | "Item not received" |
| 7 | **Manual review queue** for anything scored high | your time | Everything else |

### The critical thing to understand about 3D Secure

**3DS shifts liability for `fraudulent` disputes only.** It does nothing for "item not
received," "not as described," or cancelled orders. Merchants selling high-value goods
routinely mandate 3DS on all transactions and block anything without liability shift —
that's exactly our configuration.

So 3DS solves your 2022 loss. It does **not** solve the bigger long-term risk, which is
Part 3.

### Radar rules to configure on day one

```ruby
# ── Force 3DS on literally everything ──────────────────────────────
request_3d_secure_on_payment if :amount: > 0

# ── Block anything that didn't get liability shift ─────────────────
block if :card_3d_secure_status: != 'authenticated'
     and :card_3d_secure_status: != 'attempt_acknowledged'

# ── Address & card verification ────────────────────────────────────
block if :cvc_check: != 'pass'
block if :address_line1_check: != 'pass'
block if :address_zip_check: != 'pass'

# ── Billing/shipping mismatch: the #1 signal ───────────────────────
block if :billing_country: != :shipping_country:
review if :billing_zip: != :shipping_zip:

# ── High-value gets extra scrutiny ─────────────────────────────────
review if :amount_in_usd: > 1500 and :customer_is_new: = true
block  if :amount_in_usd: > 2500 and :risk_level: = 'elevated'

# ── Velocity / enumeration ─────────────────────────────────────────
block if :card_country: != 'US' and :ip_country: = 'US'
block if :is_anonymous_ip: = true
block if :total_charges_per_email_hourly: > 2
block if :total_charges_per_ip_daily:    > 3
block if :total_card_numbers_per_email_daily: > 2

# ── Freight-forwarder / reshipper ZIPs (maintain this list) ────────
review if :shipping_zip: in @known_reshipper_zips
```

`attempt_acknowledged` is included deliberately — a fallback charge with that status
still carries liability shift, and blocking it would reject good customers.

### Beyond Stripe

Consider **Signifyd** or **NoFraud** once you're past ~30 orders/month. They offer
*financial guarantees* — they eat the chargeback on orders they approve. At ~1% of
order value that's roughly $10 on a $1,000 order against a $165 margin, so it's a real
cost. It becomes correct when a single chargeback would hurt more than 6% of revenue
does. Not yet; revisit at ~$5k/mo.

---

## Part 3 — Chargeback defense (the harder problem)

### The threat model, honestly

| Dispute reason | 3DS covers? | Our defense | Residual risk |
|---|---|---|---|
| Fraudulent (stolen card) | ✅ **Yes** | 3DS + Radar | **Low** |
| Item not received | ❌ No | Signature + tracking + insurance | **Low** |
| **Not as described** | ❌ **No** | Authentication + photos + serial log | ⚠️ **This is the real one** |
| Duplicate / subscription | ❌ No | N/A — single purchases only | None |
| Credit not processed | ❌ No | Fast, documented refunds | Low |

An INAD chargeback on a genuine watch is the attack that works. There is no liability
shift to hide behind; you win it with **evidence quality**.

### The evidence pack — automated, generated per order

Every order accumulates an evidence bundle automatically as it moves through the state
machine. When a dispute arrives, you export, you don't reconstruct.

| Evidence | Captured at | Why it wins |
|---|---|---|
| **Authenticity Guarantee certificate + security tag photo** | inbound | A neutral third party certified this watch. Near-unanswerable against "it's fake" |
| **12–20 in-hand photos**, incl. macro of dial, caseback, clasp, any flaw | RECEIVED | Proves condition as sold |
| **Serial number photo + logged value** | RECEIVED | Proves the watch returned is the watch sent — kills the swap scam |
| **Unboxing/packing video**, continuous, showing serial then sealing | SHIPPED | Kills "the box was empty" |
| **Signed delivery confirmation + adult signature** | DELIVERED | Kills "never arrived" |
| Timestamped listing description snapshot | LISTED | Proves what was actually promised |
| Terms of Sale acceptance, with IP + timestamp | CHECKOUT | Proves disclosure |
| 3DS authentication result | AUTHORIZED | Proves cardholder authenticated |
| AVS/CVC results | AUTHORIZED | Proves card control |
| Full customer comms thread | ongoing | Context, and often a confession |
| IP, device fingerprint, geolocation | CHECKOUT | Ties order to buyer |

**The serial number log is the highest-value item on this list.** The most common
high-value watch scam is buy-genuine / return-fake. A photographed, logged serial makes
that provable in one step.

### Thresholds to stay far away from

Visa's Acquirer Monitoring Program (VAMP) sets the **merchant dispute ratio threshold at
1.5%** as of April 1, 2026 (down from 2.2%), with a **1,500-dispute floor** before
program enforcement, and roughly **$8 per dispute** in fees plus reserve and termination
risk beyond it.

At our volume the 1,500-dispute floor means VAMP itself will never touch us. **Stripe's
own internal risk review is the real constraint**, and it moves much earlier — sustained
disputes above ~0.75% can trigger reserves (commonly 5–10% of volume held 30–180 days)
or account closure.

**Practical target: ≤ 1 dispute per 100 orders.** At 6 orders/month that is
approximately *one dispute every 18 months*. If you get two in a quarter, stop selling
and fix the process — do not trade through it.

### Dispute response SOP

1. **Respond to every single one, always, within 48 hours.** Unanswered disputes are
   automatic losses and they still count against your ratio.
2. Export the evidence pack. Lead with the Authenticity Guarantee certificate and the
   signed delivery confirmation.
3. For `fraudulent` disputes on a 3DS-authenticated charge, **state the liability shift
   explicitly** in the response and cite the 3DS result. Issuers do sometimes push these
   through in error and they get reversed on the strength of that citation.
4. Log the outcome in `order_events`. Patterns in losses are the signal for what to fix.

---

## Part 4 — The pre-flight checklist

Before the first real order:

- [ ] Stripe account describes the business as **"pre-owned watch retail"** — never
      "broker," "marketplace," or "dropshipping"
- [ ] Radar for Fraud Teams enabled, all rules above deployed and tested in test mode
- [ ] 3DS forced; a non-3DS test card is confirmed **blocked**
- [ ] `capture_method: 'manual'` on every PaymentIntent — verified by making a test
      order and confirming nothing settles
- [ ] Void path tested end-to-end (simulate a source listing disappearing)
- [ ] `capture_before` monitored, with an alert at T-24h on any uncaptured auth
- [ ] Terms of Sale, Return Policy, Privacy Policy live and linked from checkout
- [ ] Handling time stated on every product page (FTC Mail Order Rule)
- [ ] Return policy: **30 days, no questions**, minus return shipping. Generous returns
      *reduce* chargebacks — a customer who can get a refund easily doesn't call their bank
- [ ] Business insurance bound
- [ ] Photography setup and SOP ready before the first watch arrives, not after

---

### Sources
- [Stripe — place a hold on a payment method (manual capture, `capture_before`)](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
- [Stripe — extended authorizations](https://docs.stripe.com/terminal/features/extended-authorizations)
- [Stripe — payment capture strategies](https://stripe.com/resources/more/payment-capture-strategies-timing-risks-and-what-businesses-need-to-know)
- [Stripe — fraud prevention rules (Radar)](https://docs.stripe.com/radar/rules)
- [Stripe — using Radar for Fraud Teams to prevent charges without liability shift](https://support.stripe.com/questions/using-radar-for-fraud-teams-to-prevent-charges-without-liability-shift)
- [Stripe — liability shift with frictionless 3DS2](https://support.stripe.com/questions/liability-shift-with-frictionless-flow-for-3d-secure-v2-(3ds2))
- [What the 3D Secure liability shift actually covers (Redo)](https://redo.com/resources/articles/chargebacks/3d-secure-liability-shift)
- [Visa VAMP 2026 thresholds (Chargeflow)](https://www.chargeflow.io/blog/vamp-visa-acquirer-monitoring-program)
- [VAMP Thresholds 2026 merchant playbook (c/side)](https://cside.com/blog/vamp-2026-merchant-playbook)
- [Stricter VAMP ratio thresholds now in effect (Merchant Risk Council)](https://merchantriskcouncil.org/learning/resource-center/member-news/blog/2026/stricter-vamp-ratio-thresholds-are-now-in-effect-heres-how-to-stay-compliant)
- [Stripe — prohibited and restricted businesses](https://stripe.com/legal/restricted-businesses)
- [Stripe high risk business (Chargeflow)](https://www.chargeflow.io/blog/stripe-high-risk-business)
