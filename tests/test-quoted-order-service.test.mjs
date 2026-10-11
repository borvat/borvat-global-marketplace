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
const run=(db,data)=>createQuotedTestOrder(db,data,{authorizeBuyer:async()=>true});
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
