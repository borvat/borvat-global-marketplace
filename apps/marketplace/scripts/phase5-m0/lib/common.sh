#!/usr/bin/env bash
# scripts/phase5-m0/lib/common.sh — shared helpers for the M0-E3 harness.
# Every script MUST `set -Eeuo pipefail` and source this file.
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Failure trap. Writes a single line to stderr and to $HARNESS_FAILURE_LOG
# (if set), never echoes environment or secrets.
# -----------------------------------------------------------------------------
_harness_on_err() {
  local ec=$?
  local line=${BASH_LINENO[0]:-?}
  local src=${BASH_SOURCE[1]:-$0}
  local msg="HARNESS_TRAP src=${src} line=${line} exit=${ec} cmd=<redacted>"
  echo "$msg" >&2
  if [[ -n "${HARNESS_FAILURE_LOG:-}" ]]; then
    echo "$msg" >> "$HARNESS_FAILURE_LOG"
  fi
  return $ec
}
trap _harness_on_err ERR

# -----------------------------------------------------------------------------
# require_cleanroom_env: assert the sandbox marker + safe target host + no
# production DSN variables leaking in.
# -----------------------------------------------------------------------------
require_cleanroom_env() {
  if [[ "${PHASE5_CLEANROOM:-}" != "true" ]]; then
    echo "HARNESS FAILURE — UNSAFE DATABASE TARGET (PHASE5_CLEANROOM marker missing)" >&2
    exit 30
  fi
  case "${PGHOST:-}" in
    localhost|127.0.0.1|"::1"|postgres) ;;
    *)
      echo "HARNESS FAILURE — UNSAFE DATABASE TARGET (PGHOST='${PGHOST:-<unset>}' not in allowlist)" >&2
      exit 31
      ;;
  esac
  case "${PGDATABASE:-}" in
    cleanroom_pre|cleanroom_current|cleanroom_m4) ;;
    *)
      echo "HARNESS FAILURE — UNSAFE DATABASE TARGET (PGDATABASE='${PGDATABASE:-<unset>}' not a clean-room name)" >&2
      exit 32
      ;;
  esac
  # Refuse if any production DSN or service-role variables are present.
  for v in SUPABASE_SERVICE_ROLE_KEY DATABASE_URL PRODUCTION_DATABASE_URL LIVE_DSN; do
    if [[ -n "${!v:-}" ]]; then
      echo "HARNESS FAILURE — UNSAFE DATABASE TARGET (production variable '$v' is set inside a clean-room job)" >&2
      exit 33
    fi
  done
  # Refuse if PGHOST resolves to a Supabase/Lovable production hostname pattern.
  local h="${PGHOST:-}"
  case "$h" in
    *supabase.co|*supabase.io|*lovable.app|*lovable.dev)
      echo "HARNESS FAILURE — UNSAFE DATABASE TARGET (host '$h' looks like production)" >&2
      exit 34
      ;;
  esac
}

# -----------------------------------------------------------------------------
# psql_quiet: run psql; never echoes DSN. Requires PG* env already set.
# -----------------------------------------------------------------------------
psql_quiet() {
  PGOPTIONS="--client-min-messages=warning" psql -v ON_ERROR_STOP=1 -Atq "$@"
}

# -----------------------------------------------------------------------------
# sha256_of: portable sha256 of a file.
# -----------------------------------------------------------------------------
sha256_of() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  else
    shasum -a 256 "$f" | awk '{print $1}'
  fi
}

# -----------------------------------------------------------------------------
# utc_now: RFC3339 UTC timestamp.
# -----------------------------------------------------------------------------
utc_now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
