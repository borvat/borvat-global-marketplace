-- ============================================================================
-- Security review follow-up (2026-11-02) — narrow the reviewer gate's EXECUTE
--
-- Finding F1: public.m1v1da_require_reviewer() is an internal authorization gate.
-- Its only callers are three SECURITY DEFINER functions in the same schema:
--   admin_get_seller_application, admin_list_seller_applications,
--   admin_review_seller_application
-- A SECURITY DEFINER caller resolves the gate as its owner (postgres), so the
-- client grants are not needed for the gate to work. No application path calls
-- the gate directly (app source has zero references; only generated types list it).
--
-- Exposure removed: an authenticated user could call the gate directly and use
-- the error channel to probe reviewer/admin membership. Enforcement inside the
-- admin_* functions is unchanged.
--
-- BOR-DEC-142 gate: any non-trigger routine executable by authenticated or
-- service_role that is not in approved-routines.json is a violation. The gate is
-- not listed, so this migration removes the drift instead of documenting it.
--
-- Behaviour change: none for any RPC. Reversal: GRANT EXECUTE to the two roles.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.m1v1da_require_reviewer() FROM authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1v1da_require_reviewer() FROM PUBLIC, anon, sandbox_exec;

COMMENT ON FUNCTION public.m1v1da_require_reviewer() IS
  'Internal reviewer/admin gate. SECURITY DEFINER only: callable by the three admin_* RPCs as owner. Client EXECUTE intentionally absent (2026-11-02 security review, finding F1). Do not grant to authenticated/service_role; the admin_* functions enforce the same check.';
