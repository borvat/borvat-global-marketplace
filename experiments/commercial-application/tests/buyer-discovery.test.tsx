import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buyerHref,
  buyerLocation,
  readDemoCatalog,
} from "../../../apps/marketplace/src/lib/commercial/buyer-discovery";
import { createCommercialDemoAdapter } from "../../../apps/marketplace/src/lib/commercial/demo-adapter";

test("country/locale seam supports Dutch NL and BE with safe defaults", () => {
  assert.equal(buyerLocation("/discover?country=BE").locale, "nl-BE");
  assert.equal(buyerLocation("/discover?country=FR").country, "NL");
  assert.equal(
    buyerLocation("/discover?category=unknown&sort=bad").category,
    "Alles",
  );
  assert.equal(buyerLocation("/discover?sort=bad").sort, "title");
});
test("product navigation retains search/category/sort/country and separates offer identity", () => {
  const href = buyerHref(
    "/product/prd_001",
    "/discover?q=tafel&category=Wonen&sort=price&country=BE",
    { offer: "demo-offer-alternative", sku: "sku-prd_001" },
  );
  const route = buyerLocation(href);
  assert.equal(route.productId, "prd_001");
  assert.equal(route.offerId, "demo-offer-alternative");
  assert.equal(route.skuId, "sku-prd_001");
  assert.equal(route.query, "tafel");
  assert.equal(route.sort, "price");
  assert.equal(route.country, "BE");
  assert.equal(
    new URL(buyerHref("/cart", href), "http://local").searchParams.has("offer"),
    false,
  );
  assert.equal(
    new URL(buyerHref("/cart", href), "http://local").searchParams.has("sku"),
    false,
  );
});
test("malformed product route is an unknown product, not a crash", () => {
  assert.equal(buyerLocation("/product/%E0%A4%A").productId, null);
});
test("validated read projection retains product, offer and seller distinctions as detached data", async () => {
  const adapter = createCommercialDemoAdapter();
  const snapshot = adapter.getSnapshot();
  const catalog = await readDemoCatalog(snapshot, new AbortController().signal);
  assert.deepEqual(catalog.products, snapshot.products);
  assert.notEqual(catalog.products, snapshot.products);
  assert.deepEqual(catalog.offers, snapshot.offers);
  assert.equal(catalog.skus.length, 10);
  assert.equal(catalog.offers.find((item) => item.id === "demo-offer-pack-2")?.packQuantity, 2);
  assert.notEqual(catalog.offers, snapshot.offers);
  const offer = catalog.offers.find(
    (item) => item.id === "demo-offer-alternative",
  )!;
  assert.equal(offer.productId, "prd_001");
  assert.equal(offer.sellerId, "demo-b");
  adapter.setQuantity(offer.id, 1);
  assert.equal(adapter.getSnapshot().cart[0].offerId, offer.id);
  adapter.setOfferPrice(offer.id, 12345);
  assert.throws(() => adapter.quote(), /niet meer zichtbaar/);
  adapter.setQuantity(offer.id, 0);
  assert.equal(adapter.quote().lines.length, 0);
});
