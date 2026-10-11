import {test} from "node:test";
import assert from "node:assert/strict";
import {createTestOrder,OrderConflict} from "../services/test-order-service.mjs";
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
function fakePool({existing=null,offers=[],held=false}={}){
 const calls=[];let released=false;
 const db={async query(sql,args=[]){calls.push({sql,args});
  if(sql.startsWith("SELECT id, request_hash"))return {rows:existing?[existing]:[]};
  if(sql.startsWith("SELECT id,seller_id"))return {rows:offers};
  if(sql.startsWith("SELECT 1 FROM borvat.risk_cases"))return {rows:held?[{x:1}]:[]};
  if(sql.startsWith("UPDATE borvat.offers"))return {rowCount:1,rows:[]};
  return {rows:[],rowCount:1};
 },release(){released=true}};
 return {connect:async()=>db,calls,get released(){return released}};
}
const offer=(n,seller)=>({id:uuid(n),seller_id:uuid(seller),price_minor:"1000",stock:2,market:"NL",currency:"EUR",status:"published"});
test("commit synthetic split into two merchant suborders and outbox",async()=>{
 const pool=fakePool({offers:[offer(1,10),offer(2,20)]});
 const result=await createTestOrder(pool,{buyerId:uuid(100),requestKey:"order-key-0001",offerIds:[uuid(1),uuid(2)]});
 assert.equal(result.totalMinor,2000);assert.equal(result.sellerCount,2);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("INSERT INTO borvat.seller_orders")).length,2);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("INSERT INTO borvat.order_lines")).length,2);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,2);
 assert.ok(pool.calls.some(c=>c.sql==="COMMIT"));assert.equal(pool.released,true);
});
test("risk hold aborts and rolls back",async()=>{
 const pool=fakePool({offers:[offer(1,10)],held:true});
 await assert.rejects(createTestOrder(pool,{buyerId:uuid(100),requestKey:"order-key-0001",offerIds:[uuid(1)]}),/RISK_HOLD/);
 assert.ok(pool.calls.some(c=>c.sql==="ROLLBACK"));assert.equal(pool.released,true);
});
test("prior idempotency key returns same order without updating stock",async()=>{
 const ids=[uuid(1)],buyerId=uuid(100);
 const {createHash}=await import("node:crypto");
 const request_hash=createHash("sha256").update(JSON.stringify(ids)).digest("hex");
 const pool=fakePool({existing:{id:uuid(50),request_hash,total_minor:"1000"}});
 const result=await createTestOrder(pool,{buyerId,requestKey:"order-key-0001",offerIds:ids});
 assert.equal(result.replayed,true);
 assert.equal(pool.calls.filter(c=>c.sql.startsWith("UPDATE borvat.offers")).length,0);
});
test("invalid offer list rejected before connecting",async()=>{
 const pool=fakePool({});
 await assert.rejects(createTestOrder(pool,{buyerId:uuid(100),requestKey:"order-key-0001",offerIds:[uuid(1),uuid(1)]}),/BAD_OFFERS/);
 assert.equal(pool.calls.length,0);
});
