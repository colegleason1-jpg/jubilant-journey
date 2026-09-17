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

## Put the option on the listing, and eBay's cheap certificate works

eBay's add-on *"is only available at checkout during purchase — it cannot be added
after the purchase has been completed."*

That's satisfied as long as the customer elects it **before we buy**, because **our
eBay purchase is that checkout.** So the option belongs on the product page as a line
item, not as a question asked before shipping:

```
customer orders WITH the certificate option
        ↓
we buy on eBay AND elect the $80 add-on at that checkout
        ↓
eBay's authenticator inspects it (already in the shipping path)
        ↓
us → customer, with the certificate
```

**This is the route to use.** $80 instead of ~$155, and no extra round trip because
the authenticator already sits between the seller and us.

### When the independent route is still needed

**Stocked inventory** (Mode A in [docs/12](12-buy-box-and-offers.md)). If we already
own the watch, the eBay checkout is behind us and the add-on can never be applied to
that unit. Selling authentication on a watch already in hand means an independent
authenticator: ~$155 and ~5 days instead of $80 and ~3.

That's a real, quantified reason to prefer **sourced-to-order** as the default
operating mode — it's not just about inventory risk.

### The eBay-branded tag is an asset, not a leak

An AG item arrives with an eBay-branded card or tag, so this route does reveal the
watch passed through eBay. **Keep it.** *"Verified through eBay's Authenticity
Guarantee"* is a recognised, trusted marker — a stronger claim to most buyers than an
unfamiliar independent service, and completely true. Use the independent route only
when a neutral certificate genuinely matters more than the recognition.

## The bands

**Sourced to order** (Mode B — our default):

| Order value | Method | Price | Our cost | **Net** | Adds |
|---|---|---:|---:|---:|---:|
| Under $500 | Not offered | — | — | — | — |
| **$500–$2,500** | **eBay AG, elected at our checkout** | **$179** | **$80** | **+$99** | 3 days |
| **Above $2,500** | **Include it free** | $0 | $0 | $0 | 2 days |

**Stocked** (Mode A — we already own it):

| Order value | Method | Price | Our cost | Net | Adds |
|---|---|---:|---:|---:|---:|
| $500–$2,500 | Independent authenticator | $179 | ~$155 | +$24 | 5 days |

**Why free at the top:** eBay's programme is automatic and free to us above a $2,000
source price. *"Free third-party authentication on every watch over $2,500"* converts
better than $179 of margin earns, and it costs nothing. Don't charge for something you
get free — advertise it.

**Market rates for reference:** independent services run **$50–$300**; Chrono24's own
certification is **$249** with insured shipping. $179 sits comfortably inside market.

At +$99 on the sourced-to-order route this is a genuine margin line, not just a
chargeback shield — though it's both. A customer holding a professional authentication
certificate does not file "it's fake", and that's the dispute category 3D Secure
doesn't cover ([docs/06](06-payments-and-fraud.md)).

### Baking it in vs. offering it

You mentioned baking the cost in. Both work; the trade is:

- **Optional line item** *(recommended for $500–$2,000)* — keeps the headline price
  competitive, which is the whole value proposition. An $80 cost baked into a $900
  watch is a 9% price rise on the thing customers compare.
- **Always included** *(above $2,000)* — free to us anyway, simpler ops, and a much
  stronger trust signal: *every* watch authenticated.

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
