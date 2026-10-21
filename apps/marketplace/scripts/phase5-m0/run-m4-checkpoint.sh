#!/usr/bin/env bash
# scripts/phase5-m0/run-m4-checkpoint.sh
#
# Applies migrations 1..29 (through Phase 4 M4) onto a fresh clean-room DB and
# runs the historical M4 suites unchanged, plus a new M4 checkpoint suite that
# asserts the pre-M5 shape (no live_authorized_at, no shipment_outbox).
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"
require_cleanroom_env

mkdir -p artifacts/m4-checkpoint
OUT="artifacts/m4-checkpoint/results.json"
: > "$OUT"

# 1. Apply M4-boundary manifest.
"$HERE/run-cleanroom.sh" m4_checkpoint

# 2. Run the checkpoint schema-shape suite.
run_suite() {
  local s="$1" log="artifacts/m4-checkpoint/${1%.ts}.log"
  local start end ec status
  start=$(date -u +%s)
  set +e
  bun run "scripts/$s" > "$log" 2>&1
  ec=$?
  set -e
  end=$(date -u +%s)
  status=$([[ $ec -eq 0 ]] && echo PASS || echo FAIL)
  local passed total
  passed=$(grep -Eo '"passed":[0-9]+' "$log" | head -1 | grep -Eo '[0-9]+' || echo 0)
  total=$(grep -Eo '"total":[0-9]+'  "$log" | head -1 | grep -Eo '[0-9]+' || echo 0)
  printf '{"script":"%s","exit_code":%d,"status":"%s","assertions_passed":%s,"assertions_total":%s,"duration_seconds":%d,"log":"%s"}' \
    "$s" "$ec" "$status" "$passed" "$total" "$((end-start))" "$log"
  return $ec
}

echo "[" > "$OUT"
overall=0
first=1
for s in phase4-m4-checkpoint-tests.ts phase4-m4-tests.ts phase4-m4-adapter-tests.ts; do
  if [[ ! -f "scripts/$s" ]]; then
    echo "HARNESS FAILURE — M4 checkpoint suite missing: scripts/$s" >&2
    overall=1
    continue
  fi
  set +e
  entry="$(run_suite "$s")"
  ec=$?
  set -e
  [[ $ec -ne 0 ]] && overall=1
  [[ $first -eq 0 ]] && echo "," >> "$OUT"
  first=0
  echo "$entry" >> "$OUT"
done
echo "]" >> "$OUT"

exit $overall
