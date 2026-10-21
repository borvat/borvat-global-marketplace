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

-- SECTION 6 — Fail-loud verification harness (all fixtures rolled back)
DO $verify$
DECLARE
  v_cA uuid; v_cB uuid;
  v_sku uuid[]; v_skuB uuid;
  sA1 uuid; sA2 uuid; sB1 uuid;
  oA1 uuid; oA1i uuid; oA1c uuid; oA1d uuid; oA1u uuid; oA2 uuid; oB uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; pB uuid;
  dpM1 uuid; dpM2 uuid; dpP1 uuid; dpD7 uuid; dpD5 uuid; dpB uuid;
  aMerchant uuid; aPlatform uuid; aDraftInactiveOrigin uuid;
  v_bad text[];
  v_lbl text[];
  v_failed text[] := ARRAY[]::text[];
  v_pass integer := 0;
  i integer;
  v_n integer;
BEGIN
  SELECT company_id INTO v_cA FROM public.catalog_skus GROUP BY company_id HAVING count(*) >= 5 ORDER BY company_id LIMIT 1;
  SELECT company_id INTO v_cB FROM public.catalog_skus WHERE company_id <> v_cA GROUP BY company_id ORDER BY company_id LIMIT 1;
  IF v_cA IS NULL OR v_cB IS NULL THEN
    RAISE EXCEPTION 'HARNESS: insufficient fixture tenants';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_sku FROM (SELECT id FROM public.catalog_skus WHERE company_id = v_cA ORDER BY id LIMIT 5) s;
  SELECT id INTO v_skuB FROM public.catalog_skus WHERE company_id = v_cB ORDER BY id LIMIT 1;

  INSERT INTO public.merchant_stores (company_id, slug, display_name, status)
  VALUES (v_cA, 'm1c1dc-fix-a1', 'Fixture A1', 'active') RETURNING id INTO sA1;
  INSERT INTO public.merchant_stores (company_id, slug, display_name, status)
  VALUES (v_cA, 'm1c1dc-fix-a2', 'Fixture A2', 'active') RETURNING id INTO sA2;
  INSERT INTO public.merchant_stores (company_id, slug, display_name, status)
  VALUES (v_cB, 'm1c1dc-fix-b1', 'Fixture B1', 'active') RETURNING id INTO sB1;

  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cA, sA1, 'store', 'A1 active', 'NL', 'active') RETURNING id INTO oA1;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cA, sA1, 'store', 'A1 inactive', 'NL', 'inactive') RETURNING id INTO oA1i;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cA, sA1, 'store', 'A1 elig-inactive', 'NL', 'active') RETURNING id INTO oA1c;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cA, sA1, 'store', 'A1 spare', 'NL', 'active') RETURNING id INTO oA1d;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cA, sA1, 'store', 'A1 not eligible', 'NL', 'active') RETURNING id INTO oA1u;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cA, sA2, 'store', 'A2 active', 'NL', 'active') RETURNING id INTO oA2;
  INSERT INTO public.merchant_fulfillment_origins (company_id, merchant_store_id, origin_type, label, country_code, status)
  VALUES (v_cB, sB1, 'store', 'B1 active', 'NL', 'active') RETURNING id INTO oB;

  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cA, sA1, v_sku[1], 1, 'standard',   false, false, false, true, 'active')   RETURNING id INTO p1;
  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cA, sA1, v_sku[2], 1, 'standard',   false, false, true,  true, 'active')   RETURNING id INTO p2;
  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cA, sA1, v_sku[3], 1, 'standard',   false, true,  false, true, 'active')   RETURNING id INTO p3;
  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cA, sA1, v_sku[4], 1, 'cold_chain', false, false, false, true, 'active')   RETURNING id INTO p4;
  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cA, sA1, v_sku[5], 1, 'standard',   false, false, false, true, 'inactive') RETURNING id INTO p5;
  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cA, sA2, v_sku[1], 1, 'standard',   false, false, false, true, 'active')   RETURNING id INTO p6;
  INSERT INTO public.merchant_store_sku_shipping_profiles
    (company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status)
  VALUES (v_cB, sB1, v_skuB, 1, 'standard',     false, false, false, true, 'active')   RETURNING id INTO pB;

  INSERT INTO public.merchant_store_sku_fulfillment_origins (shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default, status)
  VALUES (p1, oA1,  v_cA, sA1, 1, true,  'active'),
         (p1, oA1i, v_cA, sA1, 2, false, 'active'),
         (p1, oA1c, v_cA, sA1, 3, false, 'inactive'),
         (p1, oA1d, v_cA, sA1, 4, false, 'active'),
         (p2, oA1,  v_cA, sA1, 1, true,  'active'),
         (p3, oA1,  v_cA, sA1, 1, true,  'active'),
         (p4, oA1,  v_cA, sA1, 1, true,  'active'),
         (p5, oA1,  v_cA, sA1, 1, true,  'active'),
         (p6, oA2,  v_cA, sA2, 1, true,  'active'),
         (pB, oB,   v_cB, sB1, 1, true,  'active');

  INSERT INTO public.delivery_promise_profiles (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days, customer_date_selection_enabled, status)
  VALUES ('merchant_store', v_cA, sA1, 'm1c1dc-mstore', 1, 'Fixture merchant promise', 'Europe/Amsterdam', 1, false, 'draft') RETURNING id INTO dpM1;
  INSERT INTO public.delivery_promise_profiles (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days, customer_date_selection_enabled, status)
  VALUES ('merchant_store', v_cA, sA2, 'm1c1dc-other', 1, 'Fixture other store promise', 'Europe/Amsterdam', 1, false, 'draft') RETURNING id INTO dpM2;
  INSERT INTO public.delivery_promise_profiles (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days, customer_date_selection_enabled, status)
  VALUES ('platform', NULL, NULL, 'm1c1dc-platform', 1, 'Fixture platform promise', 'Europe/Amsterdam', 1, false, 'draft') RETURNING id INTO dpP1;
  INSERT INTO public.delivery_promise_profiles (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days, customer_date_selection_enabled, status)
  VALUES ('merchant_store', v_cA, sA1, 'm1c1dc-draft7', 1, 'Fixture draft complete', 'Europe/Amsterdam', 1, false, 'draft') RETURNING id INTO dpD7;
  INSERT INTO public.delivery_promise_profiles (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days, customer_date_selection_enabled, status)
  VALUES ('merchant_store', v_cA, sA1, 'm1c1dc-draft5', 1, 'Fixture draft partial', 'Europe/Amsterdam', 1, false, 'draft') RETURNING id INTO dpD5;
  INSERT INTO public.delivery_promise_profiles (scope_type, company_id, merchant_store_id, profile_code, version_number, display_name, timezone_name, handling_business_days, customer_date_selection_enabled, status)
  VALUES ('merchant_store', v_cB, sB1, 'm1c1dc-bstore', 1, 'Fixture B promise', 'Europe/Amsterdam', 1, false, 'draft') RETURNING id INTO dpB;

  INSERT INTO public.delivery_promise_weekly_schedules (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time, handover_enabled)
  SELECT d, g, true, time '17:00', true
  FROM unnest(ARRAY[dpM1, dpM2, dpP1, dpD7, dpB]) d, generate_series(1,7) g;

  INSERT INTO public.delivery_promise_weekly_schedules (delivery_promise_profile_id, weekday_iso, accepts_orders, order_cutoff_local_time, handover_enabled)
  SELECT dpD5, g, true, time '17:00', true FROM generate_series(1,5) g;

  UPDATE public.delivery_promise_profiles SET status = 'active' WHERE id IN (dpM1, dpM2, dpP1, dpB);

  -- POSITIVE 1: merchant_fulfilled valid assignment
  INSERT INTO public.merchant_store_sku_delivery_promise_assignments
    (company_id, merchant_store_id, shipping_profile_id, fulfillment_origin_id, delivery_promise_profile_id, fulfillment_mode, version_number, status)
  VALUES (v_cA, sA1, p1, oA1, dpM1, 'merchant_fulfilled', 2, 'draft')
  RETURNING id INTO aMerchant;
  UPDATE public.merchant_store_sku_delivery_promise_assignments SET status = 'active' WHERE id = aMerchant;
  v_pass := v_pass + 1;

  -- POSITIVE 2: platform_fulfilled valid assignment
  INSERT INTO public.merchant_store_sku_delivery_promise_assignments
    (company_id, merchant_store_id, shipping_profile_id, fulfillment_origin_id, delivery_promise_profile_id, fulfillment_mode, version_number, status)
  VALUES (v_cA, sA2, p6, oA2, dpP1, 'platform_fulfilled', 1, 'active')
  RETURNING id INTO aPlatform;
  v_pass := v_pass + 1;

  -- POSITIVE 3: draft with inactive origin is representable
  INSERT INTO public.merchant_store_sku_delivery_promise_assignments
    (company_id, merchant_store_id, shipping_profile_id, fulfillment_origin_id, delivery_promise_profile_id, fulfillment_mode, version_number, status)
  VALUES (v_cA, sA1, p1, oA1i, dpM1, 'merchant_fulfilled', 1, 'draft')
  RETURNING id INTO aDraftInactiveOrigin;
  v_pass := v_pass + 1;

  -- NEGATIVE MATRIX
  v_lbl := ARRAY[
    'cross-company shipping profile rejected',
    'cross-store shipping profile rejected',
    'cross-company origin rejected',
    'cross-store origin rejected',
    'origin not eligible for the shipping profile rejected',
    'merchant mode with platform promise rejected',
    'platform mode with merchant promise rejected',
    'merchant promise from another store rejected',
    'merchant promise from another company rejected',
    'invalid fulfillment mode rejected',
    'manual_quote mode rejected (BOR-DEC-080)',
    'version_number < 1 rejected',
    'duplicate version for the same group rejected',
    'supersedes with different origin rejected',
    'supersedes across tenants rejected',
    'supersedes with different fulfillment mode rejected',
    'version not higher than superseded rejected',
    'second active assignment for the same group rejected',
    'activation with inactive origin rejected',
    'activation with inactive shipping profile rejected',
    'activation with inactive eligibility row rejected',
    'activation with non-active promise profile rejected',
    'activation with incomplete weekly schedule rejected',
    'pickup-only activation rejected',
    'dangerous-goods activation rejected',
    'cold-chain activation rejected',
    'active assignment version is immutable',
    'active assignment origin is immutable'
  ]::text[];

  v_bad := ARRAY[
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cB, sB1, p1, oB, dpB, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA2, p1, oA2, dpM2, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p1, oB, dpM1, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p1, oA2, dpM1, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p1, oA1u, dpM1, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,7,%L)', v_cA, sA1, p1, oA1d, dpP1, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,7,%L)', v_cA, sA1, p1, oA1d, dpM1, 'platform_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,8,%L)', v_cA, sA1, p1, oA1d, dpM2, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,9,%L)', v_cA, sA1, p1, oA1d, dpB, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,10,%L)', v_cA, sA1, p1, oA1d, dpM1, 'fake_mode','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,11,%L)', v_cA, sA1, p1, oA1d, dpM1, 'manual_quote','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,0,%L)', v_cA, sA1, p1, oA1d, dpM1, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,2,%L)', v_cA, sA1, p1, oA1, dpM1, 'merchant_fulfilled','draft'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status,supersedes_assignment_id) values (%L,%L,%L,%L,%L,%L,12,%L,%L)', v_cA, sA1, p1, oA1d, dpM1, 'merchant_fulfilled','draft', aMerchant),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status,supersedes_assignment_id) values (%L,%L,%L,%L,%L,%L,13,%L,%L)', v_cA, sA2, p6, oA2, dpP1, 'platform_fulfilled','draft', aMerchant),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status,supersedes_assignment_id) values (%L,%L,%L,%L,%L,%L,14,%L,%L)', v_cA, sA1, p1, oA1, dpP1, 'platform_fulfilled','draft', aMerchant),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status,supersedes_assignment_id) values (%L,%L,%L,%L,%L,%L,1,%L,%L)', v_cA, sA1, p1, oA1, dpM1, 'merchant_fulfilled','draft', aMerchant),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,15,%L)', v_cA, sA1, p1, oA1, dpM1, 'merchant_fulfilled','active'),
    format('update public.merchant_store_sku_delivery_promise_assignments set status=%L where id=%L', 'active', aDraftInactiveOrigin),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p5, oA1, dpM1, 'merchant_fulfilled','active'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p1, oA1c, dpM1, 'merchant_fulfilled','active'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,16,%L)', v_cA, sA1, p1, oA1d, dpD7, 'merchant_fulfilled','active'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,17,%L)', v_cA, sA1, p1, oA1d, dpD5, 'merchant_fulfilled','active'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p2, oA1, dpM1, 'merchant_fulfilled','active'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p3, oA1, dpM1, 'merchant_fulfilled','active'),
    format('insert into public.merchant_store_sku_delivery_promise_assignments (company_id,merchant_store_id,shipping_profile_id,fulfillment_origin_id,delivery_promise_profile_id,fulfillment_mode,version_number,status) values (%L,%L,%L,%L,%L,%L,1,%L)', v_cA, sA1, p4, oA1, dpM1, 'merchant_fulfilled','active'),
    format('update public.merchant_store_sku_delivery_promise_assignments set version_number=99 where id=%L', aMerchant),
    format('update public.merchant_store_sku_delivery_promise_assignments set fulfillment_origin_id=%L where id=%L', oA1d, aMerchant)
  ]::text[];

  FOR i IN 1 .. array_length(v_bad, 1) LOOP
    BEGIN
      EXECUTE v_bad[i];
      v_failed := array_append(v_failed, v_lbl[i]);
    EXCEPTION WHEN others THEN
      v_pass := v_pass + 1;
    END;
  END LOOP;

  -- superseded / retired immutability
  UPDATE public.merchant_store_sku_delivery_promise_assignments SET status = 'superseded' WHERE id = aMerchant;
  v_pass := v_pass + 1;
  BEGIN
    UPDATE public.merchant_store_sku_delivery_promise_assignments SET status = 'draft' WHERE id = aMerchant;
    v_failed := array_append(v_failed, 'superseded assignment is immutable'::text);
  EXCEPTION WHEN others THEN v_pass := v_pass + 1; END;

  UPDATE public.merchant_store_sku_delivery_promise_assignments SET status = 'retired' WHERE id = aPlatform;
  v_pass := v_pass + 1;
  BEGIN
    UPDATE public.merchant_store_sku_delivery_promise_assignments SET fulfillment_origin_id = oA2 WHERE id = aPlatform;
    v_failed := array_append(v_failed, 'retired assignment is immutable'::text);
  EXCEPTION WHEN others THEN v_pass := v_pass + 1; END;

  -- structural assertions
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='merchant_store_sku_delivery_promise_assignments'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v_n <> 1 THEN v_failed := array_append(v_failed, 'RLS enabled + forced'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='merchant_store_sku_delivery_promise_assignments';
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'zero policies'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
    LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
   WHERE n.nspname='public' AND c.relname='merchant_store_sku_delivery_promise_assignments'
     AND has_table_privilege(rl.r, c.oid, pv.p);
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'zero application grants'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='S' AND c.relname LIKE '%delivery_promise_assignment%';
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'no new sequences (R-T22)'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'm1c1dc_guard_%'
     AND (p.proacl IS NULL
          OR has_function_privilege('anon',p.oid,'EXECUTE')
          OR has_function_privilege('authenticated',p.oid,'EXECUTE')
          OR has_function_privilege('service_role',p.oid,'EXECUTE')
          OR has_function_privilege('sandbox_exec',p.oid,'EXECUTE'));
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'guard functions locked'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'm1c1dc_guard_%';
  IF v_n <> 4 THEN v_failed := array_append(v_failed, 'guard inventory = 4'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
    LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r)
   WHERE n.nspname='public' AND p.proname='place_order' AND has_function_privilege(rl.r,p.oid,'EXECUTE');
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'place_order EXECUTE false for non-owner roles'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='place_order' AND p.prosrc NOT LIKE '%permanently disabled%';
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'place_order body fail-closed'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND (c.relname LIKE '%transit%' OR c.relname LIKE '%manual_quote%'
          OR c.relname LIKE '%delivery_promise_default%' OR c.relname LIKE '%listing_delivery_promise%');
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'no transit/manual-quote/default/listing objects'::text); ELSE v_pass := v_pass + 1; END IF;

  SELECT count(*) INTO v_n FROM public.channel_connections WHERE mode='live';
  IF v_n <> 9 THEN v_failed := array_append(v_failed, 'live channel connections = 9'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.channel_connections WHERE mode='live' AND live_authorized_at IS NOT NULL;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'no live channel authorization'::text); ELSE v_pass := v_pass + 1; END IF;

  -- CLEANUP
  DELETE FROM public.merchant_store_sku_delivery_promise_assignments WHERE merchant_store_id IN (sA1, sA2, sB1);
  DELETE FROM public.merchant_store_sku_fulfillment_origins WHERE merchant_store_id IN (sA1, sA2, sB1);
  DELETE FROM public.merchant_store_sku_shipping_profiles WHERE merchant_store_id IN (sA1, sA2, sB1);
  DELETE FROM public.merchant_fulfillment_origins WHERE merchant_store_id IN (sA1, sA2, sB1);

  ALTER TABLE public.delivery_promise_weekly_schedules DISABLE TRIGGER trg_dpws_mutable;
  DELETE FROM public.delivery_promise_weekly_schedules
   WHERE delivery_promise_profile_id IN (dpM1, dpM2, dpP1, dpD7, dpD5, dpB);
  ALTER TABLE public.delivery_promise_weekly_schedules ENABLE TRIGGER trg_dpws_mutable;

  DELETE FROM public.delivery_promise_profiles WHERE id IN (dpM1, dpM2, dpP1, dpD7, dpD5, dpB);
  DELETE FROM public.merchant_stores WHERE id IN (sA1, sA2, sB1);

  -- ZERO-ROW / STEADY-STATE EVIDENCE
  SELECT count(*) INTO v_n FROM public.merchant_store_sku_delivery_promise_assignments;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'assignments final count = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.delivery_promise_profiles;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'promise profiles = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.delivery_promise_weekly_schedules;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'weekly schedules = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.merchant_fulfillment_origins;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'origins = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.merchant_store_sku_shipping_profiles;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'shipping profiles = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.merchant_store_sku_fulfillment_origins;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'origin eligibility = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.merchant_stores;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'merchant stores = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.shipping_rate_cards;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'rate cards = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.shipping_rate_lanes;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'rate lanes = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.shipping_rate_rules;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'rate rules = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.tax_categories;
  IF v_n <> 4 THEN v_failed := array_append(v_failed, 'tax categories = 4'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.tax_rate_bands;
  IF v_n <> 9 THEN v_failed := array_append(v_failed, 'tax rate bands = 9'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.tax_rate_versions;
  IF v_n <> 5 THEN v_failed := array_append(v_failed, 'tax rate versions = 5'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.merchant_store_offer_prices;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'prices = 0'::text); ELSE v_pass := v_pass + 1; END IF;
  SELECT count(*) INTO v_n FROM public.borvat_direct_listing_publications;
  IF v_n <> 0 THEN v_failed := array_append(v_failed, 'publications = 0'::text); ELSE v_pass := v_pass + 1; END IF;

  IF array_length(v_failed, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'M1C-1D-C VERIFICATION FAILED (% assertions passed). FAILED: %', v_pass, array_to_string(v_failed, ' | ');
  END IF;

  RAISE NOTICE 'M1C-1D-C VERIFICATION PASSED: % assertions', v_pass;
END
$verify$;