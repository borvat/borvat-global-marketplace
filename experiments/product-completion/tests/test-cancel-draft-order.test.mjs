import {test} from "node:test";
import assert from "node:assert/strict";
import {cancelDraftTestOrder} from "../services/test-cancel-draft-order.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
function make({state="draft",sellerState="created",buyerFound=true,stockRows=1,sellerMatches=true,restockRows=1}={}){
 const calls=[],seller=id(11),offer=id(1),order=id(20);
 const pool={connect:async()=>({
  async query(sql,args=[]){
   calls.push({sql,args});
   if(sql.startsWith("SELECT id,state FROM borvat.buyer_orders"))return {rows:buyerFound?[{id:order,state}]:[]};
   if(sql.startsWith("SELECT id,seller_id,state FROM borvat.seller_orders"))return {rows:[{id:id(30),seller_id:seller,state:sellerState}]};
   if(sql.startsWith("SELECT l.id,l.offer_id,l.quantity"))return {rows:[{id:id(40),offer_id:offer,quantity:2,seller_id:seller}]};
   if(sql.startsWith("SELECT id,seller_id,stock FROM borvat.offers"))return {rows:stockRows?[{id:offer,seller_id:sellerMatches?seller:id(12),stock:2}]:[]};
   if(sql.startsWith("UPDATE borvat.offers"))return {rowCount:restockRows};
   if(sql.startsWith("UPDATE borvat.seller_orders"))return {rowCount:1};
   if(sql.startsWith("UPDATE borvat.buyer_orders"))return {rowCount:1};
   return {rows:[],rowCount:1};
  },release(){}
 })};
 return {pool,calls,request:{buyerId:id(100),orderId:order}};
}
const run=f=>cancelDraftTestOrder(f.pool,f.request,{authorizeBuyer:async()=>true});
test("cancel draft restores stock once, cancels both order levels",async()=>{
 const f=make();const result=await run(f);
 assert.equal(result.restoredLines,1);
 assert.equal(Number.isInteger(result.restoredLines),true);
 assert.equal(f.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,1);
 assert.equal(f.calls.find(c=>c.sql.startsWith("UPDATE borvat.offers")).args[1],2);
 assert.ok(f.calls.some(c=>c.sql.startsWith("UPDATE borvat.seller_orders")));
 assert.ok(f.calls.some(c=>c.sql.startsWith("INSERT INTO borvat.outbox_events")));
 assert.ok(f.calls.some(c=>c.sql==="COMMIT"));
});
test("cancelled draft replay never restores stock twice",async()=>{
 const f=make({state:"cancelled"});const result=await run(f);
 assert.equal(result.replayed,true);
 assert.equal(f.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});
test("confirmed order cannot be cancelled as unpaid draft",async()=>{
 const f=make({state:"test_confirmed"});
 await assert.rejects(run(f),/CANNOT_CANCEL_CONFIRMED_ORDER/);
 assert.ok(f.calls.some(c=>c.sql==="ROLLBACK"));
});
test("buyer cannot cancel missing or foreign order",async()=>{
 const f=make({buyerFound:false});
 await assert.rejects(run(f),/ORDER_NOT_FOUND/);
 assert.equal(f.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});
test("seller order already processing blocks reversal",async()=>{
 const f=make({sellerState:"processing"});
 await assert.rejects(run(f),/SELLER_ORDER_NOT_CANCELLABLE/);
});
test("wrong seller inventory cannot be increased",async()=>{
 const f=make({sellerMatches:false});
 await assert.rejects(run(f),/SELLER_MISMATCH/);
 assert.equal(f.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});
test("restock write failure rolls back all changes",async()=>{
 const f=make({restockRows:0});
 await assert.rejects(run(f),/STOCK_CHANGED/);
 assert.ok(f.calls.some(c=>c.sql==="ROLLBACK"));
 assert.equal(f.calls.some(c=>c.sql==="COMMIT"),false);
});
test("untrusted missing authentication blocks any db access",async()=>{
 const f=make();
 await assert.rejects(cancelDraftTestOrder(f.pool,f.request),/AUTH_NOT_CONFIGURED/);
 assert.equal(f.calls.length,0);
});
test("invalid order ID blocks any db access",async()=>{
 const f=make();f.request.orderId="invalid";
 await assert.rejects(run(f),/INVALID_REQUEST/);
 assert.equal(f.calls.length,0);
});
