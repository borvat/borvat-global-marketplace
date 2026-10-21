-- M1A #2D-1C — First Platform Admin Assignment
-- Owner decision reference: BOR-DEC-042
-- Target: ceo@suroohholdings.com / 368d803e-d06b-485c-9e3c-e58b168d0419

DO $$
DECLARE
  _target uuid := '368d803e-d06b-485c-9e3c-e58b168d0419';
  _admin_count int;
  _exists_in_auth boolean;
  _already_admin boolean;
BEGIN
  -- Guard 1: no existing Platform Admin
  SELECT count(*) INTO _admin_count
  FROM public.user_roles WHERE role = 'admin'::public.app_role;
  IF _admin_count <> 0 THEN
    RAISE EXCEPTION 'bootstrap aborted: admin_count = % (expected 0)', _admin_count
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: target must exist in auth.users
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = _target)
    INTO _exists_in_auth;
  IF NOT _exists_in_auth THEN
    RAISE EXCEPTION 'bootstrap aborted: target user % not found in auth.users', _target
      USING ERRCODE = '42704';
  END IF;

  -- Guard 3: target must not already hold admin
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _target AND role = 'admin'::public.app_role
  ) INTO _already_admin;
  IF _already_admin THEN
    RAISE EXCEPTION 'bootstrap aborted: target user % already has admin role', _target
      USING ERRCODE = '42710';
  END IF;

  -- Disable ONLY the mutation guard; keep audit trigger active
  EXECUTE 'ALTER TABLE public.user_roles DISABLE TRIGGER trg_guard_user_roles';

  -- Insert the admin row (audit trigger fires automatically)
  INSERT INTO public.user_roles(user_id, role)
  VALUES (_target, 'admin'::public.app_role);

  -- Re-enable the guard inside the same transaction
  EXECUTE 'ALTER TABLE public.user_roles ENABLE TRIGGER trg_guard_user_roles';

  -- Explicit bootstrap-completion marker (distinct tool_name from automatic
  -- mutation audit; documents Owner decision reference BOR-DEC-042).
  INSERT INTO public.agent_audit_log(
    user_id, role_at_time, tool_name, status, input_summary
  ) VALUES (
    NULL,
    current_setting('role', true),
    'first_platform_admin_bootstrap_completed',
    'success',
    jsonb_build_object(
      'target_user_id', _target,
      'granted_role', 'admin',
      'owner_decision_ref', 'BOR-DEC-042',
      'method', 'migration-bound',
      'sprint', 'M1A #2D-1C',
      'purpose', 'Primary owner-controlled platform administration account for Borvat.'
    )
  );

  -- Sanity: confirm exactly one admin now exists (target)
  SELECT count(*) INTO _admin_count
  FROM public.user_roles WHERE role = 'admin'::public.app_role;
  IF _admin_count <> 1 THEN
    RAISE EXCEPTION 'bootstrap post-check failed: admin_count = %', _admin_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Close R-D4: remove sandbox_exec's INSERT on user_roles
REVOKE INSERT ON public.user_roles FROM sandbox_exec;

-- Close R-D6: tighten EXECUTE on trigger functions
REVOKE EXECUTE ON FUNCTION public.guard_user_roles_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- Provenance comment
COMMENT ON TABLE public.user_roles IS
  'Global platform roles. Guarded by trg_guard_user_roles + trg_audit_user_roles. First Platform Admin bootstrapped M1A #2D-1C / BOR-DEC-042.';