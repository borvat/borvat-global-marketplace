
-- =========================================================================
-- M1A #2D-1A — PLATFORM ADMIN ROLE GOVERNANCE HARDENING
-- Scope: public.user_roles only. No admin created, no admin RPC, no UI.
-- =========================================================================

-- 1) Comprehensive BEFORE guard replacing prevent_admin_self_grant.
CREATE OR REPLACE FUNCTION public.guard_user_roles_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  _caller uuid := auth.uid();
  _caller_is_admin boolean := false;
  _admin_count int;
BEGIN
  IF _caller IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = _caller AND role = 'admin'::public.app_role
    ) INTO _caller_is_admin;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin'::public.app_role THEN
      IF NOT _caller_is_admin THEN
        RAISE EXCEPTION 'only platform admins can grant admin role'
          USING ERRCODE = '42501';
      END IF;
      IF _caller IS NOT DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'admins cannot grant admin role to themselves'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'user_id of a role assignment is immutable'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NEW.role = 'admin'::public.app_role
         OR OLD.role = 'admin'::public.app_role THEN
        IF NOT _caller_is_admin THEN
          RAISE EXCEPTION 'only platform admins can modify admin role assignments'
            USING ERRCODE = '42501';
        END IF;
        IF _caller IS NOT DISTINCT FROM OLD.user_id THEN
          RAISE EXCEPTION 'users cannot modify their own global admin role'
            USING ERRCODE = '42501';
        END IF;
        IF OLD.role = 'admin'::public.app_role THEN
          SELECT count(*) INTO _admin_count
          FROM public.user_roles WHERE role = 'admin'::public.app_role;
          IF _admin_count <= 1 THEN
            RAISE EXCEPTION 'cannot demote the last platform admin'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin'::public.app_role THEN
      IF NOT _caller_is_admin THEN
        RAISE EXCEPTION 'only platform admins can remove admin role assignments'
          USING ERRCODE = '42501';
      END IF;
      IF _caller IS NOT DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'admins cannot remove their own admin role'
          USING ERRCODE = '42501';
      END IF;
      SELECT count(*) INTO _admin_count
      FROM public.user_roles WHERE role = 'admin'::public.app_role;
      IF _admin_count <= 1 THEN
        RAISE EXCEPTION 'cannot remove the last platform admin'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END $$;

-- 2) AFTER audit trigger — writes only successful mutations (within the same txn).
CREATE OR REPLACE FUNCTION public.audit_user_roles_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor uuid := auth.uid();
  _target uuid;
  _old text;
  _new text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _target := OLD.user_id;
    _old := OLD.role::text;
    _new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    _target := NEW.user_id;
    _old := NULL;
    _new := NEW.role::text;
  ELSE
    _target := NEW.user_id;
    _old := OLD.role::text;
    _new := NEW.role::text;
  END IF;

  INSERT INTO public.agent_audit_log(
    user_id, role_at_time, tool_name, status, input_summary
  ) VALUES (
    _actor,
    current_setting('role', true),
    'user_roles.mutation',
    'success',
    jsonb_build_object(
      'op', TG_OP,
      'target_user_id', _target,
      'old_role', _old,
      'new_role', _new,
      'source', 'trg_audit_user_roles'
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- 3) Rewire triggers on user_roles.
DROP TRIGGER IF EXISTS trg_prevent_admin_self_grant ON public.user_roles;
DROP TRIGGER IF EXISTS trg_guard_user_roles ON public.user_roles;
CREATE TRIGGER trg_guard_user_roles
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_mutation();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_change();

-- 4) Retire the legacy narrow guard (superseded, no other references).
DROP FUNCTION IF EXISTS public.prevent_admin_self_grant();

-- 5) GRANT hardening on user_roles.
--    Keep sandbox_exec SELECT/INSERT (Lovable tooling). All other roles: no direct DML.
REVOKE ALL ON public.user_roles FROM PUBLIC;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.user_roles FROM authenticated;
REVOKE ALL ON public.user_roles FROM service_role;
-- sandbox_exec: unchanged (already only SELECT, INSERT).

-- 6) Governance note.
COMMENT ON TABLE public.user_roles IS
  'Global platform roles. All mutations are mediated by trg_guard_user_roles (BEFORE) and trg_audit_user_roles (AFTER). No direct DML for anon/authenticated/service_role. Bootstrap of the first platform admin is deferred to M1A #2D-1B under separate Owner authorisation.';
