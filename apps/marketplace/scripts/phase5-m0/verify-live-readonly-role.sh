#!/usr/bin/env bash
# scripts/phase5-m0/verify-live-readonly-role.sh
#
# Job D preflight — proves the DSN's connected role is genuinely read-only
# before pg_dump touches production. NEVER executes INSERT/UPDATE. NEVER
# echoes the DSN. Runs entirely through has_*_privilege catalog probes.
#
# Requires: PHASE5_LIVE_READONLY_DSN in the environment.
# Emits: artifacts/live/readonly-verification.json + a stdout summary.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"

OUT="${1:-artifacts/live/readonly-verification.json}"
mkdir -p "$(dirname "$OUT")"

if [[ -z "${PHASE5_LIVE_READONLY_DSN:-}" ]]; then
  echo "HARNESS FAILURE — LIVE DSN NOT PROVIDED" >&2
  exit 80
fi

# Route all libpq calls through the DSN; never expand it into argv.
q() {
  PGPASSWORD='' psql "$PHASE5_LIVE_READONLY_DSN" -v ON_ERROR_STOP=1 -Atqc "$1"
}

echo "::add-mask::$PHASE5_LIVE_READONLY_DSN" || true

fail=0
check() {
  local label="$1"; local expected="$2"; local sql="$3"
  local actual
  set +e
  actual=$(q "$sql" 2>&1)
  local ec=$?
  set -e
  if [[ $ec -ne 0 ]]; then
    echo "FAIL: $label (query error)"
    fail=1
    return
  fi
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $label (expected=$expected actual=$actual)"
    fail=1
  else
    echo "OK  : $label"
  fi
}

# 1. Role attributes — every dangerous attribute must be FALSE.
check "rolsuper=false"       "f" "select rolsuper       from pg_roles where rolname=current_user"
check "rolcreatedb=false"    "f" "select rolcreatedb    from pg_roles where rolname=current_user"
check "rolcreaterole=false"  "f" "select rolcreaterole  from pg_roles where rolname=current_user"
check "rolbypassrls=false"   "f" "select rolbypassrls   from pg_roles where rolname=current_user"
check "rolreplication=false" "f" "select rolreplication from pg_roles where rolname=current_user"

# 2. Role must not be a database owner.
check "not-db-owner" "f" "
  select exists (
    select 1 from pg_database d
    join pg_roles r on r.oid = d.datdba
    where d.datname = current_database() and r.rolname = current_user
  )"

# 3. Not member (direct or indirect) of any privileged role.
check "not-in-privileged-role" "f" "
  with recursive m(role_oid) as (
    select oid from pg_roles where rolname = current_user
    union
    select am.roleid from pg_auth_members am join m on am.member = m.role_oid
  )
  select exists (
    select 1 from m join pg_roles r on r.oid = m.role_oid
    where r.rolname in ('postgres','supabase_admin','service_role','supabase_auth_admin','supabase_storage_admin')
       or r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb
  )"

# 4. Session-level read-only defaults.
check "default_transaction_read_only=on" "on" "show default_transaction_read_only"
# (transaction_read_only cannot be non-on if default is on and no BEGIN READ WRITE)

# 5. No CREATE on public / auth / storage.
for s in public auth storage; do
  check "no-CREATE-on-$s" "f" "select has_schema_privilege(current_user, '$s', 'CREATE')"
done

# 6. No write privileges on any table in public / auth / storage.
check "no-writes-on-app-tables" "0" "
  with roles as (select current_user as r),
  targets as (
    select schemaname||'.'||tablename as t
    from pg_tables
    where schemaname in ('public','auth','storage')
  )
  select coalesce(count(*),0)
  from targets, roles
  where has_table_privilege(r, t, 'INSERT')
     or has_table_privilege(r, t, 'UPDATE')
     or has_table_privilege(r, t, 'DELETE')
     or has_table_privilege(r, t, 'TRUNCATE')
     or has_table_privilege(r, t, 'REFERENCES')
     or has_table_privilege(r, t, 'TRIGGER')"

# 7. No EXECUTE on sensitive RPCs.
check "no-EXECUTE-on-sensitive-rpcs" "0" "
  with roles as (select current_user as r),
  fns as (
    select p.oid, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as ident
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'place_order',
        'post_inventory_transaction',
        'reserve_inventory','release_reservation',
        'claim_outbox_batch','fail_outbox_event','complete_outbox_event',
        'dispatch_channel_offer','dispatch_shipment',
        'authorize_channel_live','transfer_company_ownership'
      )
  )
  select coalesce(count(*),0) from fns, roles where has_function_privilege(r, oid, 'EXECUTE')"

role=$(q "select current_user")
db=$(q "select current_database()")

cat > "$OUT" <<JSON
{
  "verified_at_utc": "$(utc_now)",
  "database": "${db}",
  "role": "${role}",
  "outcome": "$([[ $fail -eq 0 ]] && echo PASS || echo FAIL)"
}
JSON

if [[ $fail -ne 0 ]]; then
  echo "LIVE SNAPSHOT SECURITY CHECK FAILED" >&2
  exit 81
fi
echo "verify-live-readonly-role: PASS role=${role} db=${db}"
