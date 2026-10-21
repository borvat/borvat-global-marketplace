import {test} from "node:test";
import assert from "node:assert/strict";
import {createMarketplaceSandbox} from "../prototypes/marketplace-sandbox.mjs";
test("six-platform sandbox: role separation, seller onboarding, cart, orders, ads, quality and admin audit",()=>{
 const m=createMarketplaceSandbox(),buyer=m.createUser("buyer"),admin=m.createUser("admin"),reviewer=m.createUser("reviewer"),ads=m.createUser("ad_operator");
 const first=m.applySeller(m.createUser("seller"),"Demo A"),second=m.applySeller(m.createUser("seller"),"Demo B");
 assert.throws(()=>m.addOffer(first.actor,{productId:"stove",priceMinor:10,shippingMinor:0,stock:1,currency:"EUR",market:"NL"}),/SELLER_NOT_APPROVED/);
 m.reviewSeller(reviewer,first.seller.id,true);m.reviewSeller(reviewer,second.seller.id,true);
 const a=m.addOffer(first.actor,{productId:"stove",priceMinor:1950,shippingMinor:250,stock:2,currency:"EUR",market:"NL"});
 const b=m.addOffer(second.actor,{productId:"stove",priceMinor:2050,shippingMinor:0,stock:3,currency:"EUR",market:"NL"});
 assert.equal(m.listOffers(buyer).find(o=>o.id===a.id),undefined);
 m.reviewOffer(reviewer,a.id,true);m.reviewOffer(reviewer,b.id,true);
 assert.equal(m.listOffers(buyer).length,2);
 assert.equal(m.quote(buyer,[a.id,b.id]).totalMinor,4250);
 assert.throws(()=>m.quote(buyer,[a.id,a.id]),/DUPLICATE_OFFER/);
 const order=m.createDemoOrder(buyer,[a.id,b.id],"demo-order-0001");assert.equal(order.sellerOrders.length,2);assert.equal(order.paid,false);
 assert.deepEqual(m.sellerOrders(first.actor).map(x=>x.offerId),[a.id]);assert.deepEqual(m.sellerOrders(second.actor).map(x=>x.offerId),[b.id]);
 assert.throws(()=>m.sellerOrders(buyer),/FORBIDDEN/);
 const campaign=m.createCampaign(ads,{sellerId:first.seller.id,budgetMinor:100});
 assert.throws(()=>m.approveCampaign(buyer,campaign.id),/FORBIDDEN/);
 m.approveCampaign(admin,campaign.id);assert.equal(m.simulateAdSpend(ads,campaign.id,90).spentMinor,90);
 assert.throws(()=>m.simulateAdSpend(ads,campaign.id,11),/BUDGET_CAP/);
 m.flagOffer(reviewer,a.id,"Synthetic suspicious listing");
 assert.throws(()=>m.quote(buyer,[a.id]),/NOT_AVAILABLE/);
 m.resolveRisk(admin,a.id);assert.equal(m.quote(buyer,[a.id]).totalMinor,2200);
 assert.ok(m.audit(admin).length>10);
 assert.throws(()=>m.audit(buyer),/FORBIDDEN/);
});

test("demo order idempotency protects stock and rejects conflicting repeats",()=>{
 const m=createMarketplaceSandbox(),buyer=m.createUser("buyer"),reviewer=m.createUser("reviewer");
 const applied=m.applySeller(m.createUser("seller"),"Seller");m.reviewSeller(reviewer,applied.seller.id,true);
 const offer=m.addOffer(applied.actor,{productId:"stove",priceMinor:100,shippingMinor:0,stock:1,currency:"EUR",market:"NL"});
 m.reviewOffer(reviewer,offer.id,true);
 assert.throws(()=>m.createDemoOrder(buyer,[offer.id]),/IDEMPOTENCY_KEY_REQUIRED/);
 const first=m.createDemoOrder(buyer,[offer.id],"order-0001");
 assert.deepEqual(m.createDemoOrder(buyer,[offer.id],"order-0001"),first);
 assert.throws(()=>m.createDemoOrder(buyer,[offer.id],"order-0002"),/NOT_AVAILABLE/);
 assert.throws(()=>m.createDemoOrder(buyer,[],"order-0001"),/IDEMPOTENCY_CONFLICT/);
});
test("caller cannot inject seller tenant through user creation",()=>{
 const m=createMarketplaceSandbox(); const forged=m.createUser("seller",{sellerId:"seller-victim"});
 assert.equal(forged.sellerId,null);
 assert.throws(()=>m.sellerOrders(forged),/SELLER_NOT_APPROVED/);
});
