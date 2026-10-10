import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { demoOffers, parseShoppingRequest, rankOffers, prepareDemoCart } from "./smart-shopping.mjs";

const MAX_BYTES = 4096;
function json(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "http://localhost:5173",
  });
  response.end(JSON.stringify(data));
}
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
    if (Buffer.byteLength(raw) > MAX_BYTES) throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}
export function buildServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, demo: true });
      if (req.method === "POST" && req.url === "/demo/search") {
        const body = await readJson(req);
        if (typeof body?.message !== "string" || (body.priority && !["total", "fastest"].includes(body.priority))) return json(res, 400, {error:"Invalid query"});
        const intent = parseShoppingRequest(body.message);
        return json(res, 200, { demo:true, intent, needsMarket:!intent.market, results:rankOffers(demoOffers,intent,{priority:body.priority || "total"}), priceDisclaimer:"Synthetic data. No live stock or shipping quote." });
      }
      if (req.method === "POST" && req.url === "/demo/cart") {
        const body = await readJson(req);
        if (!body || typeof body.offerId !== "string") return json(res,400,{error:"Invalid offer"});
        const offer = demoOffers.find(o=>o.id===body.offerId);
        if (!offer) return json(res,404,{error:"Unknown demo offer"});
        const cart = prepareDemoCart(offer,body.quantity ?? 1);
        return json(res,200,cart);
      }
      if (req.url === "/checkout") return json(res,403,{error:"Checkout unavailable in demo"});
      return json(res,404,{error:"Not found"});
    } catch (error) { return json(res,error.status || 400,{error:error.message || "Invalid request"}); }
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  buildServer().listen(port, "127.0.0.1",()=>console.log("BORVAT synthetic demo listening at http://127.0.0.1:"+port));
}
