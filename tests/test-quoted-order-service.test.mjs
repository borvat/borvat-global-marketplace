import {test} from "node:test";
import assert from "node:assert/strict";
import {createQuotedTestOrder} from "../services/test-quoted-order-service.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const offer=(n,seller)=>({id:id(n),seller_id:id(seller),price_minor:"12100",stock:5,market:"NL",currency:"EUR",status:"published",seller_status:"approved",product_status:"approved",tax_category:"standard"});
function pool(rows,held=false,updateRows=1){
 const calls=[];
 return {calls,connect:async()=>({query:async(sql,args=[])=>{
 calls.push({sql,args});
 if(sql.startsWith("SELECT id,request_hash"))return {rows:[]};
 if(sql.includes("FROM borvat.offers o JOIN"))return {rows};
 if(sql.startsWith("SELECT offer_id FROM borvat.risk_cases"))return {rows:held?[{offer_id:id(1)}]:[]};
 if(sql.startsWith("UPDATE borvat.offers"))return {rowCount:updateRows};
 return {rows:[],rowCount:1};
 },release:()=>{}})};
}
const input=()=>({buyerId:id(100),requestKey:"checkout-test-001",requested:[{offerId:id(1),quantity:2}],shippingBySeller:{[id(11)]:1210}});
const run=(db,data)=>createQuotedTestOrder(db,data,{authorizeBuyer:async()=>true,quoteShipping:async()=>data.shippingBySeller});
test("VAT-aware draft saves one seller suborder and reserved quantity",async()=>{
 const db=pool([offer(1,11)]);const result=await run(db,input());
 assert.equal(result.totalMinor,25410);
 assert.equal(db.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,1);
 assert.equal(db.calls.find(c=>c.sql.startsWith("UPDATE borvat.offers")).args[1],2);
 assert.ok(db.calls.some(c=>c.sql==="COMMIT"));
 assert.equal(result.paymentEnabled,false);
});
test("risk hold prevents draft and rolls back",async()=>{
 const db=pool([offer(1,11)],true);
 await assert.rejects(run(db,input()),/RISK_HOLD/);
 assert.ok(db.calls.some(c=>c.sql==="ROLLBACK"));
 assert.equal(db.calls.filter(c=>c.sql.startsWith("INSERT INTO")).length,0);
});
test("failed reservation rolls back",async()=>{
 const db=pool([offer(1,11)],false,0);
 await assert.rejects(run(db,input()),/STOCK_CHANGED/);
 assert.ok(db.calls.some(c=>c.sql==="ROLLBACK"));
 assert.equal(db.calls.some(c=>c.sql==="COMMIT"),false);
});
test("suspended seller cannot transact",async()=>{
 const db=pool([{...offer(1,11),seller_status:"suspended"}]);
 await assert.rejects(run(db,input()),/OFFER_NOT_ELIGIBLE/);
});
test("changed duplicate offer IDs fail before DB",async()=>{
 const db=pool([offer(1,11)]);const data=input();
 data.requested.push({offerId:id(1).toUpperCase(),quantity:1});
 await assert.rejects(run(db,data),/DUPLICATE_OFFER/);
 assert.equal(db.calls.length,0);
});
test("missing shipping prevents draft",async()=>{
 const db=pool([offer(1,11)]);const data=input();data.shippingBySeller={};
 await assert.rejects(run(db,data),/MISSING_SHIPPING_QUOTE/);
 assert.equal(db.calls.filter(c=>c.sql.startsWith("INSERT INTO")).length,0);
});

test("cancelled quoted order cannot be presented as successful idempotency replay",async()=>{
 const input={buyerId:"00000000-0000-4000-8000-000000000100",requestKey:"cancelled-replay-001",requested:[{offerId:"00000000-0000-4000-8000-000000000001",quantity:1}],shippingBySeller:{"00000000-0000-4000-8000-000000000011":0}};
 const {createHash}=await import("node:crypto");
 const hash=createHash("sha256").update(JSON.stringify({requested:[[input.requested[0].offerId,1]],market:"NL",currency:"EUR",pricingContract:"trusted_shipping_v2"})).digest("hex");
 const calls=[];
 const pool={connect:async()=>({query:async(sql,args=[])=>{calls.push(sql);if(sql.startsWith("SELECT id,request_hash"))return {rows:[{id:"00000000-0000-4000-8000-000000000090",request_hash:hash,total_minor:"100",state:"cancelled"}]};return {rows:[],rowCount:1}},release(){}})};
 await assert.rejects(createQuotedTestOrder(pool,input,{authorizeBuyer:async()=>true,quoteShipping:async()=>input.shippingBySeller}),/ORDER_ALREADY_CANCELLED/);
 assert.ok(calls.includes("ROLLBACK"));
 assert.equal(calls.some(s=>s.startsWith("UPDATE borvat.offers")),false);
});

test("a missing trusted shipping provider fails closed before the DB opens",async()=>{
 const db=pool([offer(1,11)]);
 await assert.rejects(createQuotedTestOrder(db,input(),{authorizeBuyer:async()=>true}),/SHIPPING_AUTHORITY_NOT_CONFIGURED/);
 assert.equal(db.calls.length,0);
});
test("ignores buyer-supplied zero shipping and bills trusted server shipping",async()=>{
 const db=pool([offer(1,11)]);
 const data=input();data.shippingBySeller={[id(11)]:0};
 const result=await createQuotedTestOrder(db,data,{authorizeBuyer:async()=>true,quoteShipping:async()=>({[id(11)]:1210})});
 assert.equal(result.totalMinor,25410);
});
test("untrusted shipping provider response blocks draft",async()=>{
 const db=pool([offer(1,11)]);
 await assert.rejects(createQuotedTestOrder(db,input(),{authorizeBuyer:async()=>true,quoteShipping:async()=>null}),/INVALID_SHIPPING/);
 assert.equal(db.calls.filter(c=>c.sql.startsWith("INSERT INTO")).length,0);
 assert.ok(db.calls.some(c=>c.sql==="ROLLBACK"));
});

test("trusted shipping receives locked offer-to-seller snapshots",async()=>{
 const db=pool([offer(1,11)]);let received;
 const result=await createQuotedTestOrder(db,input(),{
  authorizeBuyer:async()=>true,
  quoteShipping:async ctx=>{received=ctx;return {[id(11)]:1210};}
 });
 assert.equal(received.offers[0].sellerId,id(11));
 assert.equal(received.offers[0].quantity,2);
 assert.equal(result.totalMinor,25410);
});
test("external tariff error cannot create any draft",async()=>{
 const db=pool([offer(1,11)]);
 await assert.rejects(createQuotedTestOrder(db,input(),{
  authorizeBuyer:async()=>true,quoteShipping:async()=>{throw new Error("TARIFF_UNAVAILABLE");}
 }),/TARIFF_UNAVAILABLE/);
 assert.equal(db.calls.filter(c=>c.sql.startsWith("INSERT INTO")).length,0);
 assert.ok(db.calls.some(c=>c.sql==="ROLLBACK"));
});

test("rejects corrupted PostgreSQL price and quantity before shipping or any insert",async()=>{
 for(const patch of [{price_minor:null},{price_minor:"1.2"},{stock:null},{stock:"9007199254740993"}]){
  const db=pool([{...offer(1,11),...patch}]);let providerCalls=0;
  await assert.rejects(createQuotedTestOrder(db,input(),{
   authorizeBuyer:async()=>true,quoteShipping:async()=>{providerCalls++;return {[id(11)]:1210};}
  }),/INVALID_DATABASE_AMOUNT/);
  assert.equal(providerCalls,0);
  assert.equal(db.calls.some(x=>x.sql.startsWith("INSERT INTO")),false);
  assert.ok(db.calls.some(x=>x.sql==="ROLLBACK"));
 }
});

test("wrong database offer identity is rejected before trusted shipping",async()=>{
 const db=pool([offer(2,11)]);let invoked=0;
 await assert.rejects(createQuotedTestOrder(db,input(),{
  authorizeBuyer:async()=>true,quoteShipping:async()=>{invoked++;return {[id(11)]:1210};}
 }),/OFFER_SNAPSHOT_MISMATCH/);
 assert.equal(invoked,0);
 assert.equal(db.calls.some(c=>c.sql.startsWith("INSERT INTO")),false);
});
test("duplicate database offer identities are rejected before trusted shipping",async()=>{
 const data=input();data.requested.push({offerId:id(2),quantity:1});
 const db=pool([offer(1,11),offer(1,11)]);let invoked=0;
 await assert.rejects(createQuotedTestOrder(db,data,{
  authorizeBuyer:async()=>true,quoteShipping:async()=>{invoked++;return {[id(11)]:1210};}
 }),/OFFER_SNAPSHOT_MISMATCH/);
 assert.equal(invoked,0);
});
test("invalid seller snapshot blocks shipping calculation",async()=>{
 const db=pool([{...offer(1,11),seller_id:null}]);let invoked=0;
 await assert.rejects(createQuotedTestOrder(db,input(),{
  authorizeBuyer:async()=>true,quoteShipping:async()=>{invoked++;return {};}
 }),/INVALID_SELLER_SNAPSHOT/);
 assert.equal(invoked,0);
});
