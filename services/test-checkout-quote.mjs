// Pure TEST quote boundary between trusted catalog/inventory snapshots and pricing.
// Caller must acquire authoritative, consistently-read snapshots server-side.
import {priceBuyerCart, QuoteError} from "./test-cart-pricing.mjs";
const id=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function quoteApprovedCart({requested,offers,shippingBySeller,country="NL",currency="EUR",taxRates,shippingVatBps}={}){
 if(!Array.isArray(requested)||requested.length<1||requested.length>100||!Array.isArray(offers)||offers.length!==requested.length)throw new QuoteError("CART_SNAPSHOT_MISMATCH");
 const requests=new Map();
 for(const x of requested){
  if(!x||!id(x.offerId)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>1000)throw new QuoteError("INVALID_CART");
  const key=x.offerId.toLowerCase();
  if(requests.has(key))throw new QuoteError("DUPLICATE_CART_OFFER");
  requests.set(key,x.quantity);
 }
 const observed=new Set(),lines=[];
 for(const o of offers){
  if(!o||!id(o.id)||!id(o.sellerId)||!requests.has(o.id.toLowerCase())||observed.has(o.id.toLowerCase()))throw new QuoteError("CART_SNAPSHOT_MISMATCH");
  const key=o.id.toLowerCase();observed.add(key);
  if(o.offerStatus!=="published"||o.sellerStatus!=="approved"||o.productStatus!=="approved"||o.riskHeld!==false)throw new QuoteError("OFFER_NOT_ELIGIBLE");
  const quantity=requests.get(key);
  if(!Number.isSafeInteger(o.stock)||o.stock<quantity)throw new QuoteError("INSUFFICIENT_STOCK");
  if(o.market!==country||o.currency!==currency)throw new QuoteError("MARKET_MISMATCH");
  if(!Number.isSafeInteger(o.priceMinor)||o.priceMinor<0||typeof o.taxCategory!=="string")throw new QuoteError("INVALID_SNAPSHOT");
  lines.push({offerId:key,sellerId:o.sellerId.toLowerCase(),quantity,unitPriceMinor:o.priceMinor,taxCategory:o.taxCategory});
 }
 if(observed.size!==requests.size)throw new QuoteError("CART_SNAPSHOT_MISMATCH");
 return priceBuyerCart(lines,{country,currency,shippingBySeller, ...(taxRates?{vatBpsByCategory:taxRates}:{}), ...(shippingVatBps===undefined?{}:{shippingVatBps})});
}
