-- =====================================================================
-- PHASE 5 — M1C-1D-B FORWARD-FIX ACL NORMALIZATION (drift Mechanism A, R-T21)
-- Read-only gate detected re-granted privileges on protected tables after
-- the M1C-1D-B migrations. Forward-fix only; no schema or data change.
-- =====================================================================
DO $norm$
DECLARE
  t text;
  r text;
  protected text[] := ARRAY[
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications',
    'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
    'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins',
    'shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules',
    'delivery_promise_profiles','delivery_promise_weekly_schedules'
  ];
  roles text[] := ARRAY['anon','authenticated','service_role','sandbox_exec'];
BEGIN
  FOREACH t IN ARRAY protected LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY roles LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;

  -- Re-assert P5-HF-001 on every place_order signature.
  FOR t IN
    SELECT p.oid::regprocedure::text
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', t);
    FOREACH r IN ARRAY roles LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$norm$;

-- Fail-closed verification inside the same transaction.
DO $verify$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
    LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
   WHERE n.nspname='public'
     AND c.relname IN (
       'tax_categories','tax_rate_bands','tax_rate_versions',
       'catalog_product_tax_classifications','company_tax_profiles',
       'merchant_store_offer_prices','borvat_direct_listing_publications',
       'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
       'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins',
       'shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules',
       'delivery_promise_profiles','delivery_promise_weekly_schedules')
     AND pg_catalog.has_table_privilege(rl.r, c.oid, pv.p);
  IF v <> 0 THEN
    RAISE EXCEPTION 'ACL normalization incomplete: % residual protected-table privileges', v;
  END IF;

  SELECT count(*) INTO v FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
   WHERE n.nspname='public' AND p.proname='place_order'
     AND pg_catalog.has_function_privilege(rl.r, p.oid, 'EXECUTE');
  IF v <> 0 THEN
    RAISE EXCEPTION 'P5-HF-001 violated: place_order still executable (%)', v;
  END IF;

  -- Zero-row invariants unchanged.
  IF (SELECT count(*) FROM public.delivery_promise_profiles) <> 0
     OR (SELECT count(*) FROM public.delivery_promise_weekly_schedules) <> 0
     OR (SELECT count(*) FROM public.tax_categories) <> 4
     OR (SELECT count(*) FROM public.tax_rate_bands) <> 9
     OR (SELECT count(*) FROM public.tax_rate_versions) <> 5
     OR (SELECT count(*) FROM public.merchant_stores) <> 0 THEN
    RAISE EXCEPTION 'ACL normalization: unexpected row-count drift';
  END IF;
END
$verify$;