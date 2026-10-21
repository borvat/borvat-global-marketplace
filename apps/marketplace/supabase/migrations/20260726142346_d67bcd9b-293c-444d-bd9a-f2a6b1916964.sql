-- =====================================================================
-- PHASE 5 — M1C-1D-B VERIFICATION HARNESS (fail-loud, self-rolling-back)
-- Creates a temporary owner-side test routine, executes it inside a
-- subtransaction that is force-rolled back, then drops the routine.
-- Zero residual objects, zero residual rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. FORWARD-FIX ACL NORMALIZATION (drift Mechanism A, R-T21)
--    The platform re-granted EXECUTE on the permanently disabled
--    place_order() to sandbox_exec after the M1C-1D-B schema migration.
--    Re-assert P5-HF-001 before any verification runs.
-- ---------------------------------------------------------------------
DO $norm$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    END IF;
  END LOOP;
END
$norm$;

CREATE OR REPLACE FUNCTION public.m1c1db_tmp_tests()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $tests$
DECLARE
  n        int := 0;
  fails    int := 0;
  log      text := '';
  ok       boolean;
  v        int;
  c1       uuid;
  c2       uuid;
  s1       uuid;
  s2       uuid;
  u1       uuid;
  pA1      uuid := gen_random_uuid();
  pA2      uuid := gen_random_uuid();
  pB5      uuid := gen_random_uuid();
  pB3      uuid := gen_random_uuid();
  pP1      uuid := gen_random_uuid();
  d        int;

  PROCEDURE_PLACEHOLDER int := 0;
BEGIN
  ---------------------------------------------------------------- helpers
  -- structural assertions ------------------------------------------------

  -- T1 both tables exist
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND c.relkind='r'
     AND c.relname IN ('delivery_promise_profiles','delivery_promise_weekly_schedules');
  IF v <> 2 THEN fails := fails+1; log := log||' T1'; END IF;

  -- T2 RLS enabled on both
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public'
     AND c.relname IN ('delivery_promise_profiles','delivery_promise_weekly_schedules')
     AND c.relrowsecurity;
  IF v <> 2 THEN fails := fails+1; log := log||' T2'; END IF;

  -- T3 FORCE RLS on both
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public'
     AND c.relname IN ('delivery_promise_profiles','delivery_promise_weekly_schedules')
     AND c.relforcerowsecurity;
  IF v <> 2 THEN fails := fails+1; log := log||' T3'; END IF;

  -- T4 zero policies
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_policies
   WHERE schemaname='public'
     AND tablename IN ('delivery_promise_profiles','delivery_promise_weekly_schedules');
  IF v <> 0 THEN fails := fails+1; log := log||' T4'; END IF;

  -- T5 zero application/sandbox table privileges
  n := n + 1;
  SELECT count(*) INTO v
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
    LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
   WHERE ns.nspname='public'
     AND c.relname IN ('delivery_promise_profiles','delivery_promise_weekly_schedules')
     AND pg_catalog.has_table_privilege(rl.r, c.oid, pv.p);
  IF v <> 0 THEN fails := fails+1; log := log||' T5'; END IF;

  -- T6 no PUBLIC privileges on the two tables
  n := n + 1;
  SELECT count(*) INTO v
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace,
    LATERAL pg_catalog.aclexplode(c.relacl) a
   WHERE ns.nspname='public'
     AND c.relname IN ('delivery_promise_profiles','delivery_promise_weekly_schedules')
     AND a.grantee = 0;
  IF v <> 0 THEN fails := fails+1; log := log||' T6'; END IF;

  -- T7 four new guard functions, none with proacl NULL
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname LIKE 'm1c1db_guard_%' AND p.proacl IS NULL;
  IF v <> 0 THEN fails := fails+1; log := log||' T7'; END IF;

  -- T8 no application EXECUTE on the guard functions
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
   WHERE ns.nspname='public' AND p.proname LIKE 'm1c1db_guard_%'
     AND pg_catalog.has_function_privilege(rl.r, p.oid, 'EXECUTE');
  IF v <> 0 THEN fails := fails+1; log := log||' T8'; END IF;

  -- T9 R-T22: no sequences in scope
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relkind='S' AND c.relname LIKE 'delivery_promise%';
  IF v <> 0 THEN fails := fails+1; log := log||' T9'; END IF;

  -- T10 place_order fail-closed body
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='place_order'
     AND p.prosrc NOT LIKE '%permanently disabled%';
  IF v <> 0 THEN fails := fails+1; log := log||' T10'; END IF;

  -- T11 place_order not executable by any non-owner role
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
   WHERE ns.nspname='public' AND p.proname='place_order'
     AND pg_catalog.has_function_privilege(rl.r, p.oid, 'EXECUTE');
  IF v <> 0 THEN fails := fails+1; log := log||' T11'; END IF;

  -- T12 no assignment / transit / resolver / quote objects were created
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relkind='r'
     AND (c.relname LIKE '%transit%' OR c.relname LIKE '%blackout%'
       OR c.relname LIKE '%promise_assignment%' OR c.relname LIKE '%shipping_quote%'
       OR c.relname LIKE '%delivery_slot%' OR c.relname LIKE '%booking%'
       OR c.relname LIKE '%capacity%');
  IF v <> 0 THEN fails := fails+1; log := log||' T12'; END IF;

  -- T13 no ETA resolver routine
  n := n + 1;
  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND (p.proname LIKE '%resolve_eta%' OR p.proname LIKE '%delivery_promise_resolve%'
       OR p.proname LIKE '%quote_shipping%');
  IF v <> 0 THEN fails := fails+1; log := log||' T13'; END IF;

  ---------------------------------------------------------------- fixtures
  SELECT id INTO u1 FROM auth.users ORDER BY created_at LIMIT 1;

  INSERT INTO public.companies (name, slug, owner_user_id)
  VALUES ('M1C1DB Test Co A','m1c1db-test-co-a', u1) RETURNING id INTO c1;
  INSERT INTO public.companies (name, slug, owner_user_id)
  VALUES ('M1C1DB Test Co B','m1c1db-test-co-b', u1) RETURNING id INTO c2;

  INSERT INTO public.merchant_stores (company_id, slug, display_name)
  VALUES (c1,'m1c1db-store-a','M1C1DB Store A') RETURNING id INTO s1;
  INSERT INTO public.merchant_stores (company_id, slug, display_name)
  VALUES (c2,'m1c1db-store-b','M1C1DB Store B') RETURNING id INTO s2;

  ---------------------------------------------------------------- behaviour

  -- T14 merchant scope without company/store REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('merchant_store','bad-scope',1,'x','Europe/Amsterdam',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T14'; END IF;

  -- T15 platform scope WITH company/store REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('platform', c1, s1, 'bad-platform',1,'x','Europe/Amsterdam',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T15'; END IF;

  -- T16 cross-company store REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('merchant_store', c1, s2, 'cross-tenant',1,'x','Europe/Amsterdam',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T16'; END IF;

  -- T17 invalid scope_type REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('warehouse','bad-enum',1,'x','Europe/Amsterdam',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T17'; END IF;

  -- T18 invalid status REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days, status)
    VALUES ('platform','bad-status',1,'x','Europe/Amsterdam',1,'published');
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T18'; END IF;

  -- T19 version_number 0 REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('platform','bad-version',0,'x','Europe/Amsterdam',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T19'; END IF;

  -- T20 negative handling days REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('platform','bad-handling',1,'x','Europe/Amsterdam',-1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T20'; END IF;

  -- T21 non-IANA timezone REJECTED (abbreviation)
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('platform','bad-tz-abbr',1,'x','CET',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T21'; END IF;

  -- T22 fake IANA-shaped timezone REJECTED by the catalog check
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('platform','bad-tz-fake',1,'Europe/Atlantis',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T22'; END IF;

  -- T23 UTC offset string REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES ('platform','bad-tz-offset',1,'x','UTC+1',1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T23'; END IF;

  -- T24 valid merchant-store profile ACCEPTED (family A, v1, draft)
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (id, scope_type, company_id, merchant_store_id, profile_code, version_number,
       display_name, timezone_name, handling_business_days)
    VALUES (pA1,'merchant_store', c1, s1, 'standard-nl', 1,
            'Standard NL', 'Europe/Amsterdam', 1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF NOT ok THEN fails := fails+1; log := log||' T24'; END IF;

  -- T25 valid platform profile ACCEPTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (id, scope_type, profile_code, version_number, display_name, timezone_name, handling_business_days)
    VALUES (pP1,'platform','platform-standard',1,'Platform Standard','Europe/Berlin',2);
  EXCEPTION WHEN others THEN ok := false; END;
  IF NOT ok THEN fails := fails+1; log := log||' T25'; END IF;

  -- T26 duplicate version in the same family REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, company_id, merchant_store_id, profile_code, version_number,
       display_name, timezone_name, handling_business_days)
    VALUES ('merchant_store', c1, s1, 'standard-nl', 1, 'dup', 'Europe/Amsterdam', 1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T26'; END IF;

  -- T27 supersedes a DIFFERENT profile_code family REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, company_id, merchant_store_id, profile_code, version_number,
       display_name, timezone_name, handling_business_days, supersedes_profile_id)
    VALUES ('merchant_store', c1, s1, 'express-nl', 2, 'x', 'Europe/Amsterdam', 1, pA1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T27'; END IF;

  -- T28 supersedes ACROSS tenants REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, company_id, merchant_store_id, profile_code, version_number,
       display_name, timezone_name, handling_business_days, supersedes_profile_id)
    VALUES ('merchant_store', c2, s2, 'standard-nl', 2, 'x', 'Europe/Amsterdam', 1, pA1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T28'; END IF;

  -- T29 supersedes with a NON-higher version REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_profiles
      (scope_type, company_id, merchant_store_id, profile_code, version_number,
       display_name, timezone_name, handling_business_days, supersedes_profile_id)
    VALUES ('merchant_store', c1, s1, 'standard-nl', 1, 'x', 'Europe/Amsterdam', 1, pA1);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T29'; END IF;

  -- T30 weekday 0 REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pA1, 0, true, '16:00');
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T30'; END IF;

  -- T31 weekday 8 REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pA1, 8, true, '16:00');
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T31'; END IF;

  -- T32 accepts_orders TRUE without cut-off REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pA1, 1, true, NULL);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T32'; END IF;

  -- T33 closed day WITH cut-off REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pA1, 1, false, '16:00');
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T33'; END IF;

  -- T34 handover TRUE while accepts_orders FALSE ACCEPTED (weekday 7)
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time, handover_enabled)
    VALUES (pA1, 7, false, NULL, true);
  EXCEPTION WHEN others THEN ok := false; END;
  IF NOT ok THEN fails := fails+1; log := log||' T34'; END IF;

  -- T35 duplicate weekday within the same profile REJECTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pA1, 7, false, NULL);
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T35'; END IF;

  -- T36 same weekday in ANOTHER profile ACCEPTED
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pP1, 7, true, '12:00');
  EXCEPTION WHEN others THEN ok := false; END;
  IF NOT ok THEN fails := fails+1; log := log||' T36'; END IF;

  -- T37 draft profile with an INCOMPLETE schedule is allowed to exist
  n := n+1;
  SELECT count(*) INTO v FROM public.delivery_promise_weekly_schedules w
   WHERE w.delivery_promise_profile_id = pA1;
  IF v <> 1 THEN fails := fails+1; log := log||' T37'; END IF;

  -- T38 activation WITHOUT seven days REJECTED
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET status='active' WHERE id = pA1;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T38'; END IF;

  -- complete the schedule for family A v1 (Mon..Sat open, Sun already closed)
  FOR d IN 1..6 LOOP
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time, handover_enabled)
    VALUES (pA1, d, true, '16:00', d <= 5);
  END LOOP;

  -- T39 activation WITH a complete, consistent seven-day schedule ACCEPTED
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET status='active' WHERE id = pA1;
  EXCEPTION WHEN others THEN ok := false; END;
  IF NOT ok THEN fails := fails+1; log := log||' T39'; END IF;

  -- T40 active profile is immutable (timezone change REJECTED)
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET timezone_name='Europe/Berlin' WHERE id = pA1;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T40'; END IF;

  -- T41 active profile handling days immutable
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET handling_business_days=5 WHERE id = pA1;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T41'; END IF;

  -- T42 active profile status change REJECTED (no activation workflow exists)
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET status='inactive' WHERE id = pA1;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T42'; END IF;

  -- T43 weekly rows of an active profile are immutable (UPDATE REJECTED)
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_weekly_schedules
       SET order_cutoff_local_time='18:00'
     WHERE delivery_promise_profile_id = pA1 AND weekday_iso = 1;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T43'; END IF;

  -- T44 weekly rows of an active profile cannot be DELETED
  n := n+1; ok := true;
  BEGIN
    DELETE FROM public.delivery_promise_weekly_schedules
     WHERE delivery_promise_profile_id = pA1 AND weekday_iso = 2;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T44'; END IF;

  -- T45 weekly rows cannot be ADDED to an active profile
  n := n+1; ok := true;
  BEGIN
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pA1, 3, true, '09:00');
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T45'; END IF;

  -- family A v2: draft with a complete schedule
  INSERT INTO public.delivery_promise_profiles
    (id, scope_type, company_id, merchant_store_id, profile_code, version_number,
     display_name, timezone_name, handling_business_days, supersedes_profile_id)
  VALUES (pA2,'merchant_store', c1, s1, 'standard-nl', 2,
          'Standard NL v2','Europe/Amsterdam', 0, pA1);
  FOR d IN 1..7 LOOP
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time, handover_enabled)
    VALUES (pA2, d, true, '15:00', true);
  END LOOP;

  -- T46 a SECOND active version in the same family is REJECTED
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET status='active' WHERE id = pA2;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T46'; END IF;

  -- family B: activate version 5, then attempt to activate a lower version 3
  INSERT INTO public.delivery_promise_profiles
    (id, scope_type, company_id, merchant_store_id, profile_code, version_number,
     display_name, timezone_name, handling_business_days)
  VALUES (pB5,'merchant_store', c1, s1, 'express-nl', 5,'Express v5','Europe/Amsterdam', 0);
  FOR d IN 1..7 LOOP
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pB5, d, true, '17:00');
  END LOOP;
  UPDATE public.delivery_promise_profiles SET status='active' WHERE id = pB5;

  INSERT INTO public.delivery_promise_profiles
    (id, scope_type, company_id, merchant_store_id, profile_code, version_number,
     display_name, timezone_name, handling_business_days)
  VALUES (pB3,'merchant_store', c1, s1, 'express-nl', 3,'Express v3','Europe/Amsterdam', 0);
  FOR d IN 1..7 LOOP
    INSERT INTO public.delivery_promise_weekly_schedules
      (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time)
    VALUES (pB3, d, true, '17:00');
  END LOOP;

  -- T47 activating a version that does not numerically supersede is REJECTED
  n := n+1; ok := true;
  BEGIN
    UPDATE public.delivery_promise_profiles SET status='active' WHERE id = pB3;
  EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN fails := fails+1; log := log||' T47'; END IF;

  -- T48 handling_business_days = 0 is representable (same-day handling, no guarantee)
  n := n+1;
  SELECT count(*) INTO v FROM public.delivery_promise_profiles p
   WHERE p.id = pB5 AND p.handling_business_days = 0;
  IF v <> 1 THEN fails := fails+1; log := log||' T48'; END IF;

  -- T49 customer_date_selection_enabled defaults to false and creates no capability
  n := n+1;
  SELECT count(*) INTO v FROM public.delivery_promise_profiles p
   WHERE p.customer_date_selection_enabled = true;
  IF v <> 0 THEN fails := fails+1; log := log||' T49'; END IF;

  ---------------------------------------------------------------- baselines
  -- T50 tax counts 4/9/5
  n := n+1;
  IF (SELECT count(*) FROM public.tax_categories) <> 4
     OR (SELECT count(*) FROM public.tax_rate_bands) <> 9
     OR (SELECT count(*) FROM public.tax_rate_versions) <> 5 THEN
    fails := fails+1; log := log||' T50';
  END IF;

  -- T51 shipping foundation counts all zero
  n := n+1;
  IF (SELECT count(*) FROM public.shipping_rate_cards) <> 0
     OR (SELECT count(*) FROM public.shipping_rate_lanes) <> 0
     OR (SELECT count(*) FROM public.shipping_rate_rules) <> 0
     OR (SELECT count(*) FROM public.merchant_fulfillment_origins) <> 0
     OR (SELECT count(*) FROM public.merchant_store_sku_shipping_profiles) <> 0
     OR (SELECT count(*) FROM public.merchant_store_sku_shipping_packages) <> 0
     OR (SELECT count(*) FROM public.merchant_store_sku_fulfillment_origins) <> 0 THEN
    fails := fails+1; log := log||' T51';
  END IF;

  -- T52 pricing/publication counts zero
  n := n+1;
  IF (SELECT count(*) FROM public.merchant_store_offer_prices) <> 0
     OR (SELECT count(*) FROM public.borvat_direct_listing_publications) <> 0 THEN
    fails := fails+1; log := log||' T52';
  END IF;

  -- T53 R-C1/R-C2: live-mode channel rows remain unauthorized
  n := n+1;
  SELECT count(*) INTO v FROM public.channel_connections
   WHERE mode='live' AND live_authorized_at IS NOT NULL;
  IF v <> 0 THEN fails := fails+1; log := log||' T53'; END IF;

  n := n+1;
  SELECT count(*) INTO v FROM public.channel_connections WHERE mode='live';
  IF v <> 9 THEN fails := fails+1; log := log||' T54'; END IF;

  RETURN 'FAILURES=' || fails || ' TOTAL=' || n || ' FAILED_TESTS=[' || btrim(log) || ']';
END;
$tests$;

ALTER FUNCTION public.m1c1db_tmp_tests() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.m1c1db_tmp_tests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1db_tmp_tests() FROM anon, authenticated, service_role;

DO $outer$
DECLARE
  v_summary text;
BEGIN
  BEGIN
    v_summary := public.m1c1db_tmp_tests();
    -- Force-rollback every fixture written by the suite.
    RAISE EXCEPTION 'M1C1DB_ROLLBACK::%', v_summary;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'M1C1DB_ROLLBACK::%' THEN
      v_summary := substr(SQLERRM, 18);
    ELSE
      RAISE EXCEPTION 'M1C-1D-B HARNESS FAILURE: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'M1C-1D-B TEST SUMMARY: %', v_summary;

  IF v_summary NOT LIKE 'FAILURES=0 %' THEN
    RAISE EXCEPTION 'M1C-1D-B VERIFICATION FAILED: %', v_summary;
  END IF;
  IF v_summary NOT LIKE '% TOTAL=54 %' THEN
    RAISE EXCEPTION 'M1C-1D-B VERIFICATION INCOMPLETE: %', v_summary;
  END IF;
END
$outer$;

DROP FUNCTION public.m1c1db_tmp_tests();

-- Post-cleanup residue assertions
DO $post$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='m1c1db_tmp_tests';
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: test routine residue'; END IF;

  SELECT count(*) INTO v FROM public.delivery_promise_profiles;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: profile fixtures not rolled back (%)', v; END IF;
  SELECT count(*) INTO v FROM public.delivery_promise_weekly_schedules;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: schedule fixtures not rolled back (%)', v; END IF;
  SELECT count(*) INTO v FROM public.merchant_stores;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: merchant_stores fixtures not rolled back (%)', v; END IF;
  SELECT count(*) INTO v FROM public.companies WHERE slug LIKE 'm1c1db-%';
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: company fixtures not rolled back (%)', v; END IF;
END
$post$;