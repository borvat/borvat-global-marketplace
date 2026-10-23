import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const original = json("docs/source-recovery/manifest.json");
const review = json("docs/commerce-integration/source-changes.json");
assert.equal(review.baseCommit, "bd08f17eede382d4cd7e997d1a5b52a0573918b2");
const accepted = new Map(review.changes.map((item) => [item.path, item]));
assert.equal(accepted.size, review.changes.length);
let unchanged = 0;
let evolved = 0;
for (const record of original.records.filter(
  (item) => item.status === "RECOVERED_TEXT",
)) {
  const path = resolve(root, record.destination);
  assert.ok(path.startsWith(root.endsWith(sep) ? root : root + sep));
  assert.ok(existsSync(path), "Original text missing: " + record.destination);
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  const change = accepted.get(record.destination);
  if (change) {
    assert.equal(change.before, record.sha256);
    assert.equal(
      actual,
      change.after,
      "Reviewed source changed again: " + record.destination,
    );
    assert.ok(change.reason);
    evolved++;
  } else {
    assert.equal(
      actual,
      record.sha256,
      "Unexpected original-source change: " + record.destination,
    );
    unchanged++;
  }
}
assert.equal(evolved, accepted.size);
assert.equal(unchanged + evolved, original.eligible_text_count);
console.log(
  JSON.stringify({
    status: "PASS",
    unchanged,
    reviewedChanges: evolved,
    total: original.eligible_text_count,
    unresolvedOriginalAssets: original.binary_missing_count,
    meaning:
      "bounded source evolution, not original parity or release approval",
  }),
);
