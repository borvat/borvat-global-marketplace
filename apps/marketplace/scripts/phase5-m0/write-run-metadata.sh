#!/usr/bin/env bash
# scripts/phase5-m0/write-run-metadata.sh
# Emits artifacts/run-metadata.json with the full identity of this workflow run.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"

OUT="${1:-artifacts/run-metadata.json}"
mkdir -p "$(dirname "$OUT")"

WF_FILE=".github/workflows/phase5-m0-cleanroom.yml"
WF_SHA=$([[ -f "$WF_FILE" ]] && sha256_of "$WF_FILE" || echo "missing")
PRE_SHA=$([[ -f scripts/phase5-m0/manifests/pre-hotfix-manifest.json ]] && sha256_of scripts/phase5-m0/manifests/pre-hotfix-manifest.json || echo missing)
CUR_SHA=$([[ -f scripts/phase5-m0/manifests/current-manifest.json ]] && sha256_of scripts/phase5-m0/manifests/current-manifest.json || echo missing)
M4_SHA=$([[ -f scripts/phase5-m0/manifests/m4-checkpoint-manifest.json ]] && sha256_of scripts/phase5-m0/manifests/m4-checkpoint-manifest.json || echo missing)

cat > "$OUT" <<JSON
{
  "generated_at_utc": "$(utc_now)",
  "github": {
    "sha": "${GITHUB_SHA:-unknown}",
    "ref": "${GITHUB_REF:-unknown}",
    "run_id": "${GITHUB_RUN_ID:-unknown}",
    "run_attempt": "${GITHUB_RUN_ATTEMPT:-unknown}",
    "workflow_file": "${WF_FILE}",
    "workflow_file_sha256": "${WF_SHA}"
  },
  "manifests": {
    "pre_hotfix_sha256": "${PRE_SHA}",
    "current_sha256": "${CUR_SHA}",
    "m4_checkpoint_sha256": "${M4_SHA}"
  },
  "tools": {
    "runner_os": "${RUNNER_OS:-unknown}",
    "node": "$(node --version 2>/dev/null || echo missing)",
    "bun": "$(bun --version 2>/dev/null || echo missing)",
    "psql": "$(psql --version 2>/dev/null || echo missing)",
    "pg_dump": "$(pg_dump --version 2>/dev/null || echo missing)",
    "docker": "$(docker --version 2>/dev/null || echo missing)",
    "postgres_image": "${POSTGRES_IMAGE:-unknown}"
  }
}
JSON

echo "metadata written to $OUT"
