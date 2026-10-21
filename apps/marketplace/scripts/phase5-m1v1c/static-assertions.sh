#!/usr/bin/env bash
# M1V-1C — static/catalog assertions (read-only, no writes).
set -Eeuo pipefail
FAIL=0
q() { psql -At -c "$1"; }
report() { if [[ "$2" == "$3" ]]; then echo "PASS: $1 ($3)"; else echo "FAIL: $1 (expected $2, got $3)"; FAIL=1; fi }

echo "== M1V-1C STATIC ASSERTIONS =="

SCOPE="'company_legal_identities','company_legal_identifiers','merchant_store_public_profiles','merchant_store_public_profile_categories','merchant_store_public_profile_shipping_countries','seller_verification_events'"

report "scope holds exactly six tables" "6" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ($SCOPE)")"

report "all scope tables have RLS enabled and forced" "6" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ($SCOPE) and c.relrowsecurity and c.relforcerowsecurity")"

report "scope tables carry zero policies" "0" \
  "$(q "select count(*) from pg_policies where schemaname='public' and tablename in ($SCOPE)")"

report "scope tables carry zero application/sandbox privileges" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace,
        lateral (values ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
        lateral (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) pv(p)
        where n.nspname='public' and c.relkind='r' and c.relname in ($SCOPE)
          and has_table_privilege(rl.r, c.oid, pv.p)")"

report "no new sequences in the M1V-1C scope (R-T22)" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='S'
          and (c.relname like 'company_legal%' or c.relname like 'merchant_store_public%'
               or c.relname like 'seller_verification%')")"

report "no views expose the M1V-1C scope" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('v','m')
          and (c.relname like 'company_legal%' or c.relname like 'merchant_store_public%'
               or c.relname like 'seller_verification%')")"

report "M1V-1C guard functions locked (no app/sandbox EXECUTE, no NULL proacl)" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'm1v1c_guard_%'
          and (p.proacl is null
            or has_function_privilege('anon',p.oid,'EXECUTE')
            or has_function_privilege('authenticated',p.oid,'EXECUTE')
            or has_function_privilege('service_role',p.oid,'EXECUTE')
            or has_function_privilege('sandbox_exec',p.oid,'EXECUTE'))")"

report "M1V-1C guard function inventory complete" "4" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'm1v1c_guard_%'")"

report "global duplicate identifier index present (kvk/vat across companies)" "1" \
  "$(q "select count(*) from pg_indexes where schemaname='public'
        and indexname='company_legal_identifiers_global_active_uk'")"

report "per-company single active identifier index present" "1" \
  "$(q "select count(*) from pg_indexes where schemaname='public'
        and indexname='company_legal_identifiers_company_type_active_uk'")"

report "store public slug is globally unique" "1" \
  "$(q "select count(*) from pg_indexes where schemaname='public'
        and indexname='merchant_store_public_profiles_slug_uk'")"

report "no KvK/VAT columns leaked onto merchant_stores" "0" \
  "$(q "select count(*) from information_schema.columns where table_schema='public'
        and table_name='merchant_stores'
        and (column_name ilike '%kvk%' or column_name ilike '%vat%' or column_name ilike '%chamber%')")"

# Seller-facing RPC surface: authenticated EXECUTE only, never anon (except the public read).
report "seller RPCs are authenticated-only (no anon/service_role/sandbox EXECUTE)" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
        lateral (values ('anon'),('service_role'),('sandbox_exec')) rl(r)
        where n.nspname='public' and p.proname in
          ('seller_get_legal_identity','seller_upsert_legal_identity','seller_upsert_legal_identifier',
           'seller_submit_legal_identity','seller_get_store_public_profile','seller_upsert_store_public_profile')
          and has_function_privilege(rl.r,p.oid,'EXECUTE')")"

report "seller RPC surface complete and authenticated-executable" "6" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in
          ('seller_get_legal_identity','seller_upsert_legal_identity','seller_upsert_legal_identifier',
           'seller_submit_legal_identity','seller_get_store_public_profile','seller_upsert_store_public_profile')
          and has_function_privilege('authenticated',p.oid,'EXECUTE')")"

report "no admin approve/publish RPC exists in this phase (R-D7 hold)" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and (p.proname like 'admin_%verif%' or p.proname like 'admin_%approve%'
          or p.proname like '%publish_store%' or p.proname like 'admin_%suspend%')")"

report "no self-approval path: every RPC writing verification fields is absent" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'seller_%'
          and (p.prosrc like '%verified_by%' and p.prosrc like '%UPDATE public.company_legal_identities%'
               and p.prosrc like '%verification_status = ''approved''%')")"

report "public storefront RPC is anon-executable" "1" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='public_get_store_profile'
          and has_function_privilege('anon',p.oid,'EXECUTE')")"

report "public storefront RPC filters on published + approved" "1" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='public_get_store_profile'
          and p.prosrc like '%visibility_status = ''published''%'
          and p.prosrc like '%verification_status = ''approved''%'")"

report "public storefront RPC exposes no private contact identifiers" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='public_get_store_profile'
          and (p.prosrc like '%business_email%' or p.prosrc like '%business_phone%'
               or p.prosrc like '%support_email%' or p.prosrc like '%support_phone%'
               or p.prosrc like '%address_line%' or p.prosrc like '%normalized_value%')")"

report "audit events are append-only (immutability trigger present)" "1" \
  "$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
        where c.relname='seller_verification_events' and not t.tgisinternal
          and t.tgname='m1v1c_verification_event_immutable'")"

report "no follower/notification tables created in this phase" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r'
          and (c.relname like '%follow%' or c.relname like '%store_notification%')")"

report "no temporary verification routine left in public" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like '%_tmp_tests'")"

echo
if [[ $FAIL -eq 0 ]]; then echo "M1V-1C STATIC ASSERTIONS: PASS"; else echo "M1V-1C STATIC ASSERTIONS: FAIL"; exit 1; fi
