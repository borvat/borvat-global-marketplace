-- =====================================================================
-- PHASE 5 — M1C-1D-B VERIFICATION HARNESS (fail-loud, self-rolling-back)
-- Creates a temporary owner-side test routine, executes it inside a
-- subtransaction that is force-rolled back, then drops the routine.
-- Zero residual objects, zero residual rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. FORWARD-FIX ACL NORMALIZATION (drift Mechanism A, R-T21)
--    The platform re-granted EXECUTE on the permanently disabled
--    place_order() to sandbox_exec after the M1C-1D-B schema migration.
--    Re-assert P5-HF-001 before any verification runs.
-- ---------------------------------------------------------------------
DO $norm$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role', r.sig);
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='sandbox_exec') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec', r.sig);
    END IF;
  END LOOP;
END
$norm$;

-- HISTORICAL CHANGE 2026-11-02 (owner-approved preparation, isolated branch).
-- Scope: verification harness only. The schema DDL and ACL statements that this
-- file always applied are unchanged above this line; the temporary test routine m1c1db_tmp_tests(), its 54 assertions and its drop
-- was moved verbatim to apps/marketplace/supabase/tests/20260726142346_m1c1db_verification.nottest.sql so the migration no longer rolls its DDL back when a
-- production-shaped assertion fails on a clean database.
