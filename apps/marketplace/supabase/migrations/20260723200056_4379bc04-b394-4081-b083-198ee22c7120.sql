
-- Trigger-only SECURITY DEFINER functions: no user should call these directly.
REVOKE ALL ON FUNCTION public._companies_after_insert_bootstrap_owner()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._companies_before_update_owner_guard()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._company_member_roles_guard_owner_role()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._company_members_guard_owner_membership()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                              FROM PUBLIC, anon, authenticated;

-- RLS-helper functions: referenced by policies; must be executable by the query invoker.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role)                FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)            TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid)                  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_member(uuid, uuid)              TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_company_owner(uuid, uuid)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid)               TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.company_member_has_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.company_member_has_permission(uuid, uuid, text) TO authenticated, service_role;

-- RPC endpoints: authenticated users only.
REVOKE ALL ON FUNCTION public.decide_product_suggestion(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decide_product_suggestion(uuid, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_company_ownership(uuid, uuid)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transfer_company_ownership(uuid, uuid)     TO authenticated, service_role;
