-- =====================================================================
-- PHASE 5 — M1B-0C : ACL NORMALIZATION ONLY
-- Owner-authorized scope: REVOKE-only. Zero GRANT statements.
-- Zero business schema. Zero data. Zero object delta.
-- Remediates recurring drift R-T21 (platform default-privilege re-grants).
-- =====================================================================

DO $m1b0c$
DECLARE
  r          record;
  n_tbl      int := 0;
  n_fn       int := 0;
  roles      text[] := ARRAY['anon','authenticated','service_role','sandbox_exec'];
  rolename   text;
  protected  text[] := ARRAY[
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
    'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars'
  ];
BEGIN
  -- ---------------------------------------------------------------
  -- 1. place_order (every overload) — fail-closed, executable by nobody
  -- ---------------------------------------------------------------
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    FOREACH rolename IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, rolename);
    END LOOP;
    n_fn := n_fn + 1;
  END LOOP;

  IF n_fn = 0 THEN
    RAISE EXCEPTION 'M1B-0C ABORT: no place_order signature found';
  END IF;

  -- Fail-closed body assertion (no redefinition, verification only)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
      AND p.prosrc NOT LIKE '%permanently disabled%'
  ) THEN
    RAISE EXCEPTION 'M1B-0C ABORT: place_order body is not fail-closed';
  END IF;

  -- ---------------------------------------------------------------
  -- 2. Protected tables — owner-only, zero direct privileges
  -- ---------------------------------------------------------------
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY(protected)
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', r.relname);
    FOREACH rolename IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', r.relname, rolename);
    END LOOP;
    n_tbl := n_tbl + 1;
  END LOOP;

  IF n_tbl <> 23 THEN
    RAISE EXCEPTION 'M1B-0C ABORT: expected 23 protected tables, normalized %', n_tbl;
  END IF;

  -- ---------------------------------------------------------------
  -- 3. Guard / trigger routines — never directly executable
  -- ---------------------------------------------------------------
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND (t.typname = 'trigger'
           OR p.proname LIKE 'm1c1c\_guard\_%'
           OR p.proname LIKE 'm1c1db\_guard\_%'
           OR p.proname LIKE 'm1c1dc\_guard\_%'
           OR p.proname LIKE 'm1c1dd\_guard\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    FOREACH rolename IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, rolename);
    END LOOP;
  END LOOP;

  -- ---------------------------------------------------------------
  -- 4. Post-commit-equivalent in-transaction assertions (fail loud)
  -- ---------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
    LATERAL unnest(roles) AS rl(r)
    WHERE n.nspname='public' AND p.proname='place_order'
      AND has_function_privilege(rl.r, p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'M1B-0C ABORT: place_order still executable by an application/sandbox role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL unnest(roles) AS rl(r),
    LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
                    ('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
    WHERE n.nspname='public' AND c.relname = ANY(protected)
      AND has_table_privilege(rl.r, c.oid, pv.p)
  ) THEN
    RAISE EXCEPTION 'M1B-0C ABORT: protected tables still carry direct privileges';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (p.proname LIKE 'm1c1c\_guard\_%' OR p.proname LIKE 'm1c1db\_guard\_%'
        OR p.proname LIKE 'm1c1dc\_guard\_%' OR p.proname LIKE 'm1c1dd\_guard\_%')
      AND p.proacl IS NULL
  ) THEN
    RAISE EXCEPTION 'M1B-0C ABORT: a protected guard function has NULL proacl';
  END IF;

  -- Business invariants must be untouched by this migration
  IF (SELECT count(*) FROM public.tax_categories)  <> 4
  OR (SELECT count(*) FROM public.tax_rate_bands)  <> 9
  OR (SELECT count(*) FROM public.tax_rate_versions) <> 5 THEN
    RAISE EXCEPTION 'M1B-0C ABORT: tax row invariant 4/9/5 violated';
  END IF;

  IF (SELECT count(*) FROM public.merchant_fulfillment_origins) <> 0
  OR (SELECT count(*) FROM public.shipping_rate_cards) <> 0
  OR (SELECT count(*) FROM public.shipping_rate_lanes) <> 0
  OR (SELECT count(*) FROM public.shipping_rate_rules) <> 0
  OR (SELECT count(*) FROM public.delivery_promise_profiles) <> 0
  OR (SELECT count(*) FROM public.delivery_promise_weekly_schedules) <> 0
  OR (SELECT count(*) FROM public.merchant_store_sku_delivery_promise_assignments) <> 0
  OR (SELECT count(*) FROM public.shipping_transit_time_profiles) <> 0
  OR (SELECT count(*) FROM public.shipping_transit_time_weekday_rules) <> 0
  OR (SELECT count(*) FROM public.shipping_transit_delivery_weekdays) <> 0
  OR (SELECT count(*) FROM public.shipping_calendar_profiles) <> 0
  OR (SELECT count(*) FROM public.shipping_calendar_blackout_dates) <> 0
  OR (SELECT count(*) FROM public.shipping_transit_time_profile_calendars) <> 0
  OR (SELECT count(*) FROM public.merchant_store_offer_prices) <> 0
  OR (SELECT count(*) FROM public.borvat_direct_listing_publications) <> 0 THEN
    RAISE EXCEPTION 'M1B-0C ABORT: shipping/pricing/publication zero-row invariant violated';
  END IF;

  -- R-C2 must remain a blocker: no live channel row may become authorized here
  IF EXISTS (SELECT 1 FROM public.channel_connections
             WHERE mode='live' AND live_authorized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'M1B-0C ABORT: a live channel connection is authorized (R-C2 breach)';
  END IF;

  RAISE NOTICE 'M1B-0C: normalized % protected tables, % place_order signature(s)', n_tbl, n_fn;
END
$m1b0c$;