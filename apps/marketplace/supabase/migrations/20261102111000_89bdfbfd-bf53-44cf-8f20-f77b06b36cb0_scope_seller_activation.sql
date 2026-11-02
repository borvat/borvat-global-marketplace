-- ============================================================================
-- Least privilege follow-up (2026-11-02, owner decision) — scope the seller role
--
-- F8  grant_seller_role_from_approved_application() wrote a GLOBAL app_role with
--     no record of which company (or store) the activation belonged to. Any active
--     member of a company holding an approved application acquired the role
--     everywhere. Owner decision: the seller permission must be bound to the
--     correct company and store.
--
-- This migration adds the scoped record and the predicate that authorization must
-- use. The global user_roles row is still written for UI compatibility (no policy
-- keys on it; the eight has_role policies test 'admin'), and is documented as
-- UI-only. Reversal: DROP the table and helper, re-apply the 20261102094000 body.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_activations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id       uuid REFERENCES public.merchant_stores(id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES public.seller_applications(id) ON DELETE CASCADE,
  activated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_activations_user_company_uk UNIQUE (user_id, company_id)
);

COMMENT ON TABLE public.seller_activations IS
  'Scoped seller activation (2026-11-02, finding F8). authorization must use has_seller_activation(company, store); user_roles.app_role=seller is UI-only.';

ALTER TABLE public.seller_activations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_activations_select_self ON public.seller_activations;
CREATE POLICY seller_activations_select_self ON public.seller_activations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.seller_activations FROM PUBLIC, anon, sandbox_exec, service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.seller_activations FROM authenticated;
GRANT SELECT ON TABLE public.seller_activations TO authenticated;

-- Scoped predicate. Both the caller's identity and the requested scope must match;
-- a global role alone is not sufficient.
CREATE OR REPLACE FUNCTION public.has_seller_activation(_company_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.seller_activations sa
    JOIN public.company_members cm
      ON cm.company_id = sa.company_id
     AND cm.user_id = sa.user_id
     AND cm.status = 'active'
    JOIN public.seller_applications sap
      ON sap.id = sa.application_id
     AND sap.status = 'approved'
    WHERE sa.user_id = v_uid
      AND sa.company_id = _company_id
      AND (_store_id IS NULL OR sa.store_id IS NULL OR sa.store_id = _store_id)
  );
END $$;

REVOKE ALL ON FUNCTION public.has_seller_activation(uuid, uuid) FROM PUBLIC, anon, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.has_seller_activation(uuid, uuid) TO authenticated, service_role;

-- Self-activation now records the scope and refuses a store that is not the
-- application's store within that company.
CREATE OR REPLACE FUNCTION public.grant_seller_role_from_approved_application()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT sa.id, sa.company_id, sa.store_id
    INTO v_app
  FROM public.seller_applications sa
  JOIN public.company_members cm
    ON cm.company_id = sa.company_id
  WHERE cm.user_id = v_uid
    AND cm.status = 'active'
    AND sa.status = 'approved'
  ORDER BY sa.approved_at DESC NULLS LAST, sa.id
  LIMIT 1;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'no approved seller application for this user' USING ERRCODE = '42501';
  END IF;

  IF v_app.store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.merchant_stores ms
    WHERE ms.id = v_app.store_id AND ms.company_id = v_app.company_id
  ) THEN
    RAISE EXCEPTION 'application store does not belong to the company' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.seller_activations (user_id, company_id, store_id, application_id)
  VALUES (v_uid, v_app.company_id, v_app.store_id, v_app.id)
  ON CONFLICT (user_id, company_id)
  DO UPDATE SET store_id = EXCLUDED.store_id,
                application_id = EXCLUDED.application_id,
                activated_at = now();

  -- UI compatibility only; authorization must use has_seller_activation().
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'seller'::public.app_role)
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.grant_seller_role_from_approved_application() FROM PUBLIC, anon, sandbox_exec, service_role;
GRANT EXECUTE ON FUNCTION public.grant_seller_role_from_approved_application() TO authenticated;
