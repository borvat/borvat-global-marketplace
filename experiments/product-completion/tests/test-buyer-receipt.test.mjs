import {test} from "node:test";
import assert from "node:assert/strict";
import {snapshotDigest} from "../services/test-snapshot-integrity.mjs";
import {readTestBuyerReceipt} from "../services/test-buyer-receipt.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const buyer=id(100),order=id(200);
const quote={schemaVersion:1,country:"NL",currency:"EUR",grossMinor:25410,netMinor:21000,vatMinor:4410,sellers:[{sellerId:id(11),grossMinor:25410,shippingGrossMinor:1210,lines:[{offerId:id(1),quantity:2}]}]};
function fixture(overrides={},authorizeBuyer=async()=>true){
 const row={id:order,state:"draft",order_currency:"EUR",currency:"EUR",total_minor:"25410",gross_minor:"25410",net_minor:"21000",vat_minor:"4410",snapshot:quote,snapshot_sha256:snapshotDigest(quote),...overrides};
 const calls=[];let released=false;
 const pool={connect:async()=>({async query(sql,args){calls.push({sql,args});return {rows:overrides.noRows?[]:[row]}},release(){released=true}})};
 return {pool,calls,read:()=>readTestBuyerReceipt(pool,{buyerId:buyer,orderId:order},{authorizeBuyer}),get released(){return released}};
}
test("authorized buyer gets immutable quote and locked original total",async()=>{
 const f=fixture();const result=await f.read();
 assert.equal(result.totalMinor,25410);
 assert.equal(result.quote.sellers[0].shippingGrossMinor,1210);
 assert.equal(result.paymentEnabled,false);
 assert.deepEqual(f.calls[0].args,[order,buyer]);
 assert.match(f.calls[0].sql,/bo.buyer_id=\$2/);
 assert.equal(f.released,true);
});
test("reordered JSONB object keys retain the same digest",()=>{
 const reordered={sellers:quote.sellers,vatMinor:4410,netMinor:21000,grossMinor:25410,currency:"EUR",country:"NL",schemaVersion:1};
 assert.equal(snapshotDigest(reordered),snapshotDigest(quote));
});
test("foreign buyer cannot access another order",async()=>{
 const f=fixture({noRows:true});
 await assert.rejects(f.read(),/RECEIPT_NOT_FOUND/);
 assert.equal(f.released,true);
});
test("unauthorized identity blocks database read",async()=>{
 const f=fixture({},async()=>false);
 await assert.rejects(f.read(),/UNAUTHORIZED/);
 assert.equal(f.calls.length,0);
});
test("missing authorization callback fails closed",async()=>{
 const f=fixture();
 await assert.rejects(readTestBuyerReceipt(f.pool,{buyerId:buyer,orderId:order}),/AUTH_NOT_CONFIGURED/);
 assert.equal(f.calls.length,0);
});
test("wrong receipt digest blocks display",async()=>{
 const f=fixture({snapshot_sha256:"0".repeat(64)});
 await assert.rejects(f.read(),/RECEIPT_INTEGRITY_FAILURE/);
 assert.equal(f.released,true);
});
test("changed stored amount cannot be presented as a receipt",async()=>{
 for(const changes of [{total_minor:"25000"},{gross_minor:null},{vat_minor:"0"},{currency:"USD"},{snapshot:{...quote,grossMinor:1}}]){
  const f=fixture(changes);
  await assert.rejects(f.read(),/RECEIPT_TOTAL_MISMATCH/);
 }
});
