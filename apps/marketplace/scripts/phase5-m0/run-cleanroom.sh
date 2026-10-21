#!/usr/bin/env bash
# scripts/phase5-m0/run-cleanroom.sh
#
# Apply migrations in the exact order and content pinned by a manifest.
# NEVER discovers migrations dynamically. NEVER runs against production.
#
# Usage: run-cleanroom.sh {pre_hotfix|current|m4_checkpoint}
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"

SET="${1:-}"
case "$SET" in
  pre_hotfix)     MANIFEST="$HERE/manifests/pre-hotfix-manifest.json"; OUT_DIR="artifacts/pre-hotfix" ;;
  current)        MANIFEST="$HERE/manifests/current-manifest.json";    OUT_DIR="artifacts/current" ;;
  m4_checkpoint)  MANIFEST="$HERE/manifests/m4-checkpoint-manifest.json"; OUT_DIR="artifacts/m4-checkpoint" ;;
  *) echo "usage: $0 {pre_hotfix|current|m4_checkpoint}" >&2; exit 2 ;;
esac

require_cleanroom_env

MIG_DIR="supabase/migrations"
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/replay-log.txt"
RESULTS="$OUT_DIR/migration-results.json"
INTEGRITY="$OUT_DIR/manifest-integrity.json"
: > "$LOG"

if [[ ! -f "$MANIFEST" ]]; then
  echo "HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION (manifest missing: $MANIFEST)" | tee -a "$LOG" >&2
  exit 40
fi

MANIFEST_SHA="$(sha256_of "$MANIFEST")"
echo "manifest=$MANIFEST sha256=$MANIFEST_SHA" >> "$LOG"

# ---------------------------------------------------------------------------
# Integrity phase — verify manifest structure, uniqueness, file presence,
# on-disk SHA-256 and size, and no extra unlisted files (for current set).
# ---------------------------------------------------------------------------
node --input-type=module -e '
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const [,, manifestPath, migDir, set, integrityOut] = process.argv;
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function fail(code, msg) {
  fs.writeFileSync(integrityOut, JSON.stringify({ ok:false, code, msg }, null, 2));
  console.error(`HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION (${code}: ${msg})`);
  process.exit(41);
}

if (!Array.isArray(m.entries)) fail("BAD_SHAPE", "entries not an array");
if (m.count !== m.entries.length) fail("COUNT_MISMATCH", `count=${m.count} vs entries=${m.entries.length}`);

const seenFn = new Set(), seenOrder = new Set();
for (const e of m.entries) {
  if (!e.filename || typeof e.sha256 !== "string" || e.sha256.length !== 64 || typeof e.execution_order !== "number" || typeof e.size_bytes !== "number") {
    fail("BAD_ENTRY", JSON.stringify(e));
  }
  if (seenFn.has(e.filename)) fail("DUPLICATE_FILENAME", e.filename);
  if (seenOrder.has(e.execution_order)) fail("DUPLICATE_ORDER", String(e.execution_order));
  seenFn.add(e.filename); seenOrder.add(e.execution_order);
}
const ordered = [...m.entries].sort((a,b)=>a.execution_order-b.execution_order);
for (let i=0;i<ordered.length;i++) {
  if (ordered[i].execution_order !== i+1) fail("ORDER_GAP", `expected ${i+1} got ${ordered[i].execution_order}`);
}

// Verify on-disk files match manifest exactly.
for (const e of ordered) {
  const p = path.join(migDir, e.filename);
  if (!fs.existsSync(p)) fail("MISSING_FILE", e.filename);
  const buf = fs.readFileSync(p);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha !== e.sha256) fail("SHA_MISMATCH", `${e.filename} expected=${e.sha256} actual=${sha}`);
  if (buf.length !== e.size_bytes) fail("SIZE_MISMATCH", `${e.filename} expected=${e.size_bytes} actual=${buf.length}`);
}

// For "current", reject any migration file on disk not declared in manifest.
if (set === "current") {
  const declared = new Set(ordered.map(e=>e.filename));
  const onDisk = fs.readdirSync(migDir).filter(f=>f.endsWith(".sql"));
  for (const f of onDisk) {
    if (!declared.has(f)) fail("UNDECLARED_FILE", f);
  }
  if (onDisk.length !== declared.size) fail("COUNT_MISMATCH_FS", `disk=${onDisk.length} manifest=${declared.size}`);
}

fs.writeFileSync(integrityOut, JSON.stringify({
  ok: true,
  manifest_name: m.name,
  count: m.count,
  boundary: m.boundary ?? null,
  verified_at_utc: new Date().toISOString(),
}, null, 2));
console.log(`manifest_integrity=OK entries=${m.count}`);
' -- "$MANIFEST" "$MIG_DIR" "$SET" "$INTEGRITY" | tee -a "$LOG"

# ---------------------------------------------------------------------------
# Empty-DB precondition — Project objects allowlist.
# ---------------------------------------------------------------------------
"$HERE/assert-empty-db.sh" | tee -a "$LOG"

# ---------------------------------------------------------------------------
# Apply migrations strictly in manifest order.
# ---------------------------------------------------------------------------
echo "[" > "$RESULTS"
first=1
overall="APPLIED"

# Read filename list in execution order.
mapfile -t FILES < <(
  node --input-type=module -e '
    import fs from "node:fs";
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const e of [...m.entries].sort((a,b)=>a.execution_order-b.execution_order)) {
      console.log(`${e.execution_order}\t${e.filename}\t${e.sha256}`);
    }
  ' -- "$MANIFEST"
)

for row in "${FILES[@]}"; do
  IFS=$'\t' read -r order fname expected_sha <<<"$row"
  path="$MIG_DIR/$fname"
  actual_sha="$(sha256_of "$path")"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION (runtime SHA drift on $fname)" | tee -a "$LOG" >&2
    exit 42
  fi

  start="$(utc_now)"
  echo "[${order}] APPLY $fname sha=$actual_sha" | tee -a "$LOG"
  set +e
  psql_quiet -f "$path" >>"$LOG" 2>&1
  ec=$?
  set -e
  end="$(utc_now)"

  status=$([[ $ec -eq 0 ]] && echo APPLIED || echo FAILED)

  if [[ $first -eq 0 ]]; then echo "," >> "$RESULTS"; fi
  first=0
  cat >> "$RESULTS" <<JSON
  {
    "ordinal": ${order},
    "filename": "${fname}",
    "repo_sha256": "${actual_sha}",
    "manifest_sha256": "${expected_sha}",
    "status": "${status}",
    "exit_code": ${ec},
    "started_at_utc": "${start}",
    "ended_at_utc": "${end}"
  }
JSON

  if [[ $ec -ne 0 ]]; then
    overall="REPLAY_FAILURE"
    echo "[${order}] FAIL $fname exit=$ec — stopping." | tee -a "$LOG"
    break
  fi
done

echo "]" >> "$RESULTS"
echo "MANIFEST_SET=${SET} OVERALL=${overall}" | tee -a "$LOG"

[[ "$overall" == "APPLIED" ]] || { echo "REPLAY FAILURE — BASELINE FAIL"; exit 50; }
