/**
 * Deal economics — contribution, not margin percentage.
 *
 * ── What the previous model got wrong ───────────────────────────────────────────
 * It declared a margin floor per price band (12% in the $1k–2.5k band, etc.) and
 * rejected anything below it. On a $2,600 watch that demanded buying at $1,890 —
 * a 27% discount — and clearing $280.
 *
 * That threw away real money. A $2,600 watch bought at $2,300 and listed at $2,450
 * contributes +$46 on a card and +$112 on ACH. Positive money, a far more findable
 * deal, and — the part a margin gate cannot see — a customer.
 *
 * ── The objective function ──────────────────────────────────────────────────────
 * This is not a portfolio of independent transactions. It is a business trying to
 * build an organic customer pipeline, where:
 *
 *   • Paid acquisition costs $156–782 per customer at our price points (docs/07).
 *   • A sale that contributes $1 and acquires a customer is therefore not a marginal
 *     deal. It is the cheapest customer acquisition available, by two orders of
 *     magnitude.
 *   • Customers leave reviews, refer (20–30% referral rate in luxury), and return
 *     (9–20% in jewellery/watches, 76% of those within 90 days).
 *
 * So the only HARD floor is: does this cover its own cash costs? Everything above
 * that is a question of whether we have the time and float to do it — a capacity
 * question, not a margin question.
 *
 * ── What is actually scarce ─────────────────────────────────────────────────────
 * Not margin. Time (~14 hrs/month) and float ($4–5k). So deals are RANKED by
 * contribution per hour and return on float, and only rejected when something better
 * is competing for the same hour or the same dollar.
 */

import { operationalProfile, processingFeeUsd, type PaymentRail } from './tiers.ts';
import type { AuthTier } from './types.ts';

// ───────────────────── authentication & list pricing ────────────────────────────

/**
 * eBay Authenticity Guarantee bands, keyed on the SOURCE price.
 *
 *   FREE   $2,000+            automatic, eBay pays for both sides
 *   ADDON  $500 – $1,999.99   OPTIONAL, $80, elected and paid by the BUYER
 *   NONE   under $500         not offered
 *
 * The programme covers sneakers, watches, handbags, jewellery, streetwear and
 * trading cards — it is eBay's collector-item authentication system, and the name
 * for it is Authenticity Guarantee.
 */
export function authTierForPrice(sourcePriceUsd: number): AuthTier {
  if (sourcePriceUsd >= 2000) return 'FREE';
  if (sourcePriceUsd >= 500) return 'ADDON';
  return 'NONE';
}

/**
 * What authentication costs US.
 *
 * ⚠️ DEFAULT ZERO IN THE ADDON BAND, and that is a deliberate reversal.
 *
 * An earlier model charged the $80 add-on as a mandatory cost on every $500–$1,999
 * purchase. It is not mandatory — it is buyer-elected, and we are the buyer. Paying
 * it by default cost ~9% of a $900 order and made that band the tightest in the
 * entire range for no reason.
 *
 * We do not need to buy it, because our buy-side protection is already free:
 * **eBay Money Back Guarantee** covers counterfeit and not-as-described on every
 * purchase, for 30 days, overriding the seller's own return policy. That is our
 * remedy if a watch turns out wrong.
 *
 * And above $2,000 Authenticity Guarantee is automatic and free anyway, so the
 * certificate costs us nothing exactly where the stakes are highest.
 *
 * Elect it deliberately (`electAuthenticity: true`) when the certificate is worth
 * $80 to you on a specific unit — a marginal seller, a commonly-faked reference, or
 * a customer who asks for it. Not as a blanket policy.
 */
export function authenticationCostUsd(
  sourcePriceUsd: number,
  opts: { elect?: boolean; addonUsd?: number } = {},
): number {
  const { elect = false, addonUsd = 80 } = opts;
  return elect && authTierForPrice(sourcePriceUsd) === 'ADDON' ? addonUsd : 0;
}

/** List price = market less the discount we advertise, rounded to look like retail. */
export function solveListPrice(marketPriceUsd: number, discountToMarket = 0.1): number {
  const raw = marketPriceUsd * (1 - discountToMarket);
  // $5 steps above $100; $1 steps below, where $5 would be a 5% swing.
  return raw >= 100 ? Math.round(raw / 5) * 5 : Math.round(raw);
}

/** How far under market a candidate is, as a fraction. */
export function discountToMarket(sourcePriceUsd: number, marketPriceUsd: number): number {
  if (marketPriceUsd <= 0) return 0;
  return Math.round(((marketPriceUsd - sourcePriceUsd) / marketPriceUsd) * 10_000) / 10_000;
}

// ───────────────────────── the shipping cost curve ──────────────────────────────

/**
 * Outbound shipping, modelled as a curve over declared value rather than declared
 * per band. Components are the real published pieces: postage by service level,
 * signature confirmation, and insurance above the included $100.
 *
 * Constants are fitted to published USPS retail rates. **Re-fit them to your own
 * commercial/negotiated rates** — that is the single easiest way to widen every
 * deal in the book, because this cost sits on every unit.
 */
export interface ShippingCurve {
  /** Postage by service level, chosen by value. */
  groundAdvantageUsd: number;
  priorityUsd: number;
  priorityExpressUsd: number;
  registeredUsd: number;
  signatureConfirmationUsd: number;
  adultSignatureUsd: number;
  /** Insurance included with the base service. */
  includedInsuranceUsd: number;
  /** First insurance step above the included amount. */
  insuranceBaseUsd: number;
  /** Cost per additional $100 of declared value. */
  insurancePer100Usd: number;
  /** Above this, Registered Mail and a proportional rate. */
  registeredThresholdUsd: number;
  registeredRatePct: number;
}

export const DEFAULT_SHIPPING: ShippingCurve = {
  groundAdvantageUsd: 8.5,
  priorityUsd: 11.0,
  priorityExpressUsd: 28.0,
  registeredUsd: 45.0,
  signatureConfirmationUsd: 4.15,
  adultSignatureUsd: 10.05,
  includedInsuranceUsd: 100,
  insuranceBaseUsd: 2.65,
  insurancePer100Usd: 1.05,
  registeredThresholdUsd: 5000,
  registeredRatePct: 0.005,
};

export function shippingCostUsd(
  declaredValueUsd: number,
  curve: ShippingCurve = DEFAULT_SHIPPING,
): number {
  const v = Math.max(0, declaredValueUsd);

  const postage =
    v < 250
      ? curve.groundAdvantageUsd
      : v < 1000
        ? curve.priorityUsd
        : v < curve.registeredThresholdUsd
          ? curve.priorityExpressUsd
          : curve.registeredUsd;

  const signature =
    v < 250 ? 0 : v < 1000 ? curve.signatureConfirmationUsd : curve.adultSignatureUsd;

  let insurance = 0;
  if (v > curve.includedInsuranceUsd) {
    insurance =
      v >= curve.registeredThresholdUsd
        ? v * curve.registeredRatePct
        : curve.insuranceBaseUsd +
          curve.insurancePer100Usd * Math.ceil((v - curve.includedInsuranceUsd) / 100);
  }

  return round2(postage + signature + insurance);
}

/** Packaging scales gently with value: a mailer, then a box, then a box in a box. */
export function packagingCostUsd(orderValueUsd: number): number {
  if (orderValueUsd < 250) return 1.5;
  if (orderValueUsd < 1000) return 4.0;
  if (orderValueUsd < 5000) return 9.0;
  return 18.0;
}

// ────────────────────────── strategic value of a sale ───────────────────────────

/**
 * What a NEW customer is worth beyond this transaction.
 *
 * Deliberately conservative, and sourced rather than invented (docs/12):
 *   • Jewellery/watch repeat purchase rate is 9–20%; we use 12%.
 *   • Second-purchase AOV runs 1.3–1.6× the first; we use 1.4×.
 *   • Luxury referral rates run 20–30%; we count 0.15 converted referrals.
 *
 * The cross-check: this lands near the published ~$48 CAC benchmark for >$200-AOV
 * ecommerce. Acquiring a customer is worth roughly what acquiring one costs — which
 * is the point. A $10 sale to a new customer is not a $10 event.
 */
export interface LtvAssumptions {
  repeatRate: number;
  secondOrderAovMultiplier: number;
  expectedReferrals: number;
  /** Average contribution of a future order, in dollars. */
  averageFutureContributionUsd: number;
  /** Extra credit for a sale likely to produce a public review or forum rep. */
  reviewCreditUsd: number;
}

export const DEFAULT_LTV: LtvAssumptions = {
  repeatRate: 0.12,
  secondOrderAovMultiplier: 1.4,
  expectedReferrals: 0.15,
  averageFutureContributionUsd: 150,
  reviewCreditUsd: 0,
};

export function newCustomerCreditUsd(ltv: LtvAssumptions = DEFAULT_LTV): number {
  const repeatValue =
    ltv.repeatRate * ltv.averageFutureContributionUsd * ltv.secondOrderAovMultiplier;
  const referralValue = ltv.expectedReferrals * ltv.averageFutureContributionUsd;
  return round2(repeatValue + referralValue + ltv.reviewCreditUsd);
}

// ──────────────────────────── the deal economics ────────────────────────────────

export interface EconomicsInput {
  sourcePriceUsd: number;
  /** Inbound shipping we pay to get it. Part of the buy price, never an afterthought. */
  inboundShippingUsd?: number;
  listPriceUsd: number;
  rail?: PaymentRail;
  isNewCustomer?: boolean;
  /**
   * Pay for the optional $80 Authenticity Guarantee add-on on a $500–$1,999 source
   * price. Default false — see authenticationCostUsd(). Above $2,000 the programme
   * is free and automatic, so this flag is irrelevant there.
   */
  electAuthenticity?: boolean;
  salesTaxRate?: number;
  hasResaleCertificate?: boolean;
  epnCommissionRate?: number;
  authenticationUsd?: number;
  shipping?: ShippingCurve;
  ltv?: LtvAssumptions;
}

export interface DealEconomics {
  revenueUsd: number;
  shippingCollectedUsd: number;
  sourceCostUsd: number;
  salesTaxUsd: number;
  authenticationUsd: number;
  outboundShippingUsd: number;
  packagingUsd: number;
  processingFeeUsd: number;
  epnCreditUsd: number;
  /** Revenue minus every variable cash cost. THE number. */
  contributionUsd: number;
  contributionMarginPct: number;
  handlingMinutes: number;
  contributionPerHourUsd: number;
  /** Cash tied up until Stripe settles. */
  floatRequiredUsd: number;
  /** Contribution as a return on that float. Comparable across price points. */
  returnOnFloatPct: number;
  strategicCreditUsd: number;
  /** contribution + strategic credit. What we actually rank on. */
  adjustedContributionUsd: number;
  rail: PaymentRail;
  profileLabel: string;
}

export function computeEconomics(input: EconomicsInput): DealEconomics {
  const {
    sourcePriceUsd,
    inboundShippingUsd = 0,
    listPriceUsd,
    isNewCustomer = true,
    salesTaxRate = 0.075,
    hasResaleCertificate = true,
    // ⚠️ DEFAULT ZERO, deliberately. eBay Partner Network is built for driving
    // EXTERNAL traffic to eBay, and affiliate programs generally prohibit earning
    // commission on your own purchases. I could not confirm that self-referral is
    // permitted, so it is not in the base case. At the thin contributions we now
    // target, a phantom 1.5% is exactly what turns a real $1 profit into a real
    // loss. Verify with EPN first; if they confirm it, set this and enjoy the upside.
    epnCommissionRate = 0,
    shipping = DEFAULT_SHIPPING,
    ltv = DEFAULT_LTV,
  } = input;

  const profile = operationalProfile(listPriceUsd);
  const rail = input.rail ?? profile.preferredRail;

  const shippingCollectedUsd = profile.shippingChargedToCustomer
    ? shippingCostUsd(listPriceUsd, shipping)
    : 0;
  const revenueUsd = listPriceUsd + shippingCollectedUsd;

  const landedSource = sourcePriceUsd + inboundShippingUsd;
  const salesTaxUsd = hasResaleCertificate ? 0 : sourcePriceUsd * salesTaxRate;
  // Derived consistently everywhere (an explicit override still wins), so the bid
  // ceiling and the gate can never disagree about it.
  const authenticationUsd =
    input.authenticationUsd ??
    authenticationCostUsd(sourcePriceUsd, { elect: input.electAuthenticity ?? false });
  const outboundShippingUsd = shippingCostUsd(listPriceUsd, shipping);
  const packaging = packagingCostUsd(listPriceUsd);
  const processing = processingFeeUsd(revenueUsd, rail);
  const epnCreditUsd = sourcePriceUsd * epnCommissionRate;

  const contributionUsd =
    revenueUsd -
    landedSource -
    salesTaxUsd -
    authenticationUsd -
    outboundShippingUsd -
    packaging -
    processing +
    epnCreditUsd;

  const floatRequiredUsd = landedSource + salesTaxUsd + authenticationUsd;
  const strategicCreditUsd = isNewCustomer ? newCustomerCreditUsd(ltv) : 0;

  return {
    revenueUsd: round2(revenueUsd),
    shippingCollectedUsd: round2(shippingCollectedUsd),
    sourceCostUsd: round2(landedSource),
    salesTaxUsd: round2(salesTaxUsd),
    authenticationUsd: round2(authenticationUsd),
    outboundShippingUsd: round2(outboundShippingUsd),
    packagingUsd: round2(packaging),
    processingFeeUsd: round2(processing),
    epnCreditUsd: round2(epnCreditUsd),
    contributionUsd: round2(contributionUsd),
    contributionMarginPct: revenueUsd > 0 ? round4(contributionUsd / revenueUsd) : 0,
    handlingMinutes: profile.handlingMinutes,
    contributionPerHourUsd: round2(contributionUsd / (profile.handlingMinutes / 60)),
    floatRequiredUsd: round2(floatRequiredUsd),
    returnOnFloatPct: floatRequiredUsd > 0 ? round4(contributionUsd / floatRequiredUsd) : 0,
    strategicCreditUsd: round2(strategicCreditUsd),
    adjustedContributionUsd: round2(contributionUsd + strategicCreditUsd),
    rail,
    profileLabel: profile.label,
  };
}

// ────────────────────────────── the decision ────────────────────────────────────

/**
 * Capacity state. This — not margin — is what decides whether a thin deal is good.
 *
 * ABUNDANT:    spare hours and spare float. Take anything that pays for itself.
 *              A $1 contribution plus a customer beats an idle hour.
 * CONSTRAINED: hours or float are the binding resource. Now thin deals genuinely
 *              cost you: every one occupies an hour a fatter deal wanted.
 */
export type Capacity = 'ABUNDANT' | 'CONSTRAINED';

export interface DealPolicy {
  /**
   * The only hard floor: cover your own cash costs and leave something.
   * Default $1 — literally "if I make a damn dollar that's fine".
   */
  minContributionUsd: number;
  /** Enforced ONLY when capacity is CONSTRAINED. */
  minContributionPerHourUsd: number;
  /** Enforced ONLY when capacity is CONSTRAINED. */
  minReturnOnFloatPct: number;
  capacity: Capacity;
  /** Count the LTV credit toward the floor. Off by default: keep the floor cash-real. */
  countStrategicCreditTowardFloor: boolean;
}

export const DEFAULT_POLICY: DealPolicy = {
  minContributionUsd: 1,
  minContributionPerHourUsd: 25,
  minReturnOnFloatPct: 0.015,
  capacity: 'ABUNDANT',
  countStrategicCreditTowardFloor: false,
};

export interface DealVerdict {
  accept: boolean;
  reasons: string[];
  /** What we sort the digest by. Higher is better. */
  rankScore: number;
}

export function judgeDeal(
  e: DealEconomics,
  policy: DealPolicy = DEFAULT_POLICY,
): DealVerdict {
  const reasons: string[] = [];
  const floorBasis = policy.countStrategicCreditTowardFloor
    ? e.adjustedContributionUsd
    : e.contributionUsd;

  if (floorBasis < policy.minContributionUsd) {
    reasons.push(
      `contribution $${floorBasis.toFixed(2)} below the $${policy.minContributionUsd} floor`,
    );
  }

  if (policy.capacity === 'CONSTRAINED') {
    if (e.contributionPerHourUsd < policy.minContributionPerHourUsd) {
      reasons.push(
        `$${e.contributionPerHourUsd.toFixed(2)}/hr below $${policy.minContributionPerHourUsd}/hr ` +
          `— an hour is scarce right now`,
      );
    }
    if (e.returnOnFloatPct < policy.minReturnOnFloatPct) {
      reasons.push(
        `${(e.returnOnFloatPct * 100).toFixed(2)}% return on float below ` +
          `${(policy.minReturnOnFloatPct * 100).toFixed(2)}% — float is scarce right now`,
      );
    }
  }

  return {
    accept: reasons.length === 0,
    reasons,
    // Rank on adjusted contribution per hour: the value of an hour of your life,
    // counting the customer you acquire, not just the watch you flip.
    rankScore: round2(e.adjustedContributionUsd / (e.handlingMinutes / 60)),
  };
}

/**
 * The highest source price at which a deal still clears the policy floor.
 *
 * Solved by bisection rather than algebra: shipping, packaging, the payment rail and
 * handling time are all step functions of value, so there is no clean closed form —
 * and pretending otherwise is how the last version acquired constants nobody could
 * justify.
 */
export function maxSourcePrice(
  listPriceUsd: number,
  opts: Omit<EconomicsInput, 'sourcePriceUsd' | 'listPriceUsd'> = {},
  policy: DealPolicy = DEFAULT_POLICY,
): number {
  const clears = (source: number): boolean =>
    judgeDeal(computeEconomics({ ...opts, sourcePriceUsd: source, listPriceUsd }), policy)
      .accept;

  if (!clears(0)) return 0;
  let lo = 0;
  let hi = listPriceUsd * 1.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (clears(mid)) lo = mid;
    else hi = mid;
  }
  // Floor to the cent rather than round: rounding up by a fraction of a cent can
  // push the returned price just past the floor it is supposed to respect, so the
  // answer would not itself be acceptable.
  return Math.floor(lo * 100) / 100;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}
