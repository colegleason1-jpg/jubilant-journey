/**
 * Photo provenance — which images may represent which watch.
 *
 * ── The symmetry worth noticing ─────────────────────────────────────────────────
 * `deal.ts` already has a hard REJECT gate called STOCK_PHOTOS. We refuse to buy an
 * eBay listing that uses stock imagery for a used watch, because a "used" item shown
 * with the manufacturer's press photo is a fraud signal roughly nine times in ten.
 *
 * That is the same judgement our customer would be making about us. The rule below is
 * just our own sourcing rule applied in the other direction.
 *
 * ── What the research actually says ─────────────────────────────────────────────
 * Two findings, one of which contradicts the obvious assumption:
 *
 *   • "The person who takes photos owns the copyright to those photos." Another
 *     seller's listing images are theirs. eBay will not even mediate seller-to-seller
 *     image disputes — that is a DMCA matter.
 *
 *   • Manufacturer images are NOT automatically free either: "you can't use images or
 *     videos from a manufacturer's website, even if it is publicly available." Brands
 *     commonly license imagery to retailers through media kits and dealer portals, but
 *     you have to actually obtain it.
 *
 * And on disputes: issuers "lean toward the cardholder unless the merchant has firm
 * evidence", and the merchant must "demonstrate with evidence that what they received
 * matched your accurate description." A photo of a different unit is not evidence
 * about this one — which is exactly the gap an INAD chargeback lives in, and INAD is
 * the category 3D Secure does not cover (docs/06).
 */

import type { Condition } from './types.ts';

export type PhotoProvenance =
  /** We photographed this specific watch. Always valid. */
  | 'IN_HAND'
  /** Manufacturer imagery we hold permission to use. New/unworn only. */
  | 'MANUFACTURER_LICENSED'
  /** The source seller's own photos, reused with their explicit permission. */
  | 'SOURCE_SELLER_PERMISSION'
  /** Taken from a listing, a search, or a brand site without permission. */
  | 'UNLICENSED';

/** Conditions where an image of a *different* example is still accurate. */
const REPRESENTATIVE_OK: readonly Condition[] = ['NEW', 'NEW_OTHER'];

export interface PhotoSet {
  provenance: PhotoProvenance;
  count: number;
  condition: Condition;
  /** Light exposure/white-balance correction on real images of THIS watch. */
  colorCorrected?: boolean;
  /** Edited to alter what the watch looks like. Never acceptable. */
  blemishesRetouched?: boolean;
}

export interface PhotoVerdict {
  usable: boolean;
  /** Disclosure the listing must carry. Empty when we shot it ourselves. */
  requiredDisclosure: string;
  blockers: string[];
  warnings: string[];
}

export function reviewPhotoSet(set: PhotoSet): PhotoVerdict {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let requiredDisclosure = '';

  if (set.provenance === 'UNLICENSED') {
    blockers.push(
      'images taken without permission — the photographer owns them, and eBay ' +
        'treats seller-to-seller image copying as a DMCA matter rather than ' +
        'mediating it',
    );
  }

  if (set.blemishesRetouched) {
    blockers.push(
      'retouched to alter the watch\'s appearance — this is the misdescription an ' +
        'INAD chargeback is built on, and issuers side with the cardholder absent ' +
        'firm evidence',
    );
  }

  const representative =
    set.provenance === 'MANUFACTURER_LICENSED' ||
    set.provenance === 'SOURCE_SELLER_PERMISSION';

  if (representative && !REPRESENTATIVE_OK.includes(set.condition)) {
    blockers.push(
      `condition is ${set.condition}: an image of a different example cannot show ` +
        'this unit\'s wear, so it is neither accurate nor defensible in a dispute. ' +
        'This is the same STOCK_PHOTOS rule we reject sellers on.',
    );
  }

  if (set.provenance === 'MANUFACTURER_LICENSED') {
    requiredDisclosure =
      'Manufacturer image shown. This watch is new and unworn; it is identical to ' +
      'the example pictured.';
    warnings.push(
      'confirm the brand actually licenses retailer use — public availability is ' +
        'not permission',
    );
  }

  if (set.provenance === 'SOURCE_SELLER_PERMISSION') {
    requiredDisclosure =
      'Photographs supplied by the previous owner and shown with their permission.';
    warnings.push('keep the written permission on file against a future dispute');
  }

  if (set.provenance === 'IN_HAND' && set.count < 5) {
    warnings.push(`only ${set.count} photographs — thin evidence if this is disputed`);
  }

  if (set.colorCorrected && set.provenance === 'IN_HAND') {
    // Normal product photography. Exposure and white balance are not the watch.
    warnings.push('colour-corrected only — keep the originals with the order record');
  }

  return {
    usable: blockers.length === 0,
    requiredDisclosure,
    blockers,
    warnings,
  };
}

/**
 * The practical route for a watch we never handle.
 *
 * Ask the source seller for permission to reuse their photographs. It costs a
 * message, many will agree, and it is the difference between images you can defend
 * and images you cannot. Do it before the listing goes up, not after a dispute.
 */
export const SOURCE_SELLER_PERMISSION_REQUEST = [
  'Hi — I buy watches for resale and your photographs of this piece are better than',
  'anything I could retake. If I purchase it, would you be willing to let me reuse',
  'your listing images for my own listing? Happy to credit you. Either way, thanks.',
].join(' ');
