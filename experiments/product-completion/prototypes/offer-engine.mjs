// BORVAT reference domain prototype. NOT integrated with Mercur / production.
export function validateOffer(offer) {
  if (!offer || typeof offer !== "object") throw new TypeError("offer required");
  const { sellerId, productId, market, currency, priceMinor, stock } = offer;
  for (const s of [sellerId, productId, market, currency]) {
    if (typeof s !== "string" || !s.trim()) throw new TypeError("required string missing");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError("ISO currency expected");
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new RangeError("priceMinor invalid");
  if (!Number.isSafeInteger(stock) || stock < 0) throw new RangeError("stock invalid");
  return Object.freeze({ ...offer });
}
export function compareOffers(offers, { productId, market, currency }) {
  return offers.map(validateOffer).filter(o =>
    o.productId === productId && o.market === market && o.currency === currency && o.stock > 0
  ).sort((a, b) => a.priceMinor - b.priceMinor || a.sellerId.localeCompare(b.sellerId));
}
export function commissionMinor(subtotalMinor, basisPoints) {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new RangeError("subtotal invalid");
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000)
    throw new RangeError("commission invalid");
  // Integer half-up rounding avoids floating-point settlement drift.
  const result = (BigInt(subtotalMinor) * BigInt(basisPoints) + 5000n) / 10000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("commission overflow");
  return Number(result);
}
export function sellerOrders(orders, sellerId) {
  if (typeof sellerId !== "string" || !sellerId.trim()) throw new TypeError("sellerId required");
  return orders.filter(o => o.sellerId === sellerId);
}
