-- ============================================================================
-- Security review follow-up (2026-11-02) — seller self-activation requires an
-- ACTIVE company membership
--
-- Finding F2: public.grant_seller_role_from_approved_application() checked only
-- that the caller is a member of a company holding an approved seller
-- application. It ignored company_members.status, so a member whose status is
-- 'suspended' (or any non-active value) could still grant themselves the
-- 'seller' application role. Every other row-level helper in this schema
-- (is_company_member, company_member_has_permission) filters status='active';
-- this one did not.
--
-- Change: add `AND cm.status = 'active'` to the eligibility query. Same
-- signature, same SECURITY DEFINER, same search_path, same ACL (re-asserted
-- below). A suspended member now receives 42501 'no approved seller application
-- for this user' exactly as a non-member does. Nothing else in the body changes.
--
-- Behaviour change: one predicate, strict-only (it can only deny more, never
-- allow more). Reversal: re-apply the previous body from
-- 20260731235603_61a36e53-e5d9-4915-9bf3-69bd97aafd51.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.grant_seller_role_from_approved_application()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_approved boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.seller_applications sa
    JOIN public.company_members cm
      ON cm.company_id = sa.company_id
    WHERE cm.user_id = v_uid
      AND cm.status = 'active'
      AND sa.status = 'approved'
  ) INTO v_has_approved;

  IF NOT v_has_approved THEN
    RAISE EXCEPTION
      'no approved seller application for this user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'seller'::public.app_role)
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.grant_seller_role_from_approved_application() FROM PUBLIC, anon, sandbox_exec, service_role;
GRANT EXECUTE ON FUNCTION public.grant_seller_role_from_approved_application() TO authenticated;

COMMENT ON FUNCTION public.grant_seller_role_from_approved_application() IS
  'Seller self-activation. Requires an ACTIVE company membership in a company with an approved seller application (status filter added 2026-11-02, finding F2). Application RPC called from src/routes/seller.tsx; listed in approved-routines.json (BOR-DEC-142).';
