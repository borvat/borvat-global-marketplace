// TEST ONLY: atomic, VAT/shipping-aware multi-vendor draft orders.
// Requires a trusted server pool and a separate authorized worker DB role.
// No PSP capture, refunds or live checkout. Never expose this directly to browsers.
import {randomUUID,createHash} from "node:crypto";
import {quoteApprovedCart} from "./test-checkout-quote.mjs";
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export class CheckoutError extends Error {constructor(code){super(code);this.name="CheckoutError"}}
const dbInt=value=>{
 if(typeof value!=="string"&&!Number.isSafeInteger(value))return null;
 if(typeof value==="string"&&!/^(0|[1-9][0-9]*)$/.test(value))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
};
export async function createQuotedTestOrder(pool,input,{authorizeBuyer,quoteShipping}={}){
 if(typeof quoteShipping!=="function")throw new CheckoutError("SHIPPING_AUTHORITY_NOT_CONFIGURED");
 if(typeof authorizeBuyer!=="function")throw new CheckoutError("AUTH_NOT_CONFIGURED");
 if(!input||!uuid(input.buyerId)||typeof input.requestKey!=="string"||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestKey))throw new CheckoutError("INVALID_REQUEST");
 const requested=input.requested;
 if(!Array.isArray(requested)||requested.length<1||requested.length>20)throw new CheckoutError("INVALID_CART");
 const quantities=new Map();
 for(const item of requested){
  if(!item||!uuid(item.offerId)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000)throw new CheckoutError("INVALID_CART");
  const key=item.offerId.toLowerCase();
  if(quantities.has(key))throw new CheckoutError("DUPLICATE_OFFER");
  quantities.set(key,item.quantity);
 }
 const buyerId=input.buyerId.toLowerCase();
 if(await authorizeBuyer(buyerId)!==true)throw new CheckoutError("UNAUTHORIZED");
 const canonical=[...quantities].sort((a,b)=>a[0].localeCompare(b[0]));
 // Idempotency binds buyer and canonical cart. Shipping is priced from locked
 // server-side offer snapshots only on first creation, not replay.
 const hash=createHash("sha256").update(JSON.stringify({requested:canonical,market:"NL",currency:"EUR",pricingContract:"trusted_shipping_v2"})).digest("hex");
 const db=await pool.connect();let inTx=false;
 try{
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");inTx=true;
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[buyerId+":"+input.requestKey]);
  const prior=await db.query("SELECT id,request_hash,total_minor,state FROM borvat.buyer_orders WHERE buyer_id=$1 AND idempotency_key=$2",[buyerId,input.requestKey]);
  if(prior.rows.length){
   if(prior.rows[0].request_hash!==hash)throw new CheckoutError("IDEMPOTENCY_CONFLICT");
   if(prior.rows[0].state==="cancelled")throw new CheckoutError("ORDER_ALREADY_CANCELLED");
   if(dbInt(prior.rows[0].total_minor)===null)throw new CheckoutError("INVALID_STORED_TOTAL");
   await db.query("COMMIT");inTx=false;
   return {orderId:prior.rows[0].id,totalMinor:Number(prior.rows[0].total_minor),replayed:true,testOnly:true,paymentEnabled:false};
  }
  // Lock offers and approval parents so that status/price/stock cannot change while drafting.
  const ids=canonical.map(([id])=>id);
  const rows=await db.query("SELECT o.id,o.seller_id,o.price_minor,o.stock,o.market,o.currency,o.status,s.status AS seller_status,p.status AS product_status,p.tax_category FROM borvat.offers o JOIN borvat.sellers s ON s.id=o.seller_id JOIN borvat.products p ON p.id=o.product_id WHERE o.id=ANY($1::uuid[]) ORDER BY o.id FOR UPDATE OF o,s,p",[ids]);
  if(rows.rows.length!==ids.length)throw new CheckoutError("OFFER_MISSING");
  // Match the full requested offer set before passing any row to shipping.
  const returned=rows.rows.map(o=>typeof o.id==="string"?o.id.toLowerCase():null);
  if(returned.some(x=>x===null)||new Set(returned).size!==ids.length||returned.some(x=>!ids.includes(x)))throw new CheckoutError("OFFER_SNAPSHOT_MISMATCH");
  if(rows.rows.some(o=>!uuid(o.seller_id)))throw new CheckoutError("INVALID_SELLER_SNAPSHOT");

  const held=await db.query("SELECT offer_id FROM borvat.risk_cases WHERE offer_id=ANY($1::uuid[]) AND state IN ('open','held') LIMIT 1",[ids]);
  if(held.rows.length)throw new CheckoutError("RISK_HOLD");
  if(rows.rows.some(o=>dbInt(o.stock)===null||dbInt(o.price_minor)===null))throw new CheckoutError("INVALID_DATABASE_AMOUNT");
  // Fail closed before consulting any shipping provider; it must not price ineligible listings.
  if(rows.rows.some(o=>o.status!=="published"||o.seller_status!=="approved"||o.product_status!=="approved"||o.market!=="NL"||o.currency!=="EUR"))throw new CheckoutError("OFFER_NOT_ELIGIBLE");
  if(rows.rows.some(o=>dbInt(o.stock)<quantities.get(o.id.toLowerCase())))throw new CheckoutError("INSUFFICIENT_STOCK");

  // No buyer price, shipping amount or seller mapping is trusted.
  const shipping=await quoteShipping({buyerId,requested:canonical.map(([offerId,quantity])=>({offerId,quantity})),offers:rows.rows.map(o=>({offerId:o.id,sellerId:o.seller_id,quantity:quantities.get(o.id.toLowerCase()),market:o.market,currency:o.currency})),country:"NL",currency:"EUR"});
  if(!shipping||typeof shipping!=="object"||Array.isArray(shipping))throw new CheckoutError("INVALID_SHIPPING");
  const canonicalShipping={};
  for(const [seller,amount] of Object.entries(shipping)){
   if(!uuid(seller)||!Number.isSafeInteger(amount)||amount<0)throw new CheckoutError("INVALID_SHIPPING");
   const key=seller.toLowerCase();
   if(Object.hasOwn(canonicalShipping,key))throw new CheckoutError("DUPLICATE_SHIPPING");
   canonicalShipping[key]=amount;
  }

  const offers=rows.rows.map(o=>({
   id:o.id,sellerId:o.seller_id,stock:Number(o.stock),priceMinor:Number(o.price_minor),market:o.market,currency:o.currency,
   offerStatus:o.status,sellerStatus:o.seller_status,productStatus:o.product_status,taxCategory:o.tax_category,riskHeld:false
  }));
  // Quote and save use the same locked SQL snapshot, never a browser-supplied price.
  const quote=quoteApprovedCart({requested:canonical.map(([offerId,quantity])=>({offerId,quantity})),offers,shippingBySeller:canonicalShipping});
  const orderId=randomUUID();
  await db.query("INSERT INTO borvat.buyer_orders(id,buyer_id,idempotency_key,request_hash,currency,total_minor,state) VALUES($1,$2,$3,$4,'EUR',$5,'draft')",[orderId,buyerId,input.requestKey,hash,quote.grossMinor]);
  for(const seller of quote.sellers){
   const suborderId=randomUUID();
   await db.query("INSERT INTO borvat.seller_orders(id,buyer_order_id,seller_id,amount_minor) VALUES($1,$2,$3,$4)",[suborderId,orderId,seller.sellerId,seller.grossMinor]);
   for(const line of seller.lines){
    const result=await db.query("UPDATE borvat.offers SET stock=stock-$2,updated_at=now() WHERE id=$1 AND stock >= $2 AND status='published'",[line.offerId,line.quantity]);
    if(result.rowCount!==1)throw new CheckoutError("STOCK_CHANGED");
    await db.query("INSERT INTO borvat.order_lines(id,seller_order_id,offer_id,quantity,price_minor) VALUES($1,$2,$3,$4,$5)",[randomUUID(),suborderId,line.offerId,line.quantity,line.unitPriceMinor]);
   }
  }
  await db.query("INSERT INTO borvat.outbox_events(id,event_type,aggregate_id,payload) VALUES($1,'demo_order.quoted',$2,$3::jsonb)",[randomUUID(),orderId,JSON.stringify({buyerId,grossMinor:quote.grossMinor,vatMinor:quote.vatMinor,shippingMinor:quote.sellers.reduce((n,s)=>n+s.shippingGrossMinor,0),sellerCount:quote.sellers.length,paymentEnabled:false})]);
  await db.query("COMMIT");inTx=false;
  return {orderId,totalMinor:quote.grossMinor,quote,replayed:false,testOnly:true,paymentEnabled:false};
 }catch(e){if(inTx){try{await db.query("ROLLBACK")}catch(rollbackError){if(e&&typeof e==="object")e.rollbackError=rollbackError}}throw e}
 finally{db.release()}
}
