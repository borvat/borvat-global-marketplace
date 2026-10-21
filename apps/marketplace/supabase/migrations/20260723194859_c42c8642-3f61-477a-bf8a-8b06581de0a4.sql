
-- =========================================================================
-- Phase 1: Company tenancy foundation
-- =========================================================================

-- ---------- companies ----------------------------------------------------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_owner_idx ON public.companies(owner_user_id);

GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ---------- company_members ---------------------------------------------
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','invited','suspended','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX company_members_user_idx ON public.company_members(user_id);
CREATE INDEX company_members_company_idx ON public.company_members(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- ---------- system_company_roles ----------------------------------------
CREATE TABLE public.system_company_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE
    CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_company_roles TO authenticated;
GRANT SELECT ON public.system_company_roles TO anon;
GRANT ALL ON public.system_company_roles TO service_role;
ALTER TABLE public.system_company_roles ENABLE ROW LEVEL SECURITY;

-- ---------- permissions -------------------------------------------------
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE
    CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.permissions TO anon;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- ---------- role_permissions --------------------------------------------
CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.system_company_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO anon;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ---------- company_member_roles ----------------------------------------
CREATE TABLE public.company_member_roles (
  member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.system_company_roles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, role_id)
);
CREATE INDEX company_member_roles_role_idx ON public.company_member_roles(role_id);

GRANT SELECT, INSERT, DELETE ON public.company_member_roles TO authenticated;
GRANT ALL ON public.company_member_roles TO service_role;
ALTER TABLE public.company_member_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Seed system roles and canonical permissions
-- =========================================================================
INSERT INTO public.system_company_roles (key, name, description, sort_order) VALUES
  ('owner',    'Owner',    'Full control of the company. Exactly one per company.',        10),
  ('admin',    'Admin',    'Manage members, roles, catalog, orders, and credentials.',     20),
  ('manager',  'Manager',  'Manage catalog, orders and listings; cannot manage members.',  30),
  ('operator', 'Operator', 'Fulfil orders and update inventory; cannot manage catalog.',   40),
  ('viewer',   'Viewer',   'Read-only access to company data.',                            50);

INSERT INTO public.permissions (key, description) VALUES
  ('company.update',        'Update company profile (name, branding).'),
  ('members.read',          'View company members and their roles.'),
  ('members.manage',        'Invite, remove, suspend and re-role company members.'),
  ('ownership.transfer',    'Transfer ownership of the company to another member.'),
  ('catalog.read',          'View the company catalog and drafts.'),
  ('catalog.manage',        'Create, edit and archive catalog entries.'),
  ('catalog.suggest',       'Submit AI/agent catalog change suggestions.'),
  ('catalog.publish',       'Publish or unpublish catalog entries to channels.'),
  ('listings.manage',       'Manage channel listings and their published quantities.'),
  ('inventory.read',        'View inventory balances and ledger.'),
  ('inventory.adjust',      'Adjust inventory, safety buffers and dispositions.'),
  ('warehouses.manage',     'Create and configure warehouses and locations.'),
  ('orders.read',           'View orders belonging to the company.'),
  ('orders.manage',         'Update order status, tracking and fulfilment.'),
  ('credentials.manage',    'Manage encrypted channel credentials (e.g. Bol).'),
  ('agents.audit.read',     'Read the agent audit log.'),
  ('break_glass.approve',   'Approve a two-person break-glass action.'),
  ('break_glass.execute',   'Execute an approved break-glass action.'),
  ('billing.manage',        'Manage billing and subscriptions.');

-- Owner: every permission.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.system_company_roles r
CROSS JOIN public.permissions p
WHERE r.key = 'owner';

-- Admin: everything except ownership.transfer.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.system_company_roles r
CROSS JOIN public.permissions p
WHERE r.key = 'admin'
  AND p.key <> 'ownership.transfer';

-- Manager: catalog, listings, inventory, orders, agents audit read.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.system_company_roles r
CROSS JOIN public.permissions p
WHERE r.key = 'manager'
  AND p.key IN (
    'members.read',
    'catalog.read','catalog.manage','catalog.suggest','catalog.publish',
    'listings.manage',
    'inventory.read','inventory.adjust',
    'orders.read','orders.manage',
    'agents.audit.read'
  );

-- Operator: fulfilment + read.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.system_company_roles r
CROSS JOIN public.permissions p
WHERE r.key = 'operator'
  AND p.key IN (
    'members.read',
    'catalog.read',
    'inventory.read','inventory.adjust',
    'orders.read','orders.manage'
  );

-- Viewer: read-only.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.system_company_roles r
CROSS JOIN public.permissions p
WHERE r.key = 'viewer'
  AND p.key IN (
    'members.read','catalog.read','inventory.read','orders.read','agents.audit.read'
  );

-- =========================================================================
-- Security-definer helpers (avoid RLS recursion)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id AND owner_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.company_member_has_permission(
  _company_id uuid, _user_id uuid, _permission text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
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
$$;

REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_member_has_permission(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_member_has_permission(uuid, uuid, text) TO authenticated, service_role;

-- =========================================================================
-- updated_at triggers
-- =========================================================================
CREATE TRIGGER companies_touch_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER company_members_touch_updated_at
BEFORE UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- Ownership invariants — trusted trigger functions
-- =========================================================================

-- After a company is inserted, make sure the owner is an active member and holds the 'owner' role.
CREATE OR REPLACE FUNCTION public._companies_after_insert_bootstrap_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE TRIGGER companies_after_insert_bootstrap_owner
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public._companies_after_insert_bootstrap_owner();

-- Before UPDATE on companies: if owner_user_id changes, require new owner to be an active member.
-- Direct owner changes are BLOCKED for the caller — must go through transfer_company_ownership.
CREATE OR REPLACE FUNCTION public._companies_before_update_owner_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    -- Only service_role or the transfer function (which runs as definer with a session flag) may change ownership directly.
    IF current_setting('app.allow_owner_change', true) <> 'yes' THEN
      RAISE EXCEPTION 'ownership can only be changed via transfer_company_ownership()';
    END IF;
    IF NEW.owner_user_id IS NULL THEN
      RAISE EXCEPTION 'company owner cannot be null';
    END IF;
    IF NOT public.is_company_member(NEW.id, NEW.owner_user_id) THEN
      RAISE EXCEPTION 'new owner must be an active member of the company';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER companies_before_update_owner_guard
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public._companies_before_update_owner_guard();

-- Block deleting or downgrading the owner's own membership while they are still the owner.
CREATE OR REPLACE FUNCTION public._company_members_guard_owner_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner uuid;
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

CREATE TRIGGER company_members_guard_owner_membership
BEFORE UPDATE OR DELETE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public._company_members_guard_owner_membership();

-- Block removing the 'owner' role assignment from the owner's own membership.
CREATE OR REPLACE FUNCTION public._company_member_roles_guard_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _key text; _cm_user uuid; _cm_company uuid; _owner uuid;
BEGIN
  SELECT key INTO _key FROM public.system_company_roles WHERE id = OLD.role_id;
  IF _key <> 'owner' THEN
    RETURN OLD;
  END IF;
  SELECT user_id, company_id INTO _cm_user, _cm_company FROM public.company_members WHERE id = OLD.member_id;
  SELECT owner_user_id INTO _owner FROM public.companies WHERE id = _cm_company;
  IF _owner = _cm_user THEN
    RAISE EXCEPTION 'cannot remove the owner role from the current company owner';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER company_member_roles_guard_owner_role
BEFORE DELETE ON public.company_member_roles
FOR EACH ROW EXECUTE FUNCTION public._company_member_roles_guard_owner_role();

-- =========================================================================
-- transfer_company_ownership()
-- =========================================================================
CREATE OR REPLACE FUNCTION public.transfer_company_ownership(
  _company_id uuid, _new_owner_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _current_owner uuid;
  _old_member_id uuid;
  _new_member_id uuid;
  _owner_role_id uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _new_owner_user_id IS NULL THEN RAISE EXCEPTION 'new owner is required'; END IF;

  -- Lock the company row for the duration of this transaction to serialize concurrent transfers.
  SELECT owner_user_id INTO _current_owner
  FROM public.companies
  WHERE id = _company_id
  FOR UPDATE;

  IF _current_owner IS NULL THEN RAISE EXCEPTION 'company not found'; END IF;
  IF _current_owner <> _actor THEN RAISE EXCEPTION 'only the current owner can transfer ownership'; END IF;
  IF _current_owner = _new_owner_user_id THEN RAISE EXCEPTION 'already the owner'; END IF;

  IF NOT public.is_company_member(_company_id, _new_owner_user_id) THEN
    RAISE EXCEPTION 'new owner must already be an active member of the company';
  END IF;

  SELECT id INTO _owner_role_id FROM public.system_company_roles WHERE key = 'owner';
  SELECT id INTO _old_member_id FROM public.company_members WHERE company_id = _company_id AND user_id = _current_owner;
  SELECT id INTO _new_member_id FROM public.company_members WHERE company_id = _company_id AND user_id = _new_owner_user_id;

  -- Flip owner_user_id under a session flag that the guard trigger recognizes.
  PERFORM set_config('app.allow_owner_change', 'yes', true);
  UPDATE public.companies SET owner_user_id = _new_owner_user_id, updated_at = now() WHERE id = _company_id;
  PERFORM set_config('app.allow_owner_change', 'no', true);

  -- Grant owner role to new owner.
  INSERT INTO public.company_member_roles (member_id, role_id)
  VALUES (_new_member_id, _owner_role_id)
  ON CONFLICT DO NOTHING;

  -- Revoke owner role from previous owner (guard now allows it because they are no longer the owner).
  DELETE FROM public.company_member_roles
  WHERE member_id = _old_member_id AND role_id = _owner_role_id;

  INSERT INTO public.agent_audit_log (user_id, role_at_time, tool_name, input_summary, output_summary, status)
  VALUES (_actor, 'owner', 'transfer_company_ownership',
    jsonb_build_object('company_id', _company_id, 'from', _current_owner, 'to', _new_owner_user_id),
    jsonb_build_object('ok', true), 'success');

  RETURN jsonb_build_object('ok', true, 'company_id', _company_id, 'new_owner', _new_owner_user_id);
END $$;

REVOKE ALL ON FUNCTION public.transfer_company_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_company_ownership(uuid, uuid) TO authenticated, service_role;

-- =========================================================================
-- RLS policies
-- =========================================================================

-- companies -------------------------------------------------------------
CREATE POLICY "companies_select_members"
ON public.companies FOR SELECT TO authenticated
USING (public.is_company_member(id, auth.uid()));

CREATE POLICY "companies_insert_self_owner"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "companies_update_owner"
ON public.companies FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid() OR current_setting('app.allow_owner_change', true) = 'yes');

-- company_members -------------------------------------------------------
CREATE POLICY "company_members_select_same_company"
ON public.company_members FOR SELECT TO authenticated
USING (public.is_company_member(company_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "company_members_insert_manager"
ON public.company_members FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_owner(company_id, auth.uid())
  OR public.company_member_has_permission(company_id, auth.uid(), 'members.manage')
);

CREATE POLICY "company_members_update_manager"
ON public.company_members FOR UPDATE TO authenticated
USING (
  public.is_company_owner(company_id, auth.uid())
  OR public.company_member_has_permission(company_id, auth.uid(), 'members.manage')
)
WITH CHECK (
  public.is_company_owner(company_id, auth.uid())
  OR public.company_member_has_permission(company_id, auth.uid(), 'members.manage')
);

CREATE POLICY "company_members_delete_manager"
ON public.company_members FOR DELETE TO authenticated
USING (
  public.is_company_owner(company_id, auth.uid())
  OR public.company_member_has_permission(company_id, auth.uid(), 'members.manage')
);

-- system_company_roles / permissions / role_permissions: read-only catalog
CREATE POLICY "system_company_roles_read_all"
ON public.system_company_roles FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "permissions_read_all"
ON public.permissions FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "role_permissions_read_all"
ON public.role_permissions FOR SELECT TO authenticated, anon USING (true);

-- company_member_roles --------------------------------------------------
CREATE POLICY "company_member_roles_select_members"
ON public.company_member_roles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.id = company_member_roles.member_id
      AND (public.is_company_member(cm.company_id, auth.uid()) OR cm.user_id = auth.uid())
  )
);

CREATE POLICY "company_member_roles_insert_manager"
ON public.company_member_roles FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.id = company_member_roles.member_id
      AND (
        public.is_company_owner(cm.company_id, auth.uid())
        OR public.company_member_has_permission(cm.company_id, auth.uid(), 'members.manage')
      )
  )
);

CREATE POLICY "company_member_roles_delete_manager"
ON public.company_member_roles FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.id = company_member_roles.member_id
      AND (
        public.is_company_owner(cm.company_id, auth.uid())
        OR public.company_member_has_permission(cm.company_id, auth.uid(), 'members.manage')
      )
  )
);

-- =========================================================================
-- Backfill: give every existing seller their own company
-- =========================================================================
DO $$
DECLARE
  _u record;
  _slug text;
  _base text;
  _n int;
BEGIN
  FOR _u IN
    SELECT DISTINCT ur.user_id, COALESCE(p.full_name, p.email, ur.user_id::text) AS display
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'seller'
      AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_user_id = ur.user_id)
  LOOP
    _base := regexp_replace(lower(coalesce(_u.display, 'seller')), '[^a-z0-9]+', '-', 'g');
    _base := regexp_replace(_base, '(^-+|-+$)', '', 'g');
    IF length(_base) < 2 THEN _base := 'seller'; END IF;
    IF length(_base) > 40 THEN _base := left(_base, 40); END IF;
    _slug := _base;
    _n := 0;
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = _slug) LOOP
      _n := _n + 1;
      _slug := _base || '-' || _n::text;
    END LOOP;
    INSERT INTO public.companies (name, slug, owner_user_id)
    VALUES (coalesce(_u.display, 'Seller'), _slug, _u.user_id);
  END LOOP;
END $$;
