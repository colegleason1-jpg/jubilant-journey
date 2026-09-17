# 08 — Operations Runbook

## Your actual time commitment, once it's running

| Cadence | Task | Time |
|---|---|---|
| **Daily (morning)** | Review the deal digest. Approve/reject. Buy the winners on eBay. | **10 min** |
| **Daily (evening)** | Clear the alert queue: risk-flagged orders, delist events, customer questions | **10 min** |
| **Per inbound watch** | Unbox, inspect, photograph, log serial, list or ship | **35 min** |
| **Per outbound** | Pack, video, label, insure, ship | **15 min** |
| **Weekly (Sun)** | Terapeak comp refresh on 40 refs. Watchlist review. Numbers. | **45 min** |
| **Weekly** | Content: one article or reference hub page | **2 hrs** |
| **Monthly** | Books, tax set-aside, dispute review, channel review | **90 min** |

**At 6 sales/month: ~14 hours/month.** That's the honest number. It is a real part-time
job, not passive income — but it's 14 hours for what used to take you most of a month.

The 35 minutes per inbound watch is the irreducible core and it cannot be automated.
Photography *is* the product.

---

## Shipping & insurance — read this before you ship anything

Carrier liability for watches is a trap that has cost a lot of resellers a lot of money.

### Carrier limits

| Carrier | Reality |
|---|---|
| **UPS** | Jewelry and watches are typically **capped at $500 maximum liability per package** in the terms of service. You can *declare* $5,000 and pay for it — and still find the claim capped at $500 on investigation, unless you're on a high-value goods contract or shipping through **Parcel Pro** (UPS's high-value subsidiary). |
| **USPS** | Priority Mail includes $100. You can buy up to **$5,000**. Above that you must use **Registered Mail** — covered to **$50,000** domestically, hand-signed custody at every transfer, and genuinely the most secure option in the country. Slow (5–10 days) but nearly untouchable. |
| **FedEx** | Similar jewelry limits to UPS. Not covered under a standard Jewelers Block policy without endorsement. |
| **Shippo / XCover "Total Protection"** | **Explicitly does not cover jewelry, precious metals or precious stones.** If you're relying on this, you are uninsured. |

### What we actually do

| Order value | Method | Insurance | Cost |
|---|---|---|---|
| < $1,000 | USPS Priority Mail Express, **signature required** | USPS declared value to $5,000 | ~$32 |
| $1,000–$5,000 | USPS Priority Mail Express, **adult signature** | USPS declared value | ~$40 |
| > $5,000 | **USPS Registered Mail** or **Parcel Pro** | Registered to $50k / Parcel Pro contract | ~$60 |

**Third-party specialist insurance** — **Jewelers Mutual**, **Parcel Pro**, **Cabrella**,
or **Secursus** — becomes correct at roughly 10+ shipments/month. Note that Jewelers
Mutual's standard block policy covers **USPS Priority Mail Express** but not UPS, FedEx
or DHL without endorsements. Get a Jewelers Block quote before your first $2,000 sale.

### Packaging rules

1. **Never** put a brand name, "watch," or anything identifying on the outside.
2. Plain box, generic return address label.
3. Watch in a travel case, in bubble, in a rigid inner box, in the outer box. Two boxes minimum.
4. **Signature required on every shipment. No exceptions, ever.** This is the single
   control that defeats "item not received."
5. Ship Monday–Wednesday only. A high-value package sitting in a weekend facility is
   avoidable risk.

---

## The inbound SOP (35 minutes, do not shortcut it)

This is your chargeback insurance policy. Every step produces evidence.

```
 1. FILM. Start recording before you cut the tape. One continuous take,
    no cuts, through step 7. Phone on a stand.                        [0:00]

 2. Unbox on a clean neutral surface. Show the shipping label on camera. [1:00]

 3. SERIAL NUMBER. Photograph it. Read it aloud on camera.
    Log it in `inventory.serial_number`. ← highest-value 60 seconds
    in the entire operation                                            [3:00]

 4. Condition inspection against the source listing, item by item:
    - Dial, hands, indices (macro)        - Case: scratches, polish
    - Caseback                            - Bracelet/strap + clasp
    - Crystal                             - Crown / pushers action
    - Timekeeping: 30s on a timegrapher app, log +/- sec/day
    - Box, papers, links, tags present?                                [12:00]

 5. Does it match the listing?
    NO  → stop. eBay return (seller accepts returns — hard gate, docs/04).
          If an order is attached: full refund + apology + alternatives.
    YES → continue.                                                    [14:00]

 6. PHOTOGRAPH: 20 shots, consistent setup.
    Front · back · crown side · left side · clasp open · clasp closed ·
    bracelet · lume · on-wrist · macro dial · macro caseback ·
    box & papers · every flaw individually, close, honestly            [28:00]

 7. STOP RECORDING. Upload video + photos to the order's evidence pack. [30:00]

 8. Photograph any flaw AGAIN, larger, for the listing. Under-promise
    condition in the description. A customer delighted that it's better
    than described never files a chargeback.                           [35:00]
```

> **Document flaws aggressively and honestly.** The instinct is to hide the scratch. The
> scratch you disclosed is a selling point ("this dealer is honest"); the scratch you
> hid is an INAD chargeback you will lose.

## The outbound SOP (15 minutes)

```
 1. FILM. Continuous take.
 2. Show the watch. Show the SERIAL on camera, matching the log.
 3. Set time, wind/check running, wipe down.
 4. Pack: travel case → bubble → inner box → note → outer box.
 5. Handwritten thank-you note with your real name. (Do not skip this.
    It is the cheapest retention and dispute-prevention tool available.)
 6. Seal on camera. Show the label on camera.
 7. STOP. Upload to evidence pack.
 8. Ship. Signature required. Tracking to customer with a photo of their
    actual watch packed.
```

---

## Daily deal review — what you're actually deciding

The engine has already applied every gate in
[`packages/core/src/deal.ts`](../packages/core/src/deal.ts). Your 90 seconds per deal is
spent on the things a machine can't judge:

| Check | Looking for |
|---|---|
| **Photos** | Real in-hand photos, not stock. Consistent lighting/surface across shots = same person, actually owns it |
| **Description tone** | Vague, copy-pasted, or too-good-to-be-true language |
| **Seller history** | Do they sell watches, or is this their first, between phone cases and clothing? |
| **Dial/hands sanity** | Font, spacing, date window alignment, lume plot shape. Learn one reference deeply and the fakes become obvious |
| **Price sanity** | Is it *too* cheap? A 50% discount isn't a deal, it's a warning |
| **Completeness** | Box and papers meaningfully move resale value |

**When in doubt, pass.** There will be another deal tomorrow. One bad watch costs more
than six good ones make.

---

## Business setup checklist (week 1)

- [ ] **LLC** (~$100–500 by state) — liability separation matters when you handle $2k items
- [ ] **EIN** — free, IRS website, 10 minutes
- [ ] **Business bank account** — Mercury or a local bank
- [ ] **Business credit card with a real limit** — this *is* your working capital
- [ ] ⭐ **State resale certificate** — see [docs/03](03-unit-economics.md); worth more than any code here
- [ ] ⭐ **eBay buyer tax exemption** registered against your buying account
- [ ] **eBay buying account**: clean, aged, good feedback. If it's new, buy 10 cheap
      things first and pay instantly. A new account with 0 feedback gets cancelled on by sellers.
- [ ] **eBay Developer account** + production keyset (Browse API)
- [ ] **eBay Partner Network** application (needs a live site with real content — so this
      comes after the storefront)
- [ ] **Stripe account**, described as pre-owned watch retail, **not** broker/marketplace
- [ ] **General liability + Jewelers Block insurance quote**
- [ ] **CPA, one hour** — sales tax nexus, inventory accounting, quarterly estimates
- [ ] **Separate business email and phone** (Google Voice is fine)

## Weekly numbers to track

Put these in one dashboard. If it takes more than 5 minutes to see them, you won't look.

| Metric | Target |
|---|---|
| Candidates screened | 600+/mo |
| Deals surfaced | 20–40/mo |
| Buy rate on surfaced deals | 25–35% |
| **Days to sell** (list → order) | **< 30** ⚠️ your #1 health metric |
| Gross margin % | > 14% |
| Realized vs. modeled margin | within 10% — if not, the comp model is wrong |
| Dispute rate | **0**. Investigate at 1. Stop at 2 in a quarter. |
| Return rate | < 8% |
| Source-gone-after-order rate | < 5% (tune J3 intervals if higher) |
| Organic sessions | up MoM |

**Days-to-sell is the metric that kills businesses like this.** Capital tied up in a
watch that won't move is capital not making the next deal. If median days-to-sell
exceeds 45, stop buying and cut prices until inventory clears. A 5% margin realized in
20 days beats a 20% margin realized in 200.

---

### Sources
- [UPS jewelry shipping insurance limits (ShipAid)](https://www.shipaid.com/blogs/ecommerce-shipping/ups-jewelry-shipping-insurance)
- [Insurance for shipping jewelry — 3 myths (Jewelers Mutual)](https://www.jewelersmutual.com/resources/business/shipping/insurance-shipping-jewelry-3-myths-to-stop-believing)
- [How to ship jewelry — carrier & insurance guide (Shippo)](https://goshippo.com/blog/how-to-ship-jewelry-for-your-e-commerce-store-tips-examples-for-shipping-jewelry)
- [Shipping insurance for jewelry & watches (Cabrella)](https://www.ecabrella.com/industries/jewelry-watches)
- [Shipping insurance for jewelry by value](https://blog.superjeweler.com/shipping-insurance-for-jewelry)
- [How to ship high-value items (Secursus)](https://www.secursus.com/en-us/resource/article/how-to-ship-high-value-items/)
