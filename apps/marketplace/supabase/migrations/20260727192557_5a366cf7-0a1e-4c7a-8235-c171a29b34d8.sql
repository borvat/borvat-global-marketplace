-- M1V-1D-A — INDEPENDENT SELLER VERIFICATION REVIEWER

ALTER TABLE public.seller_application_events DROP CONSTRAINT sae_actor_ck;
ALTER TABLE public.seller_application_events ADD CONSTRAINT sae_actor_ck
  CHECK (actor_role = ANY (ARRAY['seller','platform_admin','seller_verification_reviewer','system']));
ALTER TABLE public.seller_verification_events DROP CONSTRAINT sve_actor_ck;
ALTER TABLE public.seller_verification_events ADD CONSTRAINT sve_actor_ck
  CHECK (actor_role = ANY (ARRAY['seller','platform_admin','seller_verification_reviewer','system']));

-- Narrow gate: platform admin OR dedicated verification reviewer.
CREATE OR REPLACE FUNCTION public.m1v1da_require_reviewer()
RETURNS TABLE(uid uuid, actor_role text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles r
              WHERE r.user_id = v_uid AND r.role = 'admin'::public.app_role) THEN
    RETURN QUERY SELECT v_uid, 'platform_admin'::text;
  ELSIF EXISTS (SELECT 1 FROM public.user_roles r
                 WHERE r.user_id = v_uid
                   AND r.role = 'seller_verification_reviewer'::public.app_role) THEN
    RETURN QUERY SELECT v_uid, 'seller_verification_reviewer'::text;
  ELSE
    RAISE EXCEPTION 'not_verification_reviewer' USING ERRCODE = '42501';
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.m1v1da_require_reviewer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1v1da_require_reviewer() FROM anon;
GRANT EXECUTE ON FUNCTION public.m1v1da_require_reviewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.m1v1da_require_reviewer() TO service_role;

-- Read surface --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_seller_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_role text;
  v_company uuid;
BEGIN
  SELECT uid, actor_role INTO v_uid, v_role FROM public.m1v1da_require_reviewer();
  SELECT company_id INTO v_company FROM public.seller_applications WHERE id = p_application_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = '22023';
  END IF;
  RETURN public.m1v1d_application_json(v_company);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_list_seller_applications(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(application_id uuid, company_id uuid, company_name text, legal_name text, registration_country text, store_id uuid, store_name text, status text, legal_status text, contact_name text, submitted_at timestamp with time zone, review_started_at timestamp with time zone, updated_at timestamp with time zone, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_role text;
  v_lim integer := GREATEST(1, LEAST(coalesce(p_limit, 50), 200));
  v_off integer := GREATEST(0, coalesce(p_offset, 0));
  v_st  text := nullif(btrim(coalesce(p_status, '')), '');
BEGIN
  SELECT r.uid, r.actor_role INTO v_uid, v_role FROM public.m1v1da_require_reviewer() r;
  IF v_st IS NOT NULL AND v_st NOT IN ('draft','submitted','under_review',
       'information_required','approved','rejected','suspended') THEN
    RAISE EXCEPTION 'invalid_status_filter' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT a.id, a.company_id, c.name, li.legal_name, li.registration_country,
         a.store_id, s.display_name, a.status, li.verification_status,
         a.contact_name, a.submitted_at, a.review_started_at, a.updated_at, a.created_at
    FROM public.seller_applications a
    JOIN public.companies c ON c.id = a.company_id
    LEFT JOIN public.merchant_stores s ON s.id = a.store_id
    LEFT JOIN public.company_legal_identities li ON li.company_id = a.company_id
   WHERE (v_st IS NULL OR a.status = v_st)
   ORDER BY coalesce(a.submitted_at, a.created_at) DESC, a.id
   LIMIT v_lim OFFSET v_off;
END $function$;

-- Decision surface -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_seller_application(p_application_id uuid, p_action text, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid;
  v_actor  text;
  v_app    public.seller_applications%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from   text;
  v_to     text;
  v_li     text;
BEGIN
  SELECT r.uid, r.actor_role INTO v_uid, v_actor FROM public.m1v1da_require_reviewer() r;

  IF p_action NOT IN ('start_review','request_information','approve','reject','suspend','reinstate') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_app FROM public.seller_applications
   WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = '22023';
  END IF;

  -- No self-approval: no reviewer or administrator may decide on their own company.
  IF public.is_company_member(v_app.company_id, v_uid) THEN
    RAISE EXCEPTION 'self_review_forbidden' USING ERRCODE = '42501';
  END IF;

  v_from := v_app.status;
  PERFORM set_config('borvat.m1v1d_admin_action', 'on', true);
  PERFORM set_config('borvat.m1v1c_admin_action', 'on', true);

  SELECT verification_status INTO v_li
    FROM public.company_legal_identities WHERE company_id = v_app.company_id FOR UPDATE;

  IF p_action = 'start_review' THEN
    IF v_from NOT IN ('submitted','suspended') THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    v_to := 'under_review';
    UPDATE public.seller_applications
       SET status = v_to, review_started_at = now(), reviewer_note = v_reason, updated_by = v_uid
     WHERE id = v_app.id;
    IF v_li IN ('submitted','suspended') THEN
      UPDATE public.company_legal_identities
         SET verification_status = 'under_review', review_started_at = now(), updated_by = v_uid
       WHERE company_id = v_app.company_id;
      INSERT INTO public.seller_verification_events (company_id, scope, event_type,
        from_status, to_status, actor_user_id, actor_role)
      VALUES (v_app.company_id, 'legal_identity', 'review_started', v_li, 'under_review', v_uid, v_actor);
    END IF;

  ELSIF p_action = 'request_information' THEN
    IF v_from NOT IN ('submitted','under_review') THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
    END IF;
    v_to := 'information_required';
    UPDATE public.seller_applications
       SET status = v_to, information_requested_at = now(),
           information_required_reason = v_reason, reviewer_note = v_reason, updated_by = v_uid
     WHERE id = v_app.id;
    IF v_li IN ('submitted','under_review') THEN
      UPDATE public.company_legal_identities
         SET verification_status = 'information_required', updated_by = v_uid
       WHERE company_id = v_app.company_id;
      INSERT INTO public.seller_verification_events (company_id, scope, event_type,
        from_status, to_status, actor_user_id, actor_role)
      VALUES (v_app.company_id, 'legal_identity', 'information_required', v_li,
              'information_required', v_uid, v_actor);
    END IF;

  ELSIF p_action = 'approve' THEN
    IF v_from <> 'under_review' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    IF v_li IS DISTINCT FROM 'under_review' AND v_li IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'legal_identity_not_reviewable' USING ERRCODE = '22023';
    END IF;
    v_to := 'approved';
    UPDATE public.seller_applications
       SET status = v_to, approved_at = now(), decided_by = v_uid,
           reviewer_note = v_reason, rejection_reason = NULL,
           suspension_reason = NULL, information_required_reason = NULL, updated_by = v_uid
     WHERE id = v_app.id;
    IF v_li = 'under_review' THEN
      UPDATE public.company_legal_identities
         SET verification_status = 'approved', verified_at = now(),
             verified_by = v_uid, updated_by = v_uid
       WHERE company_id = v_app.company_id;
      INSERT INTO public.seller_verification_events (company_id, scope, event_type,
        from_status, to_status, actor_user_id, actor_role, reason)
      VALUES (v_app.company_id, 'legal_identity', 'approved', v_li, 'approved',
              v_uid, v_actor, v_reason);
    END IF;

  ELSIF p_action = 'reject' THEN
    IF v_from <> 'under_review' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
    END IF;
    v_to := 'rejected';
    UPDATE public.seller_applications
       SET status = v_to, rejected_at = now(), decided_by = v_uid,
           rejection_reason = v_reason, reviewer_note = v_reason, updated_by = v_uid
     WHERE id = v_app.id;
    IF v_li = 'under_review' THEN
      UPDATE public.company_legal_identities
         SET verification_status = 'rejected', rejected_at = now(),
             rejection_reason = v_reason, updated_by = v_uid
       WHERE company_id = v_app.company_id;
      INSERT INTO public.seller_verification_events (company_id, scope, event_type,
        from_status, to_status, actor_user_id, actor_role, reason)
      VALUES (v_app.company_id, 'legal_identity', 'rejected', v_li, 'rejected',
              v_uid, v_actor, v_reason);
    END IF;

  ELSIF p_action = 'suspend' THEN
    IF v_from <> 'approved' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
    END IF;
    v_to := 'suspended';
    UPDATE public.seller_applications
       SET status = v_to, suspended_at = now(), decided_by = v_uid,
           suspension_reason = v_reason, reviewer_note = v_reason, updated_by = v_uid
     WHERE id = v_app.id;
    IF v_li = 'approved' THEN
      UPDATE public.company_legal_identities
         SET verification_status = 'suspended', suspended_at = now(),
             suspension_reason = v_reason, updated_by = v_uid
       WHERE company_id = v_app.company_id;
      INSERT INTO public.seller_verification_events (company_id, scope, event_type,
        from_status, to_status, actor_user_id, actor_role, reason)
      VALUES (v_app.company_id, 'legal_identity', 'suspended', v_li, 'suspended',
              v_uid, v_actor, v_reason);
    END IF;

  ELSE -- reinstate
    IF v_from <> 'suspended' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    v_to := 'approved';
    UPDATE public.seller_applications SET status = 'under_review',
           review_started_at = now(), updated_by = v_uid WHERE id = v_app.id;
    UPDATE public.seller_applications
       SET status = 'approved', approved_at = now(), decided_by = v_uid,
           suspension_reason = NULL, reviewer_note = v_reason, updated_by = v_uid
     WHERE id = v_app.id;
    IF v_li = 'suspended' THEN
      UPDATE public.company_legal_identities
         SET verification_status = 'under_review', review_started_at = now(), updated_by = v_uid
       WHERE company_id = v_app.company_id;
      UPDATE public.company_legal_identities
         SET verification_status = 'approved', verified_at = now(),
             verified_by = v_uid, suspended_at = NULL, suspension_reason = NULL, updated_by = v_uid
       WHERE company_id = v_app.company_id;
      INSERT INTO public.seller_verification_events (company_id, scope, event_type,
        from_status, to_status, actor_user_id, actor_role, reason)
      VALUES (v_app.company_id, 'legal_identity', 'reinstated', 'suspended', 'approved',
              v_uid, v_actor, v_reason);
    END IF;
  END IF;

  INSERT INTO public.seller_application_events (
    application_id, company_id, event_type, from_status, to_status,
    actor_user_id, actor_role, reason)
  VALUES (v_app.id, v_app.company_id,
          CASE p_action
            WHEN 'start_review' THEN 'review_started'
            WHEN 'request_information' THEN 'information_required'
            WHEN 'approve' THEN 'approved'
            WHEN 'reject' THEN 'rejected'
            WHEN 'suspend' THEN 'suspended'
            ELSE 'reinstated' END,
          v_from, v_to, v_uid, v_actor, v_reason);

  PERFORM set_config('borvat.m1v1d_admin_action', 'off', true);
  PERFORM set_config('borvat.m1v1c_admin_action', 'off', true);

  RETURN public.m1v1d_application_json(v_app.company_id);
END $function$;

REVOKE ALL ON FUNCTION public.admin_get_seller_application(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_seller_application(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_seller_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_seller_application(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_seller_applications(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_seller_applications(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_seller_applications(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_seller_applications(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_review_seller_application(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_seller_application(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_review_seller_application(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_seller_application(uuid, text, text) TO service_role;

-- Role-grant governance: reviewer role is administrator-granted only ---------
CREATE OR REPLACE FUNCTION public.guard_user_roles_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _caller_is_admin boolean := false;
  _admin_count int;
  _protected public.app_role[] := ARRAY['admin'::public.app_role,
                                        'seller_verification_reviewer'::public.app_role];
BEGIN
  IF _caller IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = _caller AND role = 'admin'::public.app_role
    ) INTO _caller_is_admin;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = ANY(_protected) THEN
      IF NOT _caller_is_admin THEN
        RAISE EXCEPTION 'only platform admins can grant privileged roles'
          USING ERRCODE = '42501';
      END IF;
      IF _caller IS NOT DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'admins cannot grant privileged roles to themselves'
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
      IF NEW.role = ANY(_protected) OR OLD.role = ANY(_protected) THEN
        IF NOT _caller_is_admin THEN
          RAISE EXCEPTION 'only platform admins can modify privileged role assignments'
            USING ERRCODE = '42501';
        END IF;
        IF _caller IS NOT DISTINCT FROM OLD.user_id THEN
          RAISE EXCEPTION 'users cannot modify their own privileged role'
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
    IF OLD.role = ANY(_protected) THEN
      IF NOT _caller_is_admin THEN
        RAISE EXCEPTION 'only platform admins can remove privileged role assignments'
          USING ERRCODE = '42501';
      END IF;
      IF _caller IS NOT DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'admins cannot remove their own privileged role'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.role = 'admin'::public.app_role THEN
        SELECT count(*) INTO _admin_count
        FROM public.user_roles WHERE role = 'admin'::public.app_role;
        IF _admin_count <= 1 THEN
          RAISE EXCEPTION 'cannot remove the last platform admin'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END $function$;