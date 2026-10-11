import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const file = (p) => readFileSync(resolve(root, p), "utf8");

test("phase 0 documents and bootstrap exist", () => {
  for (const p of [
    "docs/ARCHITECTURE.md",
    "docs/ACCEPTANCE.md",
    "docs/IMPLEMENTATION-PLAN.md",
    "docs/INSTALLATION.md",
    "scripts/bootstrap-mercur-local.sh",
    "infra/compose.dev.yml",
    "infra/.env.example",
  ]) assert.ok(existsSync(resolve(root, p)), `missing ${p}`);
});

test("local infra has no publicly exposed database ports", () => {
  const compose = file("infra/compose.dev.yml");
  assert.match(compose, /127\.0\.0\.1:55432:5432/);
  assert.match(compose, /127\.0\.0\.1:56379:6379/);
  assert.match(compose, /BORVAT_DEV_DB_PASSWORD/);
  assert.match(compose, /borvat_mercur_dev/);
});

test("no application runtime is misrepresented as proven", () => {
  const status = file("docs/EXECUTION-STATUS.md");
  assert.match(status, /NOT|not/);
  assert.match(status, /NOT RUN|NOT been imported|has NOT run/);
});

test("source bootstrap never overwrites an existing folder", () => {
  const bootstrap = file("scripts/bootstrap-mercur-local.sh");
  assert.match(bootstrap, /\[ -e "\$TARGET" \]/);
  assert.match(bootstrap, /bun create mercur-app@latest/);
});
