import {test} from "node:test";
import assert from "node:assert/strict";
import {createTestOrder,OrderConflict} from "../services/test-order-service.mjs";
const execute=(pool,request)=>createTestOrder(pool,request,{authorizeBuyer:async()=>true});
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
function fakePool({existing=null,offers=[],held=false,stockUpdateRows=1}={}){
 const calls=[];let released=false;
 const db={async query(sql,args=[]){calls.push({sql,args});
  if(sql.startsWith("SELECT id, request_hash"))return {rows:existing?[existing]:[]};
  if(sql.includes("FROM borvat.offers o JOIN borvat.sellers"))return {rows:offers};
  if(sql.startsWith("SELECT 1 FROM borvat.risk_cases"))return {rows:held?[{x:1}]:[]};
  if(sql.startsWith("UPDATE borvat.offers"))return {rowCount:stockUpdateRows,rows:[]};
  return {rows:[],rowCount:1};
 },release(){released=true}};
 return {connect:async()=>db,calls,get released(){return released}};
}
const offer=(n,seller)=>({id:uuid(n),seller_id:uuid(seller),price_minor:"1000",stock:2,market:"NL",currency:"EUR",status:"published",seller_status:"approved",product_status:"approved"});
test("commit synthetic split into two merchant suborders and outbox",async()=>{
 const pool=fakePool({offers:[offer(1,10),offer(2,20)]});
 const result=await execute(pool,{buyerId:uuid(100),requestKey:"order-key-0001",offerIds:[uuid(1),uuid(2)]});
 assert.equal(result.totalMinor,2000);assert.equal(result.sellerCount,2);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("INSERT INTO borvat.seller_orders")).length,2);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("INSERT INTO borvat.order_lines")).length,2);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,2);
 assert.ok(pool.calls.some(c=>c.sql==="COMMIT"));assert.equal(pool.released,true);
});
test("risk hold aborts and rolls back",async()=>{
 const pool=fakePool({offers:[offer(1,10)],held:true});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"order-key-0001",offerIds:[uuid(1)]}),/RISK_HOLD/);
 assert.ok(pool.calls.some(c=>c.sql==="ROLLBACK"));assert.equal(pool.released,true);
});
test("prior idempotency key returns same order without updating stock",async()=>{
 const ids=[uuid(1)],buyerId=uuid(100);
 const {createHash}=await import("node:crypto");
 const request_hash=createHash("sha256").update(JSON.stringify(ids)).digest("hex");
 const pool=fakePool({existing:{id:uuid(50),request_hash,total_minor:"1000"}});
 const result=await execute(pool,{buyerId,requestKey:"order-key-0001",offerIds:ids});
 assert.equal(result.replayed,true);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,0);
});
test("invalid offer list rejected before connecting",async()=>{
 const pool=fakePool({});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"order-key-0001",offerIds:[uuid(1),uuid(1)]}),/BAD_OFFERS/);
 assert.equal(pool.calls.length,0);
});

test("a missing stock update aborts the entire order",async()=>{
 const pool=fakePool({offers:[offer(1,10)],stockUpdateRows:0});
 await assert.rejects(
   execute(pool,{buyerId:uuid(100),requestKey:"order-key-0002",offerIds:[uuid(1)]}),
   /STOCK_CHANGED/
 );
 assert.ok(pool.calls.some(c=>c.sql==="ROLLBACK"));
 assert.equal(pool.calls.some(c=>c.sql==="COMMIT"),false);
 assert.equal(pool.released,true);
});
test("a replay with changed contents is rejected without stock changes",async()=>{
 const {createHash}=await import("node:crypto");
 const request_hash=createHash("sha256").update(JSON.stringify([uuid(1)])).digest("hex");
 const pool=fakePool({existing:{id:uuid(50),request_hash,total_minor:"1000"}});
 await assert.rejects(
   execute(pool,{buyerId:uuid(100),requestKey:"order-key-0003",offerIds:[uuid(2)]}),
   /KEY_REUSED_DIFFERENT_CART/
 );
 assert.ok(pool.calls.some(c=>c.sql==="ROLLBACK"));
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,0);
});

test("unconfigured authentication rejects before database connection",async()=>{
 const pool=fakePool({offers:[offer(1,10)]});
 await assert.rejects(createTestOrder(pool,{buyerId:uuid(100),requestKey:"auth-test-001",offerIds:[uuid(1)]}),/AUTHENTICATION_NOT_CONFIGURED/);
 assert.equal(pool.calls.length,0);
});
test("identity verification rejection blocks transaction",async()=>{
 const pool=fakePool({offers:[offer(1,10)]});
 await assert.rejects(createTestOrder(pool,{buyerId:uuid(100),requestKey:"auth-test-002",offerIds:[uuid(1)]},{authorizeBuyer:async()=>false}),/UNAUTHORIZED_BUYER/);
 assert.equal(pool.calls.length,0);
});

test("suspended seller cannot receive a new order",async()=>{
 const blocked={...offer(1,10),seller_status:"suspended"};
 const pool=fakePool({offers:[blocked]});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"suspension-001",offerIds:[uuid(1)]}),/NOT_AVAILABLE/);
 assert.ok(pool.calls.some(c=>c.sql==="ROLLBACK"));
 assert.equal(pool.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});
test("unapproved catalog product cannot be sold despite published offer",async()=>{
 const blocked={...offer(1,10),product_status:"review"};
 const pool=fakePool({offers:[blocked]});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"catalog-001",offerIds:[uuid(1)]}),/NOT_AVAILABLE/);
 assert.equal(pool.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});
test("missing seller or product approval data fails closed",async()=>{
 const pool=fakePool({offers:[{...offer(1,10),seller_status:undefined}]});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"approval-001",offerIds:[uuid(1)]}),/NOT_AVAILABLE/);
 assert.ok(pool.calls.some(c=>c.sql==="ROLLBACK"));
});

test("prevents order when a seller approval is missing",async()=>{
 const pool=fakePool({offers:[{...offer(1,10),seller_status:null}]});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"missing-seller-approval",offerIds:[uuid(1)]}),/NOT_AVAILABLE/);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("INSERT INTO")).length,0);
});
test("prevents order when inventory quantity is null",async()=>{
 const pool=fakePool({offers:[{...offer(1,10),stock:null}]});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"missing-stock-value",offerIds:[uuid(1)]}),/NOT_AVAILABLE/);
 assert.equal(pool.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});

test("idempotency accepts UUID case changes as the same cart",async()=>{
 const ids=[uuid(1)], buyerId=uuid(100);
 const {createHash}=await import("node:crypto");
 const request_hash=createHash("sha256").update(JSON.stringify(ids)).digest("hex");
 const pool=fakePool({existing:{id:uuid(50),request_hash,total_minor:"1000"}});
 const result=await execute(pool,{buyerId,requestKey:"case-replay-001",offerIds:[ids[0].toUpperCase()]});
 assert.equal(result.replayed,true);
 assert.equal(pool.calls.some(c=>c.sql.startsWith("UPDATE borvat.offers")),false);
});
test("rejects the same UUID in different letter cases before opening DB",async()=>{
 const id="AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
 const pool=fakePool({});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"case-dupe-001",offerIds:[id,id.toLowerCase()]}),/BAD_OFFERS/);
 assert.equal(pool.calls.length,0);
});
test("rejects malformed UUIDs before opening DB",async()=>{
 const pool=fakePool({});
 await assert.rejects(execute(pool,{buyerId:uuid(100),requestKey:"bad-uuid-001",offerIds:["----------12345678901234567890123456"]}),/BAD_OFFERS/);
 assert.equal(pool.calls.length,0);
});

test("buyer UUID casing never changes idempotency advisory scope",async()=>{
 const pool=fakePool({offers:[offer(1,10)]});
 await execute(pool,{buyerId:uuid(100).toUpperCase(),requestKey:"buyer-case-001",offerIds:[uuid(1)]});
 const lock=pool.calls.find(c=>c.sql.startsWith("SELECT pg_advisory_xact_lock"));
 assert.equal(lock.args[0],uuid(100)+":buyer-case-001");
 const insert=pool.calls.find(c=>c.sql.startsWith("INSERT INTO borvat.buyer_orders"));
 assert.equal(insert.args[1],uuid(100));
});

test("authentication receives canonical buyer UUID",async()=>{
 const pool=fakePool({offers:[offer(1,10)]});
 let seen;
 await createTestOrder(pool,{buyerId:uuid(100).toUpperCase(),requestKey:"auth-canonical-001",offerIds:[uuid(1)]},{authorizeBuyer:async id=>(seen=id,true)});
 assert.equal(seen,uuid(100));
});
