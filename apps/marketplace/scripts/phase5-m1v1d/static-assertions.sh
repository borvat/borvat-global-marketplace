#!/usr/bin/env bash
# M1V-1D — SELLER APPLICATION AND VERIFICATION WORKFLOW
# Static/catalog assertions (read-only, no writes, no data mutation).
# The gate role (sandbox_exec) deliberately has no privilege on the scope,
# so every assertion is proved from the catalog and from routine source.
set -Eeuo pipefail
FAIL=0
q() { psql -At -c "$1"; }
report() { if [[ "$2" == "$3" ]]; then echo "PASS: $1 ($3)"; else echo "FAIL: $1 (expected $2, got $3)"; FAIL=1; fi }

echo "== M1V-1D STATIC ASSERTIONS =="
echo "checked_at: $(q 'select now()')"

SCOPE="'seller_applications','seller_application_events'"

# 1 — structural scope
report "scope holds exactly two tables" "2" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relname in ($SCOPE)")"

# 2 — one application per legal company
report "one application per legal company (unique company_id)" "1" \
  "$(q "select count(*) from pg_constraint where conname='sa_company_unique'")"

# 3 — full workflow state set is enforced by constraint
report "workflow states constrained to the seven authorised values" "7" \
  "$(q "select (length(pg_get_constraintdef(oid)) - length(replace(pg_get_constraintdef(oid), '''', '')))/2
        from pg_constraint where conname='sa_status_ck'")"

# 4 — RLS deny-by-default
report "scope tables have RLS enabled and forced" "2" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ($SCOPE)
          and c.relrowsecurity and c.relforcerowsecurity")"

# 5 — zero policies (RPC-only surface)
report "scope tables carry zero policies" "0" \
  "$(q "select count(*) from pg_policies where schemaname='public' and tablename in ($SCOPE)")"

# 6 — no direct table privileges for any application or sandbox role
report "scope tables carry zero application/sandbox privileges" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace,
        lateral (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
        lateral (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) pv(p)
        where n.nspname='public' and c.relkind='r' and c.relname in ($SCOPE)
          and has_table_privilege(rl.r, c.oid, pv.p)")"

# 7 — no sequences, no views (R-T22)
report "no sequences or views in the M1V-1D scope" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('S','v','m')
          and c.relname like 'seller_application%'")"

# 8 — audit trail is append-only
report "application audit trail is append-only (UPDATE/DELETE trigger)" "1" \
  "$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
        where c.relname='seller_application_events'
          and t.tgname='m1v1d_application_event_immutable' and not t.tgisinternal")"

# 9 — write guard installed on the application table
report "application write guard installed (INSERT/UPDATE)" "1" \
  "$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
        where c.relname='seller_applications'
          and t.tgname='m1v1d_application_write' and not t.tgisinternal")"

# 10 — guard/internal routines are never app-executable
report "M1V-1D guard/internal routines locked (no app EXECUTE, no NULL proacl)" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'm1v1d_%'
          and (p.proacl is null
            or has_function_privilege('anon',p.oid,'EXECUTE')
            or has_function_privilege('authenticated',p.oid,'EXECUTE')
            or has_function_privilege('service_role',p.oid,'EXECUTE')
            or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")"

# 11 — authorised RPC surface is exactly six routines, authenticated-only
report "RPC surface is exactly six routines" "6" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in (
          'seller_get_application','seller_upsert_application','seller_submit_application',
          'admin_list_seller_applications','admin_get_seller_application',
          'admin_review_seller_application')")"

report "RPC surface executable by authenticated only (no anon, no service_role, no sandbox)" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
        lateral (values ('anon'),('service_role'),('sandbox_exec')) rl(r)
        where n.nspname='public' and p.proname in (
          'seller_get_application','seller_upsert_application','seller_submit_application',
          'admin_list_seller_applications','admin_get_seller_application',
          'admin_review_seller_application')
          and has_function_privilege(rl.r, p.oid, 'EXECUTE')")"

# 12 — every RPC is SECURITY DEFINER with a pinned empty search_path
report "all M1V-1D routines are SECURITY DEFINER with pinned search_path" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and (p.proname like 'm1v1d_%' or p.proname like '%_seller_application%'
               or p.proname in ('seller_get_application','seller_upsert_application','seller_submit_application'))
          and (not p.prosecdef or coalesce(array_to_string(p.proconfig,','),'') not like '%search_path%')")"

# 13 — administrator self-approval is structurally impossible
report "admin review RPC blocks self-review of own company" "1" \
  "$(q "select count(*) from pg_proc p where p.proname='admin_review_seller_application'
          and p.prosrc like '%self_review_forbidden%'
          and p.prosrc like '%is_company_member(v_app.company_id, v_uid)%'")"

# 14 — every admin action requires platform-admin role
report "every admin RPC enforces the platform admin check" "3" \
  "$(q "select count(*) from pg_proc p where p.proname in (
          'admin_list_seller_applications','admin_get_seller_application',
          'admin_review_seller_application')
          and p.prosrc like '%m1v1d_require_admin()%'")"

# 15 — seller RPCs are membership-scoped
report "every seller RPC enforces company membership" "3" \
  "$(q "select count(*) from pg_proc p where p.proname in (
          'seller_get_application','seller_upsert_application','seller_submit_application')
          and p.prosrc like '%is_company_member%' and p.prosrc like '%not_authorised%'")"

# 16 — review metadata is administrator-owned (no client-supplied approval data)
report "review metadata cannot be written outside an administrator action" "1" \
  "$(q "select count(*) from pg_proc p where p.proname='m1v1d_guard_application_write'
          and p.prosrc like '%review fields are administrator-owned%'
          and p.prosrc like '%review metadata cannot be supplied on creation%'")"

# 17 — illegal transitions are rejected at the storage layer
report "state machine enforced at the storage layer" "1" \
  "$(q "select count(*) from pg_proc p where p.proname='m1v1d_guard_application_write'
          and p.prosrc like '%illegal application transition%'
          and p.prosrc like '%requires an administrator action%'")"

# 18 — submission requires a complete verified-grade legal identity
report "submission requires complete legal identity plus KvK and VAT" "1" \
  "$(q "select count(*) from pg_proc p where p.proname='seller_submit_application'
          and p.prosrc like '%legal_identity_incomplete%'
          and p.prosrc like '%legal_identifiers_incomplete%'")"

# 19 — approval/rejection/suspension reasons are mandatory where required
report "mandatory reason constraints present (rejected/suspended/information_required)" "3" \
  "$(q "select count(*) from pg_constraint
        where conname in ('sa_rejected_ck','sa_suspended_ck','sa_info_ck')")"

# 20 — decision provenance is recorded
report "approval provenance enforced (approved_at + decided_by)" "1" \
  "$(q "select count(*) from pg_constraint where conname='sa_approved_ck'")"

# 21 — no contact/PII leakage into the public storefront surface
report "public storefront read exposes no application data" "0" \
  "$(q "select count(*) from pg_proc p where p.proname='public_get_store_profile'
          and p.prosrc like '%seller_application%'")"

# 22 — runtime deny proof
DEN=0
for t in seller_applications seller_application_events; do
  if psql -At -c "select count(*) from public.$t" >/dev/null 2>&1; then
    echo "  gate role can still read public.$t"; DEN=$((DEN+1))
  fi
done
report "gate role is denied read on M1V-1D tables (runtime deny proof)" "0" "$DEN"

echo
if [[ "$FAIL" == "0" ]]; then echo "M1V-1D STATIC GATE: PASS"; else echo "M1V-1D STATIC GATE: FAIL"; fi
exit "$FAIL"
