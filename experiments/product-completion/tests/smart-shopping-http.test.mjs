import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { buildServer } from "../prototypes/smart-shopping-server.mjs";
test("HTTP synthetic shopping end-to-end with disabled checkout", async () => {
  const server = buildServer();
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const url="http://127.0.0.1:"+server.address().port;
  const send=async (path,payload)=>fetch(url+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  try {
    let response = await send("/demo/search",{message:"بدي موقد تخييم مع 4 عبوات غاز بهولندا"});
    assert.equal(response.status,200);
    const search=await response.json();
    assert.equal(search.demo,true);
    assert.equal(search.results[0].id,"demo-nl-b");
    response=await send("/demo/cart",{offerId:search.results[0].id,quantity:2});
    assert.equal(response.status,200);
    const cart=await response.json();
    assert.equal(cart.totalMinor,4300);
    assert.equal(cart.checkoutEnabled,false);
    response=await send("/checkout",{cart});
    assert.equal(response.status,403);
    response=await send("/demo/cart",{offerId:"demo-nl-b",quantity:100});
    assert.equal(response.status,400);
    response=await send("/demo/search",{message:"موقد مع 4 عبوات غاز"});
    assert.equal((await response.json()).needsMarket,true);
  } finally { await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
});

test("browser demo served by the same HTTP API", async () => {
  const server=buildServer();server.listen(0,"127.0.0.1");await once(server,"listening");
  try {
    const r=await fetch("http://127.0.0.1:"+server.address().port+"/");
    assert.equal(r.status,200);
    assert.match(r.headers.get("content-type"),/text\\/html/);
    const html=await r.text();
    assert.match(html,/BORVAT Smart Shopping/);
    assert.match(html,/DEMO/);
    assert.match(html,/demo\\/search/);
  } finally {await new Promise(resolve=>server.close(resolve))}
});
