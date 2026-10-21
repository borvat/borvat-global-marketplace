#!/usr/bin/env bash
# scripts/phase5-m0/run-baseline-suites.sh
#
# Executes every baseline test suite against the CURRENT clean-room DB and the
# post-M5 compatibility suite. NO carve-outs. Any non-zero exit is TEST FAILURE.
# The M4 historical suites are NOT run here — they only run against the M4
# checkpoint schema in run-m4-checkpoint.sh.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"
require_cleanroom_env

mkdir -p artifacts/suites
RESULTS="artifacts/suites/results.json"
: > "$RESULTS"

# Discover Phase 1/2/3/redaction/security suites — but explicitly exclude the
# two historical M4 suites (they belong to run-m4-checkpoint.sh).
mapfile -t SUITES < <(
  ls scripts | \
    grep -E '^(phase[1-3]|redaction|security).*tests\.ts$' | \
    grep -v '^phase4-m4-tests\.ts$' | \
    grep -v '^phase4-m4-adapter-tests\.ts$' | \
    sort
)
# Append the post-M5 compatibility suite (must exist as a real suite, not scaffold).
SUITES+=("phase4-m4-post-m5-compat-tests.ts")

echo "[" > "$RESULTS"
first=1
overall_ec=0

for s in "${SUITES[@]}"; do
  path="scripts/$s"
  if [[ ! -f "$path" ]]; then
    echo "HARNESS FAILURE — suite listed but missing: $path" >&2
    overall_ec=1
    continue
  fi
  log="artifacts/suites/${s%.ts}.log"
  start=$(date -u +%s)
  set +e
  bun run "$path" > "$log" 2>&1
  ec=$?
  set -e
  end=$(date -u +%s)
  dur=$((end-start))

  status="PASS"
  [[ $ec -ne 0 ]] && { status="FAIL"; overall_ec=1; }

  passed=$(grep -Eo '"passed":[0-9]+' "$log" | head -1 | grep -Eo '[0-9]+' || echo 0)
  total=$(grep -Eo '"total":[0-9]+'  "$log" | head -1 | grep -Eo '[0-9]+' || echo 0)

  if [[ $first -eq 0 ]]; then echo "," >> "$RESULTS"; fi
  first=0
  cat >> "$RESULTS" <<JSON
  {
    "script": "${s}",
    "exit_code": ${ec},
    "status": "${status}",
    "assertions_passed": ${passed},
    "assertions_total": ${total},
    "duration_seconds": ${dur},
    "log": "artifacts/suites/${s%.ts}.log"
  }
JSON
  echo "[$status] $s ec=$ec ${passed}/${total} ${dur}s"
done

echo "]" >> "$RESULTS"
exit $overall_ec
