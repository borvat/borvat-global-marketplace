-- =========================================================
-- M1B-0A STEP 2: POST-PLATFORM-PROCESSING CANARY VERDICT + CLEANUP
-- ACL governance only. No business schema. No data mutation.
-- =========================================================

-- 1) Fail-closed post-commit canary assertion (second platform cycle)
DO $$
DECLARE leaks int;
BEGIN
  SELECT count(*) INTO leaks
  FROM (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec'),('public')) AS r(role),
       (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS p(priv)
  WHERE has_table_privilege(r.role, 'public.zz_m1b0a_security_canary_table', p.priv);
  IF leaks > 0 THEN
    RAISE EXCEPTION 'M1B-0A ABORT: canary table re-granted % non-owner privileges after commit', leaks;
  END IF;

  SELECT count(*) INTO leaks
  FROM (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec'),('public')) AS r(role),
       (VALUES ('USAGE'),('SELECT'),('UPDATE')) AS p(priv)
  WHERE has_sequence_privilege(r.role, 'public.zz_m1b0a_security_canary_seq', p.priv);
  IF leaks > 0 THEN
    RAISE EXCEPTION 'M1B-0A ABORT: canary sequence re-granted % non-owner privileges after commit', leaks;
  END IF;

  SELECT count(*) INTO leaks
  FROM (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec'),('public')) AS r(role)
  WHERE has_function_privilege(r.role, 'public.zz_m1b0a_security_canary_fn()', 'EXECUTE');
  IF leaks > 0 THEN
    RAISE EXCEPTION 'M1B-0A ABORT: canary function re-granted EXECUTE after commit';
  END IF;

  RAISE NOTICE 'M1B-0A: canary post-commit verdict = DENY-BY-DEFAULT HOLDS';
END $$;

-- 2) Close remaining place_order execute drift (P5-HF-001 reinforcement)
REVOKE ALL ON FUNCTION public.place_order(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

-- 3) Remove canary objects (no permanent object delta)
DROP FUNCTION IF EXISTS public.zz_m1b0a_security_canary_fn();
DROP SEQUENCE IF EXISTS public.zz_m1b0a_security_canary_seq;
DROP TABLE IF EXISTS public.zz_m1b0a_security_canary_table;

-- 4) Mandatory final REVOKE section (compensating control)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', t);
  END LOOP;
END $$;
