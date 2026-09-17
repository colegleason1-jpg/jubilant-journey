---
name: calibrate
description: Grade the deal engine against real outcomes and propose specific threshold changes. Use after shadow mode has run, when asking whether the comps are accurate, or whether the gates are set right.
---

# Calibrate the model against reality

Every threshold in this repo is a number someone reasoned toward. This is how they
stop being opinions.

## Do this

1. **Check coverage before reading anything.**
   ```bash
   cd services/scout && python -m scout.calibrate
   ```
   Under ~30 resolved decisions, say so and stop. Below that it's noise, and tuning
   on noise is worse than not tuning.

2. **Read comp accuracy first, always.** If the market estimate is wrong, every gate
   is tuned against a fiction and no gate adjustment fixes it.

   | Median abs error | Action |
   |---|---|
   | ≤ 5% | Trustworthy — tune gates against it |
   | 5–12% | Usable but loose — widen the contribution floor to absorb the error |
   | > 12% | **Fix the comp engine first.** Nothing downstream is meaningful |

   **Signed error matters more than absolute.** It means bias, not noise, and bias is
   correctable. Overvaluing by 10% means systematically overpaying by 10%.

3. **Then the gates.** Two opposite failure modes:
   - **Too loose** — passes that would have lost money → raise the contribution floor
   - **Too tight** — profitable rejections → the report names the gate and totals the
     money left behind

4. **Propose changes as a diff**, one variable at a time, with the evidence:
   > `MIN_DISCOUNT_TO_MARKET_PCT` 0.18 → 0.12 — blocked 5 listings worth $225 of
   > realised contribution over 6 weeks; no unprofitable passes in the same period.

## Rules

- **One threshold at a time.** Change two and you learn nothing from the next cycle.
- **Never tune on fewer than 30 resolved decisions.**
- Correct a comp bias *before* touching any gate.
- Re-run after three more weeks. Calibration is a loop, not an event.

## Output

The report, then a short list of proposed changes with the evidence for each. If the
data doesn't support a change, say that — "leave it alone" is a real finding.
