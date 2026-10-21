DO $n$
DECLARE t text; p oid; roles text := 'PUBLIC, anon, authenticated, service_role, sandbox_exec';
BEGIN
  -- 1. protected tables ------------------------------------------------------
  FOREACH t IN ARRAY ARRAY[
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
    'shipping_rate_lane_transit_profile_bindings']
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s', t, roles);
  END LOOP;

  -- 2. place_order, every overload -------------------------------------------
  FOR p IN SELECT pr.oid FROM pg_catalog.pg_proc pr
             JOIN pg_catalog.pg_namespace ns ON ns.oid = pr.pronamespace
            WHERE ns.nspname = 'public' AND pr.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s', p::regprocedure::text, roles);
  END LOOP;

  -- 3. all protected guard / trigger routines --------------------------------
  FOR p IN SELECT pr.oid FROM pg_catalog.pg_proc pr
             JOIN pg_catalog.pg_namespace ns ON ns.oid = pr.pronamespace
             JOIN pg_catalog.pg_type ty ON ty.oid = pr.prorettype
            WHERE ns.nspname = 'public'
              AND (ty.typname = 'trigger'
                   OR pr.proname LIKE 'm1c1c\_guard\_%'
                   OR pr.proname LIKE 'm1c1db\_guard\_%'
                   OR pr.proname LIKE 'm1c1dc\_guard\_%'
                   OR pr.proname LIKE 'm1c1dd\_guard\_%'
                   OR pr.proname LIKE 'm1c1df\_guard\_%')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s', p::regprocedure::text, roles);
  END LOOP;

  -- 4. private internal resolver area ----------------------------------------
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA internal_shipping FROM %s', roles);
  FOR p IN SELECT pr.oid FROM pg_catalog.pg_proc pr
             JOIN pg_catalog.pg_namespace ns ON ns.oid = pr.pronamespace
            WHERE ns.nspname = 'internal_shipping'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s', p::regprocedure::text, roles);
  END LOOP;
END
$n$;

-- in-transaction fail-closed assertions (no grants, no schema change, no data change)
DO $a$
DECLARE bad text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc pr
               JOIN pg_catalog.pg_namespace ns ON ns.oid = pr.pronamespace
              WHERE ns.nspname='public' AND pr.proname='place_order'
                AND pr.prosrc NOT LIKE '%permanently disabled%') THEN
    bad := bad||'place_order not fail-closed; ';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc pr
               JOIN pg_catalog.pg_namespace ns ON ns.oid = pr.pronamespace,
             LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(rr)
              WHERE ns.nspname='public' AND pr.proname='place_order'
                AND has_function_privilege(rl.rr, pr.oid, 'EXECUTE')) THEN
    bad := bad||'place_order still executable; ';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
               JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace,
             LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(rr),
             LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(pp)
              WHERE ns.nspname='public'
                AND c.relname IN ('tax_categories','tax_rate_bands','tax_rate_versions',
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
                  'shipping_rate_lane_transit_profile_bindings')
                AND has_table_privilege(rl.rr, c.oid, pv.pp)) THEN
    bad := bad||'protected tables still reachable; ';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(rr)
              WHERE has_schema_privilege(rl.rr,'internal_shipping','USAGE')
                 OR has_function_privilege(rl.rr,'internal_shipping.resolve_final_eta(uuid,uuid,timestamptz)','EXECUTE')) THEN
    bad := bad||'internal resolver still reachable; ';
  END IF;
  IF EXISTS (SELECT 1 FROM public.channel_connections WHERE live_authorized_at IS NOT NULL) THEN
    bad := bad||'R-C2 violated; ';
  END IF;
  IF bad <> '' THEN RAISE EXCEPTION 'M1B-0D NORMALIZATION FAILED: %', bad; END IF;
END
$a$;