// Pure quote engine. Money is integer EUR cents; rates are basis points.
// This is an isolated TEST commerce primitive, not a tax/PSP compliance attestation.
export class QuoteError extends Error { constructor(code){super(code);this.name="QuoteError";} }
const safe=(n)=>Number.isSafeInteger(n)&&n>=0;
const rate=(n)=>Number.isInteger(n)&&n>=0&&n<=10000;
const fail=(code)=>{throw new QuoteError(code)};
const vatIncluded=(gross,bps)=>{
  if(!safe(gross)||!rate(bps))fail("INVALID_AMOUNT");
  // Half-up rounding using bigint, avoiding floating-point currency arithmetic.
  const g=BigInt(gross),r=BigInt(bps);
  const net=(g*10000n+(10000n+r)/2n)/(10000n+r);
  const tax=g-net;
  if(net>BigInt(Number.MAX_SAFE_INTEGER))fail("AMOUNT_OVERFLOW");
  return {netMinor:Number(net),vatMinor:Number(tax),grossMinor:gross};
};
export function priceBuyerCart(lines,{country="NL",currency="EUR",shippingBySeller={},vatBpsByCategory={standard:2100,reduced:900,zero:0},shippingVatBps=2100}={}){
  if(country!=="NL"||currency!=="EUR")fail("UNSUPPORTED_MARKET");
  if(!Array.isArray(lines)||!lines.length||lines.length>100)fail("INVALID_LINES");
  if(!shippingBySeller||typeof shippingBySeller!=="object"||Array.isArray(shippingBySeller))fail("INVALID_SHIPPING");
  if(!vatBpsByCategory||typeof vatBpsByCategory!=="object"||Array.isArray(vatBpsByCategory))fail("INVALID_TAX");
  if(!rate(shippingVatBps))fail("INVALID_TAX");
  const seen=new Set(),groups=new Map();
  for(const line of lines){
    if(!line||typeof line!=="object"||typeof line.offerId!=="string"||typeof line.sellerId!=="string"||!line.offerId||!line.sellerId||seen.has(line.offerId))fail("INVALID_LINE");
    seen.add(line.offerId);
    const quantity=line.quantity,unit=line.unitPriceMinor,category=line.taxCategory;
    if(!Number.isInteger(quantity)||quantity<1||quantity>1000||!safe(unit)||!Object.hasOwn(vatBpsByCategory,category)||!rate(vatBpsByCategory[category]))fail("INVALID_LINE");
    const grossBig=BigInt(quantity)*BigInt(unit);
    if(grossBig>BigInt(Number.MAX_SAFE_INTEGER))fail("AMOUNT_OVERFLOW");
    const gross=Number(grossBig),v=vatIncluded(gross,vatBpsByCategory[category]);
    let group=groups.get(line.sellerId);
    if(!group){group={sellerId:line.sellerId,lines:[],itemsGrossMinor:0,itemsNetMinor:0,itemsVatMinor:0};groups.set(line.sellerId,group)}
    group.lines.push({offerId:line.offerId,quantity,unitPriceMinor:unit,taxCategory:category,...v});
    for(const [key,value] of [["itemsGrossMinor",v.grossMinor],["itemsNetMinor",v.netMinor],["itemsVatMinor",v.vatMinor]]){
      group[key]+=value;if(!safe(group[key]))fail("AMOUNT_OVERFLOW");
    }
  }
  for(const sellerId of Object.keys(shippingBySeller))if(!groups.has(sellerId))fail("UNKNOWN_SHIPPING_SELLER");
  let grossTotal=0,vatTotal=0,netTotal=0;
  const sellers=[...groups.values()].sort((a,b)=>a.sellerId.localeCompare(b.sellerId));
  for(const group of sellers){
    if(!Object.hasOwn(shippingBySeller,group.sellerId))fail("MISSING_SHIPPING_QUOTE");
    const shippingGross=shippingBySeller[group.sellerId];
    if(!safe(shippingGross))fail("INVALID_SHIPPING");
    const shipping=vatIncluded(shippingGross,shippingVatBps);
    group.shippingGrossMinor=shipping.grossMinor;
    group.shippingVatMinor=shipping.vatMinor;
    group.shippingNetMinor=shipping.netMinor;
    group.grossMinor=group.itemsGrossMinor+shipping.grossMinor;
    group.vatMinor=group.itemsVatMinor+shipping.vatMinor;
    group.netMinor=group.itemsNetMinor+shipping.netMinor;
    if(!safe(group.grossMinor)||!safe(group.vatMinor)||!safe(group.netMinor))fail("AMOUNT_OVERFLOW");
    grossTotal+=group.grossMinor;vatTotal+=group.vatMinor;netTotal+=group.netMinor;
    if(!safe(grossTotal)||!safe(vatTotal)||!safe(netTotal))fail("AMOUNT_OVERFLOW");
  }
  if(netTotal+vatTotal!==grossTotal)fail("TOTAL_MISMATCH");
  return {country,currency,grossMinor:grossTotal,netMinor:netTotal,vatMinor:vatTotal,sellers,checkoutEnabled:false,paymentEnabled:false,kind:"indicative_test_quote"};
}
