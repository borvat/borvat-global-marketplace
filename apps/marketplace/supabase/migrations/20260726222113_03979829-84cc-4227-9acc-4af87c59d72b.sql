-- ============================================================================
-- M1V-1C — SELLER LEGAL IDENTITY, VERIFICATION AND PUBLIC STORE PROFILE
-- Business DDL. No publishing. No products/offers/inventory. No channel live.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Legal company identity (one per company)
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_legal_identities (
  company_id            uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE RESTRICT,
  legal_name            text NOT NULL,
  registration_country  text NOT NULL,
  legal_entity_type     text NOT NULL,
  address_line1         text,
  address_line2         text,
  postal_code           text,
  city                  text,
  region                text,
  address_country       text,
  business_email        text,
  business_phone        text,
  website_url           text,
  verification_status   text NOT NULL DEFAULT 'draft',
  submitted_at          timestamptz,
  review_started_at     timestamptz,
  verified_at           timestamptz,
  verified_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at           timestamptz,
  rejection_reason      text,
  suspended_at          timestamptz,
  suspension_reason     text,
  created_by            uuid,
  updated_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cli_legal_name_ck        CHECK (length(btrim(legal_name)) BETWEEN 2 AND 256),
  CONSTRAINT cli_reg_country_ck       CHECK (registration_country ~ '^[A-Z]{2}$'),
  CONSTRAINT cli_addr_country_ck      CHECK (address_country IS NULL OR address_country ~ '^[A-Z]{2}$'),
  CONSTRAINT cli_entity_type_ck       CHECK (legal_entity_type IN (
                                        'sole_trader','partnership','private_limited','public_limited',
                                        'cooperative','foundation','association','branch','other')),
  CONSTRAINT cli_status_ck            CHECK (verification_status IN (
                                        'draft','submitted','under_review','information_required',
                                        'approved','rejected','suspended')),
  CONSTRAINT cli_email_ck             CHECK (business_email IS NULL OR business_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT cli_phone_ck             CHECK (business_phone IS NULL OR business_phone ~ '^\+?[0-9 ()-]{6,32}$'),
  CONSTRAINT cli_website_ck           CHECK (website_url IS NULL OR website_url ~* '^https://[^\s]{4,255}$'),
  CONSTRAINT cli_approved_ck          CHECK (verification_status <> 'approved'
                                        OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)),
  CONSTRAINT cli_rejected_ck          CHECK (verification_status <> 'rejected'
                                        OR (rejected_at IS NOT NULL AND length(btrim(coalesce(rejection_reason,''))) > 0)),
  CONSTRAINT cli_suspended_ck         CHECK (verification_status <> 'suspended'
                                        OR (suspended_at IS NOT NULL AND length(btrim(coalesce(suspension_reason,''))) > 0))
);

-- ---------------------------------------------------------------------------
-- 2. Legal identifiers (kvk / vat / eori / company_registration / extensible)
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_legal_identifiers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  country_code        text NOT NULL,
  identifier_type     text NOT NULL,
  normalized_value    text NOT NULL,
  display_value       text NOT NULL,
  status              text NOT NULL DEFAULT 'active',
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_at         timestamptz,
  verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clid_country_ck    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT clid_type_ck       CHECK (identifier_type IN ('kvk','vat','eori','company_registration','other')),
  CONSTRAINT clid_norm_ck       CHECK (normalized_value ~ '^[A-Z0-9]{4,32}$'),
  CONSTRAINT clid_display_ck    CHECK (length(btrim(display_value)) BETWEEN 4 AND 64),
  CONSTRAINT clid_status_ck     CHECK (status IN ('active','replaced','revoked')),
  CONSTRAINT clid_vstatus_ck    CHECK (verification_status IN ('unverified','verified','rejected')),
  CONSTRAINT clid_verified_ck   CHECK (verification_status <> 'verified'
                                  OR (verified_at IS NOT NULL AND verified_by IS NOT NULL))
);

-- One active identifier value per (type,country) across the whole platform.
CREATE UNIQUE INDEX company_legal_identifiers_global_active_uk
  ON public.company_legal_identifiers (identifier_type, country_code, normalized_value)
  WHERE status = 'active';

-- One active identifier per type per company.
CREATE UNIQUE INDEX company_legal_identifiers_company_type_active_uk
  ON public.company_legal_identifiers (company_id, identifier_type)
  WHERE status = 'active';

CREATE INDEX company_legal_identifiers_company_ix
  ON public.company_legal_identifiers (company_id);

-- ---------------------------------------------------------------------------
-- 3. Public store profile
-- ---------------------------------------------------------------------------
CREATE TABLE public.merchant_store_public_profiles (
  merchant_store_id         uuid PRIMARY KEY,
  company_id                uuid NOT NULL,
  public_slug               text NOT NULL,
  display_name              text NOT NULL,
  logo_url                  text,
  cover_image_url           text,
  short_description         text,
  full_description          text,
  return_policy_summary     text,
  warranty_summary          text,
  customer_service_summary  text,
  seller_since              date,
  visibility_status         text NOT NULL DEFAULT 'draft',
  published_at              timestamptz,
  published_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at              timestamptz,
  suspension_reason         text,
  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mspp_store_company_fk FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT mspp_slug_format_ck CHECK (public_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$'),
  CONSTRAINT mspp_slug_lower_ck  CHECK (public_slug = lower(public_slug)),
  CONSTRAINT mspp_name_ck        CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  CONSTRAINT mspp_short_ck       CHECK (short_description IS NULL OR length(short_description) <= 280),
  CONSTRAINT mspp_full_ck        CHECK (full_description IS NULL OR length(full_description) <= 8000),
  CONSTRAINT mspp_visibility_ck  CHECK (visibility_status IN ('draft','review','published','hidden','suspended')),
  CONSTRAINT mspp_published_ck   CHECK (visibility_status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT mspp_suspended_ck   CHECK (visibility_status <> 'suspended'
                                   OR (suspended_at IS NOT NULL AND length(btrim(coalesce(suspension_reason,''))) > 0))
);

CREATE UNIQUE INDEX merchant_store_public_profiles_slug_uk
  ON public.merchant_store_public_profiles (public_slug);
CREATE INDEX merchant_store_public_profiles_company_ix
  ON public.merchant_store_public_profiles (company_id);

CREATE TABLE public.merchant_store_public_profile_categories (
  merchant_store_id uuid NOT NULL REFERENCES public.merchant_store_public_profiles(merchant_store_id) ON DELETE CASCADE,
  category_code     text NOT NULL,
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_store_id, category_code),
  CONSTRAINT msppc_code_ck CHECK (category_code ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$'),
  CONSTRAINT msppc_pos_ck  CHECK (position BETWEEN 0 AND 999)
);

CREATE TABLE public.merchant_store_public_profile_shipping_countries (
  merchant_store_id uuid NOT NULL REFERENCES public.merchant_store_public_profiles(merchant_store_id) ON DELETE CASCADE,
  country_code      text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_store_id, country_code),
  CONSTRAINT msppsc_country_ck CHECK (country_code ~ '^[A-Z]{2}$')
);

-- ---------------------------------------------------------------------------
-- 4. Immutable verification audit events
-- ---------------------------------------------------------------------------
CREATE TABLE public.seller_verification_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  scope          text NOT NULL,
  event_type     text NOT NULL,
  from_status    text,
  to_status      text,
  actor_user_id  uuid,
  actor_role     text NOT NULL,
  reason         text,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sve_scope_ck  CHECK (scope IN ('legal_identity','identifier','store_profile')),
  CONSTRAINT sve_actor_ck  CHECK (actor_role IN ('seller','platform_admin','system')),
  CONSTRAINT sve_event_ck  CHECK (event_type IN (
                             'created','updated','submitted','review_started','information_required',
                             'approved','rejected','suspended','reinstated',
                             'identifier_added','identifier_replaced','identifier_revoked',
                             'store_profile_created','store_profile_updated',
                             'store_visibility_changed'))
);

CREATE INDEX seller_verification_events_company_ix
  ON public.seller_verification_events (company_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Guard functions (owner-only; never app-executable)
-- ---------------------------------------------------------------------------

-- Legal identity: state machine + protection of approved/verification fields.
CREATE OR REPLACE FUNCTION public.m1v1c_guard_legal_identity_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin_action boolean := coalesce(current_setting('borvat.m1v1c_admin_action', true), 'off') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status <> 'draft' THEN
      RAISE EXCEPTION 'M1V1C: legal identity must be created in draft';
    END IF;
    IF NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL
       OR NEW.rejected_at IS NOT NULL OR NEW.suspended_at IS NOT NULL THEN
      RAISE EXCEPTION 'M1V1C: verification fields cannot be set on creation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'M1V1C: company_id is immutable';
  END IF;

  -- Verification-owned fields may only change through an admin action.
  IF NOT v_admin_action THEN
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.review_started_at IS DISTINCT FROM OLD.review_started_at
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
      RAISE EXCEPTION 'M1V1C: verification fields are administrator-owned';
    END IF;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NOT (
      (OLD.verification_status = 'draft'                AND NEW.verification_status = 'submitted') OR
      (OLD.verification_status = 'information_required' AND NEW.verification_status = 'submitted') OR
      (OLD.verification_status = 'submitted'            AND NEW.verification_status IN ('under_review','information_required')) OR
      (OLD.verification_status = 'under_review'         AND NEW.verification_status IN ('approved','rejected','information_required')) OR
      (OLD.verification_status = 'rejected'             AND NEW.verification_status = 'draft') OR
      (OLD.verification_status = 'approved'             AND NEW.verification_status IN ('under_review','suspended')) OR
      (OLD.verification_status = 'suspended'            AND NEW.verification_status = 'under_review')
    ) THEN
      RAISE EXCEPTION 'M1V1C: illegal verification transition % -> %',
        OLD.verification_status, NEW.verification_status;
    END IF;

    IF NEW.verification_status IN ('under_review','approved','rejected','suspended')
       AND NOT v_admin_action THEN
      RAISE EXCEPTION 'M1V1C: transition to % requires an administrator verification action', NEW.verification_status;
    END IF;
  END IF;

  -- Material legal fields are only editable while draft or information_required.
  IF OLD.verification_status NOT IN ('draft','information_required') AND NOT v_admin_action THEN
    IF NEW.legal_name IS DISTINCT FROM OLD.legal_name
       OR NEW.registration_country IS DISTINCT FROM OLD.registration_country
       OR NEW.legal_entity_type IS DISTINCT FROM OLD.legal_entity_type
       OR NEW.address_line1 IS DISTINCT FROM OLD.address_line1
       OR NEW.postal_code IS DISTINCT FROM OLD.postal_code
       OR NEW.city IS DISTINCT FROM OLD.city
       OR NEW.address_country IS DISTINCT FROM OLD.address_country THEN
      RAISE EXCEPTION 'M1V1C: approved/submitted legal data cannot be silently replaced';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1v1c_guard_identifier_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin_action boolean := coalesce(current_setting('borvat.m1v1c_admin_action', true), 'off') = 'on';
BEGIN
  NEW.normalized_value := upper(regexp_replace(coalesce(NEW.normalized_value, NEW.display_value), '[^A-Za-z0-9]', '', 'g'));

  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status <> 'unverified' OR NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'M1V1C: identifiers are created unverified';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'M1V1C: identifier company_id is immutable';
  END IF;

  IF NOT v_admin_action THEN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'M1V1C: identifier verification fields are administrator-owned';
    END IF;
    IF OLD.verification_status = 'verified'
       AND (NEW.normalized_value IS DISTINCT FROM OLD.normalized_value
            OR NEW.identifier_type IS DISTINCT FROM OLD.identifier_type
            OR NEW.country_code IS DISTINCT FROM OLD.country_code) THEN
      RAISE EXCEPTION 'M1V1C: a verified identifier cannot be silently replaced';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1v1c_guard_store_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin_action boolean := coalesce(current_setting('borvat.m1v1c_admin_action', true), 'off') = 'on';
  v_company_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.visibility_status <> 'draft' THEN
      RAISE EXCEPTION 'M1V1C: store profile must be created in draft';
    END IF;
    IF NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL OR NEW.suspended_at IS NOT NULL THEN
      RAISE EXCEPTION 'M1V1C: publication fields cannot be set on creation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.merchant_store_id <> OLD.merchant_store_id OR NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'M1V1C: store profile ownership is immutable';
  END IF;

  IF NOT v_admin_action THEN
    IF NEW.visibility_status IS DISTINCT FROM OLD.visibility_status
       AND NEW.visibility_status NOT IN ('draft','review') THEN
      RAISE EXCEPTION 'M1V1C: only an administrator may set visibility %', NEW.visibility_status;
    END IF;
    IF NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
      RAISE EXCEPTION 'M1V1C: publication fields are administrator-owned';
    END IF;
  END IF;

  IF NEW.visibility_status = 'published' THEN
    SELECT cli.verification_status INTO v_company_status
    FROM public.company_legal_identities cli
    WHERE cli.company_id = NEW.company_id;

    IF v_company_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'M1V1C: a store cannot be published before its company is approved';
    END IF;
    IF NEW.short_description IS NULL OR NEW.return_policy_summary IS NULL
       OR NEW.customer_service_summary IS NULL THEN
      RAISE EXCEPTION 'M1V1C: required public policy information is incomplete';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1v1c_guard_verification_event_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'M1V1C: verification audit events are append-only';
END $$;

CREATE TRIGGER m1v1c_legal_identity_write
  BEFORE INSERT OR UPDATE ON public.company_legal_identities
  FOR EACH ROW EXECUTE FUNCTION public.m1v1c_guard_legal_identity_write();

CREATE TRIGGER m1v1c_identifier_write
  BEFORE INSERT OR UPDATE ON public.company_legal_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.m1v1c_guard_identifier_write();

CREATE TRIGGER m1v1c_store_profile_write
  BEFORE INSERT OR UPDATE ON public.merchant_store_public_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1v1c_guard_store_profile_write();

CREATE TRIGGER m1v1c_verification_event_immutable
  BEFORE UPDATE OR DELETE ON public.seller_verification_events
  FOR EACH ROW EXECUTE FUNCTION public.m1v1c_guard_verification_event_immutable();

-- ---------------------------------------------------------------------------
-- 6. Deny-by-default: RLS enabled + forced, zero policies, zero table grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_legal_identities                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_legal_identities                        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_legal_identifiers                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_legal_identifiers                       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_public_profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_public_profiles                  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_public_profile_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_public_profile_categories        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_public_profile_shipping_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_public_profile_shipping_countries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_verification_events                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_verification_events                      FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. Controlled access surface (security definer RPCs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seller_get_legal_identity(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  SELECT jsonb_build_object(
    'company_id', c.company_id,
    'legal_name', c.legal_name,
    'registration_country', c.registration_country,
    'legal_entity_type', c.legal_entity_type,
    'address_line1', c.address_line1,
    'address_line2', c.address_line2,
    'postal_code', c.postal_code,
    'city', c.city,
    'region', c.region,
    'address_country', c.address_country,
    'business_email', c.business_email,
    'business_phone', c.business_phone,
    'website_url', c.website_url,
    'verification_status', c.verification_status,
    'submitted_at', c.submitted_at,
    'verified_at', c.verified_at,
    'editable', c.verification_status IN ('draft','information_required'),
    'identifiers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'type', i.identifier_type, 'country', i.country_code,
        'display_value', i.display_value, 'status', i.status,
        'verification_status', i.verification_status) ORDER BY i.identifier_type)
      FROM public.company_legal_identifiers i
      WHERE i.company_id = c.company_id AND i.status = 'active'), '[]'::jsonb)
  ) INTO v_out
  FROM public.company_legal_identities c
  WHERE c.company_id = p_company_id;
  RETURN coalesce(v_out, jsonb_build_object('company_id', p_company_id, 'verification_status', null));
END $$;

CREATE OR REPLACE FUNCTION public.seller_upsert_legal_identity(
  p_company_id uuid,
  p_legal_name text,
  p_registration_country text,
  p_legal_entity_type text,
  p_address_line1 text DEFAULT NULL,
  p_address_line2 text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_address_country text DEFAULT NULL,
  p_business_email text DEFAULT NULL,
  p_business_phone text DEFAULT NULL,
  p_website_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_existing text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT verification_status INTO v_existing
  FROM public.company_legal_identities WHERE company_id = p_company_id;

  IF v_existing IS NULL THEN
    INSERT INTO public.company_legal_identities (
      company_id, legal_name, registration_country, legal_entity_type,
      address_line1, address_line2, postal_code, city, region, address_country,
      business_email, business_phone, website_url, created_by, updated_by)
    VALUES (p_company_id, p_legal_name, upper(p_registration_country), p_legal_entity_type,
      p_address_line1, p_address_line2, p_postal_code, p_city, p_region, upper(p_address_country),
      p_business_email, p_business_phone, p_website_url, v_uid, v_uid);

    INSERT INTO public.seller_verification_events (company_id, scope, event_type, to_status, actor_user_id, actor_role)
    VALUES (p_company_id, 'legal_identity', 'created', 'draft', v_uid, 'seller');
  ELSE
    IF v_existing NOT IN ('draft','information_required') THEN
      RAISE EXCEPTION 'legal_identity_locked';
    END IF;
    UPDATE public.company_legal_identities SET
      legal_name = p_legal_name,
      registration_country = upper(p_registration_country),
      legal_entity_type = p_legal_entity_type,
      address_line1 = p_address_line1, address_line2 = p_address_line2,
      postal_code = p_postal_code, city = p_city, region = p_region,
      address_country = upper(p_address_country),
      business_email = p_business_email, business_phone = p_business_phone,
      website_url = p_website_url, updated_by = v_uid
    WHERE company_id = p_company_id;

    INSERT INTO public.seller_verification_events (company_id, scope, event_type, from_status, to_status, actor_user_id, actor_role)
    VALUES (p_company_id, 'legal_identity', 'updated', v_existing, v_existing, v_uid, 'seller');
  END IF;

  RETURN public.seller_get_legal_identity(p_company_id);
END $$;

CREATE OR REPLACE FUNCTION public.seller_upsert_legal_identifier(
  p_company_id uuid, p_identifier_type text, p_country_code text, p_display_value text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text := upper(regexp_replace(coalesce(p_display_value,''), '[^A-Za-z0-9]', '', 'g'));
  v_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  SELECT verification_status INTO v_status
  FROM public.company_legal_identities WHERE company_id = p_company_id;
  IF v_status IS NULL OR v_status NOT IN ('draft','information_required') THEN
    RAISE EXCEPTION 'legal_identity_locked';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.company_legal_identifiers
    WHERE status = 'active' AND identifier_type = p_identifier_type
      AND country_code = upper(p_country_code) AND normalized_value = v_norm
      AND company_id <> p_company_id) THEN
    RAISE EXCEPTION 'identifier_already_claimed';
  END IF;

  UPDATE public.company_legal_identifiers
     SET status = 'replaced'
   WHERE company_id = p_company_id AND identifier_type = p_identifier_type
     AND status = 'active' AND normalized_value <> v_norm
     AND verification_status <> 'verified';

  INSERT INTO public.company_legal_identifiers
    (company_id, country_code, identifier_type, normalized_value, display_value)
  VALUES (p_company_id, upper(p_country_code), p_identifier_type, v_norm, btrim(p_display_value))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.seller_verification_events (company_id, scope, event_type, actor_user_id, actor_role, reason)
  VALUES (p_company_id, 'identifier', 'identifier_added', v_uid, 'seller', p_identifier_type);

  RETURN public.seller_get_legal_identity(p_company_id);
END $$;

CREATE OR REPLACE FUNCTION public.seller_submit_legal_identity(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  SELECT verification_status INTO v_status
  FROM public.company_legal_identities WHERE company_id = p_company_id;
  IF v_status IS NULL OR v_status NOT IN ('draft','information_required') THEN
    RAISE EXCEPTION 'not_submittable';
  END IF;
  UPDATE public.company_legal_identities
     SET verification_status = 'submitted', submitted_at = now(), updated_by = v_uid
   WHERE company_id = p_company_id;
  INSERT INTO public.seller_verification_events (company_id, scope, event_type, from_status, to_status, actor_user_id, actor_role)
  VALUES (p_company_id, 'legal_identity', 'submitted', v_status, 'submitted', v_uid, 'seller');
  RETURN public.seller_get_legal_identity(p_company_id);
END $$;

CREATE OR REPLACE FUNCTION public.seller_get_store_public_profile(p_company_id uuid, p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  SELECT jsonb_build_object(
    'merchant_store_id', p.merchant_store_id,
    'public_slug', p.public_slug,
    'display_name', p.display_name,
    'logo_url', p.logo_url,
    'cover_image_url', p.cover_image_url,
    'short_description', p.short_description,
    'full_description', p.full_description,
    'return_policy_summary', p.return_policy_summary,
    'warranty_summary', p.warranty_summary,
    'customer_service_summary', p.customer_service_summary,
    'seller_since', p.seller_since,
    'visibility_status', p.visibility_status,
    'categories', coalesce((SELECT jsonb_agg(c.category_code ORDER BY c.position, c.category_code)
                            FROM public.merchant_store_public_profile_categories c
                            WHERE c.merchant_store_id = p.merchant_store_id), '[]'::jsonb),
    'shipping_countries', coalesce((SELECT jsonb_agg(s.country_code ORDER BY s.country_code)
                            FROM public.merchant_store_public_profile_shipping_countries s
                            WHERE s.merchant_store_id = p.merchant_store_id), '[]'::jsonb),
    'verified_badge', (p.visibility_status = 'published'
                       AND EXISTS (SELECT 1 FROM public.company_legal_identities cli
                                   WHERE cli.company_id = p.company_id AND cli.verification_status = 'approved'))
  ) INTO v_out
  FROM public.merchant_store_public_profiles p
  WHERE p.merchant_store_id = p_store_id AND p.company_id = p_company_id;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.seller_upsert_store_public_profile(
  p_company_id uuid, p_store_id uuid,
  p_public_slug text, p_display_name text,
  p_logo_url text DEFAULT NULL, p_cover_image_url text DEFAULT NULL,
  p_short_description text DEFAULT NULL, p_full_description text DEFAULT NULL,
  p_return_policy_summary text DEFAULT NULL, p_warranty_summary text DEFAULT NULL,
  p_customer_service_summary text DEFAULT NULL, p_seller_since date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_exists boolean; v_vis text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.merchant_stores s
                 WHERE s.id = p_store_id AND s.company_id = p_company_id) THEN
    RAISE EXCEPTION 'store_not_found';
  END IF;

  SELECT true, visibility_status INTO v_exists, v_vis
  FROM public.merchant_store_public_profiles WHERE merchant_store_id = p_store_id;

  IF v_exists IS NOT TRUE THEN
    INSERT INTO public.merchant_store_public_profiles (
      merchant_store_id, company_id, public_slug, display_name, logo_url, cover_image_url,
      short_description, full_description, return_policy_summary, warranty_summary,
      customer_service_summary, seller_since, created_by, updated_by)
    VALUES (p_store_id, p_company_id, lower(p_public_slug), p_display_name, p_logo_url, p_cover_image_url,
      p_short_description, p_full_description, p_return_policy_summary, p_warranty_summary,
      p_customer_service_summary, p_seller_since, v_uid, v_uid);
    INSERT INTO public.seller_verification_events (company_id, scope, event_type, to_status, actor_user_id, actor_role)
    VALUES (p_company_id, 'store_profile', 'store_profile_created', 'draft', v_uid, 'seller');
  ELSE
    IF v_vis NOT IN ('draft','review') THEN
      RAISE EXCEPTION 'store_profile_locked';
    END IF;
    UPDATE public.merchant_store_public_profiles SET
      display_name = p_display_name, logo_url = p_logo_url, cover_image_url = p_cover_image_url,
      short_description = p_short_description, full_description = p_full_description,
      return_policy_summary = p_return_policy_summary, warranty_summary = p_warranty_summary,
      customer_service_summary = p_customer_service_summary, seller_since = p_seller_since,
      updated_by = v_uid
    WHERE merchant_store_id = p_store_id;
    INSERT INTO public.seller_verification_events (company_id, scope, event_type, from_status, to_status, actor_user_id, actor_role)
    VALUES (p_company_id, 'store_profile', 'store_profile_updated', v_vis, v_vis, v_uid, 'seller');
  END IF;

  RETURN public.seller_get_store_public_profile(p_company_id, p_store_id);
END $$;

-- Public storefront read: published + approved only, safe display fields only.
CREATE OR REPLACE FUNCTION public.public_get_store_profile(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'public_slug', p.public_slug,
    'display_name', p.display_name,
    'logo_url', p.logo_url,
    'cover_image_url', p.cover_image_url,
    'short_description', p.short_description,
    'full_description', p.full_description,
    'return_policy_summary', p.return_policy_summary,
    'warranty_summary', p.warranty_summary,
    'customer_service_summary', p.customer_service_summary,
    'seller_since', p.seller_since,
    'categories', coalesce((SELECT jsonb_agg(c.category_code ORDER BY c.position, c.category_code)
                            FROM public.merchant_store_public_profile_categories c
                            WHERE c.merchant_store_id = p.merchant_store_id), '[]'::jsonb),
    'shipping_countries', coalesce((SELECT jsonb_agg(s.country_code ORDER BY s.country_code)
                            FROM public.merchant_store_public_profile_shipping_countries s
                            WHERE s.merchant_store_id = p.merchant_store_id), '[]'::jsonb),
    'verified_seller', true,
    'contact_channel', 'borvat_support'
  ) INTO v_out
  FROM public.merchant_store_public_profiles p
  JOIN public.company_legal_identities cli ON cli.company_id = p.company_id
  WHERE p.public_slug = lower(p_slug)
    AND p.visibility_status = 'published'
    AND cli.verification_status = 'approved';
  RETURN v_out;
END $$;

-- ---------------------------------------------------------------------------
-- 8. ACL normalization for this scope (R-T21)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.company_legal_identities,
  public.company_legal_identifiers,
  public.merchant_store_public_profiles,
  public.merchant_store_public_profile_categories,
  public.merchant_store_public_profile_shipping_countries,
  public.seller_verification_events
FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

REVOKE ALL ON FUNCTION public.m1v1c_guard_legal_identity_write() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1v1c_guard_identifier_write() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1v1c_guard_store_profile_write() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1v1c_guard_verification_event_immutable() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

REVOKE ALL ON FUNCTION public.seller_get_legal_identity(uuid) FROM PUBLIC, anon, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_upsert_legal_identity(uuid,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_upsert_legal_identifier(uuid,text,text,text) FROM PUBLIC, anon, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_submit_legal_identity(uuid) FROM PUBLIC, anon, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_get_store_public_profile(uuid,uuid) FROM PUBLIC, anon, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_upsert_store_public_profile(uuid,uuid,text,text,text,text,text,text,text,text,text,date) FROM PUBLIC, anon, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.public_get_store_profile(text) FROM PUBLIC, service_role, sandbox_exec;

GRANT EXECUTE ON FUNCTION public.seller_get_legal_identity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_upsert_legal_identity(uuid,text,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_upsert_legal_identifier(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_submit_legal_identity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_get_store_public_profile(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_upsert_store_public_profile(uuid,uuid,text,text,text,text,text,text,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_store_profile(text) TO anon, authenticated;