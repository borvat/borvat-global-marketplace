import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const mode = process.argv[2];
if (!["isolated", "default"].includes(mode))
  throw Error("Expected tested build profile");
const app = fileURLToPath(new URL("../../apps/marketplace/", import.meta.url));
const guard = fileURLToPath(
  new URL("../foundation/no-external-network.mjs", import.meta.url),
);
const child = spawn(process.execPath, [".output/server/index.mjs"], {
  cwd: app,
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: "4180",
    NODE_OPTIONS: "--import=" + guard,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
const expected = mode === "isolated" ? [200, 405] : [404, 503];
try {
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      response = await fetch("http://127.0.0.1:4180/discover");
      break;
    } catch {
      /* loopback readiness only */
    }
    if (child.exitCode !== null) throw Error(log);
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(
    response,
    "Original application must start without provider credentials",
  );
  assert.equal(response.status, expected[0]);
  const body = await response.text();
  if (mode === "isolated") assert.match(body, /TESTOMGEVING/g);
  else assert.doesNotMatch(body, /TESTOMGEVING/);
  const email = await fetch(
    "http://127.0.0.1:4180/lovable/email/auth/webhook",
    {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    },
  );
  assert.equal(email.status, expected[1]);
  console.log(
    JSON.stringify({
      status: "PASS",
      mode,
      discoverStatus: response.status,
      emailStatus: email.status,
      providerCredentials: false,
      log,
    }),
  );
} finally {
  child.kill("SIGTERM");
}
