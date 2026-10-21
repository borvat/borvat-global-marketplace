-- =========================================================
-- M1B-0A STEP 1: PUBLIC SCHEMA DEFAULT ACL HARDENING + CANARY
-- ACL governance only. No business schema. No data mutation.
-- =========================================================

-- Fail-closed: confirm current tax data counts are untouched baseline
DO $$
DECLARE c_cat int; c_band int; c_ver int; c_cls int; c_prof int; c_price int; c_pub int;
BEGIN
  SELECT count(*) INTO c_cat FROM public.tax_categories;
  SELECT count(*) INTO c_band FROM public.tax_rate_bands;
  SELECT count(*) INTO c_ver FROM public.tax_rate_versions;
  SELECT count(*) INTO c_cls FROM public.catalog_product_tax_classifications;
  SELECT count(*) INTO c_prof FROM public.company_tax_profiles;
  SELECT count(*) INTO c_price FROM public.merchant_store_offer_prices;
  SELECT count(*) INTO c_pub FROM public.borvat_direct_listing_publications;
  IF c_cat <> 4 OR c_band <> 9 OR c_ver <> 5 OR c_cls <> 0 OR c_prof <> 0 OR c_price <> 0 OR c_pub <> 0 THEN
    RAISE EXCEPTION 'M1B-0A ABORT: unexpected baseline counts (%,%,%,%,%,%,%)',
      c_cat, c_band, c_ver, c_cls, c_prof, c_price, c_pub;
  END IF;
END $$;

-- ---------------------------------------------------------
-- 1) Schema-level privileges: remove CREATE from app roles
--    (USAGE deliberately preserved: needed by RPC/PostgREST)
-- ---------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon;
REVOKE CREATE ON SCHEMA public FROM authenticated;
REVOKE CREATE ON SCHEMA public FROM service_role;
REVOKE CREATE ON SCHEMA public FROM sandbox_exec;

-- ---------------------------------------------------------
-- 2) Default ACL: deny-by-default for FUTURE objects created
--    by the migration owner role (postgres) in schema public
-- ---------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

-- Also attempt the platform owner role (supabase_admin). This may be
-- rejected when the migration role lacks membership; that is recorded,
-- not fatal.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role, sandbox_exec';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role, sandbox_exec';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role, sandbox_exec';
  RAISE NOTICE 'M1B-0A: supabase_admin default ACL hardening applied';
EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
  RAISE NOTICE 'M1B-0A: supabase_admin default ACL hardening NOT permitted (%)', SQLERRM;
END $$;

-- ---------------------------------------------------------
-- 3) Security canary objects (no data, no application use)
--    Created via the real migration execution path/owner so
--    post-commit platform re-grant behaviour can be observed.
-- ---------------------------------------------------------
CREATE TABLE public.zz_m1b0a_security_canary_table (
  id bigint PRIMARY KEY
);
COMMENT ON TABLE public.zz_m1b0a_security_canary_table IS
  'M1B-0A SECURITY CANARY - temporary ACL drift probe. No data. Not used by the application. Dropped in M1B-0A step 2.';

CREATE SEQUENCE public.zz_m1b0a_security_canary_seq;
COMMENT ON SEQUENCE public.zz_m1b0a_security_canary_seq IS
  'M1B-0A SECURITY CANARY - temporary ACL drift probe. Dropped in M1B-0A step 2.';

CREATE FUNCTION public.zz_m1b0a_security_canary_fn()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 'canary'::text $$;
COMMENT ON FUNCTION public.zz_m1b0a_security_canary_fn() IS
  'M1B-0A SECURITY CANARY - temporary ACL drift probe. Not an RPC. Dropped in M1B-0A step 2.';

-- ---------------------------------------------------------
-- 4) Mandatory final REVOKE section (compensating control)
--    Re-assert deny-by-default on the sensitive objects hardened
--    in M1B-3C-5, in case of privilege drift.
-- ---------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tax_categories','tax_rate_bands','tax_rate_versions',
    'catalog_product_tax_classifications','company_tax_profiles',
    'merchant_store_offer_prices','borvat_direct_listing_publications',
    'zz_m1b0a_security_canary_table'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', t);
  END LOOP;
  EXECUTE 'REVOKE ALL ON SEQUENCE public.zz_m1b0a_security_canary_seq FROM PUBLIC, anon, authenticated, service_role, sandbox_exec';
  EXECUTE 'REVOKE ALL ON FUNCTION public.zz_m1b0a_security_canary_fn() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec';
END $$;
