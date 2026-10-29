import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentHarness } from "./_payments-support.mjs";

// Everything here runs against the SIMULATED provider adapter. These tests prove the order
// core, webhook ingestion and reconciler behave correctly; they do not prove any real PSP.

test("payment intent needs confirmed reservations, is idempotent, and is closed to sellers", async (t) => {
  const h = paymentHarness(t);
  const quote = await h.store.quote(h.guest, (await import("./_payments-support.mjs")).cart);
  const { checkout } = await import("./_payments-support.mjs");
  const placed = h.store.place(h.guest, { quoteId: quote.id, checkout, idempotencyKey: "k1" });
  await assert.rejects(
    h.store.startPayment(h.guest, placed.id, h.provider),
    /RESERVATION_NOT_CONFIRMED/,
  );
  assert.equal(h.store.order(h.guest, placed.id).payment.status, "not_started");
  await h.store.reserveOrder(h.guest, placed.id);
  await assert.rejects(h.store.startPayment(h.seller, placed.id, h.provider), /FORBIDDEN/);
  const first = await h.store.startPayment(h.guest, placed.id, h.provider);
  assert.equal(first.payment.status, "pending");
  assert.match(first.payment.reference, /^sim_/);
  assert.equal(first.payment.mode, "provider:simulated");
  const again = await h.store.startPayment(h.guest, placed.id, h.provider);
  assert.equal(again.payment.reference, first.payment.reference);
  assert.equal(h.count("SELECT count(*) FROM payment_events WHERE order_id=?", placed.id), 1);
});

test("a provider outage while creating the intent leaves the order untouched and retryable", async (t) => {
  const h = paymentHarness(t);
  const order = await h.reservedOrder();
  h.provider.setOutage(true);
  await assert.rejects(
    h.store.startPayment(h.guest, order.id, h.provider),
    /PAYMENT_PROVIDER_UNAVAILABLE/,
  );
  assert.equal(h.store.order(h.guest, order.id).payment.status, "not_started");
  h.provider.setOutage(false);
  const ok = await h.store.startPayment(h.guest, order.id, h.provider);
  assert.equal(ok.payment.status, "pending");
});

test("signed success webhook pays the order; replays are idempotent; a changed body under the same event id conflicts", async (t) => {
  const h = paymentHarness(t);
  const o = await h.pendingOrder();
  const ok = h.provider.signedWebhook(h.event(o, "succeeded"));
  assert.deepEqual(h.store.applyProviderWebhook(h.provider, ok.rawBody, ok.headers), {
    outcome: "applied",
  });
  assert.equal(h.store.order(h.guest, o.id).payment.status, "succeeded");
  assert.deepEqual(h.store.applyProviderWebhook(h.provider, ok.rawBody, ok.headers), {
    outcome: "duplicate",
  });
  const conflicting = h.provider.signedWebhook(
    h.event(o, "failed", { eventId: h.event(o, "succeeded").eventId }),
  );
  assert.throws(
    () => h.store.applyProviderWebhook(h.provider, conflicting.rawBody, conflicting.headers),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal(h.store.order(h.guest, o.id).payment.status, "succeeded");
});

test("forged, tampered, stale, unsigned and malformed webhooks change nothing", async (t) => {
  const h = paymentHarness(t);
  const o = await h.pendingOrder();
  const before = h.count("SELECT count(*) FROM payment_events");
  const good = h.provider.signedWebhook(h.event(o, "succeeded"));
  const tampered = good.rawBody.replace('"succeeded"', '"succeede2"');
  const stale = h.provider.signedWebhook(h.event(o, "succeeded"), Date.now() - 10 * 60 * 1000);
  const cases = [
    [tampered, good.headers, /WEBHOOK_SIGNATURE_INVALID/],
    [good.rawBody, {}, /WEBHOOK_SIGNATURE_INVALID/],
    [good.rawBody, { ...good.headers, "x-borvat-signature": "0".repeat(64) }, /WEBHOOK_SIGNATURE_INVALID/],
    [stale.rawBody, stale.headers, /TIMESTAMP_OUT_OF_TOLERANCE/],
  ];
  for (const [raw, headers, pattern] of cases)
    assert.throws(() => h.store.applyProviderWebhook(h.provider, raw, headers), pattern);
  const junk = h.provider.signedWebhook({ eventId: "x", status: "succeeded" });
  assert.throws(
    () => h.store.applyProviderWebhook(h.provider, junk.rawBody, junk.headers),
    /WEBHOOK_PAYLOAD_INVALID/,
  );
  assert.equal(h.store.order(h.guest, o.id).payment.status, "pending");
  assert.equal(h.count("SELECT count(*) FROM payment_events"), before);
  assert.equal(h.count("SELECT count(*) FROM payment_exceptions"), 0);
});

test("wrong amount, wrong reference and unknown order become operator exceptions, never silent state changes", async (t) => {
  const h = paymentHarness(t);
  const o = await h.pendingOrder();
  const send = (event) => {
    const w = h.provider.signedWebhook(event);
    return h.store.applyProviderWebhook(h.provider, w.rawBody, w.headers);
  };
  assert.deepEqual(send(h.event(o, "succeeded", { amountCents: o.total - 1, eventId: "e-amount" })), {
    outcome: "exception",
    kind: "PAYMENT_AMOUNT_MISMATCH",
  });
  assert.deepEqual(send(h.event(o, "succeeded", { reference: "sim_other", eventId: "e-ref" })), {
    outcome: "exception",
    kind: "PAYMENT_REFERENCE_MISMATCH",
  });
  assert.deepEqual(
    send({ ...h.event(o, "succeeded", { eventId: "e-ghost" }), orderId: "no-such-order" }),
    { outcome: "exception", kind: "UNKNOWN_ORDER" },
  );
  assert.equal(h.store.order(h.guest, o.id).payment.status, "pending");
  assert.deepEqual(send(h.event(o, "succeeded", { amountCents: o.total - 1, eventId: "e-amount" })), {
    outcome: "duplicate",
  });
  const kinds = h.store.admin(h.admin).paymentExceptions.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["PAYMENT_AMOUNT_MISMATCH", "PAYMENT_REFERENCE_MISMATCH", "UNKNOWN_ORDER"]);
  assert.throws(() => h.store.admin(h.seller), /FORBIDDEN/);
});

test("late success after a failed payment is recorded for refund review and does not resurrect the order", async (t) => {
  const h = paymentHarness(t);
  const o = await h.pendingOrder();
  const send = (event) => {
    const w = h.provider.signedWebhook(event);
    return h.store.applyProviderWebhook(h.provider, w.rawBody, w.headers);
  };
  assert.deepEqual(send(h.event(o, "failed")), { outcome: "applied" });
  assert.deepEqual(send(h.event(o, "succeeded")), {
    outcome: "exception",
    kind: "INVALID_PAYMENT_TRANSITION",
  });
  assert.equal(h.store.order(h.guest, o.id).payment.status, "failed");
  const [row] = h.store.admin(h.admin).paymentExceptions;
  assert.equal(row.status, "succeeded");
  assert.equal(row.amount, o.total);
  assert.equal(row.resolved, 0);
});

test("reconciler converges a pending payment the webhook never reported, and is idempotent", async (t) => {
  const h = paymentHarness(t);
  const o = await h.pendingOrder();
  const early = await h.store.reconcilePayments(h.admin, h.provider);
  assert.equal(early.checked, 0, "fresh orders are not touched before the grace period");
  h.tick(20 * 60 * 1000);
  h.provider.settle(o.reference, "succeeded");
  const run = await h.store.reconcilePayments(h.admin, h.provider);
  assert.deepEqual(run.applied, [{ orderId: o.id, status: "succeeded" }]);
  assert.equal(h.store.order(h.guest, o.id).payment.status, "succeeded");
  const second = await h.store.reconcilePayments(h.admin, h.provider);
  assert.equal(second.checked, 0);
  assert.deepEqual(second.mismatches, []);
});

test("reconciler reports failed payments for release, survives outages, and never auto-changes paid orders", async (t) => {
  const h = paymentHarness(t);
  const failing = await h.pendingOrder();
  const paying = await h.pendingOrder();
  h.tick(20 * 60 * 1000);
  h.provider.setOutage(true);
  const outage = await h.store.reconcilePayments(h.admin, h.provider);
  assert.equal(outage.errors.length, 2);
  assert.equal(outage.applied.length, 0);
  assert.equal(h.store.order(h.guest, failing.id).payment.status, "pending");
  h.provider.setOutage(false);
  h.provider.settle(failing.reference, "failed");
  h.provider.settle(paying.reference, "succeeded");
  const run = await h.store.reconcilePayments(h.admin, h.provider);
  assert.deepEqual(run.release, [failing.id]);
  assert.equal(h.store.order(h.guest, paying.id).payment.status, "succeeded");
  // The provider later disagrees about an order we consider paid: surfaced, not changed.
  h.provider.settle(paying.reference, "failed");
  const drift = await h.store.reconcilePayments(h.admin, h.provider);
  assert.deepEqual(drift.mismatches, [
    { orderId: paying.id, kind: "PAID_LOCALLY_NOT_AT_PROVIDER" },
  ]);
  assert.equal(h.store.order(h.guest, paying.id).payment.status, "succeeded");
  await assert.rejects(h.store.reconcilePayments(h.guest, h.provider), /FORBIDDEN/);
});

test("HTTP: webhook authenticates by signature only; pay and reconcile routes keep session and origin rules", async (t) => {
  const h = paymentHarness(t);
  const order = await h.reservedOrder();
  const pay = await h.handler(h.request(`/api/commerce/orders/${order.id}/pay`, { cookie: h.guest, body: {} }));
  assert.equal(pay.status, 200);
  const reference = (await pay.json()).payment.reference;
  const o = { id: order.id, total: order.totalCents, reference };

  const signed = h.provider.signedWebhook(h.event(o, "succeeded"));
  // No cookie, no matching Origin: the signature is the only credential.
  const hook = (raw, headers) =>
    h.handler(new Request("http://127.0.0.1:19090/api/commerce/payments/webhook", {
      method: "POST",
      body: raw,
      headers: { "content-type": "application/json", ...headers },
    }));
  const bad = await hook(signed.rawBody, { ...signed.headers, "x-borvat-signature": "f".repeat(64) });
  assert.equal(bad.status, 401);
  assert.equal(h.store.order(h.guest, order.id).payment.status, "pending");
  const good = await hook(signed.rawBody, signed.headers);
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), { outcome: "applied" });
  assert.equal(h.store.order(h.guest, order.id).payment.status, "succeeded");
  const get = await h.handler(new Request("http://127.0.0.1:19090/api/commerce/payments/webhook"));
  assert.equal(get.status, 405);

  const noOrigin = await h.handler(new Request("http://127.0.0.1:19090/api/commerce/admin/reconcile-payments", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json", cookie: "borvat-test=" + h.admin },
  }));
  assert.equal(noOrigin.status, 403);
  const guestTry = await h.handler(h.request("/api/commerce/admin/reconcile-payments", { cookie: h.guest, body: {} }));
  assert.equal(guestTry.status, 403);
  const adminRun = await h.handler(h.request("/api/commerce/admin/reconcile-payments", { cookie: h.admin, body: {} }));
  assert.equal(adminRun.status, 200);
  assert.equal((await adminRun.json()).checked, 0);
});

test("HTTP: without a configured provider every payment route fails closed", async (t) => {
  const h = paymentHarness(t, { withProvider: false });
  const order = await h.reservedOrder();
  const routes = [
    [`/api/commerce/orders/${order.id}/pay`, h.guest],
    ["/api/commerce/admin/reconcile-payments", h.admin],
  ];
  for (const [path, cookie] of routes) {
    const res = await h.handler(h.request(path, { cookie, body: {} }));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "PAYMENT_PROVIDER_NOT_CONFIGURED" });
  }
  const hook = await h.handler(new Request("http://127.0.0.1:19090/api/commerce/payments/webhook", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(hook.status, 503);
  assert.equal(h.store.order(h.guest, order.id).payment.status, "not_started");
});
