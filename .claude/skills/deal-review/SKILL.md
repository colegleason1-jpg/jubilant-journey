---
name: deal-review
description: Produce today's buy list from passed candidates — re-verify each is still live, show the bid ceiling and offer ladder, and flag anything needing a second look. Use when reviewing what to buy, checking the daily digest, or asking "what should I buy today".
---

# Daily deal review

Turns passed candidates into a decision list. Target: **90 seconds per deal.**

## Do this

1. **Re-verify availability first.** A candidate found hours ago may be gone.
   ```bash
   cd services/scout && python -m scout.main --shadow
   ```
   Anything whose source listing has ended is dead — drop it before spending
   attention on it.

2. **For each passing candidate, present:**
   - Title, landed price (item + inbound shipping), market estimate
   - **Bid ceiling** — never pay more than this
   - Contribution and contribution per hour
   - Offer ladder if the listing takes Best Offers (10% → 5% → ask), marking
     any rung that breaches the floor as *do not send*
   - Warnings, verbatim
   - Direct eBay link

3. **Sort by rank score** (adjusted contribution per hour), not by price or margin.

4. **Flag for a closer look** — these are machine-invisible:
   - Photos that look like stock imagery on a used watch
   - Seller whose history is phone cases and clothing, not watches
   - Dial/hands/date-window details that look off for the reference
   - A discount so deep it's a warning rather than a win

## Rules

- **Never place an order, and never send an offer.** eBay's User Agreement prohibits
  automated ordering, and that includes Best Offers. Produce the list; the human
  clicks. The buying account is the business.
- **When in doubt, say pass.** There is another deal tomorrow. One bad watch costs
  more than six good ones make.
- Present the bid ceiling as a hard number, never a suggestion.

## Output

A short list, best first. For each: what it is, what to pay, what to offer, what to
check. If nothing passed, say so plainly — a quiet day is a normal outcome, not a
reason to loosen a gate.
