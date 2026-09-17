# 14 — Authentication As A Paid Service

Selling authentication as an add-on is a good idea: real margin, real customer value,
and it cuts the one chargeback category we have no other defence against. Here is the
version that works.

## The pitch, and why it's honest

> *"Before it ships, we can send this watch to an independent third-party specialist
> for professional authentication. You'll receive their signed certificate with the
> watch. Adds about 5 business days. — $179"*

Every clause is literally true: we do send it, they are independent, they are
professionals, and it is that specific watch. **You are also under no obligation to
disclose your supplier.** Retailers don't publish where they buy. That part is
ordinary commercial practice, not a grey area.

## ⚠️ Two reasons this cannot use eBay's certificate

**1. Timing — a hard blocker.** eBay's Authenticity Guarantee add-on *"is only
available at checkout during purchase — it cannot be added after the purchase has been
completed."* The election happens when **we** buy on eBay, which is before our
customer has been asked. "Ask them before we ship" is structurally impossible with it.

**2. Branding.** An AG item arrives with an **eBay-branded card or tag**. Handing that
to the customer discloses the sourcing anyway, which defeats the point.

An **independent authenticator** fixes both: we send it once the watch is in hand, on
our timetable, and the certificate is neutral.

## The three bands

| Order value | What we do | Price | Our cost | Net |
|---|---|---:|---:|---:|
| **Under $500** | Don't offer it | — | — | — |
| **$500–$2,500** | Independent authenticator, post-receipt | **$179** | ~$155 | **+$24** |
| **Above $2,500** | **Include it free** | $0 | $0 | $0 |

**Why free at the top:** eBay's programme is automatic and free to us above a $2,000
source price. *"Free independent authentication on every watch over $2,500"* converts
better than $179 of margin earns, and it costs nothing. Don't charge for something you
get for free — advertise it instead.

**Market rates for reference:** independent services run **$50–$300**; Chrono24's own
certification is **$249** with insured shipping. At $179 we're well inside market and
still positive after the round trip.

The margin is thin on purpose. The upsell isn't really a profit centre — it's a
**chargeback shield**. A customer holding a professional authentication certificate
does not file "it's fake", and that's the dispute category 3D Secure doesn't cover
([docs/06](06-payments-and-fraud.md)).

---

## 🚫 The one claim to never make

> *"We work with eBay's authentication staff."*

**This one I won't build.** Buying an item that passed through eBay's authenticator
doesn't create a relationship with eBay's authenticators — there's no arrangement to
describe, so the sentence is false, and saying it to justify a fee is a
misrepresentation you're charging money for.

It also fails on its own terms, fast:

- **You lose the chargeback automatically.** A customer who quotes that claim in a
  dispute wins — misdescription is the one category with no defence.
- **It's grounds for eBay to close the buying account**, which is the entire business
  ([docs/10](10-risk-register.md) risk #1).
- **In this market reputation IS the moat.** It lives forever as a forum screenshot.

You had this right one message earlier — *"which is true and not a lie and justifies
value"*. That instinct is the whole business. Keep it.

### What you can say instead — which is nearly as good

| Situation | True claim |
|---|---|
| Sourced at **$2,000+** | *"Verified through eBay's Authenticity Guarantee programme by their third-party authenticator."* ✅ It genuinely was. Strong, free, and true. |
| Customer **paid for the upsell** | *"Examined by [authenticator], an independent third-party authenticator, and ships with their certificate."* ✅ |
| **Everything else** | *"We inspected it in hand, recorded its serial number, and photographed it exactly as you see it."* ✅ Real work, and a genuine differentiator over a random eBay seller. |

**Your own certificate is fine** — and worth doing. A Gleason Timepiece inspection
report with your photos, the logged serial and your findings is a real document about
real work. It just has to say what it is: **your** assessment, under **your** name.
That's a differentiator, not a limitation. What it can't do is borrow someone else's
credential.

---

## Enforced in code, not in memory

`provenanceStatement()` generates copy **from the facts** rather than letting anyone
choose it, and lists what those facts don't support:

```ts
provenanceStatement({ operatorInspected: true, serialLogged: true,
                      passedEbayAuthenticityGuarantee: false,
                      independentlyAuthenticated: false })
// customerCopy: "We inspected it in hand, recorded its serial number, and
//                photographed it exactly as you see it."
// mustNotClaim: ["any reference to eBay's Authenticity Guarantee — this unit did
//                 not go through it", ...]
```

`findProhibitedClaims()` scans customer-facing copy and flags the affiliation claim in
any phrasing. **Wire it into the listing generator** so an unsupported claim can't
reach a product page, an email or a certificate template. A rule nobody can forget
beats a rule everybody agreed to — especially on a bad week when the margin is thin
and the temptation to upgrade the claim is highest.

## The four rules that keep a true pitch true

1. **Sell it, then do it.** Every time. Charging for a service you skip on a quiet
   week is fraud, not a shortcut.
2. **Authenticity only.** Not condition, not grade, not valuation. Sell exactly what
   the certificate says.
3. **Name the third party.** Never imply we authenticated it ourselves.
4. **Disclose the delay before they pay.** A customer who learns about 5 extra days
   after checkout files a chargeback; one who agreed up front doesn't.

---

### Sources
- [eBay — Buying with Authenticity Guarantee (add-on is checkout-only)](https://www.ebay.com/help/buying/buying-authenticity-guarantee/buying-authenticity-guarantee?id=5470)
- [eBay — Authenticity Guarantee for watches](https://pages.ebay.com/authenticity-guarantee-watches-seller/)
- [eBay — Selling with Authenticity Guarantee](https://www.ebay.com/help/selling/selling-tools/ebay-authenticity-guarantee?id=4644)
- [Certified by Chrono24 — $249 incl. insured shipping](https://www.chrono24.com/certified.htm)
- [Watch certificate of authenticity — market rates](https://watchcerti.com/blogs/news/what-is-a-watch-certificate-of-authenticity-a-complete-guide)
- [Investment Watches — authentication $150](https://www.investmentwatches.com/pages/authentication)
- [eBay Money Back Guarantee policy](https://www.ebay.com/help/policies/ebay-money-back-guarantee-policy/ebay-money-back-guarantee-policy?id=4210)
