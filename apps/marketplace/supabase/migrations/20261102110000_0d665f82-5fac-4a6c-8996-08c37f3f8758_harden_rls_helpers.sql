-- ============================================================================
-- Least privilege follow-up (2026-11-02, owner decision) — helper hardening
--
-- F5  is_company_owner() granted owner rights from companies.owner_user_id alone.
--     It now also requires an ACTIVE membership row, so an owner whose membership
--     is not active holds no owner-level policy rights. The membership guard
--     trigger keeps owners active today; this makes the helper independent of it.
--
-- F6  The self-only guard was `auth.role() = 'authenticated' AND _user_id IS
--     DISTINCT FROM auth.uid()`. With SET ROLE authenticated but no role claim,
--     auth.role() is NULL, the conjunction is NULL, and the guard did not fire:
--     a caller could ask about a foreign user and receive false instead of 42501.
--     Both predicates below fail closed: no identity under the authenticated role
--     raises, regardless of the claim. current_user is the function owner inside a
--     SECURITY DEFINER body, so the caller's role is read from the `role` GUC that
--     SET ROLE (and PostgREST) sets.
--
-- Only the guard and the owner lookup change. is_company_member and
-- company_member_has_permission keep their exact membership/permission logic.
-- Reversal: re-apply the bodies from 20260723201307.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = _user_id AND status = 'active'
  );
END $$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  -- owner rights require the company AND an active membership row (F5)
  RETURN EXISTS (
    SELECT 1
    FROM public.companies c
    JOIN public.company_members cm
      ON cm.company_id = c.id
     AND cm.user_id = _user_id
     AND cm.status = 'active'
    WHERE c.id = _company_id
      AND c.owner_user_id = _user_id
  );
END $$;

CREATE OR REPLACE FUNCTION public.company_member_has_permission(
  _company_id uuid, _user_id uuid, _permission text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.company_member_roles cmr ON cmr.member_id = cm.id
    JOIN public.role_permissions rp ON rp.role_id = cmr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE cm.company_id = _company_id
      AND cm.user_id = _user_id
      AND cm.status = 'active'
      AND p.key = _permission
  );
END $$;

-- ACL unchanged: authenticated + service_role, never PUBLIC/anon (BOR-DEC-142).
REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon, sandbox_exec;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid, uuid) FROM PUBLIC, anon, sandbox_exec;
REVOKE ALL ON FUNCTION public.company_member_has_permission(uuid, uuid, text) FROM PUBLIC, anon, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_member_has_permission(uuid, uuid, text) TO authenticated, service_role;
