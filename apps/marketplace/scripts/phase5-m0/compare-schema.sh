#!/usr/bin/env bash
# scripts/phase5-m0/compare-schema.sh
# Diff current clean-room inventory vs live inventory.
# Emits artifacts/diff/structural-diff.json with EXPECTED / UNDOCUMENTED / DANGEROUS classification.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"

CUR="artifacts/phase5-m0-current/schema.inventory.json"
LIVE="artifacts/phase5-m0-live-schema/schema.inventory.json"
mkdir -p artifacts/diff

if [[ ! -f "$CUR" ]]; then
  echo '{"status":"NO_CURRENT","rows":[]}' > artifacts/diff/structural-diff.json
  echo "compare: no current inventory (upstream job failed)"
  exit 0
fi

if [[ ! -f "$LIVE" ]]; then
  cat > artifacts/diff/structural-diff.json <<JSON
{
  "status": "NO_LIVE_SNAPSHOT",
  "current_object_count": $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).length)' "$CUR"),
  "rows": []
}
JSON
  echo "compare: live snapshot missing — DRIFT VERIFICATION INCOMPLETE"
  exit 0
fi

node -e '
const fs = require("fs");
const cur  = JSON.parse(fs.readFileSync(process.argv[1]));
const live = JSON.parse(fs.readFileSync(process.argv[2]));
const idx  = (arr) => Object.fromEntries(arr.map(o => [o.kind+"::"+o.ident, o]));
const c = idx(cur), l = idx(live);
const keys = new Set([...Object.keys(c), ...Object.keys(l)]);
const rows = [];
const dangerousKinds = new Set(["policy","trigger"]); // definition drift here is security-relevant
for (const k of keys) {
  const [kind, ident] = k.split("::");
  const a = c[k], b = l[k];
  if (a && b && a.def_hash === b.def_hash) continue;
  let classification = "UNDOCUMENTED";
  if (dangerousKinds.has(kind) && (!a || !b || a.def_hash !== b.def_hash)) classification = "DANGEROUS";
  rows.push({
    kind, ident,
    presence: { current: !!a, live: !!b },
    def_hash: { current: a?.def_hash ?? null, live: b?.def_hash ?? null },
    classification
  });
}
const out = {
  status: "OK",
  totals: {
    entries: rows.length,
    matches: keys.size - rows.length,
    dangerous:    rows.filter(r => r.classification === "DANGEROUS").length,
    undocumented: rows.filter(r => r.classification === "UNDOCUMENTED").length
  },
  rows
};
fs.writeFileSync("artifacts/diff/structural-diff.json", JSON.stringify(out, null, 2));
console.log(`compare: rows=${rows.length} dangerous=${out.totals.dangerous} undocumented=${out.totals.undocumented}`);
' "$CUR" "$LIVE"
