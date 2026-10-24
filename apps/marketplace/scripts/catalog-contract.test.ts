import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogPage,
  parseCatalog,
  parseCanonicalCatalogJson,
  previewCanonicalCatalogImport,
  serializeCanonicalCatalog,
  type CanonicalCatalog,
} from "../src/lib/commercial/catalog-contract";
import { buyerCatalog, rehearsalCatalog } from "../src/lib/commercial/catalog-rehearsal";
import { createCommercialDemoAdapter } from "../src/lib/commercial/demo-adapter";
import { projectWmsAvailability } from "../src/lib/commercial/wms-availability-adapter";
import { buyerHref, buyerLocation, readDemoCatalog } from "../src/lib/commercial/buyer-discovery";
function fixture() {
  return rehearsalCatalog(createCommercialDemoAdapter().getSnapshot());
}

test("buyer SKU selection stays on product routes and clears outside detail", () => {
  const detail = buyerHref("/product/prd_001", "/discover?q=eiken&country=BE", {
    sku: "sku-pack-2-prd_001",
    offer: "demo-offer-pack-2",
  });
  assert.equal(buyerLocation(detail).skuId, "sku-pack-2-prd_001");
  assert.equal(buyerLocation(detail).offerId, "demo-offer-pack-2");
  assert.equal(buyerLocation(detail).country, "BE");
  const cart = buyerHref("/cart", detail);
  assert.equal(new URL(cart, "http://local").searchParams.has("sku"), false);
  assert.equal(new URL(cart, "http://local").searchParams.has("offer"), false);
});

test("canonical fixture separates products, SKU, companies, stores and competing offers", () => {
  const c = fixture();
  assert.equal(c.products.length, 9);
  assert.equal(c.skus.length, 10);
  assert.ok(c.skus.some((sku) => sku.packQuantity === 2));
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
  assert.deepEqual(projected.products, adapter.getSnapshot().products);
  assert.ok(projected.skus.some((sku) => sku.packQuantity === 2));
  const packOffer = projected.offers.find((offer) => offer.id === "demo-offer-pack-2");
  assert.equal(packOffer?.packQuantity, 2);
  assert.ok(packOffer?.skuId.startsWith("sku-pack-2-"));
  adapter.setQuantity("demo-offer-pack-2", 1);
  assert.equal(rehearsalCatalog(adapter.getSnapshot()).revision, before.revision);
  adapter.submitDemoRequest();
  const oldPrice = adapter.getSnapshot().orders[0].lines[0].unitPriceCents;
  adapter.setOfferPrice("demo-offer-1", oldPrice + 100);
  const after = rehearsalCatalog(adapter.getSnapshot());
  assert.notEqual(after.revision, before.revision);
  assert.ok(!catalogPage(after, { country: "BE" }).offers.some((o) => o.id === "demo-offer-1"));
  assert.equal(adapter.getSnapshot().orders[0].lines[0].unitPriceCents, oldPrice);
  assert.equal(adapter.getSnapshot().orders[0].lines[0].packQuantity, 2);
  assert.match(adapter.getSnapshot().orders[0].lines[0].skuId, /^sku-pack-2-/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readDemoCatalog(adapter.getSnapshot(), controller.signal));
});

test("canonical JSON export validates, round-trips and ignores source row order", () => {
  const source = fixture();
  const original = JSON.stringify(source);
  const reordered: CanonicalCatalog = {
    ...source,
    products: [...source.products]
      .reverse()
      .map((product) => ({ ...product, media: [...product.media].reverse() })),
    skus: [...source.skus]
      .reverse()
      .map((sku) => ({ ...sku, references: [...sku.references].reverse() })),
    companies: [...source.companies].reverse(),
    stores: [...source.stores].reverse(),
    offers: [...source.offers]
      .reverse()
      .map((offer) => ({ ...offer, countries: [...offer.countries].reverse() })),
  };
  const serialized = serializeCanonicalCatalog(source);
  assert.ok(serialized.endsWith("\n"));
  assert.equal(serialized, serializeCanonicalCatalog(reordered));
  const compareId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const normalized: CanonicalCatalog = {
    ...source,
    products: source.products
      .map((product) => ({ ...product, media: [...product.media].sort(compareId) }))
      .sort(compareId),
    skus: source.skus
      .map((sku) => ({
        ...sku,
        references: [...sku.references].sort((a, b) => compareText(a.authority, b.authority)),
      }))
      .sort(compareId),
    companies: [...source.companies].sort(compareId),
    stores: [...source.stores].sort(compareId),
    offers: source.offers
      .map((offer) => ({
        ...offer,
        countries: [...offer.countries].sort(compareText),
      }))
      .sort(compareId),
  };
  assert.deepEqual(parseCanonicalCatalogJson(serialized), parseCatalog(normalized));
  assert.throws(() => parseCanonicalCatalogJson("{"), /Invalid canonical catalog JSON/);
  assert.throws(() => parseCanonicalCatalogJson(JSON.stringify({ ...source, mode: "production" })));
  assert.equal(JSON.stringify(source), original);
  assert.throws(() => serializeCanonicalCatalog({ ...source, mode: "production" }));
});

test("catalog import preview is deterministic, validates both snapshots and reports entity changes without mutation", () => {
  const previous = fixture();
  const previousJson = JSON.stringify(previous);
  const incoming = JSON.parse(previousJson) as CanonicalCatalog;
  const removedProductId = incoming.products[0].id;
  const removedSkuIds = incoming.skus
    .filter((sku) => sku.productId === removedProductId)
    .map((sku) => sku.id)
    .sort();
  const removedOffers = incoming.offers.filter((offer) => removedSkuIds.includes(offer.skuId));
  const removedOfferIds = removedOffers.map((offer) => offer.id).sort();
  const changedProductId = incoming.products.find((product) => product.id !== removedProductId)!.id;
  const changedCompanyId = incoming.companies[0].id;
  const changedOfferId = incoming.offers.find((offer) => !removedOfferIds.includes(offer.id))!.id;
  incoming.products = incoming.products.filter((product) => product.id !== removedProductId);
  incoming.skus = incoming.skus.filter((sku) => sku.productId !== removedProductId);
  incoming.offers = incoming.offers.filter((offer) => !removedOfferIds.includes(offer.id));
  incoming.products.find((product) => product.id === changedProductId)!.title += " updated";
  incoming.companies.find((company) => company.id === changedCompanyId)!.name += " updated";
  incoming.offers.find((offer) => offer.id === changedOfferId)!.priceCents += 100;
  incoming.revision = "reviewed-import";

  const preview = previewCanonicalCatalogImport(previous, incoming);
  assert.equal(preview.previousRevision, previous.revision);
  assert.equal(preview.incomingRevision, "reviewed-import");
  assert.equal(preview.hasChanges, true);
  assert.deepEqual(preview.collections.products.removed, [removedProductId]);
  assert.deepEqual(preview.collections.products.changed, [changedProductId]);
  assert.deepEqual(preview.collections.skus.removed, removedSkuIds);
  assert.deepEqual(preview.collections.offers.removed, removedOfferIds);
  assert.deepEqual(preview.collections.offers.changed, [changedOfferId]);
  assert.deepEqual(preview.collections.companies.changed, [changedCompanyId]);
  assert.equal(JSON.stringify(previous), previousJson);

  const sameContent = { ...previous, revision: "different-revision" };
  assert.equal(previewCanonicalCatalogImport(previous, sameContent).hasChanges, false);
  assert.throws(() =>
    previewCanonicalCatalogImport(previous, { ...incoming, mode: "production" }),
  );
});

test("WMS availability mapping requires explicit company and SKU identities and never converts UOM", () => {
  const catalog = fixture();
  const company = catalog.companies[0];
  const otherCompany = catalog.companies.find((entry) => entry.id !== company.id)!;
  const companyStores = new Set(
    catalog.stores.filter((store) => store.companyId === company.id).map((store) => store.id),
  );
  const companySkuIds = new Set(
    catalog.offers
      .filter((offer) => companyStores.has(offer.storeId))
      .map((offer) => offer.skuId),
  );
  const sku = catalog.skus.find((entry) => companySkuIds.has(entry.id))!;
  const otherSku = catalog.skus.find(
    (entry) => entry.id !== sku.id && catalog.offers.some((offer) => {
      const store = catalog.stores.find((candidate) => candidate.id === offer.storeId);
      return store?.companyId === otherCompany.id && offer.skuId === entry.id;
    }),
  )!;
  sku.references.push({
    authority: "wms",
    companyId: company.id,
    externalId: "native-item-shared",
  });
  otherSku.references.push({
    authority: "wms",
    companyId: otherCompany.id,
    externalId: "native-item-shared",
  });
  assert.doesNotThrow(() => parseCatalog(catalog));

  const duplicateIdentity = JSON.parse(JSON.stringify(catalog)) as CanonicalCatalog;
  const duplicateSku = duplicateIdentity.skus.find(
    (entry) => entry.id !== sku.id && companySkuIds.has(entry.id),
  )!;
  duplicateSku.references.push({
    authority: "wms",
    companyId: company.id,
    externalId: "native-item-shared",
  });
  assert.throws(() => parseCatalog(duplicateIdentity), /Native identity maps to multiple SKUs/);
  assert.throws(() =>
    parseCatalog({
      ...catalog,
      skus: catalog.skus.map((entry) =>
        entry.id === sku.id
          ? {
              ...entry,
              references: [
                ...entry.references,
                { authority: "accounting", companyId: "unknown-company", externalId: "native-a" },
              ],
            }
          : entry,
      ),
    }),
  );

  const projection = {
    company: "TEST-A",
    products: [
      { id: "native-item-shared", organization_id: "TEST-A", available_qty: 4 },
    ],
  };
  const result = projectWmsAvailability(
    catalog,
    { catalogCompanyId: company.id, wmsCompanyId: "TEST-A" },
    projection,
  );
  assert.deepEqual(result.availability, [
    { skuId: sku.id, wmsItemId: "native-item-shared", availableQuantity: 4 },
  ]);
  assert.ok(result.unmappedSkuIds.length > 0);
  assert.deepEqual(result.missingProjectionSkuIds, []);
  assert.throws(
    () =>
      projectWmsAvailability(
        catalog,
        { catalogCompanyId: company.id, wmsCompanyId: "TEST-B" },
        projection,
      ),
    /WMS company scope mismatch/,
  );
  assert.throws(() =>
    projectWmsAvailability(catalog, { catalogCompanyId: "absent", wmsCompanyId: "TEST-A" }, projection),
  );
  assert.throws(() =>
    projectWmsAvailability(catalog, { catalogCompanyId: company.id, wmsCompanyId: "TEST-A" }, {
      ...projection,
      products: [{ ...projection.products[0], organization_id: "TEST-B" }],
    }),
  );
  assert.throws(() =>
    projectWmsAvailability(catalog, { catalogCompanyId: company.id, wmsCompanyId: "TEST-A" }, {
      ...projection,
      products: [projection.products[0], projection.products[0]],
    }),
    /Duplicate WMS product identity/,
  );
  const missing = projectWmsAvailability(
    catalog,
    { catalogCompanyId: company.id, wmsCompanyId: "TEST-A" },
    { company: "TEST-A", products: [] },
  );
  assert.deepEqual(missing.missingProjectionSkuIds, [sku.id]);
});
