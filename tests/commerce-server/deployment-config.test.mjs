import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readTestConfig,
  validateVolume,
} from "../../packages/commerce-server/deployment-config.mjs";
import { nativeReceiver } from "../../packages/commerce-server/native-receiver.mjs";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { once } from "node:events";

// Real loopback HTTP; this fixture is transport evidence, not ERPNext/provider acceptance.
test("native transport signs scoped requests and refuses redirects instead of forwarding credentials", async (t) => {
  let redirect = false,
    requests = 0;
  const server = createServer(async (request, response) => {
    requests++;
    assert.equal(
      request.url,
      "/api/method/borvat_native_test.api.availability",
    );
    assert.equal(request.headers["x-frappe-site-name"], "wms-native-a.invalid");
    const [head, payload, signature] =
      request.headers["x-surooh-synthetic-jwt"].split(".");
    assert.equal(
      signature,
      createHmac("sha256", binding.signingKey)
        .update(head + "." + payload)
        .digest("base64url"),
    );
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    assert.equal(claims.company_id, "TEST-A");
    assert.equal(claims.sub, binding.actor);
    assert.equal(claims.aud, "surooh-native-lab");
    assert.ok(claims.exp > Date.now() / 1000);
    let body = "";
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { company: "TEST-A" });
    if (redirect)
      response.writeHead(302, { location: "/forbidden-redirect" }).end();
    else
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ message: { available: { "TEST-C1": 3 } } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((done) => server.close(done)));
  const receiver = nativeReceiver({
    ...binding,
    url: `http://127.0.0.1:${server.address().port}/`,
  });
  assert.deepEqual(await receiver.availability(), { "TEST-C1": 3 });
  redirect = true;
  await assert.rejects(receiver.availability());
  assert.equal(requests, 2);
});

const mount = "1 0 8:1 / /var/data rw,relatime - ext4 /dev/disk rw\n";
const volume = {
  dataDir: "/var/data/borvat",
  volumeRoot: "/var/data",
  mountInfo: mount,
};
const binding = {
  company: "TEST-A",
  site: "wms-native-a.invalid",
  actor: "worker@example.invalid",
  signingKey: "synthetic-test-only-key-not-a-real-secret",
  url: "http://127.0.0.1:18080/",
};

test("hosted data must reside on a writable mounted filesystem, not a marker on ephemeral storage", () => {
  assert.doesNotThrow(() => validateVolume(volume));
  for (const mountInfo of [
    "",
    mount.replace("ext4", "overlay"),
    mount.replace("ext4", "tmpfs"),
    mount.replace("rw,relatime", "ro,relatime"),
    mount.replace("/var/data", "/other"),
  ])
    assert.throws(() => validateVolume({ ...volume, mountInfo }));
  for (const dataDir of [
    "/tmp/borvat",
    "/var/data-other/borvat",
    "/var/data",
    "/var/data/../tmp",
  ])
    assert.throws(() => validateVolume({ ...volume, dataDir }));
  assert.throws(() =>
    validateVolume({
      ...volume,
      mountInfo: mount + "2 1 0:99 / /var/data/borvat rw - tmpfs tmpfs rw\n",
    }),
  );
});

test("configuration rejects cross-company bindings, public files and symlinks before opening orders", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "borvat-deploy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "bindings.json");
  const env = {
    BORVAT_TEST_DATA_DIR: dir,
    BORVAT_TEST_ORIGIN: "http://127.0.0.1:18081",
    BORVAT_NATIVE_BINDINGS_FILE: file,
  };
  const save = (value) => {
    writeFileSync(file, JSON.stringify(value));
    chmodSync(file, 0o600);
  };
  save({ "TEST-A": binding });
  assert.equal(readTestConfig(env).hosted, false);
  save({ "TEST-B": binding });
  assert.throws(() => readTestConfig(env));
  save({ "REAL-COMPANY": { ...binding, company: "REAL-COMPANY" } });
  assert.throws(() => readTestConfig(env));
  save({});
  assert.throws(() => readTestConfig(env));
  save({ "TEST-A": binding });
  chmodSync(file, 0o644);
  assert.throws(() => readTestConfig(env));
  chmodSync(file, 0o600);
  const link = join(dir, "link");
  symlinkSync(file, link);
  assert.throws(() =>
    readTestConfig({ ...env, BORVAT_NATIVE_BINDINGS_FILE: link }),
  );
  assert.throws(() => readTestConfig({ ...env, RENDER: "true" }));
  assert.throws(() =>
    readTestConfig({
      ...env,
      RENDER: "true",
      BORVAT_TEST_DEPLOYMENT: "render-synthetic",
      RENDER_EXTERNAL_URL: env.BORVAT_TEST_ORIGIN,
    }),
  );
});

test("remote native transport is explicit TLS synthetic-only and preserves local boundary", () => {
  assert.doesNotThrow(() => nativeReceiver(binding));
  const remote = {
    ...binding,
    url: "https://surooh-native-test-a.onrender.com/",
  };
  assert.throws(() => nativeReceiver(remote));
  assert.doesNotThrow(() => nativeReceiver({ ...remote, hosted: true }));
  for (const url of [
    "http://surooh-native-test-a.onrender.com/",
    "https://onrender.com.evil.test/",
    "https://surooh-native-test-a.onrender.com:444/",
    "https://surooh-native-test-a.onrender.com/?key=bad",
    "https://user:password@surooh-native-test-a.onrender.com/",
    "https://127.0.0.1/",
    "https://example.com/",
  ])
    assert.throws(() => nativeReceiver({ ...binding, hosted: true, url }));
  assert.throws(() => nativeReceiver({ ...binding, company: "TEST-B" }));
  assert.throws(() =>
    nativeReceiver({ ...binding, actor: "real@business.com" }),
  );
});
