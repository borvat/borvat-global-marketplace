import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCommercialDemoAdapter,
  selectDemoProducts,
} from "../src/lib/commercial/demo-adapter";
import { orderTotals, shippingCents } from "../src/lib/commercial/shop-pricing";
import { validateCheckout, type CheckoutInput } from "../src/lib/commercial/checkout-validation";
import { memoryTestStorage } from "../src/lib/commercial/test-storage";
import { isolatedCommerceRequestStatus } from "../src/lib/commercial/runtime-mode";
import { buyerLocation } from "../src/lib/commercial/buyer-discovery";

const valid: CheckoutInput = {
  firstName: "Test",
  lastName: "Koper",
  email: "test@voorbeeld.nl",
  phone: "0612345678",
  street: "Teststraat",
  houseNumber: "12",
  addition: "",
  postalCode: "1234ab",
  city: "Utrecht",
  country: "NL",
  shippingMethod: "standaard",
  paymentMethod: "test-ideal",
  acceptTest: true,
};

test("paid standard shipping below €50 and express are applied to TEST- orders", () => {
  const a = createCommercialDemoAdapter(undefined, ids());
  a.setQuantity("demo-offer-6-medium", 1);
  const id = a.placeTestOrder(valid, "s1");
  assert.equal(a.getSnapshot().orders.find((o) => o.id === id)?.totalCents, 2995 + 495);
  a.setQuantity("demo-offer-6-medium", 1);
  const ex = a.placeTestOrder({ ...valid, shippingMethod: "express" }, "s2");
  assert.equal(a.getSnapshot().orders.find((o) => o.id === ex)?.checkout?.shippingCents, 795);
});

const ids = () => {
  let n = 0;
  return () => `TEST-UNIT${++n}`;
};

test("shipping rules: standard €4,95 free from €50, express €7,95, integer cents", () => {
  assert.equal(shippingCents("standaard", 4999), 495);
  assert.equal(shippingCents("standaard", 5000), 0);
  assert.equal(shippingCents("express", 100_000), 795);
  assert.equal(shippingCents("standaard", 0), 0);
  const t = orderTotals([{ unitPriceCents: 1999, quantity: 3 }], "standaard");
  assert.deepEqual([t.subtotalCents, t.shippingCents, t.totalCents], [5997, 0, 5997]);
  assert.equal(t.vatIncludedCents, Math.round((5997 * 21) / 121));
  const small = orderTotals([{ unitPriceCents: 10, quantity: 3 }], "express");
  assert.equal(small.totalCents, 30 + 795);
});

test("search, price, availability filters and sorting", () => {
  const s = createCommercialDemoAdapter().getSnapshot();
  const base = { query: "", category: "Alles", sort: "title" as const };
  assert.ok(selectDemoProducts(s, { ...base, query: "eettafel" }).some((p) => p.id === "prd_001"));
  assert.equal(selectDemoProducts(s, { ...base, query: "xyz-bestaat-niet" }).length, 0);
  assert.ok(selectDemoProducts(s, { ...base, query: "Gietijzer" }).some((p) => p.id === "prd_009"));
  const cheap = selectDemoProducts(s, { ...base, maxCents: 10_000 });
  assert.ok(cheap.length > 0 && cheap.every((p) => ["prd_004", "prd_006"].includes(p.id)));
  const all = selectDemoProducts(s, base).length;
  assert.equal(selectDemoProducts(s, { ...base, inStockOnly: true }).length, all - 1);
  const asc = selectDemoProducts(s, { ...base, sort: "price" }).map((p) => p.id);
  const desc = selectDemoProducts(s, { ...base, sort: "price-desc" }).map((p) => p.id);
  assert.deepEqual([...asc].reverse(), desc);
  assert.equal(buyerLocation("/discover?min=10&max=abc&stock=1&sort=price-desc").maxPrice, null);
});

test("quantity limits reject unavailable stock, over-availability and over-maximum", () => {
  const a = createCommercialDemoAdapter();
  assert.throws(() => a.setQuantity("demo-offer-9", 1), /niet leverbaar/);
  assert.throws(() => a.setQuantity("demo-offer-4", 3), /nog maar 2/);
  assert.throws(() => a.setQuantity("demo-offer-6", 11), /maximaal 10/);
  assert.throws(() => a.setQuantity("demo-offer-6", 1.5), /heel aantal/);
  a.setQuantity("demo-offer-6", 2);
  a.setQuantity("demo-offer-6", 0);
  assert.equal(a.getSnapshot().cart.length, 0);
});

test("checkout validation flags missing and malformed fields", () => {
  assert.deepEqual(validateCheckout(valid), {});
  const e = validateCheckout({
    ...valid,
    firstName: "",
    email: "x@",
    postalCode: "123",
    phone: "12",
    acceptTest: false,
  });
  assert.ok(e.firstName && e.email && e.postalCode && e.phone && e.acceptTest);
  assert.ok(
    validateCheckout({ ...valid, country: "BE", postalCode: "1000" }).postalCode === undefined,
  );
  assert.ok(validateCheckout({ ...valid, country: "BE", postalCode: "1234 AB" }).postalCode);
});

test("TEST- order: idempotent, totals match cart, clears cart, survives reload via storage", () => {
  const storage = memoryTestStorage();
  const a = createCommercialDemoAdapter(() => "2026-10-24T10:00:00.000Z", ids());
  a.restore(storage);
  a.setQuantity("demo-offer-6", 2);
  a.setQuantity("demo-offer-4", 1);
  const cartTotal = a.quote().totalCents;
  // Cart persists across a new JS context.
  const reloadedCart = createCommercialDemoAdapter();
  reloadedCart.restore(memoryTestStorage(storage.value));
  assert.equal(reloadedCart.getSnapshot().cart.length, 2);
  assert.throws(() => a.placeTestOrder({ ...valid, email: "" }, "k1"), /gemarkeerde/);
  const id = a.placeTestOrder(valid, "k1");
  assert.equal(a.placeTestOrder(valid, "k1"), id);
  assert.match(id, /^TEST-/);
  const s = a.getSnapshot();
  assert.equal(s.orders.length, 1);
  assert.equal(s.cart.length, 0);
  const order = s.orders[0];
  assert.equal(order.checkout?.subtotalCents, cartTotal);
  assert.equal(order.totalCents, cartTotal + (cartTotal >= 5000 ? 0 : 495));
  assert.equal(order.checkout?.postalCode, "1234 AB");
  assert.equal(order.payment, "test-ideal");
  const reloaded = createCommercialDemoAdapter();
  reloaded.restore(memoryTestStorage(storage.value));
  assert.equal(reloaded.getSnapshot().orders[0].id, id);
  assert.equal(reloaded.getSnapshot().cart.length, 0);
  assert.throws(() => a.placeTestOrder(valid, "k2"), /leeg/);
});

test("corrupt or foreign storage is ignored safely", () => {
  for (const raw of [
    "{not json",
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      version: 1,
      cart: [
        { offerId: "x", quantity: 1 },
        { offerId: "demo-offer-6", quantity: 99 },
      ],
      orders: [{ id: "<script>" }],
    }),
  ]) {
    const a = createCommercialDemoAdapter();
    a.restore(memoryTestStorage(raw));
    assert.equal(a.getSnapshot().cart.length, 0);
    assert.equal(a.getSnapshot().orders.length, 0);
    assert.equal(a.getSnapshot().restored, true);
  }
});

test("isolated surface serves checkout and confirmation paths only via GET/HEAD", () => {
  assert.equal(isolatedCommerceRequestStatus("GET", "/afrekenen"), 200);
  assert.equal(isolatedCommerceRequestStatus("GET", "/bestelling/TEST-ABC"), 200);
  assert.equal(isolatedCommerceRequestStatus("POST", "/afrekenen"), 405);
  assert.equal(isolatedCommerceRequestStatus("GET", "/checkout"), 404);
});
