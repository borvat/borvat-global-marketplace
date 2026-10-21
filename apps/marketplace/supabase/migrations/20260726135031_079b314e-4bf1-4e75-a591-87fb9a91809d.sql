-- =====================================================================
-- PHASE 5 — M1C-1C
-- AUTOMATIC ORIGIN-TO-DESTINATION SHIPPING RATE-CARD FOUNDATION
-- Schema foundation only. No data. No resolver. No RPC. No UI.
-- Decisions: BOR-DEC-066, BOR-DEC-067, BOR-DEC-068, BOR-DEC-069
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. shipping_rate_cards
-- ---------------------------------------------------------------------
CREATE TABLE public.shipping_rate_cards (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type                text        NOT NULL,
  company_id                uuid        NULL,
  merchant_store_id         uuid        NULL,
  carrier_code              text        NOT NULL,
  service_code              text        NOT NULL,
  currency_code             text        NOT NULL,
  customer_charge_tax_basis text        NOT NULL DEFAULT 'pre_tax_commercial_charge',
  volumetric_divisor        integer     NULL,
  status                    text        NOT NULL DEFAULT 'draft',
  supersedes_card_id        uuid        NULL,
  valid_from                timestamptz NOT NULL DEFAULT now(),
  valid_to                  timestamptz NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT src_scope_type_ck CHECK (scope_type = ANY (ARRAY['platform','merchant_store'])),
  CONSTRAINT src_status_ck     CHECK (status = ANY (ARRAY['draft','active','inactive','superseded','retired'])),
  CONSTRAINT src_scope_tenancy_ck CHECK (
    (scope_type = 'platform'       AND company_id IS NULL     AND merchant_store_id IS NULL)
    OR
    (scope_type = 'merchant_store' AND company_id IS NOT NULL AND merchant_store_id IS NOT NULL)
  ),
  CONSTRAINT src_carrier_code_ck CHECK (carrier_code ~ '^[A-Z0-9][A-Z0-9_]{1,31}$'),
  CONSTRAINT src_service_code_ck CHECK (service_code ~ '^[A-Z0-9][A-Z0-9_]{1,31}$'),
  CONSTRAINT src_currency_ck     CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT src_tax_basis_ck    CHECK (customer_charge_tax_basis = 'pre_tax_commercial_charge'),
  CONSTRAINT src_volumetric_ck   CHECK (volumetric_divisor IS NULL OR volumetric_divisor > 0),
  CONSTRAINT src_validity_ck     CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT src_no_self_supersede_ck CHECK (supersedes_card_id IS NULL OR supersedes_card_id <> id),

  CONSTRAINT src_id_company_store_uk UNIQUE (id, company_id, merchant_store_id),

  CONSTRAINT src_company_fk FOREIGN KEY (company_id)
    REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT src_store_company_fk FOREIGN KEY (merchant_store_id, company_id)
    REFERENCES public.merchant_stores(id, company_id) ON DELETE RESTRICT,
  CONSTRAINT src_supersedes_fk FOREIGN KEY (supersedes_card_id)
    REFERENCES public.shipping_rate_cards(id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.shipping_rate_cards IS
  'M1C-1C. A versioned commercial shipping rate contract. Scope is either platform-wide (Borvat-negotiated fallback) or a single merchant store. Precedence (BOR-DEC-068) is derived from scope_type and lane origin_scope_type only; there is no free-form priority field. Immutable once active (BOR-DEC-069).';
COMMENT ON COLUMN public.shipping_rate_cards.customer_charge_tax_basis IS
  'BOR-DEC-067. Amounts on this card are a PRE-TAX COMMERCIAL CUSTOMER CHARGE. They are NOT the carrier invoice cost, NOT input VAT paid to the carrier, NOT platform margin, and NOT a checkout-displayable VAT-inclusive price. Shipping VAT may depend on the product mix of the fulfillment group and requires separate allocation. Carrier/label purchase cost needs its own future model and must never be merged into this value.';
COMMENT ON COLUMN public.shipping_rate_cards.volumetric_divisor IS
  'Carrier/service specific divisor. Volumetric weight is derived at resolve time (max of actual and volumetric); it is deliberately NOT stored on the SKU because it varies per carrier.';

-- ---------------------------------------------------------------------
-- B. shipping_rate_lanes
-- ---------------------------------------------------------------------
CREATE TABLE public.shipping_rate_lanes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_rate_card_id    uuid        NOT NULL,
  card_company_id          uuid        NULL,
  card_merchant_store_id   uuid        NULL,
  origin_scope_type        text        NOT NULL,
  fulfillment_origin_id    uuid        NULL,
  origin_country_code      text        NOT NULL,
  destination_country_code text        NOT NULL,
  status                   text        NOT NULL DEFAULT 'draft',
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT srl_origin_scope_ck CHECK (origin_scope_type = ANY (ARRAY['exact_origin','origin_country'])),
  CONSTRAINT srl_status_ck       CHECK (status = ANY (ARRAY['draft','active','inactive','retired'])),
  CONSTRAINT srl_origin_shape_ck CHECK (
    (origin_scope_type = 'exact_origin'   AND fulfillment_origin_id IS NOT NULL)
    OR
    (origin_scope_type = 'origin_country' AND fulfillment_origin_id IS NULL)
  ),
  CONSTRAINT srl_origin_country_ck      CHECK (origin_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT srl_destination_country_ck CHECK (destination_country_code ~ '^[A-Z]{2}$'),

  CONSTRAINT srl_card_tenancy_fk FOREIGN KEY (shipping_rate_card_id, card_company_id, card_merchant_store_id)
    REFERENCES public.shipping_rate_cards(id, company_id, merchant_store_id) ON DELETE CASCADE,
  CONSTRAINT srl_origin_tenancy_fk FOREIGN KEY (fulfillment_origin_id, card_company_id, card_merchant_store_id)
    REFERENCES public.merchant_fulfillment_origins(id, company_id, merchant_store_id) ON DELETE RESTRICT,
  CONSTRAINT srl_origin_fk FOREIGN KEY (fulfillment_origin_id)
    REFERENCES public.merchant_fulfillment_origins(id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.shipping_rate_lanes IS
  'M1C-1C. Origin -> destination route inside a rate card. Destination is always an explicit ISO-3166-1 alpha-2 country; no assumption of NL origin, no NL/BE/DE restriction, and no requirement that a local Borvat market exists in the destination country (e.g. SE is a valid destination with no local SE market).';

CREATE UNIQUE INDEX srl_card_route_uk
  ON public.shipping_rate_lanes (
    shipping_rate_card_id,
    origin_scope_type,
    COALESCE(fulfillment_origin_id, '00000000-0000-0000-0000-000000000000'::uuid),
    origin_country_code,
    destination_country_code
  );

CREATE INDEX srl_card_idx   ON public.shipping_rate_lanes (shipping_rate_card_id);
CREATE INDEX srl_origin_idx ON public.shipping_rate_lanes (fulfillment_origin_id) WHERE fulfillment_origin_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- C. shipping_rate_rules
-- ---------------------------------------------------------------------
CREATE TABLE public.shipping_rate_rules (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_rate_lane_id              uuid    NOT NULL,
  handling_class                     text    NOT NULL,
  billable_weight_from_grams         integer NOT NULL,
  billable_weight_to_grams           integer NOT NULL,
  parcel_count_from                  integer NOT NULL DEFAULT 1,
  parcel_count_to                    integer NOT NULL DEFAULT 1,
  max_length_mm                      integer NULL,
  max_width_mm                       integer NULL,
  max_height_mm                      integer NULL,
  customer_charge_amount_minor       bigint  NOT NULL,
  free_above_merchandise_amount_minor bigint NULL,
  created_at                         timestamptz NOT NULL DEFAULT now(),

  billable_weight_range int8range GENERATED ALWAYS AS
    (int8range(billable_weight_from_grams::bigint, billable_weight_to_grams::bigint, '[]')) STORED,
  parcel_count_range int4range GENERATED ALWAYS AS
    (int4range(parcel_count_from, parcel_count_to, '[]')) STORED,

  CONSTRAINT srr_handling_class_ck CHECK (
    handling_class = ANY (ARRAY['standard','oversized','pallet','pickup_only','dangerous_goods'])
  ),
  -- pickup_only never receives an automatic parcel rate.
  CONSTRAINT srr_no_pickup_only_ck CHECK (handling_class <> 'pickup_only'),
  CONSTRAINT srr_weight_from_ck    CHECK (billable_weight_from_grams >= 0),
  CONSTRAINT srr_weight_range_ck   CHECK (billable_weight_to_grams > billable_weight_from_grams),
  CONSTRAINT srr_parcel_from_ck    CHECK (parcel_count_from >= 1),
  CONSTRAINT srr_parcel_range_ck   CHECK (parcel_count_to >= parcel_count_from),
  CONSTRAINT srr_max_length_ck     CHECK (max_length_mm IS NULL OR max_length_mm > 0),
  CONSTRAINT srr_max_width_ck      CHECK (max_width_mm  IS NULL OR max_width_mm  > 0),
  CONSTRAINT srr_max_height_ck     CHECK (max_height_mm IS NULL OR max_height_mm > 0),
  CONSTRAINT srr_charge_ck         CHECK (customer_charge_amount_minor >= 0),
  CONSTRAINT srr_free_threshold_ck CHECK (
    free_above_merchandise_amount_minor IS NULL OR free_above_merchandise_amount_minor > 0
  ),

  CONSTRAINT srr_lane_fk FOREIGN KEY (shipping_rate_lane_id)
    REFERENCES public.shipping_rate_lanes(id) ON DELETE CASCADE,

  -- Deterministic tier selection: no two rules in the same lane + handling class
  -- may overlap on BOTH the billable-weight and the parcel-count dimension.
  -- Dimensional caps are deliberately NOT part of the exclusion key, so two rules
  -- that differ only by max dimensions are rejected as ambiguous.
  CONSTRAINT srr_no_overlap_ex EXCLUDE USING gist (
    shipping_rate_lane_id WITH =,
    handling_class        WITH =,
    billable_weight_range WITH &&,
    parcel_count_range    WITH &&
  )
);

COMMENT ON TABLE public.shipping_rate_rules IS
  'M1C-1C. Price tiers inside a lane. Currency is inherited from the parent rate card and is never restated here.';
COMMENT ON COLUMN public.shipping_rate_rules.customer_charge_amount_minor IS
  'BOR-DEC-067. Pre-tax commercial customer shipping charge in the parent card currency, minor units. NOT carrier invoice cost, NOT input VAT, NOT platform margin, NOT a VAT-inclusive checkout price. Zero means free shipping to the customer; it does NOT mean the carrier cost is zero.';
COMMENT ON COLUMN public.shipping_rate_rules.free_above_merchandise_amount_minor IS
  'Merchandise-value threshold, same currency and minor units, evaluated per FULFILLMENT GROUP (never across a multi-merchant parent cart) after destination-valid product prices are resolved. Not computed in M1C-1C.';
COMMENT ON COLUMN public.shipping_rate_rules.handling_class IS
  'Rate-side fulfilment class vocabulary: standard | oversized | pallet | pickup_only | dangerous_goods. Mapping from merchant_store_sku_shipping_profiles (standard|fragile|bulky|cold_chain|high_value + oversized/dangerous_goods/pickup_only booleans): pickup_only=true -> pickup_only (no automatic rate, rows forbidden here); dangerous_goods=true -> dangerous_goods (requires future carrier-capability eligibility; a rule alone never makes it auto-shippable); oversized=true -> oversized, or pallet where the merchant declares pallet handling; otherwise -> standard. This is a mapping, not a competing vocabulary.';

-- ---------------------------------------------------------------------
-- D. Integrity guards (owner-only, search_path='', no dynamic SQL)
-- ---------------------------------------------------------------------

-- D1. Lane tenancy / origin integrity
CREATE OR REPLACE FUNCTION public.m1c1c_guard_lane_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_card   public.shipping_rate_cards%ROWTYPE;
  v_origin public.merchant_fulfillment_origins%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM public.shipping_rate_cards WHERE id = NEW.shipping_rate_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1C: rate card % not found', NEW.shipping_rate_card_id;
  END IF;

  IF NEW.card_company_id IS DISTINCT FROM v_card.company_id
     OR NEW.card_merchant_store_id IS DISTINCT FROM v_card.merchant_store_id THEN
    RAISE EXCEPTION 'M1C-1C: lane tenancy denormalisation does not match parent rate card';
  END IF;

  IF NEW.origin_scope_type = 'exact_origin' THEN
    SELECT * INTO v_origin
      FROM public.merchant_fulfillment_origins
     WHERE id = NEW.fulfillment_origin_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C-1C: fulfillment origin % not found', NEW.fulfillment_origin_id;
    END IF;

    IF v_card.scope_type = 'merchant_store' THEN
      IF v_origin.company_id <> v_card.company_id
         OR v_origin.merchant_store_id <> v_card.merchant_store_id THEN
        RAISE EXCEPTION 'M1C-1C: exact origin does not belong to the rate card company/store';
      END IF;
    END IF;

    IF v_origin.country_code <> NEW.origin_country_code THEN
      RAISE EXCEPTION 'M1C-1C: lane origin_country_code % does not match origin country %',
        NEW.origin_country_code, v_origin.country_code;
    END IF;

    IF v_origin.status = 'retired' THEN
      RAISE EXCEPTION 'M1C-1C: exact origin % is retired and cannot back a rate lane', v_origin.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER m1c1c_lane_integrity_trg
  BEFORE INSERT OR UPDATE ON public.shipping_rate_lanes
  FOR EACH ROW EXECUTE FUNCTION public.m1c1c_guard_lane_integrity();

-- D2. Card activation requires ACTIVE exact origins (partially closes R-S1);
--     card immutability after activation (BOR-DEC-069).
CREATE OR REPLACE FUNCTION public.m1c1c_guard_card_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_bad_origin uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    IF NEW.scope_type    IS DISTINCT FROM OLD.scope_type
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.merchant_store_id IS DISTINCT FROM OLD.merchant_store_id
       OR NEW.carrier_code IS DISTINCT FROM OLD.carrier_code
       OR NEW.service_code IS DISTINCT FROM OLD.service_code
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.customer_charge_tax_basis IS DISTINCT FROM OLD.customer_charge_tax_basis
       OR NEW.volumetric_divisor IS DISTINCT FROM OLD.volumetric_divisor
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN
      RAISE EXCEPTION 'M1C-1C: an active rate card is immutable; create a new card and supersede it';
    END IF;
  END IF;

  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    SELECT o.id INTO v_bad_origin
      FROM public.shipping_rate_lanes l
      JOIN public.merchant_fulfillment_origins o ON o.id = l.fulfillment_origin_id
     WHERE l.shipping_rate_card_id = NEW.id
       AND l.origin_scope_type = 'exact_origin'
       AND o.status <> 'active'
     LIMIT 1;
    IF v_bad_origin IS NOT NULL THEN
      RAISE EXCEPTION 'M1C-1C: cannot activate rate card %; fulfillment origin % is not active',
        NEW.id, v_bad_origin;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER m1c1c_card_lifecycle_trg
  BEFORE INSERT OR UPDATE ON public.shipping_rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.m1c1c_guard_card_lifecycle();

-- D3. Lanes and rules are frozen while the parent card is active or beyond
CREATE OR REPLACE FUNCTION public.m1c1c_guard_lane_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_card_id uuid;
  v_status  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_card_id := OLD.shipping_rate_card_id;
  ELSE
    v_card_id := NEW.shipping_rate_card_id;
  END IF;

  SELECT status INTO v_status FROM public.shipping_rate_cards WHERE id = v_card_id;
  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C-1C: lanes of a % rate card are immutable; create a new card', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE TRIGGER m1c1c_lane_immutability_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.shipping_rate_lanes
  FOR EACH ROW EXECUTE FUNCTION public.m1c1c_guard_lane_immutability();

CREATE OR REPLACE FUNCTION public.m1c1c_guard_rule_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_lane_id uuid;
  v_status  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_lane_id := OLD.shipping_rate_lane_id;
  ELSE
    v_lane_id := NEW.shipping_rate_lane_id;
  END IF;

  SELECT c.status INTO v_status
    FROM public.shipping_rate_lanes l
    JOIN public.shipping_rate_cards c ON c.id = l.shipping_rate_card_id
   WHERE l.id = v_lane_id;

  IF v_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C-1C: rate rules of a % rate card are immutable; create a new card', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

CREATE TRIGGER m1c1c_rule_immutability_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.shipping_rate_rules
  FOR EACH ROW EXECUTE FUNCTION public.m1c1c_guard_rule_immutability();

-- D4. An origin cannot leave 'active' while an active card depends on it (R-S2 hardening)
CREATE OR REPLACE FUNCTION public.m1c1c_guard_origin_rate_dependency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_card_id uuid;
BEGIN
  IF NEW.status = 'active' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_card_id
    FROM public.shipping_rate_lanes l
    JOIN public.shipping_rate_cards c ON c.id = l.shipping_rate_card_id
   WHERE l.fulfillment_origin_id = NEW.id
     AND c.status = 'active'
   LIMIT 1;

  IF v_card_id IS NOT NULL THEN
    RAISE EXCEPTION 'M1C-1C: origin % cannot leave active status; active rate card % depends on it. Deactivate the card first.',
      NEW.id, v_card_id;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER m1c1c_origin_rate_dependency_trg
  BEFORE UPDATE ON public.merchant_fulfillment_origins
  FOR EACH ROW EXECUTE FUNCTION public.m1c1c_guard_origin_rate_dependency();

-- ---------------------------------------------------------------------
-- E. RLS — enabled, forced, zero policies, owner-only
-- ---------------------------------------------------------------------
ALTER TABLE public.shipping_rate_cards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_cards  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_lanes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_lanes  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_rules  FORCE  ROW LEVEL SECURITY;

-- =====================================================================
-- F. MANDATORY ACL NORMALIZATION (BOR-DEC-065, drift mechanism A + B)
-- =====================================================================
REVOKE ALL ON TABLE public.shipping_rate_cards FROM PUBLIC;
REVOKE ALL ON TABLE public.shipping_rate_lanes FROM PUBLIC;
REVOKE ALL ON TABLE public.shipping_rate_rules FROM PUBLIC;

DO $acl$
DECLARE
  r text;
  t text;
  f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','sandbox_exec'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY[
        'public.shipping_rate_cards',
        'public.shipping_rate_lanes',
        'public.shipping_rate_rules',
        -- protected inventory re-normalisation (mechanism A re-grants these)
        'public.tax_categories','public.tax_rate_bands','public.tax_rate_versions',
        'public.catalog_product_tax_classifications','public.company_tax_profiles',
        'public.merchant_store_offer_prices','public.borvat_direct_listing_publications',
        'public.merchant_fulfillment_origins','public.merchant_store_sku_shipping_profiles',
        'public.merchant_store_sku_shipping_packages','public.merchant_store_sku_fulfillment_origins'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', t, r);
      END LOOP;

      FOREACH f IN ARRAY ARRAY[
        'public.m1c1c_guard_lane_integrity()',
        'public.m1c1c_guard_card_lifecycle()',
        'public.m1c1c_guard_lane_immutability()',
        'public.m1c1c_guard_rule_immutability()',
        'public.m1c1c_guard_origin_rate_dependency()'
      ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END LOOP;

      EXECUTE format('REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb) FROM %I', r);
    END IF;
  END LOOP;
END
$acl$;

REVOKE ALL ON FUNCTION public.m1c1c_guard_lane_integrity()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1c_guard_card_lifecycle()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1c_guard_lane_immutability()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1c_guard_rule_immutability()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1c_guard_origin_rate_dependency()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb)       FROM PUBLIC;

-- =====================================================================
-- G. FAIL-CLOSED POST-MIGRATION ASSERTIONS
-- =====================================================================
DO $assert$
DECLARE
  n bigint;
BEGIN
  -- zero rows
  SELECT count(*) INTO n FROM public.shipping_rate_cards;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: shipping_rate_cards must be empty (got %)', n; END IF;
  SELECT count(*) INTO n FROM public.shipping_rate_lanes;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: shipping_rate_lanes must be empty (got %)', n; END IF;
  SELECT count(*) INTO n FROM public.shipping_rate_rules;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: shipping_rate_rules must be empty (got %)', n; END IF;

  -- untouched foundations
  SELECT count(*) INTO n FROM public.merchant_fulfillment_origins;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: fulfillment origins changed (%)', n; END IF;
  SELECT count(*) INTO n FROM public.merchant_store_sku_shipping_profiles;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: shipping profiles changed (%)', n; END IF;
  SELECT count(*) INTO n FROM public.merchant_store_offer_prices;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: offer prices changed (%)', n; END IF;
  SELECT count(*) INTO n FROM public.borvat_direct_listing_publications;
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: publications changed (%)', n; END IF;

  -- tax invariants 4 / 9 / 5
  SELECT count(*) INTO n FROM public.tax_categories;
  IF n <> 4 THEN RAISE EXCEPTION 'M1C-1C: tax_categories expected 4 (got %)', n; END IF;
  SELECT count(*) INTO n FROM public.tax_rate_bands;
  IF n <> 9 THEN RAISE EXCEPTION 'M1C-1C: tax_rate_bands expected 9 (got %)', n; END IF;
  SELECT count(*) INTO n FROM public.tax_rate_versions;
  IF n <> 5 THEN RAISE EXCEPTION 'M1C-1C: tax_rate_versions expected 5 (got %)', n; END IF;

  -- no new sequences (R-T22)
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'S'
     AND c.relname LIKE 'shipping_rate%';
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: unexpected sequence created (%)', n; END IF;

  -- new tables carry no application grants
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace,
         LATERAL (VALUES ('anon'),('authenticated'),('service_role'),('sandbox_exec')) rl(r),
         LATERAL (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER'),('TRUNCATE')) pv(p)
   WHERE ns.nspname = 'public'
     AND c.relname IN ('shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rl.r)
     AND has_table_privilege(rl.r, c.oid, pv.p);
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: new tables still expose % application privileges', n; END IF;

  -- zero policies on new tables
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('shipping_rate_cards','shipping_rate_lanes','shipping_rate_rules');
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: new tables must have zero policies (got %)', n; END IF;

  -- new guard functions not executable and not proacl NULL
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname LIKE 'm1c1c_guard_%'
     AND (p.proacl IS NULL
          OR has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: guard function ACL violation (%)', n; END IF;

  -- place_order stays fail-closed
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'place_order'
     AND p.prosrc NOT LIKE '%permanently disabled%';
  IF n <> 0 THEN RAISE EXCEPTION 'M1C-1C: place_order body is no longer neutralised'; END IF;
END
$assert$;