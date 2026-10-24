import { test } from "node:test";
import assert from "node:assert/strict";
import { createServerCommerceAdapter } from "../../../apps/marketplace/src/lib/commercial/server-adapter";
import type { CheckoutInput } from "../../../apps/marketplace/src/lib/commercial/checkout-validation";

const input: CheckoutInput = {
  firstName: "Test",
  lastName: "Buyer",
  email: "buyer@example.test",
  phone: "0612345678",
  street: "Teststraat",
  houseNumber: "12",
  addition: "",
  postalCode: "1234 AB",
  city: "Utrecht",
  country: "NL",
  shippingMethod: "standaard",
  paymentMethod: "test-ideal",
  acceptTest: true,
};
function setup(t: { after: (fn: () => void) => void }) {
  const originalFetch = globalThis.fetch,
    originalStorage = globalThis.sessionStorage;
  const values = new Map<string, string>();
  let malformed = false;
  let quotes = 0,
    dropAck = true,
    expired = false,
    removeFails = false;
  const orders = new Map<string, { id: string; body: string }>(),
    requests: Record<string, unknown>[] = [];
  globalThis.sessionStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      if (removeFails) throw Error("storage failure");
      values.delete(k);
    },
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
  globalThis.fetch = (async (url, options) => {
    const path = String(url).replace("/api/commerce/", ""),
      body = options?.body ? JSON.parse(String(options.body)) : {};
    if (path === "session") return Response.json({ role: "guest" });
    if (path === "catalog")
      return Response.json({
        offers: [
          {
            id: "native-a",
            product: "native-product",
            sku: "TEST-C1",
            seller: "seller-a",
            seller_name: "Test A",
            price: 2000,
            pack: 1,
            available: 10,
            info: { title: "Native C1", variant: "one unit" },
          },
        ],
      });
    if (path === "quote") return Response.json({ id: "quote-" + ++quotes });
    if (path === "orders") {
      requests.push(body);
      const key = body.idempotencyKey;
      if (expired) {
        expired = false;
        return Response.json({ error: "QUOTE_EXPIRED" }, { status: 409 });
      }
      const old = orders.get(key);
      if (old) {
        if (old.body !== JSON.stringify(body))
          return Response.json(
            { error: "IDEMPOTENCY_CONFLICT" },
            { status: 409 },
          );
        return Response.json({
          id: old.id,
          lines: [{}],
          portions: [{}],
          totalCents: 6000,
        });
      }
      const order = {
        id:
          "BVT-TEST-00000000-0000-4000-8000-" +
          String(orders.size).padStart(12, "0"),
        body: JSON.stringify(body),
      };
      orders.set(key, order);
      if (dropAck) {
        dropAck = false;
        throw Error("connection lost after commit");
      }
      return Response.json(
        malformed
          ? {}
          : { id: order.id, lines: [{}], portions: [{}], totalCents: 6000 },
      );
    }
    throw Error("Unexpected request " + path);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.sessionStorage = originalStorage;
  });
  const adapter = async () => {
    const value = createServerCommerceAdapter();
    await value.refresh!();
    value.setQuantity("native-a", 3);
    return value;
  };
  return {
    orders,
    requests,
    values,
    adapter,
    normal: () => (dropAck = false),
    expire: () => {
      expired = true;
      dropAck = false;
    },
    failRemove: () => (removeFails = true),
    malformed: () => {
      malformed = true;
      dropAck = false;
    },
  };
}
// Document verification is intentionally fake here: these are client retry tests, not native/provider tests.
test("reload plus changed address after a lost ACK retains the original key and cannot create a second order", async (t) => {
  const h = setup(t),
    first = await h.adapter();
  await assert.rejects(
    first.placeServerOrder!(input, "first-attempt"),
    /connection lost/,
  );
  assert.equal(first.getSnapshot().cart.length, 1);
  const reloaded = await h.adapter();
  await assert.rejects(
    reloaded.placeServerOrder!({ ...input, city: "Rotterdam" }, "new-form-key"),
    /gewijzigde gegevens/,
  );
  assert.equal(h.orders.size, 1);
  assert.equal(h.requests[1].idempotencyKey, "first-attempt");
});
test("expired quote refreshes the visible cart and waits for another confirmation while retaining the order key", async (t) => {
  const h = setup(t);
  h.expire();
  const adapter = await h.adapter();
  await assert.rejects(
    adapter.placeServerOrder!(input, "expiry-attempt"),
    /verlopen/,
  );
  assert.equal(h.orders.size, 0);
  const saved = await adapter.placeServerOrder!(input, "new-form-key");
  assert.equal(saved, "BVT-TEST-00000000-0000-4000-8000-000000000000");
  assert.equal(h.requests[1].idempotencyKey, "expiry-attempt");
  assert.notEqual(h.requests[0].quoteId, h.requests[1].quoteId);
});
test("local attempt cleanup failure after a server ACK does not report a failed order or retain its cart", async (t) => {
  const h = setup(t);
  h.normal();
  h.failRemove();
  const adapter = await h.adapter();
  assert.equal(
    await adapter.placeServerOrder!(input, "acknowledged"),
    "BVT-TEST-00000000-0000-4000-8000-000000000000",
  );
  assert.equal(adapter.getSnapshot().cart.length, 0);
  assert.equal(h.orders.size, 1);
});

test("malformed successful HTTP response cannot confirm an order or clear the basket", async (t) => {
  const h = setup(t);
  h.malformed();
  const adapter = await h.adapter();
  await assert.rejects(
    adapter.placeServerOrder!(input, "malformed-ack"),
    /onvolledig/,
  );
  assert.equal(h.orders.size, 1);
  assert.equal(adapter.getSnapshot().cart.length, 1);
  assert.ok(h.values.get("borvat-connected-checkout-v1"));
});
