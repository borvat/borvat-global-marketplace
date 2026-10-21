-- M1B-0J — ACL DRIFT CYCLE 12 NORMALIZATION ONLY (REVOKE-only, zero business changes)
DO $$
DECLARE r record; roles text[] := ARRAY['PUBLIC','anon','authenticated','service_role','sandbox_exec'];
        rl text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, rl);
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT c.oid::regclass::text AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND (c.relname LIKE 'manual_shipping_quote_%'
        OR c.relname IN (
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
        'customer_delivery_destinations','customer_delivery_destination_versions'))
  LOOP
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %s', r.rel, rl);
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'm1c1c_guard_%' OR p.proname LIKE 'm1c1db_guard_%'
        OR p.proname LIKE 'm1c1dc_guard_%' OR p.proname LIKE 'm1c1dd_guard_%'
        OR p.proname LIKE 'm1c1df_guard_%' OR p.proname LIKE 'm1c1eb_guard_%'
        OR p.proname LIKE 'm1c1ec_guard_%' OR p.proname LIKE 'm1c1ed_guard_%')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, rl);
    END LOOP;
  END LOOP;

  FOREACH rl IN ARRAY roles LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA internal_shipping FROM %s', rl);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal_shipping'
  LOOP
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, rl);
    END LOOP;
  END LOOP;
END $$;