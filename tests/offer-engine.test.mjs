import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOffer, compareOffers, commissionMinor, sellerOrders } from "../prototypes/offer-engine.mjs";

const offers = [
  { sellerId:"A", productId:"SKU1", market:"NL", currency:"EUR", priceMinor:1099, stock:2 },
  { sellerId:"B", productId:"SKU1", market:"NL", currency:"EUR", priceMinor:999, stock:1 },
  { sellerId:"C", productId:"SKU1", market:"SY", currency:"SYP", priceMinor:50000, stock:3 },
  { sellerId:"D", productId:"SKU1", market:"NL", currency:"EUR", priceMinor:799, stock:0 },
];
test("independent offers ranked by price in same market and currency",()=>{
  assert.deepEqual(compareOffers(offers, { productId:"SKU1", market:"NL", currency:"EUR" }).map(x=>x.sellerId), ["B","A"]);
});
test("reject invalid amounts and negative inventory",()=>{
  assert.throws(()=>validateOffer({...offers[0],stock:-1}),RangeError);
  assert.throws(()=>validateOffer({...offers[0],priceMinor:1.1}),RangeError);
});
test("commission uses integer arithmetic with half-up rounding",()=>{
  assert.equal(commissionMinor(1001,1000),100);
  assert.equal(commissionMinor(1005,1000),101);
  assert.equal(commissionMinor(10,500),1);
  assert.equal(commissionMinor(12345,0),0);
  assert.throws(()=>commissionMinor(100,10001),RangeError);
});
test("seller order filter does not disclose other sellers' records",()=>{
  const orders=[{sellerId:"A",id:"1"},{sellerId:"B",id:"2"},{sellerId:"A",id:"3"}];
  assert.deepEqual(sellerOrders(orders,"A").map(x=>x.id),["1","3"]);
  assert.deepEqual(sellerOrders(orders,"B").map(x=>x.id),["2"]);
});
