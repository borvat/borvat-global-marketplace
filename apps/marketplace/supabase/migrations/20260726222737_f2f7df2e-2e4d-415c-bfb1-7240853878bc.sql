-- M1B-0R — ACL DRIFT CYCLE 11 NORMALIZATION (REVOKE-ONLY, R-T21)
-- Includes the new M1V-1C scope. No business changes. No new objects.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (has_function_privilege('sandbox_exec', p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.sig);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p','v','m')
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
        'shipping_rate_lane_transit_profile_bindings',
        'customer_delivery_destinations','customer_delivery_destination_versions',
        'manual_shipping_quote_requests','manual_shipping_quote_request_items',
        'manual_shipping_quote_request_packages',
        'manual_shipping_quote_offers','manual_shipping_quote_offer_conditions',
        'manual_shipping_quote_acceptances','manual_shipping_quote_state_events',
        'company_legal_identities','company_legal_identifiers',
        'merchant_store_public_profiles','merchant_store_public_profile_categories',
        'merchant_store_public_profile_shipping_countries','seller_verification_events'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.rel);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.sig);
  END LOOP;
END $$;

-- Re-affirm ONLY the approved application execute surface.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'seller_list_workspaces','seller_store_overview','seller_list_catalog',
        'seller_list_inventory','seller_get_store_profile',
        'seller_get_legal_identity','seller_upsert_legal_identity',
        'seller_upsert_legal_identifier','seller_submit_legal_identity',
        'seller_get_store_public_profile','seller_upsert_store_public_profile'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'public_get_store_profile'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
  END LOOP;
END $$;