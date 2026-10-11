import {test} from "node:test";
import assert from "node:assert/strict";
import {quoteApprovedCart} from "../services/test-checkout-quote.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const offer=(n,seller=11)=>({id:id(n),sellerId:id(seller),stock:4,priceMinor:12100,taxCategory:"standard",market:"NL",currency:"EUR",offerStatus:"published",sellerStatus:"approved",productStatus:"approved",riskHeld:false});
const req=(...ns)=>ns.map(n=>({offerId:id(n),quantity:1}));
const q=(requested,offers,shippingBySeller)=>quoteApprovedCart({requested,offers,shippingBySeller});
test("approved snapshot produces multi-merchant indicative quote",()=>{
 const x=q(req(1,2),[offer(1,11),offer(2,12)],{[id(11)]:1210,[id(12)]:0});
 assert.equal(x.sellers.length,2);assert.equal(x.grossMinor,25410);assert.equal(x.paymentEnabled,false);
});
test("stock below requested quantity blocks quote",()=>{
 assert.throws(()=>q([{offerId:id(1),quantity:5}],[offer(1)],{[id(11)]:0}),/INSUFFICIENT_STOCK/);
});
test("suspended seller blocks quote",()=>{
 assert.throws(()=>q(req(1),[{...offer(1),sellerStatus:"suspended"}],{[id(11)]:0}),/OFFER_NOT_ELIGIBLE/);
});
test("unapproved product blocks quote",()=>{
 assert.throws(()=>q(req(1),[{...offer(1),productStatus:"review"}],{[id(11)]:0}),/OFFER_NOT_ELIGIBLE/);
});
test("risk hold blocks quote",()=>{
 assert.throws(()=>q(req(1),[{...offer(1),riskHeld:true}],{[id(11)]:0}),/OFFER_NOT_ELIGIBLE/);
});
test("missing authoritative risk state fails closed",()=>{
 const v=offer(1);delete v.riskHeld;
 assert.throws(()=>q(req(1),[v],{[id(11)]:0}),/OFFER_NOT_ELIGIBLE/);
});
test("wrong returned offer fails closed",()=>{
 assert.throws(()=>q(req(1),[offer(2)],{[id(11)]:0}),/CART_SNAPSHOT_MISMATCH/);
});
test("duplicate returned offer fails closed",()=>{
 assert.throws(()=>q(req(1,2),[offer(1),offer(1)],{[id(11)]:0}),/CART_SNAPSHOT_MISMATCH/);
});
test("wrong currency blocks quote",()=>{
 assert.throws(()=>q(req(1),[{...offer(1),currency:"USD"}],{[id(11)]:0}),/MARKET_MISMATCH/);
});
test("missing per-seller shipping blocks quote",()=>{
 assert.throws(()=>q(req(1),[offer(1)],{}),/MISSING_SHIPPING_QUOTE/);
});
test("requested duplicates in alternate UUID casing blocked",()=>{
 assert.throws(()=>q([{offerId:id(1),quantity:1},{offerId:id(1).toUpperCase(),quantity:1}],[offer(1),offer(2)],{[id(11)]:0}),/DUPLICATE_CART_OFFER/);
});
test("no buyer payment actions exposed",()=>{
 const x=q(req(1),[offer(1)],{[id(11)]:0});
 assert.equal(x.kind,"indicative_test_quote");assert.equal(x.checkoutEnabled,false);
});
