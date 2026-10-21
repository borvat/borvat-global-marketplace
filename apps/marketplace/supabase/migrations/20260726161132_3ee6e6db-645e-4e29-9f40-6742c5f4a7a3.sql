-- M1C-1D-F / R-T21 forward-only ACL normalization. REVOKE-ONLY. ZERO GRANTS.
DO $acl$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS t
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname IN (
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
        'shipping_rate_lane_transit_profile_bindings')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.t);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type ty ON ty.oid = p.prorettype
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'm1c1c_guard_%' OR p.proname LIKE 'm1c1db_guard_%'
         OR p.proname LIKE 'm1c1dc_guard_%' OR p.proname LIKE 'm1c1dd_guard_%'
         OR p.proname LIKE 'm1c1df_guard_%' OR p.proname = 'place_order'
         OR ty.typname = 'trigger')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.fn);
  END LOOP;

  -- Anonymous visitors may never execute any routine in public.
  FOR r IN
    SELECT p.oid::regprocedure::text AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.fn);
  END LOOP;
END
$acl$;
