#!/usr/bin/env bash
# scripts/phase5-m0/assert-empty-db.sh — refuse to replay onto a non-empty DB.
# Allowlist is limited to Postgres/Supabase bootstrap schemas that a local
# service container ships with. Any project object aborts.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"
require_cleanroom_env

# 1. No user tables in public.
tables=$(psql_quiet -c "select count(*) from pg_tables where schemaname='public'")
# 2. No user functions in public.
funcs=$(psql_quiet -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
# 3. No user views/matviews in public.
views=$(psql_quiet -c "select (select count(*) from pg_views where schemaname='public') + (select count(*) from pg_matviews where schemaname='public')")
# 4. No project-specific enums/types in public.
types=$(psql_quiet -c "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','c','d')")
# 5. No stray application schemas.
stray_schemas=$(psql_quiet -c "
  select coalesce(string_agg(nspname, ','), '')
  from pg_namespace
  where nspname not in (
    'pg_catalog','pg_toast','information_schema','public',
    'pg_temp_1','pg_toast_temp_1',
    'auth','storage','realtime','supabase_functions','vault','graphql','graphql_public','extensions','net','pgsodium','pgsodium_masks','_realtime','_analytics','supabase_migrations'
  )
  and nspname not like 'pg_temp_%'
  and nspname not like 'pg_toast_temp_%'
")
# 6. Explicitly probe for well-known project objects — cheap defense in depth.
project_hits=$(psql_quiet -c "
  select count(*) from (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('place_order','post_inventory_transaction','has_role','claim_outbox_batch')
    union all
    select 1 from pg_tables where schemaname='public' and tablename in ('companies','company_members','catalog_products','outbox_events','products','order_items','wishlist_items','user_roles')
  ) x
")

fail=0
[[ "$tables"        == "0" ]] || { echo "empty-db: $tables project tables in public"; fail=1; }
[[ "$funcs"         == "0" ]] || { echo "empty-db: $funcs project functions in public"; fail=1; }
[[ "$views"         == "0" ]] || { echo "empty-db: $views project views/matviews in public"; fail=1; }
[[ "$types"         == "0" ]] || { echo "empty-db: $types project types in public"; fail=1; }
[[ "$project_hits"  == "0" ]] || { echo "empty-db: $project_hits well-known project objects present"; fail=1; }
[[ -z "$stray_schemas" ]] || { echo "empty-db: stray schemas present: $stray_schemas"; fail=1; }

if [[ $fail -ne 0 ]]; then
  echo "HARNESS FAILURE — TARGET DATABASE NOT EMPTY" >&2
  exit 60
fi
echo "empty-db: OK (no project objects present)"
