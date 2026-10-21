-- =========================================================================
-- Phase 1 backfill deployment preflight — run BEFORE production deploy
-- =========================================================================
-- Purpose: quantify what the backfill in
--   supabase/migrations/20260723194859_c42c8642-3f61-477a-bf8a-8b06581de0a4.sql
-- will do on the target database, and produce reconciliation output.
--
-- Run with:  psql "$PROD_DATABASE_URL" -f scripts/phase1-backfill-preflight.sql
-- The script is READ-ONLY (only SELECTs) and safe to run repeatedly.

\echo '── 1. Dry-run: sellers that will get a company created'
SELECT count(*) AS sellers_needing_company
FROM public.user_roles ur
WHERE ur.role = 'seller'
  AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.owner_user_id = ur.user_id
  );

\echo '── 2. Expected owner rows (one company per seller without one)'
SELECT ur.user_id AS will_become_owner,
       COALESCE(p.full_name, p.email, ur.user_id::text) AS display_name
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'seller'
  AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_user_id = ur.user_id)
ORDER BY display_name
LIMIT 200;

\echo '── 3. Slug-collision preview (base slugs that already exist)'
WITH bases AS (
  SELECT regexp_replace(regexp_replace(lower(coalesce(
           COALESCE(p.full_name, p.email, ur.user_id::text), 'seller')),
           '[^a-z0-9]+','-','g'), '(^-+|-+$)','','g') AS base
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'seller'
    AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_user_id = ur.user_id)
)
SELECT b.base, count(*) AS incoming, exists(SELECT 1 FROM public.companies c WHERE c.slug = b.base) AS collides
FROM bases b GROUP BY b.base ORDER BY collides DESC, incoming DESC LIMIT 50;

\echo '── 4. Sellers who ALREADY own a company (skipped by backfill)'
SELECT count(*) AS sellers_already_with_company
FROM public.user_roles ur
JOIN public.companies c ON c.owner_user_id = ur.user_id
WHERE ur.role = 'seller';

\echo '── 5. Users with the seller role that no longer exist in auth.users (data integrity)'
SELECT count(*) AS orphan_seller_roles
FROM public.user_roles ur
LEFT JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'seller' AND u.id IS NULL;

\echo '── 6. Post-migration reconciliation query (run AFTER deploy)'
\echo '     Every seller must own at least one company. Expect 0 rows.'
-- Comment out until after deploy:
-- SELECT ur.user_id FROM public.user_roles ur
--  WHERE ur.role = 'seller'
--    AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_user_id = ur.user_id);

\echo '── 7. Rollback / remediation'
\echo '     The backfill DO block is idempotent (skips sellers who already own a company).'
\echo '     If a specific backfilled company must be removed, execute as service_role:'
\echo '       BEGIN;'
\echo '         -- 1) Ensure no downstream data (products / orders / listings) references it.'
\echo '         SELECT count(*) FROM public.products WHERE seller_id = <owner_uid>;'
\echo '         -- 2) Remove the company (CASCADE clears company_members + company_member_roles).'
\echo '         DELETE FROM public.companies WHERE owner_user_id = <owner_uid> AND slug = <slug>;'
\echo '       COMMIT;'
\echo '     Re-running the same migration file will re-create the company (idempotent).'
