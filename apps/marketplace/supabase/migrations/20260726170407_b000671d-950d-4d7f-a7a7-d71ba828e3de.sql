-- M1B-0E — ACL DRIFT CYCLE 7 NORMALIZATION ONLY (REVOKE-only, BOR-DEC-057 / BOR-DEC-065)
-- No GRANT. No DDL. No DML. No function body changes.

DO $$
DECLARE
  r         record;
  app_roles text[] := array['anon','authenticated','service_role','sandbox_exec'];
  rl        text;
  protected text[] := array[
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
    'shipping_rate_lane_transit_profile_bindings'
  ];
BEGIN
  -- 1. Protected tables -> owner-only
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname = ANY(protected)
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', r.relname);
    FOREACH rl IN ARRAY app_roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', r.relname, rl);
    END LOOP;
  END LOOP;

  -- 2. public.place_order, every overload -> no EXECUTE for anyone but the owner
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    FOREACH rl IN ARRAY app_roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, rl);
    END LOOP;
  END LOOP;

  -- 3. Every trigger/guard routine in public -> never directly executable
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND (t.typname = 'trigger' OR p.proname LIKE 'm1c1%_guard_%' OR p.proname LIKE '%guard%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    FOREACH rl IN ARRAY app_roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, rl);
    END LOOP;
  END LOOP;

  -- 4. Non-trigger routines in public: strip anything outside the approved allowlist.
  --    Approved: p4_writes_allowed / p4_dispatch_decision keep service_role only.
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public' AND t.typname <> 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, 'anon');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, 'sandbox_exec');
  END LOOP;

  -- 5. Private internal ETA area -> owner-only
  FOREACH rl IN ARRAY app_roles LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA internal_shipping FROM %I', rl);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_shipping FROM %I', rl);
  END LOOP;
  REVOKE ALL ON SCHEMA internal_shipping FROM PUBLIC;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_shipping FROM PUBLIC;
END $$;

-- Fail-closed post-conditions (abort the migration if normalization did not hold)
DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
  WHERE n.nspname='public' AND p.proname='place_order'
    AND has_function_privilege(rl.r, p.oid, 'EXECUTE');
  IF v <> 0 THEN RAISE EXCEPTION 'M1B-0E: place_order still executable (%).', v; END IF;

  SELECT count(*) INTO v
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='place_order'
    AND p.prosrc NOT LIKE '%permanently disabled%';
  IF v <> 0 THEN RAISE EXCEPTION 'M1B-0E: place_order body is not fail-closed.'; END IF;

  SELECT count(*) INTO v
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
       LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
  WHERE n.nspname='public' AND c.relname IN (
    'tax_categories','tax_rate_bands','tax_rate_versions','catalog_product_tax_classifications',
    'company_tax_profiles','merchant_store_offer_prices','borvat_direct_listing_publications',
    'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
    'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins',
    'shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules',
    'delivery_promise_profiles','delivery_promise_weekly_schedules',
    'merchant_store_sku_delivery_promise_assignments','shipping_transit_time_profiles',
    'shipping_transit_time_weekday_rules','shipping_transit_delivery_weekdays',
    'shipping_calendar_profiles','shipping_calendar_blackout_dates',
    'shipping_transit_time_profile_calendars','shipping_rate_lane_transit_profile_bindings')
    AND has_table_privilege(rl.r, c.oid, pv.p);
  IF v <> 0 THEN RAISE EXCEPTION 'M1B-0E: protected tables still reachable (%).', v; END IF;

  SELECT count(*) INTO v
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
  WHERE n.nspname='internal_shipping'
    AND (p.proacl IS NULL OR has_function_privilege(rl.r, p.oid, 'EXECUTE'));
  IF v <> 0 THEN RAISE EXCEPTION 'M1B-0E: internal resolver still reachable (%).', v; END IF;

  SELECT count(*) INTO v
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'm1c1%_guard_%' AND p.proacl IS NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'M1B-0E: guard routine with NULL proacl (%).', v; END IF;
END $$;