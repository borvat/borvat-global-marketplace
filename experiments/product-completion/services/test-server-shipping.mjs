// TEST ONLY. Server-owned per-seller shipping tariffs, never buyer supplied.
// Rates represent gross EUR cents (shipping VAT is calculated by quote engine).
export function createFixedSellerShippingProvider({tariffs,market="NL",currency="EUR"}={}){
 if(market!=="NL"||currency!=="EUR")throw new Error("UNSUPPORTED_SHIPPING_MARKET");
 if(!tariffs||typeof tariffs!=="object"||Array.isArray(tariffs))throw new Error("INVALID_TARIFFS");
 const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
 const expectedCurrency=currency;
 const trusted=new Map();
 for(const [sellerId,rate] of Object.entries(tariffs)){
  if(!uuid(sellerId)||!Number.isSafeInteger(rate)||rate<0)throw new Error("INVALID_TARIFF");
  const id=sellerId.toLowerCase();if(trusted.has(id))throw new Error("DUPLICATE_SELLER_TARIFF");
  trusted.set(id,rate);
 }
 // Rates are snapshotted at construction; callers cannot mutate tariffs later.
 return async function quoteShipping({requested,country,currency,offers}={}){
  if(country!==market||currency!==expectedCurrency)throw new Error("SHIPPING_MARKET_MISMATCH");
  if(!Array.isArray(requested)||requested.length<1||requested.length>20)throw new Error("INVALID_SHIPPING_CART");
  if(!Array.isArray(offers)||offers.length!==requested.length)throw new Error("MISSING_TRUSTED_SELLER_SNAPSHOT");
  const required=new Map(requested.map(x=>[x.offerId?.toLowerCase(),x.quantity]));
  if(required.size!==requested.length)throw new Error("INVALID_SHIPPING_CART");
  const observed=new Set(),result={};
  for(const o of offers){
   const offerId=o?.offerId?.toLowerCase(),sellerId=o?.sellerId?.toLowerCase();
   if(!uuid(offerId)||!uuid(sellerId)||!required.has(offerId)||observed.has(offerId)||o.market!==market||o.currency!==currency)throw new Error("INVALID_SHIPPING_SNAPSHOT");
   if(required.get(offerId)!==o.quantity)throw new Error("SHIPPING_QUANTITY_MISMATCH");
   if(!trusted.has(sellerId))throw new Error("MISSING_SELLER_TARIFF");
   observed.add(offerId);result[sellerId]=trusted.get(sellerId);
  }
  if(observed.size!==required.size)throw new Error("INCOMPLETE_SHIPPING_SNAPSHOT");
  return result;
 };
}
