-- Synthetic preflight fixtures for the clean-chain rebuild.
--
-- WHY THIS FILE EXISTS
--   Eight historical migrations (20260725–20260801) mix schema work with harness
--   assertions that read EXISTING tenant rows and abort when they are absent, e.g.
--   20260725220916 requires the platform-admin target user to exist in auth.users,
--   20260726135308 requires two companies, 20260801002900 requires exactly one
--   company named "Qnan B.V.". On an empty database every one of them aborts and
--   its DDL is rolled back with it, which then cascades into 13 further failures.
--   This file supplies that minimal tenant shape so a clean rebuild can complete.
--
-- WHAT IT IS NOT
--   Not a migration, never applied to any hosted project, not a data backfill.
--   It creates no production row and copies no production value except the owner
--   account identity the harness hard-codes (ceo@surooholdings.com). Run it only
--   against a disposable database built by scripts/chain-rebuild/apply.cjs.
--
-- ORDERING
--   apply.cjs runs this immediately BEFORE 20260725220916, the first harness
--   migration. companies/catalog_products already exist at that point.

DO $seed$
DECLARE
  owner_user uuid := '368d803e-d06b-485c-9e3c-e58b168d0419';
  second_user uuid := '00000000-0000-4000-8000-0000000000b1';
  third_user uuid := '00000000-0000-4000-8000-0000000000b2';
  keep_company uuid := '00000000-0000-4000-8000-0000000000f1';
  second_company uuid := '00000000-0000-4000-8000-0000000000f2';
BEGIN
  INSERT INTO auth.users (id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (owner_user, 'ceo@surooholdings.com', 'authenticated', 'authenticated', now(), '{}'::jsonb, '{}'::jsonb),
    (second_user, 'fixture-secondary@chain-rebuild.invalid', 'authenticated', 'authenticated', now(), '{}'::jsonb, '{}'::jsonb),
    (third_user, 'fixture-third@chain-rebuild.invalid', 'authenticated', 'authenticated', now(), '{}'::jsonb, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Two tenants: the harness needs "two companies", and the later purge migration
  -- needs exactly one survivor named "Qnan B.V.".
  INSERT INTO public.companies (id, name, slug, owner_user_id)
  SELECT keep_company, 'Qnan B.V.', 'qnan-bv', owner_user
  WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE id = keep_company OR slug = 'qnan-bv');

  INSERT INTO public.companies (id, name, slug, owner_user_id)
  SELECT second_company, 'Chain Fixture Ltd', 'chain-fixture-ltd', second_user
  WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE id = second_company OR slug = 'chain-fixture-ltd');

  INSERT INTO public.catalog_products (company_id, title, status, created_by)
  SELECT keep_company, 'Chain fixture product', 'draft', owner_user
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_products WHERE company_id = keep_company AND title = 'Chain fixture product');

  -- 20260726145235 selects a tenant with >= 5 catalog_skus as tenant A and a
  -- second tenant with at least one sku as tenant B.
  INSERT INTO public.catalog_skus (company_id, code)
  SELECT keep_company, 'FIX-A-' || g
  FROM generate_series(1, 5) g
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_skus WHERE company_id = keep_company AND code = 'FIX-A-' || g);

  INSERT INTO public.catalog_skus (company_id, code)
  SELECT second_company, 'FIX-B-' || g
  FROM generate_series(1, 2) g
  WHERE NOT EXISTS (SELECT 1 FROM public.catalog_skus WHERE company_id = second_company AND code = 'FIX-B-' || g);
END $seed$;
