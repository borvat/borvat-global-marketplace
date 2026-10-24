/** Actual fresh ERPNext HTTP acceptance. Contains no fake stock/financial receiver. */
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { CommerceStore } from "../../packages/commerce-server/store.mjs";
import { createCommerceHandler } from "../../packages/commerce-server/http.mjs";
import { nativeReceiver } from "../../packages/commerce-server/native-receiver.mjs";
import { LoyaltyAuthority } from "../../packages/loyalty-authority/journal.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const config = JSON.parse(Buffer.concat(chunks));
const receivers = Object.fromEntries(
  Object.entries(config.bindings).map(([company, binding]) => [
    company,
    nativeReceiver(binding),
  ]),
);
if (process.argv.includes("--lost-response")) {
  const receiver = receivers["TEST-A"],
    execute = receiver.execute;
  receiver.execute = async (envelope) => {
    await execute(envelope);
    process.kill(process.pid, "SIGKILL");
  };
  const store = new CommerceStore({ path: config.path, receivers });
  await store.executePortion(config.admin, config.order, "seller-a", "reserve");
  throw Error("Fault injection did not kill child");
}
const dir = mkdtempSync(join(tmpdir(), "borvat-native-"));
writeFileSync(join(dir, ".borvat-synthetic-only"), "");
const path = join(dir, "orders.sqlite");
const loyaltyScope = {
  program: "borvat-shared-native-test",
  customer: "explicit-test-customer-1",
};
const loyalty = new LoyaltyAuthority({
  path: join(dir, "loyalty.sqlite"),
  authorize: (principal, program, customer) =>
    principal === "trusted-native-worker" &&
    program === loyaltyScope.program &&
    customer === loyaltyScope.customer,
  verify: async (source) => {
    if (
      !receivers[source.company] ||
      !["invoice", "credit"].includes(source.kind) ||
      source.customer !== loyaltyScope.customer
    )
      throw Error("No native discount binding / customer scope");
    const result = await receivers[source.company].document({
      invoice: source.invoice,
      line: source.line,
      creditNote: source.creditNote,
    });
    if (result.customer !== "TEST-CUSTOMER")
      throw Error("Explicit shared synthetic customer binding mismatch");
    return result;
  },
});
let clock = Date.now(),
  store = new CommerceStore({ path, receivers, now: () => clock });
const password = "synthetic-only-" + crypto.randomUUID();
store.bootstrap({
  sellers: [
    { id: "seller-a", company: "TEST-A", name: "Synthetic seller A" },
    { id: "seller-b", company: "TEST-B", name: "Synthetic seller B" },
  ],
  users: [
    { id: "admin", email: "admin@example.test", password, role: "admin" },
    {
      id: "seller-a-user",
      email: "seller-a@example.test",
      password,
      role: "seller",
      seller: "seller-a",
    },
    {
      id: "seller-b-user",
      email: "seller-b@example.test",
      password,
      role: "seller",
      seller: "seller-b",
    },
  ],
  offers: [
    {
      id: "native-a",
      product: "native-product",
      sku: "TEST-C1",
      seller: "seller-a",
      price: 2000,
      pack: 1,
      info: { title: "BORVAT native test C1", variant: "one unit" },
    },
    {
      id: "native-b",
      product: "native-product",
      sku: "TEST-C1",
      seller: "seller-b",
      price: 2000,
      pack: 1,
      info: { title: "BORVAT native test C1", variant: "one unit" },
    },
    {
      id: "last-unit",
      product: "native-last-unit",
      sku: "BORVAT-LAST",
      seller: "seller-a",
      price: 2000,
      pack: 1,
      info: { title: "Native last unit", variant: "one unit" },
    },
  ],
});
let handler, origin;
const server = createServer(async (req, res) => {
  try {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = Buffer.concat(parts);
    const r = await handler(
      new Request(origin + req.url, {
        method: req.method,
        headers: req.headers,
        ...(body.length ? { body } : {}),
      }),
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  } catch {
    res.writeHead(500);
    res.end("harness error");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
origin = "http://127.0.0.1:" + server.address().port;
handler = createCommerceHandler({ store, origin });
const root = new URL("../../", import.meta.url).pathname;
const sourceFiles = [
  "packages/commerce-server/store.mjs",
  "packages/commerce-server/http.mjs",
  "packages/commerce-server/native-receiver.mjs",
  "packages/loyalty-authority/journal.mjs",
  "integrations/native-test/borvat_native_test/api.py",
  "scripts/commerce-integration/native-cycle.mjs",
  "scripts/commerce-integration/native-installer.py",
];
const rows = [],
  summary = {
    mode: "actual-local-native; payment simulator only; no carrier",
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceFiles: Object.fromEntries(
      sourceFiles.map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(join(root, file)))
          .digest("hex"),
      ]),
    ),
    cases: rows,
  };
const save = () =>
  writeFileSync(config.output, JSON.stringify(summary, null, 2) + "\n");
const call = async (path, body, cookie) => {
  const response = await fetch(origin + "/api/commerce/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  return {
    status: response.status,
    value,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
};
const ok = async (...args) => {
  const r = await call(...args);
  assert.ok(r.status < 300, JSON.stringify(r.value));
  return r;
};
const step = async (name, fn) => {
  try {
    const evidence = await fn();
    rows.push({ name, status: "PASS", evidence });
    save();
  } catch (error) {
    rows.push({ name, status: "FAIL", error: error.message });
    save();
    throw error;
  }
};
const checkout = {
  firstName: "Synthetic",
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
let admin, a, b, guest, order;
try {
  await step("server-auth-seller-approval-native-quote-order", async () => {
    admin = (await ok("login", { email: "admin@example.test", password }))
      .cookie;
    a = (await ok("login", { email: "seller-a@example.test", password }))
      .cookie;
    b = (await ok("login", { email: "seller-b@example.test", password }))
      .cookie;
    guest = (await ok("session", {})).cookie;
    for (const seller of ["seller-a", "seller-b"])
      await ok("admin/sellers", { seller, state: "approved" }, admin);
    const q = (
      await ok(
        "quote",
        {
          lines: [
            { offerId: "native-a", quantity: 2 },
            { offerId: "native-b", quantity: 2 },
          ],
        },
        guest,
      )
    ).value;
    assert.equal(q.totalCents, 8000);
    order = (
      await ok(
        "orders",
        { quoteId: q.id, checkout, idempotencyKey: "native-multi-seller" },
        guest,
      )
    ).value;
    const replay = (
      await ok(
        "orders",
        { quoteId: q.id, checkout, idempotencyKey: "native-multi-seller" },
        guest,
      )
    ).value;
    assert.equal(replay.id, order.id);
    return { order: order.id, totalCents: order.totalCents };
  });
  await step("real-native-reservation-and-seller-isolation", async () => {
    for (const sellerId of ["seller-a", "seller-b"]) {
      const r = (
        await ok(
          "orders/" + order.id + "/action",
          { sellerId, action: "reserve" },
          admin,
        )
      ).value;
      assert.equal(r.command.state, "completed");
      order = r.order;
    }
    assert.equal(
      (await ok("orders/" + order.id, undefined, a)).value.totalCents,
      4000,
    );
    assert.equal(
      (await ok("orders/" + order.id, undefined, b)).value.lines.length,
      1,
    );
    assert.equal(
      (
        await call(
          "orders/" + order.id + "/action",
          { sellerId: "seller-b", action: "pick" },
          a,
        )
      ).status,
      403,
    );
    const other = (await ok("session", {})).cookie;
    assert.equal(
      (await call("orders/" + order.id, undefined, other)).status,
      404,
    );
    return { portions: order.portions };
  });
  await step(
    "simulated-payment-separate-native-pick-pack-delivery-invoice",
    async () => {
      const event = {
        eventId: "native-payment-simulator-1",
        reference: "SIMULATED-CHARGE-1",
        status: "succeeded",
      };
      await ok("orders/" + order.id + "/payment-simulator", event, admin);
      await ok("orders/" + order.id + "/payment-simulator", event, admin);
      for (const action of ["pick", "pack", "ship", "invoice", "receipt"])
        for (const sellerId of ["seller-a", "seller-b"]) {
          const r = (
            await ok(
              "orders/" + order.id + "/action",
              { sellerId, action },
              admin,
            )
          ).value;
          assert.equal(r.command.state, "completed", JSON.stringify(r.command));
          order = r.order;
          const again = (
            await ok(
              "orders/" + order.id + "/action",
              { sellerId, action },
              admin,
            )
          ).value;
          assert.equal(again.command.dispatches, 1);
        }
      for (const p of order.portions)
        assert.equal(p.references.invoice.gross_minor, 4000);
      return { payment: "SIMULATOR, no provider", portions: order.portions };
    },
  );
  await step(
    "single-loyalty-authority-native-invoices-across-two-channel-replays",
    async () => {
      for (const p of order.portions) {
        const source = {
          ...loyaltyScope,
          company: p.company,
          invoice: p.references.invoice.invoice,
          line: "TEST-C1",
          channel: "marketplace",
        };
        const first = await loyalty.earn("trusted-native-worker", source);
        const again = await loyalty.earn("trusted-native-worker", {
          ...source,
          channel: "accounting",
        });
        assert.deepEqual(again, first);
      }
      const balance = loyalty.balance(
        "trusted-native-worker",
        loyaltyScope.program,
        loyaltyScope.customer,
      );
      assert.equal(balance.available, 80);
      return balance;
    },
  );
  await step("native-partial-return-credit-invoice-replay", async () => {
    for (const sellerId of ["seller-a", "seller-b"])
      for (const action of ["return", "credit", "refund"]) {
        const payload =
          action === "return" ? { quantity: 1, lineId: "TEST-C1" } : {};
        const r = (
          await ok(
            "orders/" + order.id + "/action",
            { sellerId, action, payload },
            admin,
          )
        ).value;
        assert.equal(r.command.state, "completed", JSON.stringify(r.command));
        order = r.order;
      }
    for (const p of order.portions)
      assert.equal(p.references.credit.gross_minor, 2000);
    return {
      portions: order.portions,
      refund: "Native Payment Entry only; provider unavailable",
    };
  });
  await step(
    "single-loyalty-authority-native-partial-credits-once",
    async () => {
      for (const p of order.portions) {
        const source = {
          ...loyaltyScope,
          company: p.company,
          invoice: p.references.invoice.invoice,
          line: "TEST-C1",
          creditNote: p.references.credit.credit_note,
          creditLine: "TEST-C1",
        };
        await loyalty.credit("trusted-native-worker", source);
        await loyalty.credit("trusted-native-worker", source);
      }
      const balance = loyalty.balance(
        "trusted-native-worker",
        loyaltyScope.program,
        loyaltyScope.customer,
      );
      assert.equal(balance.available, 40);
      return balance;
    },
  );
  await step(
    "native-documents-stock-GL-receipt-and-partial-refund-reconcile",
    async () => {
      const reports = [];
      for (const p of order.portions) {
        const report = await receivers[p.company].inspect(
          p.references.reserve.sales_order,
        );
        assert.equal(report.invoices.filter((x) => !x.is_return).length, 1);
        assert.equal(report.invoices.filter((x) => x.is_return).length, 1);
        assert.equal(report.payments.length, 2);
        assert.equal(
          report.payments.find((x) => x.payment_type === "Receive").paid_amount,
          40,
        );
        assert.equal(
          report.payments.find((x) => x.payment_type === "Pay").paid_amount,
          20,
        );
        assert.ok(report.invoices.every((x) => x.outstanding_amount === 0));
        assert.equal(
          Math.round(
            report.general_ledger.reduce(
              (sum, x) => sum + x.debit - x.credit,
              0,
            ) * 100,
          ),
          0,
        );
        assert.equal(
          report.stock_ledger.reduce((sum, x) => sum + x.actual_qty, 0),
          -1,
        );
        assert.ok(
          report.stock_ledger.some(
            (x) =>
              x.actual_qty === 1 &&
              x.warehouse.includes("BORVAT Return Quarantine"),
          ),
        );
        reports.push(report);
      }
      return reports;
    },
  );
  await step(
    "failed-payment-releases-native-hold-once-with-no-invoice-or-points",
    async () => {
      const before = await receivers["TEST-A"].availability();
      const q = (
        await ok(
          "quote",
          { lines: [{ offerId: "native-a", quantity: 3 }] },
          guest,
        )
      ).value;
      const saved = (
        await ok(
          "orders",
          { quoteId: q.id, checkout, idempotencyKey: "native-failed-payment" },
          guest,
        )
      ).value;
      const event = {
        eventId: "native-failure-1",
        reference: "SIMULATED-FAILED",
        status: "failed",
      };
      let failed;
      for (let i = 0; i < 2; i++)
        failed = (
          await ok("orders/" + saved.id + "/payment-simulator", event, admin)
        ).value;
      assert.equal(failed.portions[0].state, "cancelled");
      const native = await receivers["TEST-A"].inspect(
        failed.portions[0].references.reserve.sales_order,
      );
      assert.equal(native.reservations.length, 0);
      assert.equal(native.invoices.length, 0);
      const after = await receivers["TEST-A"].availability();
      assert.equal(after["TEST-C1"], before["TEST-C1"]);
      assert.equal(
        loyalty.balance(
          "trusted-native-worker",
          loyaltyScope.program,
          loyaltyScope.customer,
        ).available,
        40,
      );
      return {
        order: saved.id,
        payment: "SIMULATOR FAILED, no provider",
        native,
        availableBefore: before["TEST-C1"],
        availableAfter: after["TEST-C1"],
        points: 40,
      };
    },
  );
  await step(
    "expiry-sweep-releases-real-native-hold-using-controlled-channel-clock",
    async () => {
      const q = (
        await ok(
          "quote",
          { lines: [{ offerId: "native-a", quantity: 3 }] },
          guest,
        )
      ).value;
      const saved = (
        await ok(
          "orders",
          { quoteId: q.id, checkout, idempotencyKey: "native-expiry" },
          guest,
        )
      ).value;
      clock = Date.now() + 900001;
      const sweep = (await ok("admin/expire-reservations", {}, admin)).value;
      const expired = (await ok("orders/" + saved.id, undefined, guest)).value;
      assert.equal(expired.portions[0].state, "cancelled");
      const native = await receivers["TEST-A"].inspect(
        expired.portions[0].references.reserve.sales_order,
      );
      assert.equal(native.reservations.length, 0);
      const again = (await ok("admin/expire-reservations", {}, admin)).value;
      assert.equal(again.results.length, 0);
      clock = Date.now();
      return {
        order: saved.id,
        sweep,
        native,
        clock:
          "explicit channel clock advanced15 minutes; actual native cancellation, no hosted scheduler",
      };
    },
  );
  await step("distinct-buyer-orders-compete-for-last-native-unit", async () => {
    const orders = [];
    for (let i = 0; i < 2; i++) {
      const cookie = (await ok("session", {})).cookie;
      const quote = (
        await ok(
          "quote",
          { lines: [{ offerId: "last-unit", quantity: 1 }] },
          cookie,
        )
      ).value;
      orders.push(
        store.place(cookie.slice(cookie.indexOf("=") + 1), {
          quoteId: quote.id,
          checkout,
          idempotencyKey: "last-unit-" + i,
        }),
      );
    }
    const results = await Promise.all(
      orders.map((o) =>
        ok(
          "orders/" + o.id + "/action",
          { sellerId: "seller-a", action: "reserve" },
          admin,
        ),
      ),
    );
    assert.equal(
      results.filter((r) => r.value.command.state === "completed").length,
      1,
    );
    assert.equal(
      results.filter((r) => r.value.command.state === "rejected").length,
      1,
    );
    return results.map((r) => ({
      order: r.value.order.id,
      command: r.value.command.state,
      native: r.value.command.result?.native,
    }));
  });
  await step(
    "SIGKILL-after-real-remote-commit-and-local-service-restart",
    async () => {
      const quote = (
        await ok(
          "quote",
          { lines: [{ offerId: "native-a", quantity: 1 }] },
          guest,
        )
      ).value;
      const pending = store.place(guest.slice(guest.indexOf("=") + 1), {
        quoteId: quote.id,
        checkout,
        idempotencyKey: "lost-response",
      });
      const adminToken = admin.slice(admin.indexOf("=") + 1);
      const child = spawn(
        process.execPath,
        [new URL(import.meta.url).pathname, "--lost-response"],
        { stdio: ["pipe", "ignore", "ignore"] },
      );
      child.stdin.end(
        JSON.stringify({
          bindings: config.bindings,
          path,
          order: pending.id,
          admin: adminToken,
        }),
      );
      const exit = await new Promise((resolve) =>
        child.on("exit", (code, signal) => resolve({ code, signal })),
      );
      assert.equal(exit.signal, "SIGKILL");
      store.close();
      await new Promise((resolve) => setTimeout(resolve, 31000));
      clock = Date.now();
      store = new CommerceStore({ path, receivers, now: () => clock });
      handler = createCommerceHandler({ store, origin });
      const recovered = (
        await ok(
          "orders/" + pending.id + "/action",
          { sellerId: "seller-a", action: "reserve" },
          admin,
        )
      ).value;
      assert.equal(recovered.command.state, "completed");
      assert.equal(recovered.command.dispatches, 1);
      const native = await receivers["TEST-A"].inspect(
        recovered.command.result.native.sales_order,
      );
      assert.equal(native.reservations.length, 1);
      return {
        order: pending.id,
        child: exit,
        dispatches: recovered.command.dispatches,
        native: recovered.command.result.native,
        actualNativeReservationCount: native.reservations.length,
        realLeaseWaitMilliseconds: 31000,
      };
    },
  );
  summary.status = "PASS";
  save();
  console.log(JSON.stringify({ status: summary.status, cases: rows.length }));
} catch (error) {
  summary.status = "FAIL";
  save();
  console.log(JSON.stringify({ status: "FAIL", error: error.message }));
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
  store.close();
  loyalty.close();
  rmSync(dir, { recursive: true, force: true });
}
