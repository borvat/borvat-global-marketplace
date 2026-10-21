-- PHASE 5 — M1C-1D-D — TRANSIT-TIME AND DELIVERY-CALENDAR FOUNDATION
-- Schema foundation only. No ETA resolver, no rate linkage, no RPC, no UI, no data.

-- ===========================================================================
-- 1. TRANSIT TIME PROFILES
-- ===========================================================================
CREATE TABLE public.shipping_transit_time_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  company_id uuid,
  merchant_store_id uuid,
  profile_code text NOT NULL,
  version_number integer NOT NULL,
  carrier_code text NOT NULL,
  service_code text NOT NULL,
  origin_scope_type text NOT NULL,
  fulfillment_origin_id uuid,
  origin_country_code text NOT NULL,
  destination_country_code text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  supersedes_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sttp_scope_type_ck CHECK (scope_type IN ('platform','merchant_store')),
  CONSTRAINT sttp_scope_tenancy_ck CHECK (
    (scope_type = 'platform' AND company_id IS NULL AND merchant_store_id IS NULL)
    OR (scope_type = 'merchant_store' AND company_id IS NOT NULL AND merchant_store_id IS NOT NULL)),
  CONSTRAINT sttp_profile_code_ck CHECK (profile_code ~ '^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$'),
  CONSTRAINT sttp_version_ck CHECK (version_number >= 1),
  CONSTRAINT sttp_carrier_code_ck CHECK (carrier_code ~ '^[A-Z0-9][A-Z0-9_]{1,31}$'),
  CONSTRAINT sttp_service_code_ck CHECK (service_code ~ '^[A-Z0-9][A-Z0-9_]{1,31}$'),
  CONSTRAINT sttp_origin_scope_ck CHECK (origin_scope_type IN ('exact_origin','origin_country')),
  CONSTRAINT sttp_origin_shape_ck CHECK (
    (origin_scope_type = 'exact_origin' AND fulfillment_origin_id IS NOT NULL AND scope_type = 'merchant_store')
    OR (origin_scope_type = 'origin_country' AND fulfillment_origin_id IS NULL)),
  CONSTRAINT sttp_origin_country_ck CHECK (origin_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT sttp_destination_country_ck CHECK (destination_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT sttp_status_ck CHECK (status IN ('draft','active','inactive','superseded','retired')),
  CONSTRAINT sttp_not_self_supersede_ck CHECK (supersedes_profile_id IS DISTINCT FROM id),
  CONSTRAINT sttp_id_tenant_uk UNIQUE (id, company_id, merchant_store_id),
  CONSTRAINT sttp_id_scope_uk UNIQUE (id, scope_type),
  CONSTRAINT sttp_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT sttp_store_company_fk FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT sttp_origin_tenancy_fk FOREIGN KEY (fulfillment_origin_id, company_id, merchant_store_id)
    REFERENCES public.merchant_fulfillment_origins(id, company_id, merchant_store_id) ON DELETE RESTRICT,
  CONSTRAINT sttp_supersedes_fk FOREIGN KEY (supersedes_profile_id)
    REFERENCES public.shipping_transit_time_profiles(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX sttp_family_version_uk ON public.shipping_transit_time_profiles (
  scope_type,
  COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(merchant_store_id, '00000000-0000-0000-0000-000000000000'::uuid),
  profile_code, version_number);

CREATE UNIQUE INDEX sttp_one_active_per_family_uk ON public.shipping_transit_time_profiles (
  scope_type,
  COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(merchant_store_id, '00000000-0000-0000-0000-000000000000'::uuid),
  profile_code) WHERE (status = 'active');

CREATE INDEX sttp_company_ix ON public.shipping_transit_time_profiles (company_id);
CREATE INDEX sttp_store_ix ON public.shipping_transit_time_profiles (merchant_store_id);
CREATE INDEX sttp_origin_ix ON public.shipping_transit_time_profiles (fulfillment_origin_id)
  WHERE fulfillment_origin_id IS NOT NULL;
CREATE INDEX sttp_supersedes_ix ON public.shipping_transit_time_profiles (supersedes_profile_id);

-- ===========================================================================
-- 2. WEEKDAY TRANSIT RULES
-- ===========================================================================
CREATE TABLE public.shipping_transit_time_weekday_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_transit_time_profile_id uuid NOT NULL,
  handover_weekday_iso smallint NOT NULL,
  handover_supported boolean NOT NULL,
  transit_min_business_days integer,
  transit_max_business_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sttwr_weekday_ck CHECK (handover_weekday_iso BETWEEN 1 AND 7),
  CONSTRAINT sttwr_supported_shape_ck CHECK (
    (handover_supported AND transit_min_business_days IS NOT NULL AND transit_max_business_days IS NOT NULL)
    OR ((NOT handover_supported) AND transit_min_business_days IS NULL AND transit_max_business_days IS NULL)),
  CONSTRAINT sttwr_min_ck CHECK (transit_min_business_days IS NULL OR transit_min_business_days >= 0),
  CONSTRAINT sttwr_range_ck CHECK (
    transit_max_business_days IS NULL OR transit_max_business_days >= transit_min_business_days),
  CONSTRAINT sttwr_profile_weekday_uk UNIQUE (shipping_transit_time_profile_id, handover_weekday_iso),
  CONSTRAINT sttwr_profile_fk FOREIGN KEY (shipping_transit_time_profile_id)
    REFERENCES public.shipping_transit_time_profiles(id) ON DELETE CASCADE
);

-- ===========================================================================
-- 3. DELIVERY WEEKDAYS
-- ===========================================================================
CREATE TABLE public.shipping_transit_delivery_weekdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_transit_time_profile_id uuid NOT NULL,
  delivery_weekday_iso smallint NOT NULL,
  delivery_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stdw_weekday_ck CHECK (delivery_weekday_iso BETWEEN 1 AND 7),
  CONSTRAINT stdw_profile_weekday_uk UNIQUE (shipping_transit_time_profile_id, delivery_weekday_iso),
  CONSTRAINT stdw_profile_fk FOREIGN KEY (shipping_transit_time_profile_id)
    REFERENCES public.shipping_transit_time_profiles(id) ON DELETE CASCADE
);

-- ===========================================================================
-- 4. CALENDAR PROFILES
-- ===========================================================================
CREATE TABLE public.shipping_calendar_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  company_id uuid,
  merchant_store_id uuid,
  calendar_code text NOT NULL,
  version_number integer NOT NULL,
  calendar_type text NOT NULL,
  country_code text,
  timezone_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  supersedes_calendar_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scp_scope_type_ck CHECK (scope_type IN ('platform','merchant_store')),
  CONSTRAINT scp_scope_tenancy_ck CHECK (
    (scope_type = 'platform' AND company_id IS NULL AND merchant_store_id IS NULL)
    OR (scope_type = 'merchant_store' AND company_id IS NOT NULL AND merchant_store_id IS NOT NULL)),
  CONSTRAINT scp_calendar_code_ck CHECK (calendar_code ~ '^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$'),
  CONSTRAINT scp_version_ck CHECK (version_number >= 1),
  CONSTRAINT scp_calendar_type_ck CHECK (calendar_type IN ('origin_handover','carrier_transit','destination_delivery')),
  CONSTRAINT scp_country_ck CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT scp_timezone_shape_ck CHECK (timezone_name ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+._-]+)+$'),
  CONSTRAINT scp_status_ck CHECK (status IN ('draft','active','inactive','superseded','retired')),
  CONSTRAINT scp_not_self_supersede_ck CHECK (supersedes_calendar_id IS DISTINCT FROM id),
  CONSTRAINT scp_id_type_uk UNIQUE (id, calendar_type),
  CONSTRAINT scp_id_tenant_uk UNIQUE (id, company_id, merchant_store_id),
  CONSTRAINT scp_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT scp_store_company_fk FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT scp_supersedes_fk FOREIGN KEY (supersedes_calendar_id)
    REFERENCES public.shipping_calendar_profiles(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX scp_family_version_uk ON public.shipping_calendar_profiles (
  scope_type,
  COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(merchant_store_id, '00000000-0000-0000-0000-000000000000'::uuid),
  calendar_code, version_number);

CREATE UNIQUE INDEX scp_one_active_per_family_uk ON public.shipping_calendar_profiles (
  scope_type,
  COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(merchant_store_id, '00000000-0000-0000-0000-000000000000'::uuid),
  calendar_code) WHERE (status = 'active');

CREATE INDEX scp_company_ix ON public.shipping_calendar_profiles (company_id);
CREATE INDEX scp_store_ix ON public.shipping_calendar_profiles (merchant_store_id);
CREATE INDEX scp_supersedes_ix ON public.shipping_calendar_profiles (supersedes_calendar_id);

-- ===========================================================================
-- 5. CALENDAR BLACKOUT DATES
-- ===========================================================================
CREATE TABLE public.shipping_calendar_blackout_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_calendar_profile_id uuid NOT NULL,
  blackout_date date NOT NULL,
  reason_code text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scbd_reason_ck CHECK (reason_code IN
    ('public_holiday','warehouse_closed','carrier_closed','service_suspension','emergency')),
  CONSTRAINT scbd_description_ck CHECK (description IS NULL OR
    (btrim(description) <> '' AND length(description) <= 300)),
  CONSTRAINT scbd_calendar_date_uk UNIQUE (shipping_calendar_profile_id, blackout_date),
  CONSTRAINT scbd_calendar_fk FOREIGN KEY (shipping_calendar_profile_id)
    REFERENCES public.shipping_calendar_profiles(id) ON DELETE CASCADE
);

-- ===========================================================================
-- 6. TRANSIT PROFILE <-> CALENDAR ASSIGNMENT
-- ===========================================================================
CREATE TABLE public.shipping_transit_time_profile_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_transit_time_profile_id uuid NOT NULL,
  shipping_calendar_profile_id uuid NOT NULL,
  calendar_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sttpc_role_ck CHECK (calendar_role IN ('origin_handover','carrier_transit','destination_delivery')),
  CONSTRAINT sttpc_profile_role_uk UNIQUE (shipping_transit_time_profile_id, calendar_role),
  CONSTRAINT sttpc_profile_fk FOREIGN KEY (shipping_transit_time_profile_id)
    REFERENCES public.shipping_transit_time_profiles(id) ON DELETE CASCADE,
  CONSTRAINT sttpc_calendar_role_fk FOREIGN KEY (shipping_calendar_profile_id, calendar_role)
    REFERENCES public.shipping_calendar_profiles(id, calendar_type) ON DELETE RESTRICT
);

CREATE INDEX sttpc_calendar_ix ON public.shipping_transit_time_profile_calendars (shipping_calendar_profile_id);

-- ===========================================================================
-- 7. GUARD FUNCTIONS
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.m1c1dd_guard_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_transit_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_origin public.merchant_fulfillment_origins%ROWTYPE;
  v_prev   public.shipping_transit_time_profiles%ROWTYPE;
BEGIN
  IF NEW.origin_scope_type = 'exact_origin' THEN
    SELECT * INTO v_origin FROM public.merchant_fulfillment_origins o
      WHERE o.id = NEW.fulfillment_origin_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C-1D-D: exact origin does not exist' USING ERRCODE = '23514';
    END IF;
    IF v_origin.company_id IS DISTINCT FROM NEW.company_id
       OR v_origin.merchant_store_id IS DISTINCT FROM NEW.merchant_store_id THEN
      RAISE EXCEPTION 'M1C-1D-D: cross-tenant fulfillment origin is rejected' USING ERRCODE = '23514';
    END IF;
    IF v_origin.country_code <> NEW.origin_country_code THEN
      RAISE EXCEPTION 'M1C-1D-D: origin_country_code must match the exact origin country (% <> %)',
        NEW.origin_country_code, v_origin.country_code USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.supersedes_profile_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.shipping_transit_time_profiles p
      WHERE p.id = NEW.supersedes_profile_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C-1D-D: superseded transit profile does not exist' USING ERRCODE = '23514';
    END IF;
    IF v_prev.scope_type <> NEW.scope_type
       OR v_prev.company_id IS DISTINCT FROM NEW.company_id
       OR v_prev.merchant_store_id IS DISTINCT FROM NEW.merchant_store_id
       OR v_prev.profile_code <> NEW.profile_code
       OR v_prev.carrier_code <> NEW.carrier_code
       OR v_prev.service_code <> NEW.service_code
       OR v_prev.origin_scope_type <> NEW.origin_scope_type
       OR v_prev.fulfillment_origin_id IS DISTINCT FROM NEW.fulfillment_origin_id
       OR v_prev.origin_country_code <> NEW.origin_country_code
       OR v_prev.destination_country_code <> NEW.destination_country_code THEN
      RAISE EXCEPTION 'M1C-1D-D: supersession must target the same transit family' USING ERRCODE = '23514';
    END IF;
    IF NEW.version_number <= v_prev.version_number THEN
      RAISE EXCEPTION 'M1C-1D-D: a superseding version must be numerically higher' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_transit_activation_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_origin public.merchant_fulfillment_origins%ROWTYPE;
  v_cal    public.shipping_calendar_profiles%ROWTYPE;
  v_n      integer;
  v_role   text;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN RETURN NEW; END IF;

  IF NEW.origin_scope_type = 'exact_origin' THEN
    SELECT * INTO v_origin FROM public.merchant_fulfillment_origins o
      WHERE o.id = NEW.fulfillment_origin_id;
    IF NOT FOUND OR v_origin.status <> 'active' THEN
      RAISE EXCEPTION 'M1C-1D-D: cannot activate; exact origin is not active' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_time_weekday_rules r
    WHERE r.shipping_transit_time_profile_id = NEW.id;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'M1C-1D-D: cannot activate; expected 7 handover weekday rows, found %', v_n USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_time_weekday_rules r
    WHERE r.shipping_transit_time_profile_id = NEW.id AND r.handover_supported;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'M1C-1D-D: cannot activate; at least one supported handover weekday is required' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_delivery_weekdays d
    WHERE d.shipping_transit_time_profile_id = NEW.id;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'M1C-1D-D: cannot activate; expected 7 delivery weekday rows, found %', v_n USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_delivery_weekdays d
    WHERE d.shipping_transit_time_profile_id = NEW.id AND d.delivery_enabled;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'M1C-1D-D: cannot activate; at least one enabled delivery weekday is required' USING ERRCODE = '23514';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['origin_handover','carrier_transit','destination_delivery'] LOOP
    SELECT c.* INTO v_cal
    FROM public.shipping_transit_time_profile_calendars a
    JOIN public.shipping_calendar_profiles c ON c.id = a.shipping_calendar_profile_id
    WHERE a.shipping_transit_time_profile_id = NEW.id AND a.calendar_role = v_role;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C-1D-D: cannot activate; missing % calendar assignment', v_role USING ERRCODE = '23514';
    END IF;
    IF v_cal.status <> 'active' THEN
      RAISE EXCEPTION 'M1C-1D-D: cannot activate; % calendar is not active', v_role USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_transit_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'M1C-1D-D: only draft transit profiles may be deleted (BOR-DEC-085)' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('active','superseded','retired') THEN
    IF NEW.scope_type <> OLD.scope_type
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.merchant_store_id IS DISTINCT FROM OLD.merchant_store_id
       OR NEW.profile_code <> OLD.profile_code
       OR NEW.version_number <> OLD.version_number
       OR NEW.carrier_code <> OLD.carrier_code
       OR NEW.service_code <> OLD.service_code
       OR NEW.origin_scope_type <> OLD.origin_scope_type
       OR NEW.fulfillment_origin_id IS DISTINCT FROM OLD.fulfillment_origin_id
       OR NEW.origin_country_code <> OLD.origin_country_code
       OR NEW.destination_country_code <> OLD.destination_country_code
       OR NEW.supersedes_profile_id IS DISTINCT FROM OLD.supersedes_profile_id THEN
      RAISE EXCEPTION 'M1C-1D-D: % transit profiles are immutable; issue a new version (BOR-DEC-085)', OLD.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'      AND NEW.status IN ('active','inactive','retired'))
      OR (OLD.status = 'inactive' AND NEW.status IN ('active','retired'))
      OR (OLD.status = 'active'   AND NEW.status IN ('inactive','superseded','retired'))
      OR (OLD.status = 'superseded' AND NEW.status = 'retired')
    ) THEN
      RAISE EXCEPTION 'M1C-1D-D: illegal transit status transition % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_transit_child_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id     uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.shipping_transit_time_profile_id;
  ELSE
    v_id := NEW.shipping_transit_time_profile_id;
  END IF;

  SELECT p.status INTO v_status FROM public.shipping_transit_time_profiles p WHERE p.id = v_id;
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'M1C-1D-D: transit profile does not exist' USING ERRCODE = '23514';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C-1D-D: transit profile is % ; its rules, delivery weekdays and calendar assignments are immutable (BOR-DEC-085)', v_status
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_calendar_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_prev public.shipping_calendar_profiles%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name = NEW.timezone_name) THEN
    RAISE EXCEPTION 'M1C-1D-D: % is not a valid IANA timezone (BOR-DEC-084)', NEW.timezone_name USING ERRCODE = '23514';
  END IF;

  IF NEW.calendar_type IN ('origin_handover','destination_delivery') AND NEW.country_code IS NULL THEN
    RAISE EXCEPTION 'M1C-1D-D: % calendars require a country_code', NEW.calendar_type USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_calendar_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.shipping_calendar_profiles c WHERE c.id = NEW.supersedes_calendar_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C-1D-D: superseded calendar does not exist' USING ERRCODE = '23514';
    END IF;
    IF v_prev.scope_type <> NEW.scope_type
       OR v_prev.company_id IS DISTINCT FROM NEW.company_id
       OR v_prev.merchant_store_id IS DISTINCT FROM NEW.merchant_store_id
       OR v_prev.calendar_code <> NEW.calendar_code
       OR v_prev.calendar_type <> NEW.calendar_type
       OR v_prev.country_code IS DISTINCT FROM NEW.country_code THEN
      RAISE EXCEPTION 'M1C-1D-D: supersession must target the same calendar family' USING ERRCODE = '23514';
    END IF;
    IF NEW.version_number <= v_prev.version_number THEN
      RAISE EXCEPTION 'M1C-1D-D: a superseding calendar version must be numerically higher' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_calendar_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'M1C-1D-D: only draft calendars may be deleted (BOR-DEC-085)' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('active','superseded','retired') THEN
    IF NEW.scope_type <> OLD.scope_type
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.merchant_store_id IS DISTINCT FROM OLD.merchant_store_id
       OR NEW.calendar_code <> OLD.calendar_code
       OR NEW.version_number <> OLD.version_number
       OR NEW.calendar_type <> OLD.calendar_type
       OR NEW.country_code IS DISTINCT FROM OLD.country_code
       OR NEW.timezone_name <> OLD.timezone_name
       OR NEW.supersedes_calendar_id IS DISTINCT FROM OLD.supersedes_calendar_id THEN
      RAISE EXCEPTION 'M1C-1D-D: % calendars are immutable; issue a new version (BOR-DEC-085)', OLD.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'      AND NEW.status IN ('active','inactive','retired'))
      OR (OLD.status = 'inactive' AND NEW.status IN ('active','retired'))
      OR (OLD.status = 'active'   AND NEW.status IN ('inactive','superseded','retired'))
      OR (OLD.status = 'superseded' AND NEW.status = 'retired')
    ) THEN
      RAISE EXCEPTION 'M1C-1D-D: illegal calendar status transition % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_blackout_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_id := OLD.shipping_calendar_profile_id;
  ELSE v_id := NEW.shipping_calendar_profile_id; END IF;

  SELECT c.status INTO v_status FROM public.shipping_calendar_profiles c WHERE c.id = v_id;
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'M1C-1D-D: calendar profile does not exist' USING ERRCODE = '23514';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C-1D-D: calendar is % ; blackout dates are immutable (BOR-DEC-085)', v_status USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.m1c1dd_guard_calendar_assignment_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_t public.shipping_transit_time_profiles%ROWTYPE;
  v_c public.shipping_calendar_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.shipping_transit_time_profiles p WHERE p.id = NEW.shipping_transit_time_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1D-D: transit profile does not exist' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_c FROM public.shipping_calendar_profiles c WHERE c.id = NEW.shipping_calendar_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1D-D: calendar profile does not exist' USING ERRCODE = '23514';
  END IF;

  IF v_c.calendar_type <> NEW.calendar_role THEN
    RAISE EXCEPTION 'M1C-1D-D: calendar type % does not match role %', v_c.calendar_type, NEW.calendar_role USING ERRCODE = '23514';
  END IF;

  IF v_c.scope_type = 'merchant_store' THEN
    IF v_t.scope_type <> 'merchant_store'
       OR v_c.company_id IS DISTINCT FROM v_t.company_id
       OR v_c.merchant_store_id IS DISTINCT FROM v_t.merchant_store_id THEN
      RAISE EXCEPTION 'M1C-1D-D: cross-tenant calendar assignment is rejected' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.calendar_role = 'origin_handover' AND v_c.country_code IS DISTINCT FROM v_t.origin_country_code THEN
    RAISE EXCEPTION 'M1C-1D-D: origin calendar country % does not match origin country %',
      v_c.country_code, v_t.origin_country_code USING ERRCODE = '23514';
  END IF;
  IF NEW.calendar_role = 'destination_delivery' AND v_c.country_code IS DISTINCT FROM v_t.destination_country_code THEN
    RAISE EXCEPTION 'M1C-1D-D: destination calendar country % does not match destination country %',
      v_c.country_code, v_t.destination_country_code USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;

-- ===========================================================================
-- 8. TRIGGERS
-- ===========================================================================
CREATE TRIGGER sttp_touch BEFORE UPDATE ON public.shipping_transit_time_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_touch_updated_at();
CREATE TRIGGER sttp_integrity BEFORE INSERT OR UPDATE ON public.shipping_transit_time_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_transit_integrity();
CREATE TRIGGER sttp_immutability BEFORE UPDATE OR DELETE ON public.shipping_transit_time_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_transit_immutability();
CREATE CONSTRAINT TRIGGER sttp_activation AFTER INSERT OR UPDATE ON public.shipping_transit_time_profiles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_transit_activation_integrity();

CREATE TRIGGER sttwr_touch BEFORE UPDATE ON public.shipping_transit_time_weekday_rules
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_touch_updated_at();
CREATE TRIGGER sttwr_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.shipping_transit_time_weekday_rules
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_transit_child_immutability();

CREATE TRIGGER stdw_touch BEFORE UPDATE ON public.shipping_transit_delivery_weekdays
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_touch_updated_at();
CREATE TRIGGER stdw_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.shipping_transit_delivery_weekdays
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_transit_child_immutability();

CREATE TRIGGER sttpc_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.shipping_transit_time_profile_calendars
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_transit_child_immutability();
CREATE TRIGGER sttpc_integrity BEFORE INSERT OR UPDATE ON public.shipping_transit_time_profile_calendars
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_calendar_assignment_integrity();

CREATE TRIGGER scp_touch BEFORE UPDATE ON public.shipping_calendar_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_touch_updated_at();
CREATE TRIGGER scp_integrity BEFORE INSERT OR UPDATE ON public.shipping_calendar_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_calendar_integrity();
CREATE TRIGGER scp_immutability BEFORE UPDATE OR DELETE ON public.shipping_calendar_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_calendar_immutability();

CREATE TRIGGER scbd_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.shipping_calendar_blackout_dates
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dd_guard_blackout_immutability();

-- ===========================================================================
-- 9. RLS — enabled, forced, zero policies (owner-only)
-- ===========================================================================
ALTER TABLE public.shipping_transit_time_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_time_profiles          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_time_weekday_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_time_weekday_rules     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_delivery_weekdays      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_delivery_weekdays      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_calendar_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_calendar_profiles              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_calendar_blackout_dates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_calendar_blackout_dates        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_time_profile_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_transit_time_profile_calendars FORCE ROW LEVEL SECURITY;

-- ===========================================================================
-- 10. ACL NORMALIZATION (R-T21 mandatory section)
-- ===========================================================================
DO $norm$
DECLARE
  r record;
  v_roles text := 'anon, authenticated, service_role';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    v_roles := v_roles || ', sandbox_exec';
  END IF;

  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN (
        'tax_categories','tax_rate_bands','tax_rate_versions',
        'catalog_product_tax_classifications','company_tax_profiles',
        'merchant_store_offer_prices','borvat_direct_listing_publications',
        'merchant_fulfillment_origins','merchant_store_sku_shipping_profiles',
        'merchant_store_sku_shipping_packages','merchant_store_sku_fulfillment_origins',
        'shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules',
        'delivery_promise_profiles','delivery_promise_weekly_schedules',
        'merchant_store_sku_delivery_promise_assignments',
        'shipping_transit_time_profiles','shipping_transit_time_weekday_rules',
        'shipping_transit_delivery_weekdays','shipping_calendar_profiles',
        'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', r.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s', r.relname, v_roles);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, v_roles);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'm1c1b_guard_%' OR p.proname LIKE 'm1c1c_guard_%'
           OR p.proname LIKE 'm1c1db_guard_%' OR p.proname LIKE 'm1c1dc_guard_%'
           OR p.proname LIKE 'm1c1dd_guard_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, v_roles);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
  END LOOP;
END
$norm$;