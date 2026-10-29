/** Shared fixtures for payment tests. Everything here is synthetic and clearly simulated. */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommerceStore } from "../../packages/commerce-server/store.mjs";
import { createCommerceHandler } from "../../packages/commerce-server/http.mjs";
import { SimulatedPaymentProvider } from "../../packages/commerce-server/payment-provider.mjs";

export const ORIGIN = "http://127.0.0.1:19090";
export const WEBHOOK_SECRET = "synthetic-webhook-secret-0123456789";

const fixtures = {
  sellers: [
    { id: "seller-a", company: "TEST-A", name: "Test A" },
    { id: "seller-b", company: "TEST-B", name: "Test B" },
  ],
  users: [
    {
      id: "admin",
      email: "admin@example.test",
      password: "isolated-admin-password",
      role: "admin",
    },
    {
      id: "a",
      email: "a@example.test",
      password: "isolated-seller-a-password",
      role: "seller",
      seller: "seller-a",
    },
  ],
  offers: [
    {
      id: "demo-offer-1",
      product: "prd_001",
      sku: "TEST-C1",
      seller: "seller-a",
      price: 2000,
      pack: 1,
      info: { title: "Test product", variant: "Native component C1" },
    },
    {
      id: "demo-offer-alternative",
      product: "prd_001",
      sku: "TEST-C1",
      seller: "seller-b",
      price: 2000,
      pack: 1,
      info: { title: "Test product", variant: "Native component C1" },
    },
  ],
};
export const checkout = {
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
};
export const cart = {
  lines: [
    { offerId: "demo-offer-1", quantity: 2 },
    { offerId: "demo-offer-alternative", quantity: 2 },
  ],
  shippingMethod: "standaard",
};

/** Deliberately simulated WMS receiver, same idea as service.test.mjs. */
function fakeReceiver(company) {
  const commands = new Map();
  return {
    mode: "test",
    durableIdempotency: true,
    availability: async () => ({ "TEST-C1": 100 }),
    lookup: async (e) =>
      commands.has(e.command_id)
        ? { kind: "found", evidence: commands.get(e.command_id) }
        : { kind: "absent", authoritative: true },
    execute: async (e) => {
      const result = {
        commandId: e.command_id,
        company,
        status: "completed",
        references: ["FAKE-" + e.command_id],
        native: { reference: "FAKE-" + e.command_id },
      };
      commands.set(e.command_id, result);
      return result;
    },
  };
}

export function paymentHarness(t, { withProvider = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "borvat-pay-"));
  writeFileSync(join(dir, ".borvat-synthetic-only"), "");
  let now = Date.now();
  const clock = () => now;
  const store = new CommerceStore({
    path: join(dir, "orders.sqlite"),
    now: clock,
    receivers: { "TEST-A": fakeReceiver("TEST-A"), "TEST-B": fakeReceiver("TEST-B") },
  });
  store.bootstrap(fixtures);
  const provider = new SimulatedPaymentProvider({
    webhookSecret: WEBHOOK_SECRET,
    now: clock,
  });
  const handler = createCommerceHandler({
    store,
    origin: ORIGIN,
    payments: withProvider ? { provider } : null,
  });
  const admin = store.login(
    "admin@example.test",
    fixtures.users[0].password,
    null,
    "admin",
  ).token;
  const seller = store.login(
    "a@example.test",
    fixtures.users[1].password,
    null,
    "a",
  ).token;
  store.approve(admin, "seller-a", "approved");
  store.approve(admin, "seller-b", "approved");
  const guest = store.createSession().token;
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const tick = (ms) => (now += ms);
  /** Places an order and reserves stock; the payment stays not_started. */
  async function reservedOrder(key = "checkout-" + Math.random().toString(36).slice(2)) {
    const quote = await store.quote(guest, cart);
    const order = store.place(guest, {
      quoteId: quote.id,
      checkout,
      idempotencyKey: key,
    });
    await store.reserveOrder(guest, order.id);
    return store.order(guest, order.id);
  }
  /** Reserved order with a pending provider intent. */
  async function pendingOrder() {
    const order = await reservedOrder();
    const started = await store.startPayment(guest, order.id, provider);
    return { id: order.id, total: order.totalCents, reference: started.payment.reference };
  }
  const event = (o, status, extra = {}) => ({
    eventId: extra.eventId ?? `evt-${o.id}-${status}`,
    orderId: o.id,
    reference: extra.reference ?? o.reference,
    status,
    amountCents: extra.amountCents ?? o.total,
    currency: extra.currency ?? "EUR",
  });
  const count = (sql, ...args) =>
    store.db.prepare(sql).get(...args)["count(*)"];
  const request = (path, { method = "POST", body, cookie, headers = {} } = {}) =>
    new Request(ORIGIN + path, {
      method,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...(cookie ? { cookie: "borvat-test=" + cookie } : {}),
        ...headers,
      },
    });
  return {
    store, provider, handler, admin, seller, guest, tick,
    reservedOrder, pendingOrder, event, count, request,
  };
}
