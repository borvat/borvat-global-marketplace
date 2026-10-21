#!/usr/bin/env bash
# scripts/phase5-acl-gate/check-critical-acl.sh
#
# PHASE 5 — M1B-0B POST-DEPLOYMENT ACL GATE (BOR-DEC-065)
#
# MANDATORY after every migration/deployment. A migration is NOT considered
# successful until this gate exits 0.
#
# It is read-only: it never grants, never revokes, never mutates data.
# Remediation is always a forward-fix migration ending with an explicit
# ACL normalization section.
#
# Exit codes: 0 = PASS, 1 = ACL VIOLATION (deployment gate FAIL), 70 = harness failure.
#
# Env:
#   ACL_GATE_SIMULATE_FAILURE=1  -> injects a synthetic violation to prove the
#                                   failure path (no database change).
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="$HERE/approved-routines.json"
FAIL=0

if [[ -z "${PGHOST:-}" ]]; then
  echo "HARNESS FAILURE: no managed database connection (PGHOST unset)" >&2
  exit 70
fi
[[ -f "$ALLOWLIST" ]] || { echo "HARNESS FAILURE: missing allowlist $ALLOWLIST" >&2; exit 70; }

q() { psql -At -c "$1" 2>/dev/null || { echo "HARNESS FAILURE: query failed: $1" >&2; exit 70; }; }

report() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo "PASS: $1 ($3)"; else echo "FAIL: $1 (expected $2, got $3)"; FAIL=1; fi
}

echo "== M1B-0B POST-DEPLOYMENT ACL GATE =="
echo "checked_at: $(q 'select now()')"

# --- 1. P5-HF-001 permanent invariant: place_order, every overload -----------
INV=$(q "
  select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace,
  lateral (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
  where n.nspname='public' and p.proname='place_order'
    and has_function_privilege(rl.r, p.oid, 'EXECUTE')")
report "place_order not executable by any application/sandbox role" "0" "$INV"

PUBX=$(q "
  select count(*) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace, aclexplode(p.proacl) a
  where n.nspname='public' and p.proname='place_order' and a.grantee=0 and a.privilege_type='EXECUTE'")
report "place_order carries no PUBLIC EXECUTE" "0" "$PUBX"

NEUT=$(q "
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='place_order'
    and p.prosrc not like '%permanently disabled%'")
report "place_order body is fail-closed (neutralised)" "0" "$NEUT"

echo "place_order signature inventory:"
q "select '  - '||p.oid::regprocedure::text||'  acl='||coalesce(p.proacl::text,'NULL')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='place_order'"

# --- 2. Anonymous EXECUTE only for routines allowlisted with the anon role ---
python3 - "$ALLOWLIST" <<'PY' > /tmp/acl_gate_allow_anon.txt
import json,sys
d=json.load(open(sys.argv[1]))
for r in d["routines"]:
    if "anon" in r.get("roles", []):
        print(r["signature"])
PY
q "select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE')
   order by 1" > /tmp/acl_gate_anon_current.txt
ANON=$(comm -13 <(sort -u /tmp/acl_gate_allow_anon.txt) <(sort -u /tmp/acl_gate_anon_current.txt) | tee /tmp/acl_gate_anon_unapproved.txt | wc -l | tr -d ' ')
report "no public routine executable by anon outside the approved allowlist" "0" "$ANON"
[[ "$ANON" != "0" ]] && sed 's/^/  UNAPPROVED-ANON: /' /tmp/acl_gate_anon_unapproved.txt


# --- 3. Trigger/guard routines are never directly executable ----------------
TRG=$(q "select count(*) from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace
         join pg_type t on t.oid=p.prorettype,
         lateral (values ('anon'),('authenticated'),('service_role')) rl(r)
         where n.nspname='public' and t.typname='trigger'
           and has_function_privilege(rl.r, p.oid, 'EXECUTE')")
report "trigger/guard routines not executable by application roles" "0" "$TRG"

# --- 4. Allowlist: deny-by-default for non-trigger routines -----------------
python3 - "$ALLOWLIST" <<'PY' > /tmp/acl_gate_allow.txt
import json,sys
d=json.load(open(sys.argv[1]))
for r in d["routines"]:
    print(r["signature"])
PY
q "select p.oid::regprocedure::text
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   join pg_type t on t.oid=p.prorettype
   where n.nspname='public' and t.typname<>'trigger'
     and (has_function_privilege('authenticated',p.oid,'EXECUTE')
       or has_function_privilege('service_role',p.oid,'EXECUTE'))
   order by 1" > /tmp/acl_gate_current.txt
UNAPPROVED=$(comm -13 <(sort -u /tmp/acl_gate_allow.txt) <(sort -u /tmp/acl_gate_current.txt) | tee /tmp/acl_gate_unapproved.txt | wc -l | tr -d ' ')
report "no routine executable by app roles outside the approved allowlist" "0" "$UNAPPROVED"
[[ "$UNAPPROVED" != "0" ]] && sed 's/^/  UNAPPROVED: /' /tmp/acl_gate_unapproved.txt

# --- 5. Protected tables stay owner-only ------------------------------------
TBL=$(q "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace,
  lateral (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
  lateral (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
  where n.nspname='public' and c.relname in (
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications',
    'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
    'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins',
    'shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules',
    'delivery_promise_profiles','delivery_promise_weekly_schedules',
    'merchant_store_sku_delivery_promise_assignments',
    'shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
    'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
    'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars',
    'shipping_rate_lane_transit_profile_bindings',
    'customer_delivery_destinations','customer_delivery_destination_versions',
    'manual_shipping_quote_requests','manual_shipping_quote_request_items',
    'manual_shipping_quote_request_packages',
    'manual_shipping_quote_offers','manual_shipping_quote_offer_conditions')


    and has_table_privilege(rl.r, c.oid, pv.p)")
report "protected tax/pricing/publication/shipping tables owner-only" "0" "$TBL"

# --- 6. Deny-by-default proved at runtime -----------------------------------
# The gate role deliberately has NO read access to the protected tables, so row
# counts cannot (and must not) be read here. Business-row invariants
# (tax 4/9/5, shipping 0/0/0/0) are asserted fail-closed inside every migration.
DENIED=0
for t in tax_categories tax_rate_bands tax_rate_versions merchant_fulfillment_origins \
         shipping_rate_cards shipping_rate_lanes shipping_rate_rules \
         delivery_promise_profiles delivery_promise_weekly_schedules; do
  if psql -At -c "select count(*) from public.$t" >/dev/null 2>&1; then
    echo "  gate role can still read public.$t"; DENIED=$((DENIED+1))
  fi
done
report "gate role is denied read on protected tables (runtime deny proof)" "0" "$DENIED"

# --- 6b. M1C-1C guard functions must never be app-executable and never proacl NULL
M1C=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname like 'm1c1c_guard_%'
           and (p.proacl is null
             or has_function_privilege('anon',p.oid,'EXECUTE')
             or has_function_privilege('authenticated',p.oid,'EXECUTE')
             or has_function_privilege('service_role',p.oid,'EXECUTE'))")
report "M1C-1C guard functions locked (no app EXECUTE, no NULL proacl)" "0" "$M1C"

# --- 6b2. M1C-1D-B delivery promise guard functions (BOR-DEC-075..077) -------
M1DB=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'm1c1db_guard_%'
            and (p.proacl is null
              or has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              or has_function_privilege('service_role',p.oid,'EXECUTE')
              or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1C-1D-B guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$M1DB"

M1DBN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1c1db_guard_%'")
report "M1C-1D-B guard function inventory complete" "4" "$M1DBN"

# No temporary verification routine may survive a deployment.
TMPFN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like '%_tmp_tests'")
report "no temporary verification routine left in public" "0" "$TMPFN"

# --- 6c. R-T22: no sequences introduced by the shipping rate-card scope -------
SEQ=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='S' and c.relname like 'shipping_rate%'")
report "no new sequences in the shipping rate-card scope (R-T22)" "0" "$SEQ"

# --- 6d. R-T22: no sequences introduced by the delivery promise scope --------
SEQD=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='S' and c.relname like 'delivery_promise%'")
report "no new sequences in the delivery promise scope (R-T22)" "0" "$SEQD"

# --- 6e. Delivery promise tables: RLS enabled + forced, zero policies --------
DPRLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public'
             and c.relname in ('delivery_promise_profiles','delivery_promise_weekly_schedules')
             and c.relrowsecurity and c.relforcerowsecurity")
report "delivery promise tables have RLS enabled and forced" "2" "$DPRLS"

DPPOL=$(q "select count(*) from pg_policies
           where schemaname='public'
             and tablename in ('delivery_promise_profiles','delivery_promise_weekly_schedules')")
report "delivery promise tables carry zero policies" "0" "$DPPOL"

# --- 6f. M1C-1D-C assignment guard functions (BOR-DEC-078..081) --------------
M1DC=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'm1c1dc_guard_%'
            and (p.proacl is null
              or has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              or has_function_privilege('service_role',p.oid,'EXECUTE')
              or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1C-1D-C guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$M1DC"

M1DCN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1c1dc_guard_%'")
report "M1C-1D-C guard function inventory complete" "4" "$M1DCN"

# --- 6g. Assignment table: RLS enabled + forced, zero policies ---------------
DPARLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public'
              and c.relname='merchant_store_sku_delivery_promise_assignments'
              and c.relrowsecurity and c.relforcerowsecurity")
report "delivery promise assignment table has RLS enabled and forced" "1" "$DPARLS"

DPAPOL=$(q "select count(*) from pg_policies where schemaname='public'
            and tablename='merchant_store_sku_delivery_promise_assignments'")
report "delivery promise assignment table carries zero policies" "0" "$DPAPOL"

# --- 6h. R-T22: no sequences in the assignment scope -------------------------
SEQA=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='S'
            and c.relname like '%delivery_promise_assignment%'")
report "no new sequences in the delivery promise assignment scope (R-T22)" "0" "$SEQA"

# --- 6i. Runtime deny proof for the assignment table -------------------------
if psql -At -c "select count(*) from public.merchant_store_sku_delivery_promise_assignments" >/dev/null 2>&1; then
  DENIEDA=1
else
  DENIEDA=0
fi
report "gate role is denied read on the assignment table (runtime deny proof)" "0" "$DENIEDA"

# --- 6j. Forbidden out-of-scope objects (quotes / defaults / listing / ETA) ---
FORB=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r'
            and (c.relname like '%manual_quote%'
              or c.relname like '%delivery_promise_default%'
              or c.relname like '%listing_delivery_promise%'
              or c.relname like '%eta_%' or c.relname like '%delivery_booking%')")
report "no manual-quote/default/listing/ETA-booking objects exist" "0" "$FORB"

# --- 6k. M1C-1D-D transit/calendar guard functions (BOR-DEC-082..085) --------
M1DD=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'm1c1dd_guard_%'
            and (p.proacl is null
              or has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              or has_function_privilege('service_role',p.oid,'EXECUTE')
              or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1C-1D-D guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$M1DD"

M1DDN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1c1dd_guard_%'")
report "M1C-1D-D guard function inventory complete" "9" "$M1DDN"

# --- 6l. Transit/calendar tables: RLS enabled + forced, zero policies --------
TCRLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relrowsecurity and c.relforcerowsecurity
             and c.relname in ('shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
                               'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
                               'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars')")
report "transit/calendar tables have RLS enabled and forced" "6" "$TCRLS"

TCPOL=$(q "select count(*) from pg_policies where schemaname='public'
           and tablename in ('shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
                             'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
                             'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars')")
report "transit/calendar tables carry zero policies" "0" "$TCPOL"

# --- 6m. R-T22: no sequences in the transit/calendar scope -------------------
SEQT=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='S'
            and (c.relname like 'shipping_transit%' or c.relname like 'shipping_calendar%')")
report "no new sequences in the transit/calendar scope (R-T22)" "0" "$SEQT"

# --- 6n. Runtime deny proof for the transit/calendar tables ------------------
DENIEDT=0
for t in shipping_transit_time_profiles shipping_transit_time_weekday_rules \
         shipping_transit_delivery_weekdays shipping_calendar_profiles \
         shipping_calendar_blackout_dates shipping_transit_time_profile_calendars; do
  if psql -At -c "select count(*) from public.$t" >/dev/null 2>&1; then
    echo "  gate role can still read public.$t"; DENIEDT=$((DENIEDT+1))
  fi
done
report "gate role is denied read on transit/calendar tables (runtime deny proof)" "0" "$DENIEDT"





# --- 6o. M1C-1D-F rate-lane/transit binding guards (BOR-DEC-091..094) --------
M1DF=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'm1c1df_guard_%'
            and (p.proacl is null
              or has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              or has_function_privilege('service_role',p.oid,'EXECUTE')
              or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1C-1D-F guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$M1DF"

M1DFN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1c1df_guard_%'")
report "M1C-1D-F guard function inventory complete" "4" "$M1DFN"

BRLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='shipping_rate_lane_transit_profile_bindings'
            and c.relrowsecurity and c.relforcerowsecurity")
report "rate-transit binding table has RLS enabled and forced" "1" "$BRLS"

BPOL=$(q "select count(*) from pg_policies where schemaname='public'
          and tablename='shipping_rate_lane_transit_profile_bindings'")
report "rate-transit binding table carries zero policies" "0" "$BPOL"

SEQB=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='S' and c.relname like '%rate_lane_transit%'")
report "no new sequences in the rate-transit binding scope (R-T22)" "0" "$SEQB"

if psql -At -c "select count(*) from public.shipping_rate_lane_transit_profile_bindings" >/dev/null 2>&1; then
  DENIEDB=1
else
  DENIEDB=0
fi
report "gate role is denied read on the rate-transit binding table (runtime deny proof)" "0" "$DENIEDB"


# --- 6p. M1C-1D-G private internal ETA resolver (BOR-DEC-095..099) -----------
ISU=$(q "select count(*) from (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
         where has_schema_privilege(rl.r,'internal_shipping','USAGE')
            or has_schema_privilege(rl.r,'internal_shipping','CREATE')")
report "internal_shipping schema has no USAGE/CREATE for app or sandbox roles" "0" "$ISU"

ISO=$(q "select count(*) from pg_namespace where nspname='internal_shipping' and nspowner<>'postgres'::regrole")
report "internal_shipping schema is owned by the database owner" "0" "$ISO"

ISF=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
         lateral (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
         where n.nspname='internal_shipping' and (p.proacl is null or has_function_privilege(rl.r,p.oid,'EXECUTE'))")
report "internal resolver functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$ISF"

ISN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='internal_shipping' and p.proname='resolve_final_eta'")
report "internal resolver inventory complete" "1" "$ISN"

ISR=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='internal_shipping' and c.relkind in ('r','p','S','v','m')")
report "internal_shipping holds no tables, sequences or views" "0" "$ISR"

if psql -At -c "select 1 from internal_shipping.resolve_final_eta(null,null,now()) limit 1" >/dev/null 2>&1; then
  DENIEDG=1
else
  DENIEDG=0
fi
report "gate role is denied execution of the internal resolver (runtime deny proof)" "0" "$DENIEDG"

# --- 6q. M1C-1E-B delivery destination foundation (BOR-DEC-106..111) ---------
M1EB=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'm1c1eb_guard_%'
            and (p.proacl is null
              or has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              or has_function_privilege('service_role',p.oid,'EXECUTE')
              or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1C-1E-B guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$M1EB"

M1EBN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1c1eb_guard_%'")
report "M1C-1E-B guard function inventory complete" "3" "$M1EBN"

DDRLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relrowsecurity and c.relforcerowsecurity
             and c.relname in ('customer_delivery_destinations','customer_delivery_destination_versions')")
report "delivery destination tables have RLS enabled and forced" "2" "$DDRLS"

DDPOL=$(q "select count(*) from pg_policies where schemaname='public'
           and tablename in ('customer_delivery_destinations','customer_delivery_destination_versions')")
report "delivery destination tables carry zero policies" "0" "$DDPOL"

SEQDD=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='S' and c.relname like '%delivery_destination%'")
report "no new sequences in the delivery destination scope (R-T22)" "0" "$SEQDD"

DENIEDD=0
for t in customer_delivery_destinations customer_delivery_destination_versions; do
  if psql -At -c "select count(*) from public.$t" >/dev/null 2>&1; then
    echo "  gate role can still read public.$t"; DENIEDD=$((DENIEDD+1))
  fi
done
report "gate role is denied read on delivery destination tables (runtime deny proof)" "0" "$DENIEDD"

DDJSON=$(q "select count(*) from information_schema.columns
            where table_schema='public' and table_name like '%delivery_destination%'
              and (data_type='jsonb' or column_name ~* '(email|phone|recipient|note|instruction|lat|lon|geo|shipment_form)')")
report "delivery destination tables carry no JSONB/contact/geo/shipment-form columns" "0" "$DDJSON"

DDVIEW=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind in ('v','m') and c.relname like '%delivery_destination%'")
report "no delivery destination views exist" "0" "$DDVIEW"

# --- 6r. M1C-1E-C manual shipping quote request foundation (BOR-DEC-112..117) -
M1EC=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname like 'm1c1e%_guard_%'
            and (p.proacl is null
              or has_function_privilege('anon',p.oid,'EXECUTE')
              or has_function_privilege('authenticated',p.oid,'EXECUTE')
              or has_function_privilege('service_role',p.oid,'EXECUTE')
              or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1C-1E-C guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" "$M1EC"

M1ECN=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1c1e%_guard_%'")
# 18 post-R1 guards + m1c1ee_guard_family_lock authorised by M1C-1E-E-R3 (W1 serialization).
report "M1C-1E-C/D/E guard function inventory complete (post-R3)" "19" "$M1ECN"


MQN=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'manual_shipping_quote%'")
report "manual quote scope holds exactly seven tables (post-R1)" "7" "$MQN"

MQRLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind in ('r','p')
             and c.relname like 'manual_shipping_quote%'
             and c.relrowsecurity and c.relforcerowsecurity")
report "manual quote tables have RLS enabled and forced" "7" "$MQRLS"

MQPOL=$(q "select count(*) from pg_policies where schemaname='public'
           and tablename like 'manual_shipping_quote%'")
report "manual quote tables carry zero policies" "0" "$MQPOL"

SEQMQ=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='S' and c.relname like '%quote_request%'")
report "no new sequences in the manual quote scope (R-T22)" "0" "$SEQMQ"

MQFORB=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public'
              and (c.relname ~ 'quote_(acceptance_condition|message|checkout|payment|order)'
                or (c.relkind in ('v','m') and c.relname like '%quote%'))")
report "no quote messaging/checkout/payment/order objects and no quote views" "0" "$MQFORB"

# M1C-1E-E authorises exactly one commercial charge column and one acceptance
# snapshot charge column; no other price/tax/contact/address column is allowed.
MQCOL=$(q "select count(*) from information_schema.columns
           where table_schema='public' and table_name like 'manual_shipping_quote%'
             and column_name not in ('customer_shipping_charge_minor','accepted_shipping_charge_minor')
             and (data_type='jsonb'
               or column_name ~* '(email|phone|recipient|note|instruction|street|house|door|price|amount|charge|tax)')")
report "manual quote tables carry no JSONB/contact/address/unauthorised price columns" "0" "$MQCOL"

DENIEDQ=0
for t in manual_shipping_quote_requests manual_shipping_quote_request_items \
         manual_shipping_quote_request_packages manual_shipping_quote_offers \
         manual_shipping_quote_offer_conditions manual_shipping_quote_acceptances \
         manual_shipping_quote_state_events; do

  if psql -At -c "select count(*) from public.$t" >/dev/null 2>&1; then
    echo "  gate role can still read public.$t"; DENIEDQ=$((DENIEDQ+1))
  fi
done
report "gate role is denied read on manual quote tables (runtime deny proof)" "0" "$DENIEDQ"

# --- 6z. M1V-1D seller application workflow (BOR-DEC-142..146) ---------------
SARLS=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public'
             and c.relname in ('seller_applications','seller_application_events')
             and c.relrowsecurity and c.relforcerowsecurity")
report "M1V-1D application tables have RLS enabled and forced" "2" "$SARLS"

SAPOL=$(q "select count(*) from pg_policies where schemaname='public'
           and tablename in ('seller_applications','seller_application_events')")
report "M1V-1D application tables carry zero policies" "0" "$SAPOL"

SATBL=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace,
           lateral (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
           lateral (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) pv(p)
           where n.nspname='public'
             and c.relname in ('seller_applications','seller_application_events')
             and has_table_privilege(rl.r, c.oid, pv.p)")
report "M1V-1D application tables owner-only (RPC-only access)" "0" "$SATBL"

SAGRD=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'm1v1d_%'
             and (p.proacl is null
               or has_function_privilege('anon',p.oid,'EXECUTE')
               or has_function_privilege('authenticated',p.oid,'EXECUTE')
               or has_function_privilege('service_role',p.oid,'EXECUTE')
               or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")
report "M1V-1D internal/guard routines locked (no app EXECUTE, no NULL proacl)" "0" "$SAGRD"

DENIEDA2=0
for t in seller_applications seller_application_events; do
  if psql -At -c "select count(*) from public.$t" >/dev/null 2>&1; then
    echo "  gate role can still read public.$t"; DENIEDA2=$((DENIEDA2+1))
  fi
done
report "gate role is denied read on M1V-1D tables (runtime deny proof)" "0" "$DENIEDA2"


# --- 7. Deliberate failure-path proof ---------------------------------------
if [[ "${ACL_GATE_SIMULATE_FAILURE:-0}" == "1" ]]; then
  report "SIMULATED violation (failure-path proof)" "0" "1"
fi

echo
if [[ "$FAIL" == "0" ]]; then
  echo "ACL GATE: PASS"
else
  echo "ACL GATE: FAIL — deployment must not be considered successful."
  echo "Forward-fix only: add an explicit ACL normalization section to a new migration."
fi
exit "$FAIL"
