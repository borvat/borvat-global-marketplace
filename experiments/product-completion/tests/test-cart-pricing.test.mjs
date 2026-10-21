import {test} from "node:test";
import assert from "node:assert/strict";
import {priceBuyerCart,QuoteError} from "../services/test-cart-pricing.mjs";
const line=(id,seller,price=12100,quantity=1,taxCategory="standard")=>({offerId:id,sellerId:seller,unitPriceMinor:price,quantity,taxCategory});
const quote=(lines,shippingBySeller)=>priceBuyerCart(lines,{shippingBySeller});
test("one seller, 21 percent VAT included, shipping VAT included",()=>{
 const x=quote([line("a","seller1")],{seller1:1210});
 assert.equal(x.grossMinor,13310);assert.equal(x.netMinor,11000);assert.equal(x.vatMinor,2310);assert.equal(x.sellers.length,1);
 assert.equal(x.paymentEnabled,false);
});
test("two merchants separate shipping and settlement grouping",()=>{
 const x=quote([line("b","B",10900,1,"reduced"),line("a","A",12100)],{A:1210,B:0});
 assert.equal(x.sellers.length,2);assert.deepEqual(x.sellers.map(s=>s.sellerId),["A","B"]);
 assert.equal(x.grossMinor,24210);assert.equal(x.vatMinor,3210);
});
test("quantity multiplier keeps line arithmetic exact",()=>{const x=quote([line("a","A",121,3)],{A:0});assert.equal(x.grossMinor,363);assert.equal(x.netMinor+x.vatMinor,363)});
test("reject unknown seller shipping",()=>assert.throws(()=>quote([line("a","A")],{A:0,B:0}),/UNKNOWN_SHIPPING_SELLER/));
test("reject missing seller shipping",()=>assert.throws(()=>quote([line("a","A")],{}),/MISSING_SHIPPING_QUOTE/));
test("reject duplicate offer rows",()=>assert.throws(()=>quote([line("a","A"),line("a","B")],{A:0,B:0}),/INVALID_LINE/));
test("reject unsupported currency",()=>assert.throws(()=>priceBuyerCart([line("a","A")],{currency:"USD",shippingBySeller:{A:0}}),/UNSUPPORTED_MARKET/));
test("reject unsupported country",()=>assert.throws(()=>priceBuyerCart([line("a","A")],{country:"DE",shippingBySeller:{A:0}}),/UNSUPPORTED_MARKET/));
test("reject negative and fractional item prices",()=>{for(const n of [-1,12.1])assert.throws(()=>quote([line("a","A",n)],{A:0}),/INVALID_LINE/)});
test("reject negative and fractional shipping",()=>{for(const n of [-1,12.1])assert.throws(()=>quote([line("a","A")],{A:n}),/INVALID_SHIPPING/)});
test("reject unconfigured category",()=>assert.throws(()=>quote([line("a","A",500,1,"unknown")],{A:0}),/INVALID_LINE/));
test("zero-rated goods do not accrue goods VAT",()=>{const x=quote([line("a","A",10000,1,"zero")],{A:0});assert.equal(x.vatMinor,0)});
test("reject oversized multiplication",()=>assert.throws(()=>quote([line("a","A",Number.MAX_SAFE_INTEGER,2)],{A:0}),/AMOUNT_OVERFLOW/));
test("reject invalid tax rate",()=>assert.throws(()=>priceBuyerCart([line("a","A")],{shippingBySeller:{A:0},shippingVatBps:20000}),/INVALID_TAX/));
