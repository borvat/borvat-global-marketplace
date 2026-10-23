import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogPage,
  parseCatalog,
  type CanonicalCatalog,
} from "../src/lib/commercial/catalog-contract";
import { buyerCatalog, rehearsalCatalog } from "../src/lib/commercial/catalog-rehearsal";
import { createCommercialDemoAdapter } from "../src/lib/commercial/demo-adapter";
import { readDemoCatalog } from "../src/lib/commercial/buyer-discovery";
function fixture() {
  return rehearsalCatalog(createCommercialDemoAdapter().getSnapshot());
}

test("canonical fixture separates products, SKU, companies, stores and competing offers", () => {
  const c = fixture();
  assert.equal(c.products.length, 9);
  assert.equal(c.skus.length, 9);
  assert.equal(c.companies.length, 2);
  const competitors = c.offers.filter((o) => o.skuId === c.skus[0].id);
  assert.equal(competitors.length, 2);
  assert.equal(new Set(competitors.map((o) => o.storeId)).size, 2);
  assert.ok(c.skus.every((s) => s.references.length === 0));
  assert.ok(c.products.every((p) => p.media.length === 0));
});
test("atomic parser rejects duplicate identities, dangling relations and invalid commercial values", () => {
  const cases: ((c: CanonicalCatalog) => void)[] = [
    (c) => {
      c.products.push(c.products[0]);
    },
    (c) => {
      c.skus[0].productId = "absent";
    },
    (c) => {
      c.stores[0].companyId = "absent";
    },
    (c) => {
      c.offers[0].skuId = "absent";
    },
    (c) => {
      c.offers[0].storeId = "absent";
    },
    (c) => {
      c.offers[0].priceCents = 1.5;
    },
    (c) => {
      c.offers[0].priceCents = -1;
    },
    (c) => {
      c.skus[0].packQuantity = 0;
    },
    (c) => {
      c.offers[0].countries = ["BE", "BE"];
    },
    (c) => {
      c.skus[0].references = [
        { authority: "wms", externalId: "a" },
        { authority: "wms", externalId: "b" },
      ];
    },
  ];
  for (const change of cases) {
    const c = fixture();
    change(c);
    assert.throws(() => parseCatalog(c));
  }
  assert.throws(() => parseCatalog({ ...fixture(), stockLedger: [] }));
  assert.throws(() => parseCatalog({ ...fixture(), mode: "production" }));
  assert.throws(() => parseCatalog({ ...fixture(), version: "unknown" }));
});
test("owned media requires HTTPS and a rights reference; missing media is allowed", () => {
  const c = fixture();
  c.products[0].media = [
    {
      id: "asset-1",
      url: "https://assets.example.test/owned.jpg",
      rightsReference: "fixture-license",
      source: "owner-controlled",
    },
  ];
  assert.equal(parseCatalog(c).products[0].media.length, 1);
  c.products[0].media[0].url = "javascript:alert(1)";
  assert.throws(() => parseCatalog(c));
  c.products[0].media[0].url = "https://assets.example.test/owned.jpg";
  c.products[0].media[0].rightsReference = " ";
  assert.throws(() => parseCatalog(c));
});
test("seventh company, second store and multiple packs need no special-case identifiers", () => {
  const c = fixture();
  for (let i = 3; i <= 7; i++)
    c.companies.push({ id: `company-${i}`, name: `Fixture company ${i}` });
  c.stores.push({ id: "seventh-store", companyId: "company-7", name: "Seventh store" });
  c.stores.push({ id: "seventh-store-2", companyId: "company-7", name: "Second store" });
  c.skus.push({
    ...c.skus[0],
    id: "sku-pack-6",
    packQuantity: 6,
    references: [
      { authority: "wms", externalId: "wms-pack-6" },
      { authority: "accounting", externalId: "accounting-pack-6" },
    ],
  });
  c.offers.push({
    ...c.offers[0],
    id: "seventh-offer",
    skuId: "sku-pack-6",
    storeId: "seventh-store-2",
  });
  const page = catalogPage(parseCatalog(c), { country: "BE" });
  assert.ok(page.offers.some((o) => o.id === "seventh-offer"));
  assert.equal(page.stores.find((s) => s.id === "seventh-store-2")!.companyId, "company-7");
  assert.equal(page.skus.find((s) => s.id === "sku-pack-6")!.packQuantity, 6);
});
test("pagination is deterministic, complete, country-safe and bound to revision and filters", () => {
  const c = fixture();
  c.offers[0].countries = ["BE"];
  const nl = catalogPage(c, { country: "NL" });
  assert.ok(!nl.offers.some((o) => o.id === c.offers[0].id));
  assert.ok(nl.offers.every((o) => o.state === "published"));
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = catalogPage(c, { country: "BE", sort: "price", limit: 2, cursor });
    ids.push(...page.products.map((p) => p.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(
    ids,
    catalogPage(c, { country: "BE", sort: "price" }).products.map((p) => p.id),
  );
  assert.equal(ids.length, new Set(ids).size);
  const first = catalogPage(c, { country: "BE", limit: 2 });
  assert.ok(first.nextCursor);
  for (const changed of [{ country: "NL" as const }, { query: "stoel" }, { limit: 3 }])
    assert.throws(() =>
      catalogPage(c, { country: "BE", limit: 2, cursor: first.nextCursor!, ...changed }),
    );
  assert.throws(() =>
    catalogPage(
      { ...c, revision: "new-revision" },
      { country: "BE", limit: 2, cursor: first.nextCursor! },
    ),
  );
  assert.throws(() => catalogPage(c, { country: "BE", cursor: "%bad" }));
  for (const limit of [0, 101, 1.5]) assert.throws(() => catalogPage(c, { country: "BE", limit }));
});
test("buyer projection preserves offer identity and follows seller edits without mutating request history", async () => {
  const adapter = createCommercialDemoAdapter();
  const before = rehearsalCatalog(adapter.getSnapshot());
  const projected = buyerCatalog(before);
  assert.deepEqual(projected, {
    products: adapter.getSnapshot().products,
    offers: adapter.getSnapshot().offers,
  });
  adapter.setQuantity("demo-offer-1", 1);
  assert.equal(rehearsalCatalog(adapter.getSnapshot()).revision, before.revision);
  adapter.submitDemoRequest();
  const oldPrice = adapter.getSnapshot().orders[0].lines[0].unitPriceCents;
  adapter.setOfferPrice("demo-offer-1", oldPrice + 100);
  const after = rehearsalCatalog(adapter.getSnapshot());
  assert.notEqual(after.revision, before.revision);
  assert.ok(!catalogPage(after, { country: "BE" }).offers.some((o) => o.id === "demo-offer-1"));
  assert.equal(adapter.getSnapshot().orders[0].lines[0].unitPriceCents, oldPrice);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readDemoCatalog(adapter.getSnapshot(), controller.signal));
});
