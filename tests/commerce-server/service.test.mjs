import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommerceStore } from "../../packages/commerce-server/store.mjs";
import { createCommerceHandler } from "../../packages/commerce-server/http.mjs";

export const fixtures = {
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
    {
      id: "b",
      email: "b@example.test",
      password: "isolated-seller-b-password",
      role: "seller",
      seller: "seller-b",
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

function harness(t, receivers) {
  const dir = mkdtempSync(join(tmpdir(), "borvat-test-"));
  writeFileSync(join(dir, ".borvat-synthetic-only"), "");
  let now = Date.now();
  const store = new CommerceStore({
    path: join(dir, "orders.sqlite"),
    now: () => now,
    receivers: receivers ?? {
      "TEST-A": fake("TEST-A"),
      "TEST-B": fake("TEST-B"),
    },
  });
  store.bootstrap(fixtures);
  const handler = createCommerceHandler({
    store,
    origin: "http://127.0.0.1:19090",
  });
  const admin = store.login(
    "admin@example.test",
    fixtures.users[0].password,
    null,
    "admin",
  ).token;
  const a = store.login(
    "a@example.test",
    fixtures.users[1].password,
    null,
    "a",
  ).token;
  const b = store.login(
    "b@example.test",
    fixtures.users[2].password,
    null,
    "b",
  ).token;
  store.approve(admin, "seller-a", "approved");
  store.approve(admin, "seller-b", "approved");
  const guest = store.createSession().token;
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, admin, a, b, guest, handler, dir, tick: (ms) => (now += ms) };
}
/** Deliberately simulated receiver; this suite proves API/persistence/auth, not ERPNext. */
function fake(company) {
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
const cart = {
  lines: [
    { offerId: "demo-offer-1", quantity: 2 },
    { offerId: "demo-offer-alternative", quantity: 2 },
  ],
  shippingMethod: "standaard",
};

test("server quote ignores no client monetary values, stale prices fail, same-key retry survives reopen", async (t) => {
  const h = harness(t);
  const quote = await h.store.quote(h.guest, cart);
  assert.equal(quote.totalCents, 8000);
  const request = { quoteId: quote.id, checkout, idempotencyKey: "checkout-1" };
  const order = h.store.place(h.guest, request);
  assert.equal(order.portions.length, 2);
  assert.equal(order.payment.status, "not_started");
  assert.equal(h.store.place(h.guest, request).id, order.id);
  assert.throws(
    () =>
      h.store.place(h.guest, {
        ...request,
        checkout: { ...checkout, city: "Other" },
      }),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.throws(
    () => h.store.place(h.guest, { ...request, idempotencyKey: "another-key" }),
    /QUOTE_ALREADY_USED/,
  );
  const second = new CommerceStore({ path: join(h.dir, "orders.sqlite") });
  assert.equal(second.order(h.guest, order.id).id, order.id);
  assert.equal(second.place(h.guest, request).id, order.id);
  second.close();
  const q2 = await h.store.quote(h.guest, cart);
  h.store.setPrice(h.a, "demo-offer-1", 2100, 1);
  assert.throws(
    () =>
      h.store.place(h.guest, {
        ...request,
        quoteId: q2.id,
        idempotencyKey: "stale",
      }),
    /QUOTE_CHANGED/,
  );
});
test("actual server sessions enforce guest, seller and administrator projections and immediate revocation", async (t) => {
  const h = harness(t);
  const q = await h.store.quote(h.guest, cart);
  const order = h.store.place(h.guest, {
    quoteId: q.id,
    checkout,
    idempotencyKey: "isolation",
  });
  const a = h.store.order(h.a, order.id),
    b = h.store.order(h.b, order.id);
  assert.equal(a.lines.length, 1);
  assert.equal(a.totalCents, 4000);
  assert.equal(b.lines[0].sellerId, "seller-b");
  assert.equal(a.checkout.email, undefined);
  assert.equal(a.payment.status, "not_started");
  assert.throws(
    () => h.store.order(h.store.createSession().token, order.id),
    /NOT_FOUND/,
  );
  assert.throws(() => h.store.admin(h.a), /FORBIDDEN/);
  assert.throws(
    () => h.store.setPrice(h.a, "demo-offer-alternative", 1, 1),
    /NOT_FOUND/,
  );
  await assert.rejects(
    h.store.executePortion(h.a, order.id, "seller-b", "reserve"),
    /FORBIDDEN/,
  );
  h.store.setUserEnabled(h.admin, "a", false);
  assert.throws(() => h.store.order(h.a, order.id), /AUTH_REQUIRED/);
});
test("HTTP denies CSRF, invalid JSON, oversized requests, forged identity and cross-site reads", async (t) => {
  const h = harness(t);
  const req = (path, body, headers = {}) =>
    h.handler(
      new Request("http://127.0.0.1:19090/api/commerce/" + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:19090",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  assert.equal(
    (await req("session", {}, { origin: "https://attacker.test" })).status,
    403,
  );
  assert.equal((await req("session", { data: "x".repeat(17000) })).status, 413);
  const session = await req("session", {});
  const cookie = session.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(JSON.stringify(await session.json()), /token/);
  assert.equal(
    (
      await req(
        "admin/sellers",
        { seller: "seller-a", state: "approved", role: "admin" },
        { cookie },
      )
    ).status,
    403,
  );
  const cross = await h.handler(
    new Request("http://127.0.0.1:19090/api/commerce/orders", {
      headers: { cookie, "sec-fetch-site": "cross-site" },
    }),
  );
  assert.equal(cross.status, 403);
  assert.equal(
    (await req("orders", { role: "admin", owner: "forged" })).status,
    401,
  );
});
test("state transitions, duplicate simulation and durable journal are separate from payment provider proof", async (t) => {
  const h = harness(t);
  const q = await h.store.quote(h.guest, cart);
  const o = h.store.place(h.guest, {
    quoteId: q.id,
    checkout,
    idempotencyKey: "cycle",
  });
  await assert.rejects(
    h.store.executePortion(h.a, o.id, "seller-a", "ship"),
    /INVALID_TRANSITION/,
  );
  assert.throws(
    () =>
      h.store.simulatePayment(h.admin, o.id, {
        eventId: "premature",
        reference: "FAKE",
        status: "succeeded",
      }),
    /RESERVATION_NOT_CONFIRMED/,
  );
  for (const seller of ["seller-a", "seller-b"])
    await h.store.executePortion(h.admin, o.id, seller, "reserve");
  const event = {
    eventId: "event-1",
    reference: "FAKE-charge",
    status: "succeeded",
  };
  h.store.simulatePayment(h.admin, o.id, event);
  h.store.simulatePayment(h.admin, o.id, event);
  assert.throws(
    () =>
      h.store.simulatePayment(h.admin, o.id, { ...event, status: "failed" }),
    /IDEMPOTENCY_CONFLICT/,
  );
  for (const action of [
    "pick",
    "pack",
    "ship",
    "invoice",
    "receipt",
    "return",
    "credit",
    "refund",
  ])
    for (const seller of ["seller-a", "seller-b"]) {
      const payload =
        action === "return" ? { quantity: 1, lineId: "TEST-C1" } : {};
      const out = await h.store.executePortion(
        h.admin,
        o.id,
        seller,
        action,
        payload,
      );
      assert.equal(out.command.state, "completed");
      assert.equal(
        (await h.store.executePortion(h.admin, o.id, seller, action, payload))
          .command.dispatches,
        1,
      );
    }
  assert.equal(
    h.store.admin(h.admin).audit.filter((x) => x.action === "simulator-payment")
      .length,
    1,
  );
});
test("unknown stock outcome cannot masquerade as reserved or paid; suspension/expiry prevent checkout", async (t) => {
  const uncertain = fake("TEST-A");
  uncertain.lookup = async () => {
    throw Error("network down");
  };
  const h = harness(t, { "TEST-A": uncertain, "TEST-B": fake("TEST-B") });
  const q = await h.store.quote(h.guest, cart);
  const order = h.store.place(h.guest, {
    quoteId: q.id,
    checkout,
    idempotencyKey: "uncertain",
  });
  const out = await h.store.executePortion(
    h.admin,
    order.id,
    "seller-a",
    "reserve",
  );
  assert.equal(out.command.state, "unknown");
  assert.equal(out.order.portions[0].state, "pending_reservation");
  const stale = await h.store.quote(h.guest, cart);
  h.tick(300001);
  assert.throws(
    () =>
      h.store.place(h.guest, {
        quoteId: stale.id,
        checkout,
        idempotencyKey: "expired",
      }),
    /QUOTE_EXPIRED/,
  );
  h.store.approve(h.admin, "seller-a", "suspended");
  await assert.rejects(h.store.quote(h.guest, cart), /OFFER_UNAVAILABLE/);
});
test("authentication rejects wrong password, rates attempts, rotates and revokes sessions", (t) => {
  const h = harness(t);
  for (let i = 0; i < 8; i++)
    assert.throws(
      () =>
        h.store.login(
          "admin@example.test",
          "incorrect",
          null,
          "attempt-client",
        ),
      /INVALID_LOGIN/,
    );
  assert.throws(
    () =>
      h.store.login(
        "admin@example.test",
        fixtures.users[0].password,
        null,
        "attempt-client",
      ),
    /LOGIN_RATE_LIMIT/,
  );
  h.tick(900001);
  const login = h.store.login(
    "admin@example.test",
    fixtures.users[0].password,
    h.guest,
    "attempt-client",
  );
  assert.equal(h.store.identity(h.guest), null);
  assert.equal(login.principal.role, "admin");
  h.store.logout(login.token);
  assert.equal(h.store.identity(login.token), null);
});

test("saved guest checkout orchestrates WMS holds and compensates another seller rejection", async (t) => {
  const good = fake("TEST-A"),
    bad = fake("TEST-B");
  bad.execute = async (e) => ({
    commandId: e.command_id,
    company: "TEST-B",
    status: "rejected",
    references: [],
    native: { rejected: true },
  });
  const h = harness(t, { "TEST-A": good, "TEST-B": bad });
  const quote = await h.store.quote(h.guest, cart);
  const body = { quoteId: quote.id, checkout, idempotencyKey: "compensated" };
  const request = () =>
    new Request("http://127.0.0.1:19090/api/commerce/orders", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:19090",
        "content-type": "application/json",
        cookie: "borvat-test=" + h.guest,
      },
      body: JSON.stringify(body),
    });
  const first = await h.handler(request());
  assert.equal(first.status, 201);
  const order = await first.json();
  assert.equal(
    order.portions.find((p) => p.sellerId === "seller-a").state,
    "cancelled",
  );
  assert.equal(
    order.portions.find((p) => p.sellerId === "seller-b").state,
    "reservation_rejected",
  );
  assert.equal((await (await h.handler(request())).json()).id, order.id);
  assert.throws(
    () =>
      h.store.simulatePayment(h.admin, order.id, {
        eventId: "no-charge",
        reference: "FAKE",
        status: "succeeded",
      }),
    /RESERVATION_NOT_CONFIRMED/,
  );
  assert.equal(
    h.store.db
      .prepare(
        "SELECT count(*) n FROM channel_commands WHERE operation='cancel'",
      )
      .get().n,
    1,
  );
});

test("current seller approval is checked after remote I/O and journal completion remains recoverable", async (t) => {
  const receiver = fake("TEST-A"),
    original = receiver.execute;
  let h;
  receiver.execute = async (e) => {
    const result = await original(e);
    h.store.approve(h.admin, "seller-a", "suspended");
    return result;
  };
  h = harness(t, { "TEST-A": receiver, "TEST-B": fake("TEST-B") });
  const q = await h.store.quote(h.guest, {
    lines: [{ offerId: "demo-offer-1", quantity: 1 }],
  });
  const order = h.store.place(h.guest, {
    quoteId: q.id,
    checkout,
    idempotencyKey: "revocation",
  });
  await assert.rejects(
    h.store.executePortion(h.a, order.id, "seller-a", "reserve"),
    /FORBIDDEN/,
  );
  assert.equal(
    h.store.order(h.admin, order.id).portions[0].state,
    "pending_reservation",
  );
  const recovered = await h.store.executePortion(
    h.admin,
    order.id,
    "seller-a",
    "reserve",
  );
  assert.equal(recovered.command.state, "completed");
  assert.equal(recovered.command.dispatches, 1);
});

test("failed simulated payment releases all confirmed WMS holds once and never permits late success", async (t) => {
  const h = harness(t),
    q = await h.store.quote(h.guest, cart),
    order = h.store.place(h.guest, {
      quoteId: q.id,
      checkout,
      idempotencyKey: "fail-and-release",
    });
  await h.store.reserveOrder(h.guest, order.id);
  const body = {
    eventId: "failure-event",
    reference: "SIM-FAILURE",
    status: "failed",
  };
  const request = () =>
    new Request(
      "http://127.0.0.1:19090/api/commerce/orders/" +
        order.id +
        "/payment-simulator",
      {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:19090",
          "content-type": "application/json",
          cookie: "borvat-test=" + h.admin,
        },
        body: JSON.stringify(body),
      },
    );
  for (let i = 0; i < 2; i++) {
    const r = await h.handler(request());
    assert.equal(r.status, 200);
    const value = await r.json();
    assert.ok(value.cancellationRequested);
    assert.ok(value.portions.every((p) => p.state === "cancelled"));
  }
  assert.equal(
    h.store.db
      .prepare(
        "SELECT count(*) n FROM channel_commands WHERE operation='cancel'",
      )
      .get().n,
    2,
  );
  assert.throws(
    () =>
      h.store.simulatePayment(h.admin, order.id, {
        eventId: "late",
        reference: "SIM-LATE",
        status: "succeeded",
      }),
    /INVALID_PAYMENT_TRANSITION/,
  );
});

test("cancellation before dispatch creates no stock operation and an authenticated expiry sweep excludes pending money", async (t) => {
  const h = harness(t),
    q = await h.store.quote(h.guest, cart),
    order = h.store.place(h.guest, {
      quoteId: q.id,
      checkout,
      idempotencyKey: "before-dispatch",
    });
  await h.store.cancelUnpaid(h.guest, order.id);
  await h.store.reserveOrder(h.guest, order.id);
  assert.equal(
    h.store.db.prepare("SELECT count(*) n FROM channel_commands").get().n,
    0,
  );
  const ids = [];
  for (const key of ["expiry", "payment-unknown"]) {
    const q = await h.store.quote(h.guest, cart);
    const o = h.store.place(h.guest, {
      quoteId: q.id,
      checkout,
      idempotencyKey: key,
    });
    await h.store.reserveOrder(h.guest, o.id);
    ids.push(o.id);
  }
  h.store.simulatePayment(h.admin, ids[1], {
    eventId: "still-pending",
    reference: "SIM-PENDING",
    status: "pending",
  });
  h.tick(900001);
  await assert.rejects(h.store.expireUnpaid(h.a), /FORBIDDEN/);
  const sweep = await h.store.expireUnpaid(h.admin);
  assert.equal(sweep.results.length, 1);
  assert.equal(sweep.results[0].order, ids[0]);
  assert.ok(sweep.results[0].states.every((s) => s === "cancelled"));
  assert.ok(
    h.store
      .order(h.admin, ids[1])
      .portions.every((p) => p.state === "reserved"),
  );
  assert.equal((await h.store.expireUnpaid(h.admin)).results.length, 0);
});

test("inflight reserve versus guest cancellation compensates the native result before either can be paid", async (t) => {
  const receiver = fake("TEST-A"),
    execute = receiver.execute;
  let allow, started;
  const waiting = new Promise((r) => (allow = r)),
    hasStarted = new Promise((r) => (started = r));
  receiver.execute = async (e) => {
    if (e.operation === "reserve") {
      started();
      await waiting;
    }
    return execute(e);
  };
  const h = harness(t, { "TEST-A": receiver, "TEST-B": fake("TEST-B") });
  const q = await h.store.quote(h.guest, {
    lines: [{ offerId: "demo-offer-1", quantity: 1 }],
  });
  const order = h.store.place(h.guest, {
    quoteId: q.id,
    checkout,
    idempotencyKey: "cancel-race",
  });
  const reservation = h.store.reserveOrder(h.guest, order.id);
  await hasStarted;
  const cancel = await h.store.cancelUnpaid(h.guest, order.id);
  assert.equal(cancel.portions[0].state, "pending_reservation");
  assert.equal(cancel.cancellationRequested, true);
  allow();
  const resolved = await reservation;
  assert.equal(resolved.portions[0].state, "cancelled");
  assert.equal(resolved.payment.status, "not_started");
  assert.equal(
    h.store.db
      .prepare(
        "SELECT count(*) n FROM channel_commands WHERE operation='reserve'",
      )
      .get().n,
    1,
  );
  assert.equal(
    h.store.db
      .prepare(
        "SELECT count(*) n FROM channel_commands WHERE operation='cancel'",
      )
      .get().n,
    1,
  );
});

test("server checkout rejects malformed address fields independently of browser validation and normalizes safe retries", async (t) => {
  const h = harness(t),
    q = await h.store.quote(h.guest, cart),
    body = { quoteId: q.id, checkout, idempotencyKey: "address" };
  for (const bad of [
    { firstName: "<script>" },
    { houseNumber: "12 OR 1=1" },
    { phone: "invalid" },
    { postalCode: "0000 XX" },
    { street: "Line\nInjected" },
    { addition: "1234567" },
  ])
    assert.throws(
      () =>
        h.store.place(h.guest, { ...body, checkout: { ...checkout, ...bad } }),
      /INVALID_ADDRESS/,
    );
  assert.equal(h.store.list(h.guest).length, 0);
  const saved = h.store.place(h.guest, {
    ...body,
    checkout: { ...checkout, firstName: " Test ", email: "BUYER@EXAMPLE.TEST" },
  });
  assert.equal(saved.checkout.firstName, "Test");
  assert.equal(saved.checkout.email, "buyer@example.test");
  assert.equal(h.store.place(h.guest, body).id, saved.id);
});
