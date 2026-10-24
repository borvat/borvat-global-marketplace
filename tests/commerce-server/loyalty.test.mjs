import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoyaltyAuthority } from "../../packages/loyalty-authority/journal.mjs";

// Actual SQLite transactions; document verifier is explicitly a fake in this suite.
const scope = { program: "shared-test", customer: "customer-1" },
  source = {
    ...scope,
    company: "TEST-A",
    invoice: "INV-1",
    line: "LINE-1",
    channel: "marketplace",
  };
function harness(t, { net = 10000, credits = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "borvat-loyalty-"));
  let now = Date.now();
  const config = {
    path: join(dir, "loyalty.sqlite"),
    now: () => now,
    authorize: (actor, p, c) =>
      actor === "worker" && p === scope.program && c === scope.customer,
    verify: async (d) =>
      d.kind === "invoice"
        ? {
            submitted: true,
            paid: true,
            fulfilled: true,
            currency: "EUR",
            eligibleNetCents: net,
          }
        : d.kind === "credit"
          ? { submitted: true, eligibleCreditCents: credits[d.creditNote] }
          : { confirmed: true, points: 20, quote: "quote-1" },
  };
  const journal = new LoyaltyAuthority(config);
  t.after(() => {
    journal.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { journal, config, tick: (ms) => (now += ms) };
}
test("one native invoice source earns once across Marketplace/invoice channels and actual reopen", async (t) => {
  const { journal, config } = harness(t);
  const first = await journal.earn("worker", source),
    second = await journal.earn("worker", { ...source, channel: "accounting" });
  assert.deepEqual(first, second);
  const reopened = new LoyaltyAuthority(config);
  assert.equal(
    reopened.balance("worker", scope.program, scope.customer).available,
    100,
  );
  reopened.close();
  await assert.rejects(journal.earn("other", source), /scope denied/);
  assert.throws(
    () => journal.balance("worker", scope.program, "other-customer"),
    /scope denied/,
  );
});
test("two actual connections cannot spend the last points twice; held funds need native discount proof", async (t) => {
  const { journal, config } = harness(t, { net: 2000 });
  await journal.earn("worker", source);
  const second = new LoyaltyAuthority(config);
  t.after(() => second.close());
  const version = journal.balance(
    "worker",
    scope.program,
    scope.customer,
  ).version;
  const hold = journal.hold("worker", {
    ...scope,
    key: "hold-a",
    quote: "quote-1",
    points: 20,
    expectedVersion: version,
  });
  assert.throws(
    () =>
      second.hold("worker", {
        ...scope,
        key: "hold-b",
        quote: "quote-2",
        points: 20,
        expectedVersion: version,
      }),
    /version conflict/,
  );
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).available,
    0,
  );
  await journal.commit("worker", {
    ...scope,
    hold: hold.hold,
    discountRef: "FAKE-DISCOUNT",
  });
  await journal.commit("worker", {
    ...scope,
    hold: hold.hold,
    discountRef: "FAKE-DISCOUNT",
  });
  assert.equal(
    journal
      .balance("worker", scope.program, scope.customer)
      .movements.filter((x) => x.kind === "redeem").length,
    1,
  );
  assert.throws(
    () => journal.release("worker", { ...scope, hold: hold.hold }),
    /committed/,
  );
});
test("cumulative credits avoid partial rounding gains; expiry and repeated credits cannot double reverse", async (t) => {
  const { journal, tick } = harness(t, {
    net: 299,
    credits: { C1: 100, C2: 100, C3: 99 },
  });
  await journal.earn("worker", source);
  for (const creditNote of ["C1", "C2", "C3", "C3"])
    await journal.credit("worker", {
      ...source,
      creditNote,
      creditLine: "line",
    });
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).ledgerPoints,
    0,
  );
  tick(366 * 86400_000);
  assert.equal(journal.expire("worker", scope).lots, 0);
  assert.equal(
    journal
      .balance("worker", scope.program, scope.customer)
      .movements.reduce((n, x) => n + x.points, 0),
    0,
  );
});
test("return of spent earnings records explicit debt; later earnings clear debt once without expiry reviving it", async (t) => {
  const { journal, tick } = harness(t, { net: 2000, credits: { C1: 2000 } });
  await journal.earn("worker", source);
  const hold = journal.hold("worker", {
    ...scope,
    key: "spent",
    quote: "quote-1",
    points: 20,
    expectedVersion: 1,
  });
  await journal.commit("worker", {
    ...scope,
    hold: hold.hold,
    discountRef: "FAKE",
  });
  await journal.credit("worker", {
    ...source,
    creditNote: "C1",
    creditLine: "line",
  });
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).debt,
    20,
  );
  await journal.earn("worker", { ...source, invoice: "INV-2" });
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).ledgerPoints,
    0,
  );
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).available,
    0,
  );
  tick(366 * 86400_000);
  journal.expire("worker", scope);
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).debt,
    0,
  );
});
test("expired redemption releases and expires unspent lots only once; expired earn is not reversed into debt", async (t) => {
  const { journal, tick } = harness(t, { net: 2000, credits: { C1: 2000 } });
  await journal.earn("worker", source);
  journal.hold("worker", {
    ...scope,
    key: "pending",
    quote: "quote-1",
    points: 20,
    expectedVersion: 1,
  });
  tick(366 * 86400_000);
  assert.equal(journal.expire("worker", scope).lots, 1);
  assert.equal(journal.expire("worker", scope).lots, 0);
  await journal.credit("worker", {
    ...source,
    creditNote: "C1",
    creditLine: "line",
  });
  assert.equal(
    journal.balance("worker", scope.program, scope.customer).debt,
    0,
  );
});
