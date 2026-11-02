-- =====================================================================
-- PHASE 5 / M1C-1D-C
-- STORE-SKU-ORIGIN DELIVERY PROMISE ASSIGNMENT FOUNDATION
-- Schema-only. Zero permanent rows. Owner-only. No RPC. No UI.
-- BOR-DEC-078 / 079 / 080 / 081
-- =====================================================================

-- SECTION 1 — Declarative reference keys for the promise path
ALTER TABLE public.delivery_promise_profiles
  ADD CONSTRAINT dpp_id_scope_uk UNIQUE (id, scope_type);

ALTER TABLE public.delivery_promise_profiles
  ADD CONSTRAINT dpp_id_tenant_uk UNIQUE (id, company_id, merchant_store_id);

-- SECTION 2 — Assignment table
CREATE TABLE public.merchant_store_sku_delivery_promise_assignments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL,
  merchant_store_id           uuid NOT NULL,
  shipping_profile_id         uuid NOT NULL,
  fulfillment_origin_id       uuid NOT NULL,
  delivery_promise_profile_id uuid NOT NULL,
  fulfillment_mode            text NOT NULL,
  version_number              integer NOT NULL,
  status                      text NOT NULL DEFAULT 'draft',
  supersedes_assignment_id    uuid,
  promise_scope_type          text GENERATED ALWAYS AS (
                                CASE fulfillment_mode
                                  WHEN 'merchant_fulfilled' THEN 'merchant_store'
                                  WHEN 'platform_fulfilled' THEN 'platform'
                                END) STORED,
  promise_company_id          uuid GENERATED ALWAYS AS (
                                CASE WHEN fulfillment_mode = 'merchant_fulfilled'
                                     THEN company_id END) STORED,
  promise_store_id            uuid GENERATED ALWAYS AS (
                                CASE WHEN fulfillment_mode = 'merchant_fulfilled'
                                     THEN merchant_store_id END) STORED,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mssdpa_mode_ck CHECK (
    fulfillment_mode IN ('merchant_fulfilled','platform_fulfilled')),
  CONSTRAINT mssdpa_status_ck CHECK (
    status IN ('draft','active','inactive','superseded','retired')),
  CONSTRAINT mssdpa_version_ck CHECK (version_number >= 1),
  CONSTRAINT mssdpa_not_self_supersede_ck CHECK (
    supersedes_assignment_id IS DISTINCT FROM id),

  CONSTRAINT mssdpa_profile_tenancy_fk
    FOREIGN KEY (shipping_profile_id, company_id, merchant_store_id)
    REFERENCES public.merchant_store_sku_shipping_profiles (id, company_id, merchant_store_id)
    ON DELETE RESTRICT,

  CONSTRAINT mssdpa_origin_tenancy_fk
    FOREIGN KEY (fulfillment_origin_id, company_id, merchant_store_id)
    REFERENCES public.merchant_fulfillment_origins (id, company_id, merchant_store_id)
    ON DELETE RESTRICT,

  CONSTRAINT mssdpa_origin_eligibility_fk
    FOREIGN KEY (shipping_profile_id, fulfillment_origin_id)
    REFERENCES public.merchant_store_sku_fulfillment_origins (shipping_profile_id, fulfillment_origin_id)
    ON DELETE RESTRICT,

  CONSTRAINT mssdpa_promise_scope_fk
    FOREIGN KEY (delivery_promise_profile_id, promise_scope_type)
    REFERENCES public.delivery_promise_profiles (id, scope_type)
    ON DELETE RESTRICT,

  CONSTRAINT mssdpa_promise_tenancy_fk
    FOREIGN KEY (delivery_promise_profile_id, promise_company_id, promise_store_id)
    REFERENCES public.delivery_promise_profiles (id, company_id, merchant_store_id)
    ON DELETE RESTRICT,

  CONSTRAINT mssdpa_supersedes_fk
    FOREIGN KEY (supersedes_assignment_id)
    REFERENCES public.merchant_store_sku_delivery_promise_assignments (id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX mssdpa_group_version_uk
  ON public.merchant_store_sku_delivery_promise_assignments
  (shipping_profile_id, fulfillment_origin_id, fulfillment_mode, version_number);

CREATE UNIQUE INDEX mssdpa_one_active_per_group_uk
  ON public.merchant_store_sku_delivery_promise_assignments
  (shipping_profile_id, fulfillment_origin_id, fulfillment_mode)
  WHERE (status = 'active');

CREATE INDEX mssdpa_company_ix    ON public.merchant_store_sku_delivery_promise_assignments (company_id);
CREATE INDEX mssdpa_store_ix      ON public.merchant_store_sku_delivery_promise_assignments (merchant_store_id);
CREATE INDEX mssdpa_promise_ix    ON public.merchant_store_sku_delivery_promise_assignments (delivery_promise_profile_id);
CREATE INDEX mssdpa_supersedes_ix ON public.merchant_store_sku_delivery_promise_assignments (supersedes_assignment_id);

COMMENT ON TABLE public.merchant_store_sku_delivery_promise_assignments IS
  'M1C-1D-C: exact-origin delivery promise assignment (BOR-DEC-078..081). Handling/handover promise only; proves no rate, no transit rule, no carrier, no checkout capability.';

-- SECTION 3 — Guard functions (owner-only, search_path = '')
CREATE OR REPLACE FUNCTION public.m1c1dc_guard_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1dc_guard_supersedes_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  v_prev public.merchant_store_sku_delivery_promise_assignments%ROWTYPE;
BEGIN
  IF NEW.supersedes_assignment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prev
  FROM public.merchant_store_sku_delivery_promise_assignments a
  WHERE a.id = NEW.supersedes_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1D-C: supersedes_assignment_id % not found', NEW.supersedes_assignment_id
      USING ERRCODE = '23503';
  END IF;

  IF v_prev.company_id               IS DISTINCT FROM NEW.company_id
     OR v_prev.merchant_store_id     IS DISTINCT FROM NEW.merchant_store_id
     OR v_prev.shipping_profile_id   IS DISTINCT FROM NEW.shipping_profile_id
     OR v_prev.fulfillment_origin_id IS DISTINCT FROM NEW.fulfillment_origin_id
     OR v_prev.fulfillment_mode      IS DISTINCT FROM NEW.fulfillment_mode THEN
    RAISE EXCEPTION 'M1C-1D-C: supersedes must reference the same company/store/shipping profile/origin/fulfillment mode (BOR-DEC-081)'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.version_number <= v_prev.version_number THEN
    RAISE EXCEPTION 'M1C-1D-C: version_number % must be greater than superseded version %',
      NEW.version_number, v_prev.version_number USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1dc_guard_activation_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE
  v_prof    public.merchant_store_sku_shipping_profiles%ROWTYPE;
  v_origin  public.merchant_fulfillment_origins%ROWTYPE;
  v_elig    public.merchant_store_sku_fulfillment_origins%ROWTYPE;
  v_promise public.delivery_promise_profiles%ROWTYPE;
  v_days    integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prof
  FROM public.merchant_store_sku_shipping_profiles p
  WHERE p.id = NEW.shipping_profile_id;

  IF NOT FOUND OR v_prof.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; shipping profile is not active' USING ERRCODE = '23514';
  END IF;
  IF v_prof.company_id <> NEW.company_id OR v_prof.merchant_store_id <> NEW.merchant_store_id THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; shipping profile tenancy mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_prof.pickup_only THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; pickup-only shipping profiles carry no delivery promise' USING ERRCODE = '23514';
  END IF;
  IF v_prof.dangerous_goods THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; dangerous goods require carrier-capability architecture (fail-closed)' USING ERRCODE = '23514';
  END IF;
  IF v_prof.handling_class = 'cold_chain' THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; cold chain requires carrier-capability architecture (fail-closed)' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_origin
  FROM public.merchant_fulfillment_origins o
  WHERE o.id = NEW.fulfillment_origin_id;

  IF NOT FOUND OR v_origin.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; fulfillment origin is not active' USING ERRCODE = '23514';
  END IF;
  IF v_origin.company_id <> NEW.company_id OR v_origin.merchant_store_id <> NEW.merchant_store_id THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; fulfillment origin tenancy mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_elig
  FROM public.merchant_store_sku_fulfillment_origins e
  WHERE e.shipping_profile_id = NEW.shipping_profile_id
    AND e.fulfillment_origin_id = NEW.fulfillment_origin_id;

  IF NOT FOUND OR v_elig.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; origin is not an active eligible origin for this store-SKU shipping profile' USING ERRCODE = '23514';
  END IF;
  IF v_elig.company_id <> NEW.company_id OR v_elig.merchant_store_id <> NEW.merchant_store_id THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; eligibility tenancy mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_promise
  FROM public.delivery_promise_profiles d
  WHERE d.id = NEW.delivery_promise_profile_id;

  IF NOT FOUND OR v_promise.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; delivery promise profile is not active' USING ERRCODE = '23514';
  END IF;

  IF NEW.fulfillment_mode = 'merchant_fulfilled' THEN
    IF v_promise.scope_type <> 'merchant_store'
       OR v_promise.company_id IS DISTINCT FROM NEW.company_id
       OR v_promise.merchant_store_id IS DISTINCT FROM NEW.merchant_store_id THEN
      RAISE EXCEPTION 'M1C-1D-C: merchant_fulfilled requires a tenant-scoped promise of the same store (BOR-DEC-079)' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.fulfillment_mode = 'platform_fulfilled' THEN
    IF v_promise.scope_type <> 'platform'
       OR v_promise.company_id IS NOT NULL
       OR v_promise.merchant_store_id IS NOT NULL THEN
      RAISE EXCEPTION 'M1C-1D-C: platform_fulfilled requires a platform-scoped promise (BOR-DEC-079)' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'M1C-1D-C: unsupported fulfillment mode %', NEW.fulfillment_mode USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_days
  FROM public.delivery_promise_weekly_schedules w
  WHERE w.delivery_promise_profile_id = NEW.delivery_promise_profile_id;

  IF v_days <> 7 THEN
    RAISE EXCEPTION 'M1C-1D-C: cannot activate; promise profile has % weekly schedule rows (7 required)', v_days USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1dc_guard_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF OLD.status IN ('superseded','retired') THEN
    RAISE EXCEPTION 'M1C-1D-C: % assignments are immutable; create a new assignment version (BOR-DEC-081)', OLD.status
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'active' THEN
    IF NEW.company_id                     IS DISTINCT FROM OLD.company_id
       OR NEW.merchant_store_id           IS DISTINCT FROM OLD.merchant_store_id
       OR NEW.shipping_profile_id         IS DISTINCT FROM OLD.shipping_profile_id
       OR NEW.fulfillment_origin_id       IS DISTINCT FROM OLD.fulfillment_origin_id
       OR NEW.delivery_promise_profile_id IS DISTINCT FROM OLD.delivery_promise_profile_id
       OR NEW.fulfillment_mode            IS DISTINCT FROM OLD.fulfillment_mode
       OR NEW.version_number              IS DISTINCT FROM OLD.version_number
       OR NEW.supersedes_assignment_id    IS DISTINCT FROM OLD.supersedes_assignment_id THEN
      RAISE EXCEPTION 'M1C-1D-C: active assignments are immutable; create a new assignment version (BOR-DEC-081)'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.status NOT IN ('active','superseded','retired') THEN
      RAISE EXCEPTION 'M1C-1D-C: an active assignment may only move to superseded or retired'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_mssdpa_supersedes
  BEFORE INSERT OR UPDATE ON public.merchant_store_sku_delivery_promise_assignments
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dc_guard_supersedes_integrity();

CREATE TRIGGER trg_mssdpa_immutability
  BEFORE UPDATE ON public.merchant_store_sku_delivery_promise_assignments
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dc_guard_immutability();

CREATE TRIGGER trg_mssdpa_activation
  BEFORE INSERT OR UPDATE ON public.merchant_store_sku_delivery_promise_assignments
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dc_guard_activation_integrity();

CREATE TRIGGER trg_mssdpa_touch
  BEFORE UPDATE ON public.merchant_store_sku_delivery_promise_assignments
  FOR EACH ROW EXECUTE FUNCTION public.m1c1dc_guard_touch_updated_at();

-- SECTION 4 — RLS + owner-only ACL
ALTER TABLE public.merchant_store_sku_delivery_promise_assignments OWNER TO postgres;
ALTER TABLE public.merchant_store_sku_delivery_promise_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_store_sku_delivery_promise_assignments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.merchant_store_sku_delivery_promise_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.merchant_store_sku_delivery_promise_assignments FROM anon, authenticated, service_role;

DO $acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.merchant_store_sku_delivery_promise_assignments FROM sandbox_exec';
  END IF;
END
$acl$;

-- SECTION 5 — R-T21 forward-only ACL normalization (protected inventory)
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
        'merchant_store_sku_delivery_promise_assignments')
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
           OR p.proname LIKE 'm1c1db_guard_%' OR p.proname LIKE 'm1c1dc_guard_%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, v_roles);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
  END LOOP;
END
$norm$;

-- HISTORICAL CHANGE 2026-11-02 (owner-approved preparation, isolated branch).
-- Scope: verification harness only. The schema DDL and ACL statements that this
-- file always applied are unchanged above this line; SECTION 6 fail-loud verification harness (fixtures rolled back)
-- was moved verbatim to apps/marketplace/supabase/tests/20260726145235_m1c1dc_verification.nottest.sql so the migration no longer rolls its DDL back when a
-- production-shaped assertion fails on a clean database.
