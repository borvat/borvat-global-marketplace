DO $$
DECLARE v_c int; v_b int; v_v int; v_s int;
BEGIN
  SELECT count(*) INTO v_c FROM public.tax_categories;
  SELECT count(*) INTO v_b FROM public.tax_rate_bands;
  SELECT count(*) INTO v_v FROM public.tax_rate_versions;
  IF (v_c, v_b, v_v) IS DISTINCT FROM (4, 9, 5) THEN
    RAISE EXCEPTION 'M1B-0B ABORT: tax baseline drift %/%/%', v_c, v_b, v_v;
  END IF;
  SELECT (SELECT count(*) FROM public.merchant_fulfillment_origins)
       + (SELECT count(*) FROM public.merchant_store_sku_shipping_profiles)
       + (SELECT count(*) FROM public.merchant_store_sku_shipping_packages)
       + (SELECT count(*) FROM public.merchant_store_sku_fulfillment_origins) INTO v_s;
  IF v_s <> 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: shipping foundation rows present (%)', v_s; END IF;
END $$;

-- 1. place_order: revoke every overload from every non-owner role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

-- 2. place_order: fail-closed body. Original logic is archived in
--    docs/PHASE5_M1B0B_CRITICAL_FUNCTION_ACL_DRIFT_ROOT_CAUSE_AND_GATE_REPORT.md
CREATE OR REPLACE FUNCTION public.place_order(p_user_id uuid, p_total_cents integer, p_shipping_address jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'place_order is permanently disabled (P5-HF-001 / M1B-0B). Use the Phase 5 canonical checkout.'
    USING ERRCODE = '42501';
END;
$fn$;

COMMENT ON FUNCTION public.place_order(uuid, integer, jsonb) IS
  'DEPRECATED 2026-07-24 (P5-HF-001); NEUTRALISED 2026-07-26 (M1B-0B). Body is fail-closed; no grants to application roles. Do not re-grant or restore.';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

-- 3. Trigger/guard functions are never invoked directly: deny-by-default for all app roles.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_type t ON t.oid = p.prorettype
           WHERE n.nspname = 'public' AND t.typname = 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

-- 4. No routine in public may be executed by PUBLIC or by anonymous visitors.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 5. Re-assert owner-only access on protected tables (sandbox drift re-appeared post-commit).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications',
    'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
    'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', r);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, service_role', r);
    BEGIN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM sandbox_exec', r);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

-- 6. Fail-closed post-conditions.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) AS rl(role)
  WHERE n.nspname = 'public' AND p.proname = 'place_order'
    AND has_function_privilege(rl.role, p.oid, 'EXECUTE');
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: place_order still executable (% grants)', bad; END IF;

  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_type t ON t.oid = p.prorettype,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role')) AS rl(role)
  WHERE n.nspname = 'public' AND t.typname = 'trigger'
    AND has_function_privilege(rl.role, p.oid, 'EXECUTE');
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: % trigger-function grants remain', bad; END IF;

  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: % anon-executable routines remain', bad; END IF;

  SELECT count(*) INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) AS rl(role),
       LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) AS pv(priv)
  WHERE n.nspname = 'public'
    AND c.relname IN ('tax_categories','tax_rate_bands','tax_rate_versions',
      'catalog_product_tax_classifications','company_tax_profiles',
      'merchant_store_offer_prices','borvat_direct_listing_publications',
      'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
      'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins')
    AND has_table_privilege(rl.role, c.oid, pv.priv);
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: % protected-table privileges remain', bad; END IF;
END $$;