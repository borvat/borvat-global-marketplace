/**
 * The single pricing engine.
 *
 * Both the cart view and the checkout quote call this function, so a customer can
 * never be shown one total and charged another for the same basket.
 *
 * Shipping rule: each vendor ships one parcel, so a vendor charges the highest
 * single-line shipping cost of its own lines, unless the vendor's goods subtotal
 * reaches that line's free-shipping threshold.
 */

import { multiply, taxFromInclusive } from './money.ts';
import { validation } from './errors.ts';

export interface PricingLine {
  readonly offerId: string;
  readonly vendorOrganizationId: string;
  readonly unitPriceMinor: bigint;
  readonly shippingMinor: bigint;
  readonly freeShippingThresholdMinor: bigint | null;
  readonly quantity: number;
}

export interface VendorGroup {
  readonly vendorOrganizationId: string;
  readonly goodsMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
}

export interface PricingResult {
  readonly itemsSubtotalMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly taxRateBps: number;
  readonly vendorGroups: VendorGroup[];
  readonly lineTotals: ReadonlyMap<string, bigint>;
}

export function computePricing(lines: readonly PricingLine[], taxRateBps: number): PricingResult {
  if (lines.length === 0) throw validation('cannot price an empty basket');
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 4000) {
    throw validation(`invalid tax rate: ${taxRateBps}`);
  }

  const lineTotals = new Map<string, bigint>();
  const groups = new Map<string, { goodsMinor: bigint; shippingCandidates: bigint[]; thresholds: bigint[] }>();

  let itemsSubtotalMinor = 0n;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw validation(`invalid quantity for offer ${line.offerId}`);
    }
    const goods = multiply(line.unitPriceMinor, line.quantity);
    lineTotals.set(line.offerId, goods);
    itemsSubtotalMinor += goods;
    const group = groups.get(line.vendorOrganizationId) ?? {
      goodsMinor: 0n,
      shippingCandidates: [],
      thresholds: [],
    };
    group.goodsMinor += goods;
    group.shippingCandidates.push(line.shippingMinor);
    if (line.freeShippingThresholdMinor !== null) {
      group.thresholds.push(line.freeShippingThresholdMinor);
    }
    groups.set(line.vendorOrganizationId, group);
  }

  let shippingMinor = 0n;
  const vendorGroups: VendorGroup[] = [];
  for (const [vendorOrganizationId, group] of groups) {
    const highestShipping = group.shippingCandidates.reduce((a, b) => (b > a ? b : a), 0n);
    const lowestThreshold = group.thresholds.length === 0
      ? null
      : group.thresholds.reduce((a, b) => (b < a ? b : a));
    const freeShipping = lowestThreshold !== null && group.goodsMinor >= lowestThreshold;
    const vendorShipping = freeShipping ? 0n : highestShipping;
    const vendorTotal = group.goodsMinor + vendorShipping;
    const vendorTax = taxFromInclusive(vendorTotal, taxRateBps);
    shippingMinor += vendorShipping;
    vendorGroups.push({
      vendorOrganizationId,
      goodsMinor: group.goodsMinor,
      shippingMinor: vendorShipping,
      taxMinor: vendorTax,
      totalMinor: vendorTotal,
    });
  }

  const totalMinor = itemsSubtotalMinor + shippingMinor;
  const taxMinor = taxFromInclusive(totalMinor, taxRateBps);
  vendorGroups.sort((a, b) => (a.vendorOrganizationId < b.vendorOrganizationId ? -1 : 1));

  return {
    itemsSubtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor,
    taxRateBps,
    vendorGroups,
    lineTotals,
  };
}