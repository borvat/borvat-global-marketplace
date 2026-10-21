import {test} from "node:test";
import assert from "node:assert/strict";
import {createFixedSellerShippingProvider} from "../services/test-server-shipping.mjs";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const data=()=>({requested:[{offerId:id(1),quantity:2}],offers:[{offerId:id(1),sellerId:id(11),quantity:2,market:"NL",currency:"EUR"}],country:"NL",currency:"EUR"});
test("server tariff resolves correct seller, regardless of buyer price",async()=>{
 const tariffs={[id(11)]:1210};const quote=createFixedSellerShippingProvider({tariffs});
 tariffs[id(11)]=0;assert.deepEqual(await quote(data()),{[id(11)]:1210});
});
test("missing trusted seller snapshot fails closed",async()=>{
 const quote=createFixedSellerShippingProvider({tariffs:{[id(11)]:1210}});
 await assert.rejects(quote({...data(),offers:undefined}),/MISSING_TRUSTED_SELLER_SNAPSHOT/);
});
test("seller unknown to tariff configuration blocks checkout",async()=>{
 const quote=createFixedSellerShippingProvider({tariffs:{[id(12)]:1210}});
 await assert.rejects(quote(data()),/MISSING_SELLER_TARIFF/);
});
test("quantity change after quote request is rejected",async()=>{
 const quote=createFixedSellerShippingProvider({tariffs:{[id(11)]:1210}});
 const d=data();d.offers[0].quantity=1;
 await assert.rejects(quote(d),/SHIPPING_QUANTITY_MISMATCH/);
});
test("wrong currency is rejected",async()=>{
 const quote=createFixedSellerShippingProvider({tariffs:{[id(11)]:1210}});
 await assert.rejects(quote({...data(),currency:"USD"}),/SHIPPING_MARKET_MISMATCH/);
});
test("duplicate snapshot for one offer blocked",async()=>{
 const quote=createFixedSellerShippingProvider({tariffs:{[id(11)]:1210}});
 const d=data();d.requested.push({offerId:id(2),quantity:1});d.offers.push(d.offers[0]);
 await assert.rejects(quote(d),/INVALID_SHIPPING_SNAPSHOT/);
});
