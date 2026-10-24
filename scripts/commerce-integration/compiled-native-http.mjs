/** Real compiled TanStack/Nitro server + real native WMS API; no browser or fake provider. */
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { CommerceStore } from "../../packages/commerce-server/store.mjs";
const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const config = JSON.parse(Buffer.concat(input));
const root = new URL("../../", import.meta.url).pathname,
  dir = mkdtempSync(join(tmpdir(), "borvat-compiled-native-"));
writeFileSync(join(dir, ".borvat-synthetic-only"), "");
const bindingFile = join(dir, "native-bindings.json");
writeFileSync(bindingFile, JSON.stringify(config.bindings), { mode: 0o600 });
const password = "local-test-" + randomUUID(),
  store = new CommerceStore({ path: join(dir, "orders.sqlite") });
store.bootstrap({
  sellers: [
    { id: "seller-a", company: "TEST-A", name: "Synthetic A" },
    { id: "seller-b", company: "TEST-B", name: "Synthetic B" },
  ],
  users: [
    { id: "admin", email: "admin@example.test", password, role: "admin" },
    {
      id: "b",
      email: "b@example.test",
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
      info: { title: "Native test C1", variant: "One unit" },
    },
  ],
});
store.close();
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const origin = "http://127.0.0.1:" + port;
let child;
const app = join(root, "apps/marketplace/.output/server/index.mjs");
const report = {
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  compiledEntrySHA256: createHash("sha256")
    .update(readFileSync(app))
    .digest("hex"),
  scope:
    "actual compiled HTTP/SSR and native reservation; no rendered browser; no provider",
  cases: [],
};
const save = () =>
  writeFileSync(config.output, JSON.stringify(report, null, 2) + "\n");
const call = async (path, body, cookie) => {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return {
    status: r.status,
    value,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
};
const ok = async (...args) => {
  const r = await call(...args);
  assert.ok(r.status < 300, JSON.stringify(r.value));
  return r;
};
async function stop() {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("exit", r));
  }
  child = undefined;
}
async function start() {
  child = spawn(process.execPath, [app], {
    cwd: root,
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      BORVAT_TEST_DATA_DIR: dir,
      BORVAT_TEST_ORIGIN: origin,
      BORVAT_NATIVE_BINDINGS_FILE: bindingFile,
      NODE_OPTIONS:
        "--import=" + join(root, "scripts/foundation/no-external-network.mjs"),
    },
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw Error("Compiled server exited before readiness");
    try {
      const r = await call("/discover");
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Compiled server readiness timed out");
}
try {
  await start();
  const admin = (
    await ok("/api/commerce/login", { email: "admin@example.test", password })
  ).cookie;
  await ok(
    "/api/commerce/admin/sellers",
    { seller: "seller-a", state: "approved" },
    admin,
  );
  const guest = (await ok("/api/commerce/session", {})).cookie;
  const quote = (
    await ok(
      "/api/commerce/quote",
      { lines: [{ offerId: "native-a", quantity: 3 }] },
      guest,
    )
  ).value;
  assert.equal(quote.totalCents, 6000);
  const checkout = {
    firstName: "Test",
    lastName: "Buyer",
    email: "compiled@example.test",
    phone: "0612345678",
    street: "Teststraat",
    houseNumber: "12",
    addition: "",
    postalCode: "1234 AB",
    city: "Utrecht",
    country: "NL",
  };
  const body = {
    quoteId: quote.id,
    checkout,
    idempotencyKey: "compiled-checkout",
  };
  const order = (await ok("/api/commerce/orders", body, guest)).value;
  assert.equal(order.portions[0].state, "reserved");
  assert.ok(order.portions[0].references.reserve.reservation);
  assert.equal(
    (await ok("/api/commerce/orders", body, guest)).value.id,
    order.id,
  );
  const other = (await ok("/api/commerce/session", {})).cookie;
  assert.equal(
    (await call("/api/commerce/orders/" + order.id, undefined, other)).status,
    404,
  );
  const sellerB = (
    await ok("/api/commerce/login", { email: "b@example.test", password })
  ).cookie;
  assert.equal(
    (await call("/api/commerce/orders/" + order.id, undefined, sellerB)).status,
    404,
  );
  report.cases.push({
    name: "compiled-server-guest-checkout-native-reservation-and-privacy",
    status: "PASS",
    order: order.id,
    native: order.portions[0].references.reserve,
    totalCents: order.totalCents,
  });
  save();
  await stop();
  await start();
  const restored = (
    await ok("/api/commerce/orders/" + order.id, undefined, guest)
  ).value;
  assert.equal(restored.id, order.id);
  assert.equal(restored.portions[0].state, "reserved");
  report.cases.push({
    name: "compiled-server-process-restart-keeps-order-cookie-and-native-reference",
    status: "PASS",
  });
  const html = (await ok("/discover?lang=ar")).value;
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes("لبيتك وحديقتك، على ذوقك."));
  assert.equal(
    (await call("/api/email/send", { to: "nobody@example.test" }, admin))
      .status,
    405,
  );
  assert.equal((await call("/account")).status, 404);
  report.cases.push({
    name: "compiled-Arabic-SSR-and-operational-route-denial",
    status: "PASS",
    browser: "NOT_RUN",
  });
  report.status = "PASS";
  save();
  console.log(JSON.stringify({ status: "PASS", cases: report.cases.length }));
} catch (error) {
  report.status = "FAIL";
  report.cases.push({
    name: "compiled-server-acceptance",
    status: "FAIL",
    error: error.message,
  });
  save();
  console.log(JSON.stringify({ status: "FAIL", error: error.message }));
  process.exitCode = 1;
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
