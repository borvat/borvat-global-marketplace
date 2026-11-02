-- ============================================================================
-- Security review follow-up (2026-11-02) — remove service_role from the three
-- reviewer RPCs so the granted surface matches the approved allowlist
--
-- Finding F3 (independent review): approved-routines.json lists these three as
-- ["authenticated"], yet all three also carried EXECUTE for service_role. That is
-- a violation of the file's own rule ("any non-trigger routine executable by
-- authenticated/service_role that is not listed here is a violation").
--
-- Why the grant is unnecessary, not merely unapproved:
--   * No routine in public references any of the three (pg_proc.prosrc scan).
--   * The repository ships no supabase/functions directory, so no edge function
--     calls them with the service key.
--   * service_role has BYPASSRLS and full table privileges; an admin server task
--     reads the underlying tables directly instead of an RPC built for a user JWT.
--
-- Reversal: GRANT EXECUTE ... TO service_role. No data, table or policy change.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.admin_get_seller_application(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.admin_list_seller_applications(text, integer, integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.admin_review_seller_application(uuid, text, text) FROM service_role;

COMMENT ON FUNCTION public.admin_get_seller_application(uuid) IS
  'Admin/reviewer read RPC. EXECUTE: authenticated only (BOR-DEC-142). service_role removed 2026-11-02 (finding F3): nothing calls it with the service key and service_role bypasses RLS.';
COMMENT ON FUNCTION public.admin_list_seller_applications(text, integer, integer) IS
  'Admin/reviewer list RPC. EXECUTE: authenticated only (BOR-DEC-142). service_role removed 2026-11-02 (finding F3).';
COMMENT ON FUNCTION public.admin_review_seller_application(uuid, text, text) IS
  'Admin/reviewer decision RPC. EXECUTE: authenticated only (BOR-DEC-142). service_role removed 2026-11-02 (finding F3).';
