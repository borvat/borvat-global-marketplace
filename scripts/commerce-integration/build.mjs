import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!["isolated", "default", "connected-test"].includes(mode))
  throw Error("Expected isolated or default build profile");
const app = fileURLToPath(new URL("../../apps/marketplace/", import.meta.url));
const guard = fileURLToPath(
  new URL("../foundation/no-external-network.mjs", import.meta.url),
);
const envFiles = readdirSync(app).filter(
  (name) => /^\.env(?:\.|$)/.test(name) && !name.endsWith(".example"),
);
if (envFiles.length)
  throw Error(
    "Remove environment files from the disposable test checkout before building",
  );
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "TEMP", "SYSTEMROOT"]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
Object.assign(env, {
  VITE_BORVAT_RUNTIME: mode,
  NITRO_PRESET: "node-server",
  NODE_OPTIONS: "--import=" + guard,
});
const child = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  { cwd: app, env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
