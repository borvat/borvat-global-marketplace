-- Reversal for 20261102090000_abcd0277-f2e6-499c-b65c-f5fa0a876671_restore_rls_helper_execute.sql
-- Restores the pre-fix ACL exactly: the three RLS helpers lose EXECUTE for the
-- application roles. Policies that call them will raise 42501 again, which is
-- the state produced by 20260726222737. No data, table or row is touched.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.company_member_has_permission(uuid, uuid, text) FROM authenticated, service_role;

COMMIT;
