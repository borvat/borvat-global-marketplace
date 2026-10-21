-- Canary: created and dropped inside this same migration (zero permanent delta).
CREATE FUNCTION public.zz_m1b0b_acl_canary() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'canary'::text $$;
COMMENT ON FUNCTION public.zz_m1b0b_acl_canary() IS 'M1B-0B temporary ACL canary; dropped in the same migration.';

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role')) rl(r)
  WHERE n.nspname='public' AND p.proname='zz_m1b0b_acl_canary'
    AND has_function_privilege(rl.r, p.oid, 'EXECUTE');
  -- ROOT CAUSE (B), recorded not aborted: a newly created routine has a NULL ACL,
  -- and a NULL ACL means the PostgreSQL built-in default EXECUTE TO PUBLIC.
  -- Narrowed pg_default_acl (M1B-0A) does NOT prevent this.
  RAISE NOTICE 'M1B-0B ROOT CAUSE B: fresh canary executable by % application roles (NULL acl = PUBLIC EXECUTE)', bad;
  IF bad <> 3 THEN RAISE EXCEPTION 'M1B-0B ABORT: unexpected canary baseline (%)', bad; END IF;

  REVOKE ALL ON FUNCTION public.zz_m1b0b_acl_canary() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.zz_m1b0b_acl_canary() FROM anon, authenticated, service_role;

  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role')) rl(r)
  WHERE n.nspname='public' AND p.proname='zz_m1b0b_acl_canary'
    AND has_function_privilege(rl.r, p.oid, 'EXECUTE');
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: canary still executable after revoke (%)', bad; END IF;
END $$;

DROP FUNCTION public.zz_m1b0b_acl_canary();

-- MANDATORY ACL NORMALIZATION SECTION (pattern required by BOR-DEC-065).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_type t ON t.oid = p.prorettype
           WHERE n.nspname='public'
             AND (p.proname = 'place_order' OR t.typname = 'trigger')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;

  FOR r IN SELECT p.oid::regprocedure AS sig
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications',
    'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
    'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, service_role', t);
    BEGIN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM sandbox_exec', t);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

DO $$
DECLARE bad int; v_c int; v_b int; v_v int;
BEGIN
  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
  WHERE n.nspname='public' AND p.proname='place_order'
    AND has_function_privilege(rl.r, p.oid, 'EXECUTE');
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: place_order executable (%)', bad; END IF;

  SELECT count(*) INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: % anon-executable routines', bad; END IF;

  SELECT count(*) INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
       LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
       LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) pv(p)
  WHERE n.nspname='public' AND c.relname IN (
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications',
    'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
    'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins')
    AND has_table_privilege(rl.r, c.oid, pv.p);
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: % protected-table privileges', bad; END IF;

  SELECT count(*) INTO v_c FROM public.tax_categories;
  SELECT count(*) INTO v_b FROM public.tax_rate_bands;
  SELECT count(*) INTO v_v FROM public.tax_rate_versions;
  IF (v_c, v_b, v_v) IS DISTINCT FROM (4, 9, 5) THEN
    RAISE EXCEPTION 'M1B-0B ABORT: tax baseline drift %/%/%', v_c, v_b, v_v;
  END IF;

  SELECT count(*) INTO bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'zz_m1b0b%';
  IF bad > 0 THEN RAISE EXCEPTION 'M1B-0B ABORT: canary object left behind'; END IF;
END $$;