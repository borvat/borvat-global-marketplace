#!/usr/bin/env bash
# scripts/phase5-m0/dump-schema.sh
# Schema-only, no-data, no-privileges dump. Refuses to run against a target
# that hasn't passed the readonly preflight (when a DSN is provided).
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"

OUT="${1:?output path required}"
MODE="${2:-local}"   # local | live
mkdir -p "$(dirname "$OUT")"

echo "pg_dump_version=$(pg_dump --version)"

# Sanity: pg_dump must support the flags we rely on.
if ! pg_dump --help 2>&1 | grep -q -- '--schema-only'; then
  echo "HARNESS FAILURE — SCHEMA DUMP FAILED (pg_dump lacks --schema-only)" >&2
  exit 90
fi

if [[ "$MODE" == "live" ]]; then
  if [[ -z "${PHASE5_LIVE_READONLY_DSN:-}" ]]; then
    echo "HARNESS FAILURE — SCHEMA DUMP FAILED (live mode without DSN)" >&2
    exit 91
  fi
  # Preflight is required before this script runs; re-check the marker file
  # instead of re-running the probes (they've already gated the job).
  if [[ ! -f "artifacts/live/readonly-verification.json" ]] \
     || ! grep -q '"outcome": "PASS"' artifacts/live/readonly-verification.json; then
    echo "HARNESS FAILURE — SCHEMA DUMP FAILED (readonly preflight not confirmed)" >&2
    exit 92
  fi
  set +e
  pg_dump "$PHASE5_LIVE_READONLY_DSN" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --format=plain \
    --schema=public \
    > "$OUT"
  ec=$?
  set -e
else
  require_cleanroom_env
  set +e
  pg_dump \
    --schema-only \
    --no-owner \
    --no-privileges \
    --format=plain \
    --schema=public \
    > "$OUT"
  ec=$?
  set -e
fi

if [[ $ec -ne 0 ]]; then
  echo "HARNESS FAILURE — SCHEMA DUMP FAILED (exit=$ec)" >&2
  exit 93
fi

SIZE=$(wc -c < "$OUT")
HASH=$(sha256_of "$OUT")
echo "dump: file=$OUT size=$SIZE sha256=$HASH"

# Extract a catalog inventory alongside the SQL dump.
INV="${OUT%.sql}.inventory.json"
if [[ "$MODE" == "live" ]]; then
  PSQL_CMD=(psql "$PHASE5_LIVE_READONLY_DSN")
else
  PSQL_CMD=(psql)
fi

"${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 -Atqc "
with objs as (
  select 'table' as kind, format('%I.%I', schemaname, tablename) as ident,
         md5(coalesce((select string_agg(column_name||':'||data_type, ',' order by ordinal_position)
                       from information_schema.columns c
                       where c.table_schema=schemaname and c.table_name=tablename), '')) as def_hash
  from pg_tables where schemaname='public'
  union all
  select 'function', format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all
  select 'policy', format('%I.%I:%s', schemaname, tablename, policyname), md5(coalesce(qual,'')||coalesce(with_check,''))
  from pg_policies where schemaname='public'
  union all
  select 'index', format('%I.%I', schemaname, indexname), md5(indexdef)
  from pg_indexes where schemaname='public'
  union all
  select 'trigger', format('%I.%I:%s', n.nspname, c.relname, t.tgname), md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal
)
select coalesce(json_agg(json_build_object('kind',kind,'ident',ident,'def_hash',def_hash)), '[]'::json) from objs;
" > "$INV" || { echo "HARNESS FAILURE — SCHEMA DUMP FAILED (inventory query)" >&2; exit 94; }

cat > "${OUT%.sql}.dump-metadata.json" <<JSON
{
  "mode": "${MODE}",
  "pg_dump_version": "$(pg_dump --version | head -1)",
  "output_file": "${OUT}",
  "output_size_bytes": ${SIZE},
  "output_sha256": "${HASH}",
  "inventory_file": "${INV}",
  "dumped_at_utc": "$(utc_now)"
}
JSON
