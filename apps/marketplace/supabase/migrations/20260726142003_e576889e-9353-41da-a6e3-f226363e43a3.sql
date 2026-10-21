-- =====================================================================
-- PHASE 5 — M1C-1D-B
-- DELIVERY PROMISE PROFILE AND WEEKLY SCHEDULE FOUNDATION
-- Decisions: BOR-DEC-075, BOR-DEC-076, BOR-DEC-077
-- Additive-only. Schema foundation only. Zero operational data.
-- No assignment, no transit rules, no resolver, no RPC, no UI.
-- R-T22: UUID keys only. No sequences created.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------
CREATE TABLE public.delivery_promise_profiles (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type                      text        NOT NULL,
  company_id                      uuid        NULL,
  merchant_store_id               uuid        NULL,
  profile_code                    text        NOT NULL,
  version_number                  integer     NOT NULL,
  display_name                    text        NOT NULL,
  timezone_name                   text        NOT NULL,
  handling_business_days          integer     NOT NULL,
  customer_date_selection_enabled boolean     NOT NULL DEFAULT false,
  status                          text        NOT NULL DEFAULT 'draft',
  supersedes_profile_id           uuid        NULL
        REFERENCES public.delivery_promise_profiles(id) ON DELETE RESTRICT,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dpp_scope_type_ck
    CHECK (scope_type IN ('platform','merchant_store')),

  -- Explicit scope contract: no owner polymorphism without constraints.
  CONSTRAINT dpp_scope_contract_ck CHECK (
    (scope_type = 'platform'
       AND company_id IS NULL AND merchant_store_id IS NULL)
    OR
    (scope_type = 'merchant_store'
       AND company_id IS NOT NULL AND merchant_store_id IS NOT NULL)
  ),

  CONSTRAINT dpp_company_fk
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,

  -- Composite FK: the store must belong to the same company (tenant isolation).
  CONSTRAINT dpp_store_company_fk
    FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,

  CONSTRAINT dpp_profile_code_ck
    CHECK (profile_code ~ '^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$'),

  CONSTRAINT dpp_version_ck   CHECK (version_number >= 1),
  CONSTRAINT dpp_display_ck   CHECK (btrim(display_name) <> '' AND length(display_name) <= 200),
  CONSTRAINT dpp_timezone_shape_ck
    CHECK (timezone_name ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+._-]+)+$'),
  CONSTRAINT dpp_handling_days_ck CHECK (handling_business_days >= 0),
  CONSTRAINT dpp_status_ck
    CHECK (status IN ('draft','active','inactive','superseded','retired')),
  CONSTRAINT dpp_not_self_supersede_ck
    CHECK (supersedes_profile_id IS DISTINCT FROM id)
);

COMMENT ON TABLE public.delivery_promise_profiles IS
'M1C-1D-B. Versioned delivery promise profile (seller handling side only). Scope is either platform (platform_fulfilled, future) or merchant_store (merchant_fulfilled, future). NO assignment to SKU/listing/origin exists yet; the presence of a profile does NOT make an offer publishable or purchasable. Carrier transit, calendars, blackouts and ETA composition are OUT OF SCOPE (M1C-1D-C+).';

COMMENT ON COLUMN public.delivery_promise_profiles.timezone_name IS
'BOR-DEC-075. Mandatory explicit IANA timezone (e.g. Europe/Amsterdam), validated against the PostgreSQL timezone catalog. Server timezone, UTC offsets and abbreviations such as CET are forbidden.';

COMMENT ON COLUMN public.delivery_promise_profiles.handling_business_days IS
'Number of business days required after order acceptance and BEFORE the shipment is ready for handover to the carrier. 0 permits same-day handling in principle but NEVER guarantees same-day handover: same-day handover additionally requires an order before the local cut-off, handover_enabled = true on that weekday, and no future blackout (blackouts are not modelled yet). No ETA is computed here.';

COMMENT ON COLUMN public.delivery_promise_profiles.customer_date_selection_enabled IS
'Capability marker only. Does NOT enable customer date selection: capacity, booking slots, minimum date, maximum horizon and carrier appointment logic are all out of scope and must be designed before this flag can be honoured operationally.';

-- Family = (scope_type, company_id, merchant_store_id, profile_code)
CREATE UNIQUE INDEX dpp_family_version_uk
  ON public.delivery_promise_profiles (
    scope_type,
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(merchant_store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    profile_code,
    version_number
  );

-- BOR-DEC-077: at most one ACTIVE version per profile family.
CREATE UNIQUE INDEX dpp_one_active_per_family_uk
  ON public.delivery_promise_profiles (
    scope_type,
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(merchant_store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    profile_code
  )
  WHERE status = 'active';

CREATE INDEX dpp_company_ix   ON public.delivery_promise_profiles (company_id);
CREATE INDEX dpp_store_ix     ON public.delivery_promise_profiles (merchant_store_id);
CREATE INDEX dpp_supersedes_ix ON public.delivery_promise_profiles (supersedes_profile_id);

-- ---------------------------------------------------------------------
-- 2. WEEKLY SCHEDULES
-- ---------------------------------------------------------------------
CREATE TABLE public.delivery_promise_weekly_schedules (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_promise_profile_id uuid NOT NULL
        REFERENCES public.delivery_promise_profiles(id) ON DELETE RESTRICT,
  weekday_iso                 smallint NOT NULL,
  accepts_orders              boolean  NOT NULL,
  order_cutoff_local_time     time without time zone NULL,
  handover_enabled            boolean  NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dpws_weekday_ck CHECK (weekday_iso BETWEEN 1 AND 7),

  -- accepts_orders = true  -> cut-off REQUIRED
  -- accepts_orders = false -> cut-off MUST be NULL
  CONSTRAINT dpws_cutoff_contract_ck CHECK (
    (accepts_orders = true  AND order_cutoff_local_time IS NOT NULL)
    OR
    (accepts_orders = false AND order_cutoff_local_time IS NULL)
  ),

  CONSTRAINT dpws_profile_weekday_uk UNIQUE (delivery_promise_profile_id, weekday_iso)
);

COMMENT ON TABLE public.delivery_promise_weekly_schedules IS
'BOR-DEC-075/076. Normalized weekday rows (ISO-8601: 1 = Monday .. 7 = Sunday), never JSON. Times are LOCAL to the parent profile timezone_name. Calendar dates, holidays and blackouts are NOT stored here.';

COMMENT ON COLUMN public.delivery_promise_weekly_schedules.handover_enabled IS
'Independent of accepts_orders: a day may allow carrier handover while not accepting new orders, and vice versa.';

CREATE INDEX dpws_profile_ix
  ON public.delivery_promise_weekly_schedules (delivery_promise_profile_id);

-- ---------------------------------------------------------------------
-- 3. INTEGRITY FUNCTIONS (owner-only, search_path='', no dynamic SQL)
-- ---------------------------------------------------------------------

-- 3.1 updated_at
CREATE OR REPLACE FUNCTION public.m1c1db_guard_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- 3.2 Profile integrity: timezone catalog, supersedes family, activation
CREATE OR REPLACE FUNCTION public.m1c1db_guard_profile_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_prev   public.delivery_promise_profiles%ROWTYPE;
  v_days   integer;
  v_bad    integer;
  v_higher integer;
BEGIN
  -- (a) Mandatory IANA timezone, validated against the PostgreSQL catalog.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names z
    WHERE z.name = NEW.timezone_name
  ) THEN
    RAISE EXCEPTION
      'delivery promise profile: timezone_name % is not a valid IANA timezone', NEW.timezone_name
      USING ERRCODE = '22023';
  END IF;

  -- (b) supersedes must reference the same profile family and a lower version.
  IF NEW.supersedes_profile_id IS NOT NULL THEN
    SELECT * INTO v_prev
    FROM public.delivery_promise_profiles p
    WHERE p.id = NEW.supersedes_profile_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'delivery promise profile: supersedes_profile_id % not found',
        NEW.supersedes_profile_id USING ERRCODE = '23503';
    END IF;

    IF v_prev.scope_type IS DISTINCT FROM NEW.scope_type
       OR v_prev.company_id IS DISTINCT FROM NEW.company_id
       OR v_prev.merchant_store_id IS DISTINCT FROM NEW.merchant_store_id
       OR v_prev.profile_code IS DISTINCT FROM NEW.profile_code THEN
      RAISE EXCEPTION
        'delivery promise profile: supersedes_profile_id must belong to the same scope/company/store/profile_code family'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.version_number <= v_prev.version_number THEN
      RAISE EXCEPTION
        'delivery promise profile: version_number % must be greater than superseded version %',
        NEW.version_number, v_prev.version_number USING ERRCODE = '23514';
    END IF;
  END IF;

  -- (c) Activation integrity (no activation workflow exists; owner-only path).
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN

    SELECT count(*) INTO v_days
    FROM public.delivery_promise_weekly_schedules w
    WHERE w.delivery_promise_profile_id = NEW.id;

    IF v_days <> 7 THEN
      RAISE EXCEPTION
        'delivery promise profile: cannot activate without a complete seven-day weekly schedule (found % rows)', v_days
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_bad
    FROM public.delivery_promise_weekly_schedules w
    WHERE w.delivery_promise_profile_id = NEW.id
      AND (
        w.weekday_iso NOT BETWEEN 1 AND 7
        OR (w.accepts_orders AND w.order_cutoff_local_time IS NULL)
        OR (NOT w.accepts_orders AND w.order_cutoff_local_time IS NOT NULL)
      );

    IF v_bad > 0 THEN
      RAISE EXCEPTION
        'delivery promise profile: cannot activate with an inconsistent weekly schedule'
        USING ERRCODE = '23514';
    END IF;

    -- A newly activated version must numerically supersede every prior
    -- active/superseded/retired version of the same family.
    SELECT count(*) INTO v_higher
    FROM public.delivery_promise_profiles p
    WHERE p.id <> NEW.id
      AND p.scope_type = NEW.scope_type
      AND p.company_id IS NOT DISTINCT FROM NEW.company_id
      AND p.merchant_store_id IS NOT DISTINCT FROM NEW.merchant_store_id
      AND p.profile_code = NEW.profile_code
      AND p.status IN ('active','superseded','retired')
      AND p.version_number >= NEW.version_number;

    IF v_higher > 0 THEN
      RAISE EXCEPTION
        'delivery promise profile: version % does not supersede an existing version of the same family',
        NEW.version_number USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- 3.3 Profile immutability once active/superseded/retired
CREATE OR REPLACE FUNCTION public.m1c1db_guard_profile_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.status IN ('active','superseded','retired') THEN
    IF NEW.scope_type                      IS DISTINCT FROM OLD.scope_type
       OR NEW.company_id                   IS DISTINCT FROM OLD.company_id
       OR NEW.merchant_store_id            IS DISTINCT FROM OLD.merchant_store_id
       OR NEW.profile_code                 IS DISTINCT FROM OLD.profile_code
       OR NEW.version_number               IS DISTINCT FROM OLD.version_number
       OR NEW.timezone_name                IS DISTINCT FROM OLD.timezone_name
       OR NEW.handling_business_days       IS DISTINCT FROM OLD.handling_business_days
       OR NEW.customer_date_selection_enabled IS DISTINCT FROM OLD.customer_date_selection_enabled
       OR NEW.supersedes_profile_id        IS DISTINCT FROM OLD.supersedes_profile_id
       OR NEW.status                       IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION
        'delivery promise profile: % versions are immutable; create a new version instead (BOR-DEC-077)', OLD.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- 3.4 Weekly rows frozen unless the parent profile is a draft
CREATE OR REPLACE FUNCTION public.m1c1db_guard_weekly_schedule_mutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_status text;
  v_pid    uuid;
BEGIN
  v_pid := CASE WHEN TG_OP = 'DELETE'
                THEN OLD.delivery_promise_profile_id
                ELSE NEW.delivery_promise_profile_id END;

  SELECT p.status INTO v_status
  FROM public.delivery_promise_profiles p
  WHERE p.id = v_pid;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'delivery promise weekly schedule: parent profile % not found', v_pid
      USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION
      'delivery promise weekly schedule: parent profile is % and its schedule is immutable (BOR-DEC-076/077)', v_status
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.delivery_promise_profile_id IS DISTINCT FROM OLD.delivery_promise_profile_id THEN
    RAISE EXCEPTION 'delivery promise weekly schedule: reparenting is forbidden'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 4. TRIGGERS
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_dpp_integrity
  BEFORE INSERT OR UPDATE ON public.delivery_promise_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1db_guard_profile_integrity();

CREATE TRIGGER trg_dpp_immutability
  BEFORE UPDATE ON public.delivery_promise_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1db_guard_profile_immutability();

CREATE TRIGGER trg_dpp_touch
  BEFORE UPDATE ON public.delivery_promise_profiles
  FOR EACH ROW EXECUTE FUNCTION public.m1c1db_guard_touch_updated_at();

CREATE TRIGGER trg_dpws_mutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_promise_weekly_schedules
  FOR EACH ROW EXECUTE FUNCTION public.m1c1db_guard_weekly_schedule_mutable();

CREATE TRIGGER trg_dpws_touch
  BEFORE UPDATE ON public.delivery_promise_weekly_schedules
  FOR EACH ROW EXECUTE FUNCTION public.m1c1db_guard_touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. OWNERSHIP, RLS AND ACL NORMALIZATION (deny-by-default)
-- ---------------------------------------------------------------------
ALTER TABLE public.delivery_promise_profiles          OWNER TO postgres;
ALTER TABLE public.delivery_promise_weekly_schedules  OWNER TO postgres;

ALTER FUNCTION public.m1c1db_guard_touch_updated_at()          OWNER TO postgres;
ALTER FUNCTION public.m1c1db_guard_profile_integrity()         OWNER TO postgres;
ALTER FUNCTION public.m1c1db_guard_profile_immutability()      OWNER TO postgres;
ALTER FUNCTION public.m1c1db_guard_weekly_schedule_mutable()   OWNER TO postgres;

ALTER TABLE public.delivery_promise_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_promise_profiles          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.delivery_promise_weekly_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_promise_weekly_schedules  FORCE  ROW LEVEL SECURITY;
-- Deliberately ZERO policies: owner-only, no application read or write path.

REVOKE ALL ON TABLE public.delivery_promise_profiles         FROM PUBLIC;
REVOKE ALL ON TABLE public.delivery_promise_weekly_schedules FROM PUBLIC;
REVOKE ALL ON TABLE public.delivery_promise_profiles         FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.delivery_promise_weekly_schedules FROM anon, authenticated, service_role;

-- Guard functions: proacl must never remain NULL (NULL = EXECUTE TO PUBLIC).
REVOKE ALL ON FUNCTION public.m1c1db_guard_touch_updated_at()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1db_guard_profile_integrity()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1db_guard_profile_immutability()    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1db_guard_weekly_schedule_mutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1db_guard_touch_updated_at()        FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1c1db_guard_profile_integrity()       FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1c1db_guard_profile_immutability()    FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.m1c1db_guard_weekly_schedule_mutable() FROM anon, authenticated, service_role;

DO $acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.delivery_promise_profiles FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON TABLE public.delivery_promise_weekly_schedules FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.m1c1db_guard_touch_updated_at() FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.m1c1db_guard_profile_integrity() FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.m1c1db_guard_profile_immutability() FROM sandbox_exec';
    EXECUTE 'REVOKE ALL ON FUNCTION public.m1c1db_guard_weekly_schedule_mutable() FROM sandbox_exec';
  END IF;
END
$acl$;

-- Ensure proacl is materialised (never NULL) for the four new routines.
DO $pa$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'm1c1db_guard_%'
      AND p.proacl IS NULL
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END
$pa$;

-- ---------------------------------------------------------------------
-- 6. FAIL-CLOSED INVARIANT ASSERTIONS (no data is written by this migration)
-- ---------------------------------------------------------------------
DO $assert$
DECLARE
  v int;
BEGIN
  SELECT count(*) INTO v FROM public.delivery_promise_profiles;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: profiles must be empty, found %', v; END IF;

  SELECT count(*) INTO v FROM public.delivery_promise_weekly_schedules;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: weekly schedules must be empty, found %', v; END IF;

  SELECT count(*) INTO v FROM public.tax_categories;
  IF v <> 4 THEN RAISE EXCEPTION 'M1C-1D-B: tax_categories drift, found %', v; END IF;
  SELECT count(*) INTO v FROM public.tax_rate_bands;
  IF v <> 9 THEN RAISE EXCEPTION 'M1C-1D-B: tax_rate_bands drift, found %', v; END IF;
  SELECT count(*) INTO v FROM public.tax_rate_versions;
  IF v <> 5 THEN RAISE EXCEPTION 'M1C-1D-B: tax_rate_versions drift, found %', v; END IF;

  SELECT count(*) INTO v FROM public.shipping_rate_cards;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: shipping_rate_cards drift, found %', v; END IF;
  SELECT count(*) INTO v FROM public.shipping_rate_lanes;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: shipping_rate_lanes drift, found %', v; END IF;
  SELECT count(*) INTO v FROM public.shipping_rate_rules;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: shipping_rate_rules drift, found %', v; END IF;
  SELECT count(*) INTO v FROM public.merchant_fulfillment_origins;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: origins drift, found %', v; END IF;

  -- R-C1 / R-C2: live-mode channel rows must remain unauthorized.
  SELECT count(*) INTO v FROM public.channel_connections
   WHERE mode = 'live' AND live_authorized_at IS NOT NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: live-authorized channel connection detected (%)', v; END IF;

  -- R-T22: no new sequences in this scope.
  SELECT count(*) INTO v FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname LIKE 'delivery_promise%';
  IF v <> 0 THEN RAISE EXCEPTION 'M1C-1D-B: unexpected sequence created (%)', v; END IF;
END
$assert$;