import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCommercialDemoAdapter,
  parseDemoPrice,
  selectDemoProducts,
} from "../../../apps/marketplace/src/lib/commercial/demo-adapter";
import { CommercialWorkspace } from "../../../apps/marketplace/src/components/commercial/workspace";
const clock = () => "2026-10-22T12:00:00.000Z";

test("buyer compares two sellers for one original demo product", () => {
  const demo = createCommercialDemoAdapter(clock);
  const data = demo.getSnapshot();
  const offers = data.offers.filter(
    (offer) => offer.productId === data.products[0].id,
  );
  assert.equal(offers.length, 3);
  assert.equal(offers.filter((offer) => offer.packQuantity === 1).length, 2);
  assert.equal(offers.find((offer) => offer.packQuantity === 2)?.id, "demo-offer-pack-2");
  assert.notEqual(offers[0].sellerId, offers[1].sellerId);
  assert.equal(
    data.products[0].title,
    "Eiken eettafel 180×90 — natuurlijke afwerking",
  );
});

test("mixed seller cart has exact article totals and no shipping/payment estimate", () => {
  const demo = createCommercialDemoAdapter(clock);
  demo.setQuantity("demo-offer-1", 2);
  demo.setQuantity("demo-offer-alternative", 1);
  const quote = demo.quote();
  assert.equal(quote.totalCents, 225700);
  assert.equal(quote.shipping, "not-calculated");
  assert.equal(quote.paymentEnabled, false);
});

test("quantity change and removal update totals without reserving example stock", () => {
  const demo = createCommercialDemoAdapter(clock);
  const available = demo.getSnapshot().offers[0].availabilityExample;
  demo.setQuantity("demo-offer-1", 3);
  demo.setQuantity("demo-offer-1", 1);
  assert.equal(demo.quote().totalCents, 74900);
  demo.setQuantity("demo-offer-1", 0);
  assert.equal(demo.quote().totalCents, 0);
  assert.equal(demo.getSnapshot().offers[0].availabilityExample, available);
});

test("local request clears cart, snapshots article prices and remains unpaid", () => {
  const demo = createCommercialDemoAdapter(clock);
  demo.setQuantity("demo-offer-1", 1);
  const id = demo.submitDemoRequest();
  const order = demo.getSnapshot().orders[0];
  assert.equal(id, "DEMO-0001");
  assert.equal(order.createdAt, clock());
  assert.equal(order.payment, "disabled");
  assert.equal(order.status, "aanvraag");
  assert.equal(demo.getSnapshot().cart.length, 0);
  demo.setOfferPrice("demo-offer-1", 50000);
  assert.equal(order.lines[0].unitPriceCents, 74900);
  assert.equal(order.totalCents, 74900);
});

test("buyer/seller/admin share request progress per seller without early whole-order completion", () => {
  const demo = createCommercialDemoAdapter(clock);
  demo.setQuantity("demo-offer-1", 1);
  demo.setQuantity("demo-offer-alternative", 1);
  const id = demo.submitDemoRequest();
  demo.prepareOrder(id, "demo-a");
  assert.equal(demo.getSnapshot().orders[0].status, "aanvraag");
  demo.prepareOrder(id, "demo-b");
  assert.equal(demo.getSnapshot().orders[0].status, "voorbereid");
  assert.equal(demo.getSnapshot().orders[0].payment, "disabled");
});

test("seller price edit requires draft/review/publish before buyer can request", () => {
  const demo = createCommercialDemoAdapter(clock);
  demo.setOfferPrice("demo-offer-1", 12345);
  assert.equal(demo.getSnapshot().offers[0].state, "draft");
  demo.requestReview("demo-offer-1");
  assert.equal(demo.getSnapshot().offers[0].state, "review");
  demo.moderate("demo-offer-1", "publish");
  demo.setQuantity("demo-offer-1", 1);
  assert.equal(demo.quote().totalCents, 12345);
});

test("admin can return review item to concept", () => {
  const demo = createCommercialDemoAdapter(clock);
  demo.moderate("demo-offer-3", "draft");
  assert.equal(demo.getSnapshot().offers[2].state, "draft");
});

test("price parser accepts comma and dot decimals without float rounding", () => {
  assert.equal(parseDemoPrice("12,34"), 1234);
  assert.equal(parseDemoPrice("12.3"), 1230);
  assert.equal(parseDemoPrice("0,01"), 1);
});

test("malformed commercial prices leave state unchanged", () => {
  const demo = createCommercialDemoAdapter(clock);
  const before = demo.getSnapshot();
  for (const value of ["0", "-1", "1.234", "", "Infinity", "1000001"])
    assert.throws(() => parseDemoPrice(value));
  assert.throws(() => demo.setOfferPrice("demo-offer-1", NaN));
  assert.equal(demo.getSnapshot(), before);
});

test("out-of-range and fractional quantities do not corrupt cart", () => {
  const demo = createCommercialDemoAdapter(clock);
  for (const value of [-1, 1.5, 100, NaN])
    assert.throws(() => demo.setQuantity("demo-offer-1", value));
  assert.throws(() => demo.setQuantity("demo-offer-9", 1));
  assert.deepEqual(demo.getSnapshot().cart, []);
});

test("offer changed after cart entry surfaces review requirement and can be removed", () => {
  const demo = createCommercialDemoAdapter(clock);
  demo.setQuantity("demo-offer-1", 1);
  demo.setOfferPrice("demo-offer-1", 60000);
  assert.throws(() => demo.quote(), /niet meer zichtbaar/);
  assert.throws(() => demo.submitDemoRequest());
  demo.setQuantity("demo-offer-1", 0);
  assert.equal(demo.quote().totalCents, 0);
});

test("empty request produces no demo order", () => {
  const demo = createCommercialDemoAdapter(clock);
  assert.throws(() => demo.submitDemoRequest(), /leeg/);
  assert.equal(demo.getSnapshot().orders.length, 0);
});

test("two adapter instances and reset have disposable independent state", () => {
  const first = createCommercialDemoAdapter(clock);
  const second = createCommercialDemoAdapter(clock);
  first.setQuantity("demo-offer-1", 1);
  first.submitDemoRequest();
  assert.equal(second.getSnapshot().orders.length, 0);
  first.reset();
  assert.equal(first.getSnapshot().orders.length, 0);
  assert.equal(first.getSnapshot().cart.length, 0);
});

test("react subscriber sees consistent snapshot and unsubscribe works", () => {
  const demo = createCommercialDemoAdapter(clock);
  let updates = 0;
  const stop = demo.subscribe(() => {
    updates++;
    assert.equal(demo.getSnapshot().mode, "synthetic-memory-only");
  });
  demo.setQuantity("demo-offer-1", 1);
  stop();
  demo.reset();
  assert.equal(updates, 1);
});

test("initial UI renders original brand, comparison, missing-image disclosure and demo boundaries", () => {
  const html = renderToStaticMarkup(
    <CommercialWorkspace adapter={createCommercialDemoAdapter(clock)} />,
  );
  assert.match(html, /LOKALE DEMO/);
  assert.match(html, /BOR/);
  assert.match(html, /Productresultaten/);
  assert.match(html, /Voorbeeldwinkel A/);
  assert.match(html, /Voorbeeldwinkel B/);
  assert.match(html, /Originele afbeelding niet beschikbaar/);
  assert.doesNotMatch(html, /<img/); // Do not fabricate or request original binaries.
});

test("cart UI renders seller quantities and a disabled payment control", () => {
  const adapter = createCommercialDemoAdapter(clock);
  adapter.setQuantity("demo-offer-1", 2);
  const html = renderToStaticMarkup(
    <CommercialWorkspace adapter={adapter} initialBuyerTab="Mandje" />,
  );
  assert.match(html, /Voorbeeldwinkel A/);
  assert.match(html, /value="2"/);
  assert.match(html, /disabled=""[^>]*>Betalen niet beschikbaar/);
  assert.match(html, /Bewaar demo-aanvraag/);
});

test("seller UI renders editable offers and selected shop requests", () => {
  const adapter = createCommercialDemoAdapter(clock);
  adapter.setQuantity("demo-offer-1", 1);
  adapter.setQuantity("demo-offer-alternative", 1);
  adapter.submitDemoRequest();
  const html = renderToStaticMarkup(
    <CommercialWorkspace adapter={adapter} initialView="Verkoper" />,
  );
  assert.match(html, /Verkoperscentrum/);
  assert.match(html, /Bewaar concept/);
  assert.match(html, /Markeer demo als voorbereid/);
  assert.match(html, /DEMO-0001/);
});

test("admin UI renders moderation and shared request overview", () => {
  const adapter = createCommercialDemoAdapter(clock);
  adapter.setQuantity("demo-offer-1", 1);
  adapter.submitDemoRequest();
  const html = renderToStaticMarkup(
    <CommercialWorkspace adapter={adapter} initialView="Beheer" />,
  );
  assert.match(html, /Aanbodbeoordeling/);
  assert.match(html, /Publiceer in demo/);
  assert.match(html, /Terug naar concept/);
  assert.match(html, /DEMO-0001/);
});

test("buyer order UI shows completion without payment claims", () => {
  const adapter = createCommercialDemoAdapter(clock);
  adapter.setQuantity("demo-offer-1", 1);
  const id = adapter.submitDemoRequest();
  adapter.prepareOrder(id, "demo-a");
  const html = renderToStaticMarkup(
    <CommercialWorkspace adapter={adapter} initialBuyerTab="Aanvragen" />,
  );
  assert.match(html, /Demo voorbereid/);
  assert.match(html, /Geen betaling/);
  assert.doesNotMatch(html, /betaling ontvangen/i);
});

test("empty UI panels explain missing cart and request data", () => {
  const adapter = createCommercialDemoAdapter(clock);
  const cart = renderToStaticMarkup(
    <CommercialWorkspace adapter={adapter} initialBuyerTab="Mandje" />,
  );
  const orders = renderToStaticMarkup(
    <CommercialWorkspace adapter={adapter} initialBuyerTab="Aanvragen" />,
  );
  assert.match(cart, /Je mandje is leeg/);
  assert.match(orders, /Nog geen demo-aanvragen/);
});

test("catalog search trims whitespace, combines category and omits review-only product", () => {
  const data = createCommercialDemoAdapter(clock).getSnapshot();
  const result = selectDemoProducts(data, {
    query: "  EIKEN  ",
    category: "Wonen",
    sort: "title",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "prd_001");
  assert.equal(
    selectDemoProducts(data, {
      query: "eiken",
      category: "Tuin",
      sort: "title",
    }).length,
    0,
  );
  assert.equal(
    selectDemoProducts(data, {
      query: "wandkast",
      category: "Alles",
      sort: "title",
    }).length,
    0,
  );
});

test("catalog price order uses cheapest published offer rather than array position", () => {
  const data = createCommercialDemoAdapter(clock).getSnapshot();
  const result = selectDemoProducts(data, {
    query: "",
    category: "Tuin",
    sort: "price",
  });
  const price = (id: string) =>
    Math.min(
      ...data.offers
        .filter((o) => o.productId === id && o.state === "published")
        .map((o) => o.priceCents),
    );
  assert.equal(result.length, 3);
  assert.ok(price(result[0].id) <= price(result[1].id));
  assert.ok(price(result[1].id) <= price(result[2].id));
});
