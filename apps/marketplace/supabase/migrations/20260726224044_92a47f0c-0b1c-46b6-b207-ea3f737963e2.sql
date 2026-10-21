-- =====================================================================
-- M1B-0S — ACL DRIFT CYCLE 12 NORMALIZATION (REVOKE-ONLY)
-- Recurring platform re-grant to sandbox_exec after deployment (R-T21).
-- No DDL, no data change: privilege removal only.
-- =====================================================================
DO $drift$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM sandbox_exec';
  END IF;
END
$drift$;

REVOKE ALL ON public.seller_applications       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.seller_application_events FROM PUBLIC, anon, authenticated, service_role;
