// TEST-ONLY order transaction against borvat.* PostgreSQL schema.
// Uses an injected trusted database pool implementing pool.connect() (pg compatible).
// Never expose this function as a direct public HTTP endpoint.
import { randomUUID, createHash } from "node:crypto";
const safeMoney=n=>Number.isSafeInteger(n)&&n>=0;
const validUuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class OrderConflict extends Error {constructor(code){super(code);this.name="OrderConflict"}}
export async function createTestOrder(pool,{buyerId,requestKey,offerIds},{authorizeBuyer}={}) {
  if(typeof authorizeBuyer!=="function")throw new OrderConflict("AUTHENTICATION_NOT_CONFIGURED");

  if(!validUuid(buyerId))throw new OrderConflict("BAD_BUYER");
  if(typeof requestKey!=="string"||! /^[a-zA-Z0-9_-]{8,100}$/.test(requestKey))throw new OrderConflict("BAD_KEY");
  if(!Array.isArray(offerIds)||offerIds.length<1||offerIds.length>20||!offerIds.every(x=>validUuid(x))||new Set(offerIds.map(x=>x.toLowerCase())).size!==offerIds.length)throw new OrderConflict("BAD_OFFERS");
  const canonicalBuyerId=buyerId.toLowerCase();
  const authorized=await authorizeBuyer(canonicalBuyerId);
  if(authorized!==true)throw new OrderConflict("UNAUTHORIZED_BUYER");
  const sorted=offerIds.map(x=>x.toLowerCase()).sort();
  const requestHash=createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  const db=await pool.connect();
  let started=false;
  try{
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    started=true;
    // Transaction-scoped advisory lock protects absent idempotency-key rows against concurrent requests.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[canonicalBuyerId+":"+requestKey]);
    const prior=await db.query("SELECT id, request_hash, total_minor FROM borvat.buyer_orders WHERE buyer_id=$1 AND idempotency_key=$2",[canonicalBuyerId,requestKey]);
    if(prior.rows.length){
      if(prior.rows[0].request_hash!==requestHash)throw new OrderConflict("KEY_REUSED_DIFFERENT_CART");
      await db.query("COMMIT");started=false;
      return {orderId:prior.rows[0].id,totalMinor:Number(prior.rows[0].total_minor),replayed:true,demo:true};
    }
    const records=await db.query("SELECT o.id,o.seller_id,o.price_minor,o.stock,o.market,o.currency,o.status,s.status AS seller_status,p.status AS product_status FROM borvat.offers o JOIN borvat.sellers s ON s.id=o.seller_id JOIN borvat.products p ON p.id=o.product_id WHERE o.id=ANY($1::uuid[]) ORDER BY o.id FOR UPDATE OF o,s,p",[sorted]);
    if(records.rows.length!==sorted.length)throw new OrderConflict("NOT_AVAILABLE");
    const offers=records.rows;
    for(const o of offers){
      if(o.status!=="published"||o.seller_status!=="approved"||o.product_status!=="approved"||(!Number.isSafeInteger(Number(o.stock))||Number(o.stock)<1)||o.market!=="NL"||o.currency!=="EUR"||!safeMoney(Number(o.price_minor)))throw new OrderConflict("NOT_AVAILABLE");
    }
    const held=await db.query("SELECT 1 FROM borvat.risk_cases WHERE offer_id=ANY($1::uuid[]) AND state IN ('open','held') LIMIT 1",[sorted]);
    if(held.rows.length)throw new OrderConflict("RISK_HOLD");
    // TEST pricing: subtotal only. No real shipping, VAT or checkout.
    const total=offers.reduce((n,o)=>n+Number(o.price_minor),0);
    if(!safeMoney(total))throw new OrderConflict("PRICE_OVERFLOW");
    const orderId=randomUUID();
    await db.query("INSERT INTO borvat.buyer_orders(id,buyer_id,idempotency_key,request_hash,currency,total_minor,state) VALUES ($1,$2,$3,$4,'EUR',$5,'draft')",[orderId,canonicalBuyerId,requestKey,requestHash,total]);
    const grouped=new Map();
    for(const offer of offers){
      let group=grouped.get(offer.seller_id);
      if(!group){group={id:randomUUID(),amount:0,offers:[]};grouped.set(offer.seller_id,group)}
      group.amount+=Number(offer.price_minor);
      if(!safeMoney(group.amount))throw new OrderConflict("PRICE_OVERFLOW");
      group.offers.push(offer);
    }
    for(const [sellerId,group] of grouped){
      await db.query("INSERT INTO borvat.seller_orders(id,buyer_order_id,seller_id,amount_minor) VALUES ($1,$2,$3,$4)",[group.id,orderId,sellerId,group.amount]);
      for(const offer of group.offers) {
        const result = await db.query("UPDATE borvat.offers SET stock=stock-1,updated_at=now() WHERE id=$1 AND stock>0 AND status='published'",[offer.id]);
        if(result.rowCount!==1)throw new OrderConflict("STOCK_CHANGED");
        await db.query("INSERT INTO borvat.order_lines(id,seller_order_id,offer_id,quantity,price_minor) VALUES ($1,$2,$3,1,$4)",[randomUUID(),group.id,offer.id,offer.price_minor]);
      }
    }
    await db.query("INSERT INTO borvat.outbox_events(id,event_type,aggregate_id,payload) VALUES ($1,'demo_order.created',$2,$3::jsonb)",[randomUUID(),orderId,JSON.stringify({buyerId:canonicalBuyerId,sellerCount:grouped.size})]);
    await db.query("COMMIT");started=false;
    return {orderId,totalMinor:total,sellerCount:grouped.size,replayed:false,demo:true,paymentEnabled:false};
  }catch(error){
    if(started){try{await db.query("ROLLBACK")}catch(rollbackError){error.rollbackError=rollbackError}}
    throw error;
  }finally{db.release()}
}
