
-- =========================================================================
-- Phase 1 — Final hardening (Migration 4)
-- =========================================================================
--   1. Ownership control: primary defense is column-level privilege on
--      companies.owner_user_id. The GUC (app.allow_owner_change) is retained
--      only as defense in depth inside the trigger; it is NOT the
--      authorization gate.
--   2. All SECURITY DEFINER functions: search_path = '' with schema-qualified
--      references throughout.
--   3. Helper functions block user-supplied _user_id enumeration by binding
--      to auth.uid() unless the caller is service_role.
-- =========================================================================

-- ---------- 1. Column-level UPDATE control on companies -----------------
REVOKE UPDATE ON public.companies FROM authenticated;
GRANT  UPDATE (name, slug) ON public.companies TO authenticated;
-- service_role keeps ALL via existing grant. transfer_company_ownership
-- runs SECURITY DEFINER as its owner (postgres) and retains full UPDATE.

-- Tighten the RLS UPDATE policy: no more GUC bypass on WITH CHECK. Column
-- privilege is the authoritative control now.
DROP POLICY IF EXISTS "companies_update_owner" ON public.companies;
CREATE POLICY "companies_update_owner"
ON public.companies FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- ---------- 2 + 3. Rewrite every SECURITY DEFINER function ---------------
--    - search_path = ''
--    - all identifiers schema-qualified
--    - user-parameter helpers gate on auth.role() and auth.uid()

-- has_role: bind to auth.uid() unless service_role.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END $$;

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
  IF auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id AND owner_user_id = _user_id
  );
END $$;

CREATE OR REPLACE FUNCTION public.company_member_has_permission(
  _company_id uuid, _user_id uuid, _permission text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

-- Trigger-only functions: fixed empty search_path, schema-qualified.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'buyer');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._companies_after_insert_bootstrap_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _member_id uuid;
  _owner_role_id uuid;
BEGIN
  INSERT INTO public.company_members (company_id, user_id, status)
  VALUES (NEW.id, NEW.owner_user_id, 'active')
  ON CONFLICT (company_id, user_id) DO UPDATE SET status = 'active'
  RETURNING id INTO _member_id;

  SELECT id INTO _owner_role_id FROM public.system_company_roles WHERE key = 'owner';

  INSERT INTO public.company_member_roles (member_id, role_id)
  VALUES (_member_id, _owner_role_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._companies_before_update_owner_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    -- Defense in depth: column-level privilege is the primary control.
    IF current_setting('app.allow_owner_change', true) <> 'yes' THEN
      RAISE EXCEPTION 'ownership can only be changed via transfer_company_ownership()';
    END IF;
    IF NEW.owner_user_id IS NULL THEN
      RAISE EXCEPTION 'company owner cannot be null';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.company_members
      WHERE company_id = NEW.id AND user_id = NEW.owner_user_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'new owner must be an active member of the company';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._company_members_guard_owner_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _owner uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT owner_user_id INTO _owner FROM public.companies WHERE id = OLD.company_id;
    IF _owner = OLD.user_id THEN
      RAISE EXCEPTION 'cannot remove the company owner from members; transfer ownership first';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT owner_user_id INTO _owner FROM public.companies WHERE id = NEW.company_id;
    IF _owner = NEW.user_id AND NEW.status <> 'active' THEN
      RAISE EXCEPTION 'company owner membership must remain active';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._company_member_roles_guard_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _key text; _cm_user uuid; _cm_company uuid; _owner uuid;
BEGIN
  SELECT key INTO _key FROM public.system_company_roles WHERE id = OLD.role_id;
  IF _key <> 'owner' THEN RETURN OLD; END IF;
  SELECT user_id, company_id INTO _cm_user, _cm_company FROM public.company_members WHERE id = OLD.member_id;
  SELECT owner_user_id INTO _owner FROM public.companies WHERE id = _cm_company;
  IF _owner = _cm_user THEN
    RAISE EXCEPTION 'cannot remove the owner role from the current company owner';
  END IF;
  RETURN OLD;
END $$;

-- RPCs: fixed empty search_path.
CREATE OR REPLACE FUNCTION public.transfer_company_ownership(
  _company_id uuid, _new_owner_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _actor uuid := auth.uid();
  _current_owner uuid;
  _old_member_id uuid;
  _new_member_id uuid;
  _owner_role_id uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _new_owner_user_id IS NULL THEN RAISE EXCEPTION 'new owner is required'; END IF;

  SELECT owner_user_id INTO _current_owner
  FROM public.companies WHERE id = _company_id FOR UPDATE;

  IF _current_owner IS NULL THEN RAISE EXCEPTION 'company not found'; END IF;
  IF _current_owner <> _actor THEN RAISE EXCEPTION 'only the current owner can transfer ownership'; END IF;
  IF _current_owner = _new_owner_user_id THEN RAISE EXCEPTION 'already the owner'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = _new_owner_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'new owner must already be an active member of the company';
  END IF;

  SELECT id INTO _owner_role_id FROM public.system_company_roles WHERE key = 'owner';
  SELECT id INTO _old_member_id FROM public.company_members WHERE company_id = _company_id AND user_id = _current_owner;
  SELECT id INTO _new_member_id FROM public.company_members WHERE company_id = _company_id AND user_id = _new_owner_user_id;

  PERFORM set_config('app.allow_owner_change', 'yes', true);
  UPDATE public.companies SET owner_user_id = _new_owner_user_id, updated_at = now() WHERE id = _company_id;
  PERFORM set_config('app.allow_owner_change', 'no', true);

  INSERT INTO public.company_member_roles (member_id, role_id)
  VALUES (_new_member_id, _owner_role_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.company_member_roles
  WHERE member_id = _old_member_id AND role_id = _owner_role_id;

  INSERT INTO public.agent_audit_log (user_id, role_at_time, tool_name, input_summary, output_summary, status)
  VALUES (_actor, 'owner', 'transfer_company_ownership',
    jsonb_build_object('company_id', _company_id, 'from', _current_owner, 'to', _new_owner_user_id),
    jsonb_build_object('ok', true), 'success');

  RETURN jsonb_build_object('ok', true, 'company_id', _company_id, 'new_owner', _new_owner_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.decide_product_suggestion(_suggestion_id uuid, _accept boolean, _feedback text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.product_suggestions%ROWTYPE;
  p public.products%ROWTYPE;
  _actor uuid := auth.uid();
  _patch jsonb := '{}'::jsonb;
  _before jsonb := '{}'::jsonb;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO s FROM public.product_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found'; END IF;
  IF s.seller_id <> _actor THEN RAISE EXCEPTION 'not your suggestion'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'already decided'; END IF;

  IF _accept AND s.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = s.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;
    IF p.seller_id <> _actor THEN RAISE EXCEPTION 'not your product'; END IF;
    IF s.product_updated_at_at_suggestion IS NOT NULL
       AND p.updated_at <> s.product_updated_at_at_suggestion THEN
      RAISE EXCEPTION 'product was modified after suggestion — please regenerate';
    END IF;
    IF s.suggestion_type = 'title' THEN
      _before := jsonb_build_object('title', p.title);
      _patch := jsonb_build_object('title', s.suggested_value->>'value');
      UPDATE public.products SET title = s.suggested_value->>'value', updated_at = now() WHERE id = p.id;
    ELSIF s.suggestion_type = 'description' THEN
      _before := jsonb_build_object('description', p.description);
      _patch := jsonb_build_object('description', s.suggested_value->>'value');
      UPDATE public.products SET description = s.suggested_value->>'value', updated_at = now() WHERE id = p.id;
    ELSIF s.suggestion_type = 'price' THEN
      _before := jsonb_build_object('price_cents', p.price_cents);
      _patch := jsonb_build_object('price_cents', (s.suggested_value->>'price_cents')::int);
      UPDATE public.products SET price_cents = (s.suggested_value->>'price_cents')::int, updated_at = now() WHERE id = p.id;
    ELSE
      RAISE EXCEPTION 'unsupported suggestion type: %', s.suggestion_type;
    END IF;
  END IF;

  UPDATE public.product_suggestions SET
    status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
    decided_at = now(), decided_by = _actor, feedback = _feedback,
    applied_at = CASE WHEN _accept THEN now() ELSE NULL END,
    applied_by = CASE WHEN _accept THEN _actor ELSE NULL END,
    applied_value = CASE WHEN _accept THEN _patch ELSE NULL END,
    before_value = CASE WHEN _accept THEN _before ELSE NULL END
  WHERE id = _suggestion_id;

  INSERT INTO public.agent_audit_log (user_id, role_at_time, tool_name, input_summary, output_summary, status)
  VALUES (_actor, 'seller', 'decide_product_suggestion',
    jsonb_build_object('suggestion_id', _suggestion_id, 'accept', _accept),
    jsonb_build_object('before', _before, 'applied', _patch), 'success');

  RETURN jsonb_build_object('ok', true, 'accepted', _accept, 'applied', _patch);
END $$;

-- Reassert grants (function body redefinition preserves grants but the
-- signature change on has_role would not — this is idempotent regardless).
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role)                     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)                 TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid)                       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_member(uuid, uuid)                   TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid, uuid)                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid)                    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.company_member_has_permission(uuid, uuid, text)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.company_member_has_permission(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.transfer_company_ownership(uuid, uuid)              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transfer_company_ownership(uuid, uuid)          TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decide_product_suggestion(uuid, boolean, text)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decide_product_suggestion(uuid, boolean, text)  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._companies_after_insert_bootstrap_owner()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._companies_before_update_owner_guard()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._company_member_roles_guard_owner_role()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._company_members_guard_owner_membership()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                                   FROM PUBLIC, anon, authenticated;
