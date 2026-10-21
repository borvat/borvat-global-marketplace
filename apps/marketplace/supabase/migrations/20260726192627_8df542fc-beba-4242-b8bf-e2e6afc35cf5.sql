-- =====================================================================
-- M1B-0M — ACL DRIFT CYCLE 14 NORMALIZATION ONLY (REVOKE-only)
-- Triggered by: R-T21 recurrence immediately after the M1C-1E-E-R3 DDL.
-- Zero grants. Zero business changes. Zero schema changes.
-- =====================================================================
DO $$
DECLARE
  r record;
  v_roles text[] := ARRAY['public','anon','authenticated','service_role','sandbox_exec'];
  v_role text;
BEGIN
  -- 1. Protected tables: manual quote scope, tax, pricing, publication,
  --    shipping topology, destinations and promise/transit/calendar scope.
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND (c.relname LIKE 'manual_shipping_quote%'
         OR c.relname LIKE 'shipping_rate%'
         OR c.relname LIKE 'shipping_transit%'
         OR c.relname LIKE 'shipping_calendar%'
         OR c.relname LIKE 'delivery_promise%'
         OR c.relname LIKE 'customer_delivery_destination%'
         OR c.relname LIKE 'merchant_store_sku_%'
         OR c.relname LIKE 'merchant_store_offer_prices'
         OR c.relname LIKE 'merchant_fulfillment_origins'
         OR c.relname LIKE 'tax_rate%'
         OR c.relname = 'tax_categories'
         OR c.relname = 'company_tax_profiles'
         OR c.relname = 'catalog_product_tax_classifications'
         OR c.relname = 'borvat_direct_listing_publications')
  LOOP
    FOREACH v_role IN ARRAY v_roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s', r.relname, v_role);
    END LOOP;
  END LOOP;

  -- 2. Protected routines: every milestone guard plus the legacy order RPC.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'm1c1%' OR p.proname = 'place_order')
  LOOP
    FOREACH v_role IN ARRAY v_roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, v_role);
    END LOOP;
  END LOOP;

  -- 3. Owner-only internal shipping schema and its routines.
  FOREACH v_role IN ARRAY v_roles LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA internal_shipping FROM %s', v_role);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_shipping FROM %s', v_role);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA internal_shipping FROM %s', v_role);
  END LOOP;
END $$;
