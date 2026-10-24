/** Test-only shipping and money rules. All amounts are integer euro cents (VAT included). */
import { CONNECTED_TEST_COMMERCE } from "./runtime-mode";
export const SHIPPING_METHODS = {
  standaard: {
    id: "standaard",
    priceCents: 495,
    freeFromCents: 5000,
    deliveryDays: "2–3 werkdagen",
  },
  express: { id: "express", priceCents: 795, freeFromCents: null, deliveryDays: "1 werkdag" },
} as const;
export type ShippingMethodId = keyof typeof SHIPPING_METHODS;
export const PAYMENT_METHODS = ["test-ideal", "test-card"] as const;
export type TestPaymentMethod = (typeof PAYMENT_METHODS)[number];
export const MAX_LINE_QUANTITY = 10;
export const VAT_RATE_PERCENT = 21;

export function isShippingMethod(value: unknown): value is ShippingMethodId {
  return value === "standaard" || value === "express";
}

export function shippingCents(method: ShippingMethodId, subtotalCents: number) {
  if (subtotalCents <= 0) return 0;
  const rule = SHIPPING_METHODS[method];
  return rule.freeFromCents !== null && subtotalCents >= rule.freeFromCents ? 0 : rule.priceCents;
}

export function lineTotalCents(unitPriceCents: number, quantity: number) {
  const total = unitPriceCents * quantity;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Ongeldig regeltotaal.");
  return total;
}

export function orderTotals(
  lines: { unitPriceCents: number; quantity: number }[],
  method: ShippingMethodId,
) {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + lineTotalCents(line.unitPriceCents, line.quantity),
    0,
  );
  const shipping = shippingCents(method, subtotalCents);
  const totalCents = subtotalCents + shipping;
  return {
    subtotalCents,
    shippingCents: shipping,
    totalCents,
    // Prices include VAT; the included share is rounded once on the total.
    vatIncludedCents: CONNECTED_TEST_COMMERCE
      ? 0
      : Math.round((totalCents * VAT_RATE_PERCENT) / (100 + VAT_RATE_PERCENT)),
  };
}

export function maxOrderable(availability: number) {
  return Math.max(0, Math.min(availability, MAX_LINE_QUANTITY));
}
