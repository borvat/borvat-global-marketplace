-- =====================================================================
-- M1V-1D — SELLER APPLICATION AND VERIFICATION WORKFLOW (BUSINESS DDL)
-- Governance: BORVAT_MASTER_BLUEPRINT_V1 / PHASE_5_EXECUTION_SPEC_V1
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. MANDATORY FAIL-CLOSED PREFLIGHT
-- ---------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regclass('public.companies') IS NULL
     OR to_regclass('public.merchant_stores') IS NULL
     OR to_regclass('public.company_legal_identities') IS NULL
     OR to_regclass('public.seller_verification_events') IS NULL THEN
    RAISE EXCEPTION 'M1V1D PREFLIGHT: required M1V-1C foundation objects missing';
  END IF;

  IF to_regclass('public.seller_applications') IS NOT NULL
     OR to_regclass('public.seller_application_events') IS NOT NULL THEN
    RAISE EXCEPTION 'M1V1D PREFLIGHT: application objects already exist (re-run blocked)';
  END IF;

  IF to_regprocedure('public.is_company_member(uuid,uuid)') IS NULL
     OR to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'M1V1D PREFLIGHT: authorisation helpers missing';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------
-- 1. APPLICATION TABLE (one application per legal company)
-- ---------------------------------------------------------------------
CREATE TABLE public.seller_applications (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  store_id                      uuid REFERENCES public.merchant_stores(id) ON DELETE SET NULL,
  status                        text NOT NULL DEFAULT 'draft',
  contact_name                  text,
  contact_email                 text,
  contact_phone                 text,
  intended_categories           text[] NOT NULL DEFAULT '{}'::text[],
  expected_monthly_orders       integer,
  business_summary              text,
  seller_note                   text,
  reviewer_note                 text,
  information_required_reason   text,
  rejection_reason              text,
  suspension_reason             text,
  submitted_at                  timestamptz,
  review_started_at             timestamptz,
  information_requested_at      timestamptz,
  approved_at                   timestamptz,
  rejected_at                   timestamptz,
  suspended_at                  timestamptz,
  decided_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by                    uuid,
  updated_by                    uuid,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sa_company_unique UNIQUE (company_id),
  CONSTRAINT sa_status_ck CHECK (status = ANY (ARRAY[
    'draft','submitted','under_review','information_required',
    'approved','rejected','suspended'])),
  CONSTRAINT sa_contact_name_ck CHECK (contact_name IS NULL
    OR length(btrim(contact_name)) BETWEEN 2 AND 128),
  CONSTRAINT sa_contact_email_ck CHECK (contact_email IS NULL
    OR contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT sa_contact_phone_ck CHECK (contact_phone IS NULL
    OR contact_phone ~ '^\+?[0-9 ()-]{6,32}$'),
  CONSTRAINT sa_categories_ck CHECK (array_length(intended_categories, 1) IS NULL
    OR array_length(intended_categories, 1) <= 20),
  CONSTRAINT sa_volume_ck CHECK (expected_monthly_orders IS NULL
    OR (expected_monthly_orders >= 0 AND expected_monthly_orders <= 10000000)),
  CONSTRAINT sa_summary_ck CHECK (business_summary IS NULL
    OR length(business_summary) <= 4000),
  CONSTRAINT sa_seller_note_ck CHECK (seller_note IS NULL OR length(seller_note) <= 2000),
  CONSTRAINT sa_reviewer_note_ck CHECK (reviewer_note IS NULL OR length(reviewer_note) <= 2000),
  CONSTRAINT sa_approved_ck CHECK (status <> 'approved'
    OR (approved_at IS NOT NULL AND decided_by IS NOT NULL)),
  CONSTRAINT sa_rejected_ck CHECK (status <> 'rejected'
    OR (rejected_at IS NOT NULL AND length(btrim(coalesce(rejection_reason,''))) > 0)),
  CONSTRAINT sa_suspended_ck CHECK (status <> 'suspended'
    OR (suspended_at IS NOT NULL AND length(btrim(coalesce(suspension_reason,''))) > 0)),
  CONSTRAINT sa_info_ck CHECK (status <> 'information_required'
    OR length(btrim(coalesce(information_required_reason,''))) > 0)
);

CREATE INDEX seller_applications_status_ix
  ON public.seller_applications (status, coalesce(submitted_at, created_at) DESC);

-- ---------------------------------------------------------------------
-- 2. APPEND-ONLY APPLICATION HISTORY
-- ---------------------------------------------------------------------
CREATE TABLE public.seller_application_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.seller_applications(id) ON DELETE RESTRICT,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_type     text NOT NULL,
  from_status    text,
  to_status      text,
  actor_user_id  uuid,
  actor_role     text NOT NULL,
  reason         text,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sae_event_ck CHECK (event_type = ANY (ARRAY[
    'created','updated','submitted','review_started','information_required',
    'approved','rejected','suspended','reinstated','reopened'])),
  CONSTRAINT sae_actor_ck CHECK (actor_role = ANY (ARRAY['seller','platform_admin','system'])),
  CONSTRAINT sae_reason_ck CHECK (reason IS NULL OR length(reason) <= 2000)
);

CREATE INDEX seller_application_events_app_ix
  ON public.seller_application_events (application_id, occurred_at DESC);

-- ---------------------------------------------------------------------
-- 3. GUARDS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1v1d_guard_application_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_admin boolean := coalesce(current_setting('borvat.m1v1d_admin_action', true), 'off') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'M1V1D: application must be created in draft';
    END IF;
    IF NEW.submitted_at IS NOT NULL OR NEW.review_started_at IS NOT NULL
       OR NEW.approved_at IS NOT NULL OR NEW.rejected_at IS NOT NULL
       OR NEW.suspended_at IS NOT NULL OR NEW.decided_by IS NOT NULL
       OR NEW.reviewer_note IS NOT NULL THEN
      RAISE EXCEPTION 'M1V1D: review metadata cannot be supplied on creation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'M1V1D: identity columns are immutable';
  END IF;

  IF NOT v_admin THEN
    IF NEW.review_started_at IS DISTINCT FROM OLD.review_started_at
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
       OR NEW.information_requested_at IS DISTINCT FROM OLD.information_requested_at
       OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
       OR NEW.reviewer_note IS DISTINCT FROM OLD.reviewer_note
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
       OR NEW.information_required_reason IS DISTINCT FROM OLD.information_required_reason THEN
      RAISE EXCEPTION 'M1V1D: review fields are administrator-owned';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'                AND NEW.status = 'submitted') OR
      (OLD.status = 'information_required' AND NEW.status = 'submitted') OR
      (OLD.status = 'submitted'            AND NEW.status IN ('under_review','information_required')) OR
      (OLD.status = 'under_review'         AND NEW.status IN ('approved','rejected','information_required')) OR
      (OLD.status = 'rejected'             AND NEW.status = 'draft') OR
      (OLD.status = 'approved'             AND NEW.status = 'suspended') OR
      (OLD.status = 'suspended'            AND NEW.status IN ('under_review','approved'))
    ) THEN
      RAISE EXCEPTION 'M1V1D: illegal application transition % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status IN ('under_review','information_required','approved','rejected','suspended')
       AND NOT v_admin THEN
      RAISE EXCEPTION 'M1V1D: transition to % requires an administrator action', NEW.status;
    END IF;
  END IF;

  IF OLD.status NOT IN ('draft','information_required') AND NOT v_admin THEN
    IF NEW.contact_name IS DISTINCT FROM OLD.contact_name
       OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
       OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
       OR NEW.intended_categories IS DISTINCT FROM OLD.intended_categories
       OR NEW.expected_monthly_orders IS DISTINCT FROM OLD.expected_monthly_orders
       OR NEW.business_summary IS DISTINCT FROM OLD.business_summary THEN
      RAISE EXCEPTION 'M1V1D: submitted application data cannot be silently replaced';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.m1v1d_guard_application_event_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
  RAISE EXCEPTION 'M1V1D: application audit events are append-only';
END $fn$;

CREATE TRIGGER m1v1d_application_write
  BEFORE INSERT OR UPDATE ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.m1v1d_guard_application_write();

CREATE TRIGGER m1v1d_application_event_immutable
  BEFORE UPDATE OR DELETE ON public.seller_application_events
  FOR EACH ROW EXECUTE FUNCTION public.m1v1d_guard_application_event_immutable();

ALTER TABLE public.seller_applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_applications        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.seller_application_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_application_events  FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. INTERNAL HELPERS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1v1d_application_json(p_company_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
  SELECT to_jsonb(x) FROM (
    SELECT a.id, a.company_id, a.store_id, a.status,
           a.contact_name, a.contact_email, a.contact_phone,
           a.intended_categories, a.expected_monthly_orders, a.business_summary,
           a.seller_note, a.reviewer_note, a.information_required_reason,
           a.rejection_reason, a.suspension_reason,
           a.submitted_at, a.review_started_at, a.information_requested_at,
           a.approved_at, a.rejected_at, a.suspended_at,
           a.created_at, a.updated_at,
           c.name AS company_name,
           li.legal_name, li.registration_country, li.verification_status AS legal_status,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'event_type', e.event_type, 'from_status', e.from_status,
                     'to_status', e.to_status, 'actor_role', e.actor_role,
                     'reason', e.reason, 'occurred_at', e.occurred_at)
                     ORDER BY e.occurred_at DESC), '[]'::jsonb)
              FROM public.seller_application_events e
             WHERE e.application_id = a.id) AS history
      FROM public.seller_applications a
      JOIN public.companies c ON c.id = a.company_id
      LEFT JOIN public.company_legal_identities li ON li.company_id = a.company_id
     WHERE a.company_id = p_company_id
  ) x;
$fn$;

CREATE OR REPLACE FUNCTION public.m1v1d_require_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END $fn$;

-- ---------------------------------------------------------------------
-- 5. SELLER RPC SURFACE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_get_application(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;
  RETURN public.m1v1d_application_json(p_company_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.seller_upsert_application(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_intended_categories text[] DEFAULT NULL,
  p_expected_monthly_orders integer DEFAULT NULL,
  p_business_summary text DEFAULT NULL,
  p_seller_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
  v_id     uuid;
  v_cats   text[] := coalesce(p_intended_categories, '{}'::text[]);
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.merchant_stores s
       WHERE s.id = p_store_id AND s.company_id = p_company_id) THEN
    RAISE EXCEPTION 'store_not_in_company' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_id, v_status
    FROM public.seller_applications WHERE company_id = p_company_id FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.seller_applications (
      company_id, store_id, contact_name, contact_email, contact_phone,
      intended_categories, expected_monthly_orders, business_summary, seller_note,
      created_by, updated_by)
    VALUES (p_company_id, p_store_id, p_contact_name, p_contact_email, p_contact_phone,
      v_cats, p_expected_monthly_orders, p_business_summary, p_seller_note, v_uid, v_uid)
    RETURNING id INTO v_id;

    INSERT INTO public.seller_application_events (
      application_id, company_id, event_type, to_status, actor_user_id, actor_role)
    VALUES (v_id, p_company_id, 'created', 'draft', v_uid, 'seller');

    RETURN public.m1v1d_application_json(p_company_id);
  END IF;

  IF v_status = 'rejected' THEN
    UPDATE public.seller_applications SET status = 'draft', updated_by = v_uid
     WHERE id = v_id;
    INSERT INTO public.seller_application_events (
      application_id, company_id, event_type, from_status, to_status, actor_user_id, actor_role)
    VALUES (v_id, p_company_id, 'reopened', 'rejected', 'draft', v_uid, 'seller');
    v_status := 'draft';
  END IF;

  IF v_status NOT IN ('draft','information_required') THEN
    RAISE EXCEPTION 'application_not_editable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.seller_applications
     SET store_id                = coalesce(p_store_id, store_id),
         contact_name            = coalesce(p_contact_name, contact_name),
         contact_email           = coalesce(p_contact_email, contact_email),
         contact_phone           = coalesce(p_contact_phone, contact_phone),
         intended_categories     = coalesce(p_intended_categories, intended_categories),
         expected_monthly_orders = coalesce(p_expected_monthly_orders, expected_monthly_orders),
         business_summary        = coalesce(p_business_summary, business_summary),
         seller_note             = coalesce(p_seller_note, seller_note),
         updated_by              = v_uid
   WHERE id = v_id;

  INSERT INTO public.seller_application_events (
    application_id, company_id, event_type, from_status, to_status, actor_user_id, actor_role)
  VALUES (v_id, p_company_id, 'updated', v_status, v_status, v_uid, 'seller');

  RETURN public.m1v1d_application_json(p_company_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.seller_submit_application(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_status text;
  v_app    public.seller_applications%ROWTYPE;
  v_li     public.company_legal_identities%ROWTYPE;
  v_kvk    boolean;
  v_vat    boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.seller_applications
   WHERE company_id = p_company_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application_missing' USING ERRCODE = '22023';
  END IF;
  v_id := v_app.id; v_status := v_app.status;

  IF v_status NOT IN ('draft','information_required') THEN
    RAISE EXCEPTION 'not_submittable' USING ERRCODE = '22023';
  END IF;

  IF coalesce(btrim(v_app.contact_name),'') = ''
     OR coalesce(btrim(v_app.contact_email),'') = ''
     OR array_length(v_app.intended_categories, 1) IS NULL THEN
    RAISE EXCEPTION 'application_incomplete' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_li FROM public.company_legal_identities WHERE company_id = p_company_id;
  IF v_li.company_id IS NULL
     OR coalesce(btrim(v_li.legal_name),'') = ''
     OR coalesce(btrim(v_li.registration_country),'') = ''
     OR coalesce(btrim(v_li.address_line1),'') = ''
     OR coalesce(btrim(v_li.city),'') = '' THEN
    RAISE EXCEPTION 'legal_identity_incomplete' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.company_legal_identifiers i
                  WHERE i.company_id = p_company_id AND i.identifier_type = 'kvk'
                    AND i.revoked_at IS NULL),
         EXISTS (SELECT 1 FROM public.company_legal_identifiers i
                  WHERE i.company_id = p_company_id AND i.identifier_type = 'vat'
                    AND i.revoked_at IS NULL)
    INTO v_kvk, v_vat;
  IF NOT v_kvk OR NOT v_vat THEN
    RAISE EXCEPTION 'legal_identifiers_incomplete' USING ERRCODE = '22023';
  END IF;

  UPDATE public.seller_applications
     SET status = 'submitted', submitted_at = now(), updated_by = v_uid
   WHERE id = v_id;

  INSERT INTO public.seller_application_events (
    application_id, company_id, event_type, from_status, to_status, actor_user_id, actor_role)
  VALUES (v_id, p_company_id, 'submitted', v_status, 'submitted', v_uid, 'seller');

  IF v_li.verification_status IN ('draft','information_required') THEN
    UPDATE public.company_legal_identities
       SET verification_status = 'submitted', submitted_at = now(), updated_by = v_uid
     WHERE company_id = p_company_id;
    INSERT INTO public.seller_verification_events (
      company_id, scope, event_type, from_status, to_status, actor_user_id, actor_role)
    VALUES (p_company_id, 'legal_identity', 'submitted',
            v_li.verification_status, 'submitted', v_uid, 'seller');
  END IF;

  RETURN public.m1v1d_application_json(p_company_id);
END $fn$;

-- ---------------------------------------------------------------------
-- 6. ADMIN RPC SURFACE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_seller_applications(
  p_status text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  application_id uuid, company_id uuid, company_name text, legal_name text,
  registration_country text, store_id uuid, store_name text, status text,
  legal_status text, contact_name text, submitted_at timestamptz,
  review_started_at timestamptz, updated_at timestamptz, created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_uid uuid := public.m1v1d_require_admin();
  v_lim integer := GREATEST(1, LEAST(coalesce(p_limit, 50), 200));
  v_off integer := GREATEST(0, coalesce(p_offset, 0));
  v_st  text := nullif(btrim(coalesce(p_status, '')), '');
BEGIN
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
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_get_seller_application(p_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_uid uuid := public.m1v1d_require_admin();
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.seller_applications WHERE id = p_application_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = '22023';
  END IF;
  RETURN public.m1v1d_application_json(v_company);
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_review_seller_application(
  p_application_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_uid    uuid := public.m1v1d_require_admin();
  v_app    public.seller_applications%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from   text;
  v_to     text;
  v_li     text;
BEGIN
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

  -- No self-approval: an administrator may never decide on their own company.
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
      VALUES (v_app.company_id, 'legal_identity', 'review_started', v_li, 'under_review', v_uid, 'platform_admin');
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
              'information_required', v_uid, 'platform_admin');
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
              v_uid, 'platform_admin', v_reason);
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
              v_uid, 'platform_admin', v_reason);
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
              v_uid, 'platform_admin', v_reason);
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
              v_uid, 'platform_admin', v_reason);
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
          v_from, v_to, v_uid, 'platform_admin', v_reason);

  PERFORM set_config('borvat.m1v1d_admin_action', 'off', true);
  PERFORM set_config('borvat.m1v1c_admin_action', 'off', true);

  RETURN public.m1v1d_application_json(v_app.company_id);
END $fn$;

-- ---------------------------------------------------------------------
-- 7. ACL NORMALIZATION (deny-by-default, explicit grants only)
-- ---------------------------------------------------------------------
REVOKE ALL ON public.seller_applications       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.seller_application_events FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.m1v1d_guard_application_write()            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1v1d_guard_application_event_immutable()  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1v1d_application_json(uuid)               FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1v1d_require_admin()                      FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.seller_get_application(uuid)               FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seller_upsert_application(uuid,uuid,text,text,text,text[],integer,text,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.seller_submit_application(uuid)            FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_list_seller_applications(text,integer,integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_get_seller_application(uuid)         FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.admin_review_seller_application(uuid,text,text) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.seller_get_application(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_upsert_application(uuid,uuid,text,text,text,text[],integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_submit_application(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_seller_applications(text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_seller_application(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_seller_application(uuid,text,text) TO authenticated;

DO $sandbox$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON public.seller_applications FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON public.seller_application_events FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM sandbox_exec';
  END IF;
END
$sandbox$;
