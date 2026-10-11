// Isolated, deterministic prototype: no model calls, network, payments or customer data.
export const demoOffers = Object.freeze([
  {id:"demo-nl-a",seller:"Camping Direct NL",product:"camping-stove-4-canisters",market:"NL",currency:"EUR",unitPriceMinor:1995,shippingMinor:395,stock:12,etaDays:3},
  {id:"demo-nl-b",seller:"Outdoor Plus EU",product:"camping-stove-4-canisters",market:"NL",currency:"EUR",unitPriceMinor:2150,shippingMinor:0,stock:8,etaDays:5},
  {id:"demo-nl-c",seller:"BORVAT Outdoor",product:"camping-stove-4-canisters",market:"NL",currency:"EUR",unitPriceMinor:2290,shippingMinor:0,stock:16,etaDays:2}
]);
export function parseShoppingRequest(message) {
  if (typeof message !== "string" || message.trim().length === 0 || message.length > 2000) throw new TypeError("Invalid request");
  const hasStove = /موقد|طباخ|camping stove|camping cooker|kooktoestel/i.test(message);
  const canisters = /(?:4|٤|أربع|اربعة|four|vier)\s*(?:عبو|كرتوش|قارور|gas|canister)/i.test(message);
  const country = /هولندا|netherlands|nederland/i.test(message) ? "NL" : null;
  return {query:message.trim(),product:hasStove && canisters ? "camping-stove-4-canisters" : null,market:country,quantity:1};
}
function validateOffer(o) {
  if (!o || typeof o!=="object" || !["unitPriceMinor","shippingMinor","stock","etaDays"].every(k=>Number.isSafeInteger(o[k])&&o[k]>=0)) throw new TypeError("Invalid offer");
  if (typeof o.id!=="string" || typeof o.product!=="string" || !/^[A-Z]{2}$/.test(o.market)||!/^[A-Z]{3}$/.test(o.currency)) throw new TypeError("Invalid offer identity");
  return o;
}
export function rankOffers(offers, intent, {priority="total"}={}) {
  if (!["total","fastest"].includes(priority)) throw new TypeError("Invalid priority");
  if (!intent.product || !intent.market) return [];
  return offers.map(validateOffer).filter(o=>o.product===intent.product && o.market===intent.market && o.stock>=intent.quantity).map(o=>({...o,totalMinor:o.unitPriceMinor*intent.quantity+o.shippingMinor})).sort((a,b)=>priority==="fastest"?a.etaDays-b.etaDays || a.totalMinor-b.totalMinor : a.totalMinor-b.totalMinor || a.etaDays-b.etaDays);
}
export function prepareDemoCart(offer,quantity=1) {
  validateOffer(offer);
  if (!Number.isSafeInteger(quantity)||quantity<1||quantity>offer.stock) throw new RangeError("Invalid quantity or stock");
  const itemsMinor=offer.unitPriceMinor*quantity;
  const totalMinor=itemsMinor+offer.shippingMinor;
  if (!Number.isSafeInteger(totalMinor)) throw new RangeError("Total overflow");
  return {demo:true,offerId:offer.id,seller:offer.seller,quantity,currency:offer.currency,itemsMinor,shippingMinor:offer.shippingMinor,totalMinor,checkoutEnabled:false};
}
