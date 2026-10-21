-- =====================================================================
-- PHASE 5 — M1C-1D-F
-- EXPLICIT RATE-LANE TO TRANSIT-PROFILE BINDING FOUNDATION
-- Schema foundation only. No resolver, no RPC, no UI, no data.
-- BOR-DEC-091..094
-- =====================================================================

CREATE TABLE public.shipping_rate_lane_transit_profile_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_rate_lane_id uuid NOT NULL
    REFERENCES public.shipping_rate_lanes(id) ON DELETE RESTRICT,
  shipping_transit_time_profile_id uuid NOT NULL
    REFERENCES public.shipping_transit_time_profiles(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  supersedes_binding_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT srltpb_version_ck CHECK (version_number >= 1),
  CONSTRAINT srltpb_status_ck CHECK (status = ANY (ARRAY['draft','active','inactive','superseded','retired'])),
  CONSTRAINT srltpb_not_self_supersede_ck CHECK (supersedes_binding_id IS DISTINCT FROM id),
  CONSTRAINT srltpb_id_lane_uk UNIQUE (id, shipping_rate_lane_id),
  CONSTRAINT srltpb_lane_version_uk UNIQUE (shipping_rate_lane_id, version_number)
);

-- Supersession family is declaratively confined to the same rate lane.
ALTER TABLE public.shipping_rate_lane_transit_profile_bindings
  ADD CONSTRAINT srltpb_supersedes_same_lane_fk
  FOREIGN KEY (supersedes_binding_id, shipping_rate_lane_id)
  REFERENCES public.shipping_rate_lane_transit_profile_bindings(id, shipping_rate_lane_id)
  ON DELETE RESTRICT;

-- BOR-DEC-092: exactly one active binding per rate lane.
CREATE UNIQUE INDEX srltpb_one_active_per_lane_uk
  ON public.shipping_rate_lane_transit_profile_bindings (shipping_rate_lane_id)
  WHERE (status = 'active');

CREATE INDEX srltpb_profile_ix
  ON public.shipping_rate_lane_transit_profile_bindings (shipping_transit_time_profile_id);
CREATE INDEX srltpb_supersedes_ix
  ON public.shipping_rate_lane_transit_profile_bindings (supersedes_binding_id)
  WHERE (supersedes_binding_id IS NOT NULL);

COMMENT ON TABLE public.shipping_rate_lane_transit_profile_bindings IS
'M1C-1D-F (BOR-DEC-091..094). Explicit binding: when this shipping rate lane is used, the bound transit-time profile version is the single authoritative source of transit duration and calendars. A binding does NOT prove carrier capability, product shipping eligibility, SKU serviceability, dangerous-goods / cold-chain / pallet / oversized support, VAT treatment, ETA completeness or checkout permission. Price and ETA remain independent (BOR-DEC-089): a rate lane may exist without a binding and a transit profile may exist without a rate lane; only automatic price+ETA composition requires exactly one active binding.';

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1df_guard_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- Compatibility guard: scope, tenant, carrier, service, origin, destination
-- BOR-DEC-093
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1df_guard_binding_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_lane      public.shipping_rate_lanes%ROWTYPE;
  v_card      public.shipping_rate_cards%ROWTYPE;
  v_profile   public.shipping_transit_time_profiles%ROWTYPE;
  v_prev_ver  integer;
BEGIN
  SELECT * INTO v_lane FROM public.shipping_rate_lanes
   WHERE id = NEW.shipping_rate_lane_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1D-F: shipping rate lane % not found', NEW.shipping_rate_lane_id;
  END IF;

  SELECT * INTO v_card FROM public.shipping_rate_cards
   WHERE id = v_lane.shipping_rate_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1D-F: parent rate card of lane % not found', v_lane.id;
  END IF;

  SELECT * INTO v_profile FROM public.shipping_transit_time_profiles
   WHERE id = NEW.shipping_transit_time_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1C-1D-F: transit profile % not found', NEW.shipping_transit_time_profile_id;
  END IF;

  -- Carrier / service must match the parent rate card.
  IF v_card.carrier_code IS DISTINCT FROM v_profile.carrier_code THEN
    RAISE EXCEPTION 'M1C-1D-F: carrier mismatch (rate card % vs transit profile %)',
      v_card.carrier_code, v_profile.carrier_code;
  END IF;
  IF v_card.service_code IS DISTINCT FROM v_profile.service_code THEN
    RAISE EXCEPTION 'M1C-1D-F: service mismatch (rate card % vs transit profile %)',
      v_card.service_code, v_profile.service_code;
  END IF;

  -- Destination country must match literally.
  IF v_lane.destination_country_code IS DISTINCT FROM v_profile.destination_country_code THEN
    RAISE EXCEPTION 'M1C-1D-F: destination country mismatch (lane % vs transit profile %)',
      v_lane.destination_country_code, v_profile.destination_country_code;
  END IF;

  -- Origin country must match literally.
  IF v_lane.origin_country_code IS DISTINCT FROM v_profile.origin_country_code THEN
    RAISE EXCEPTION 'M1C-1D-F: origin country mismatch (lane % vs transit profile %)',
      v_lane.origin_country_code, v_profile.origin_country_code;
  END IF;

  -- Scope / tenant compatibility.
  IF v_card.scope_type = 'platform' THEN
    IF v_profile.scope_type <> 'platform' THEN
      RAISE EXCEPTION 'M1C-1D-F: a platform rate lane may only bind a platform-scoped transit profile';
    END IF;
  ELSE
    IF v_profile.scope_type = 'merchant_store' THEN
      IF v_profile.company_id IS DISTINCT FROM v_card.company_id
         OR v_profile.merchant_store_id IS DISTINCT FROM v_card.merchant_store_id THEN
        RAISE EXCEPTION 'M1C-1D-F: cross-tenant binding rejected (rate card company/store must equal transit profile company/store)';
      END IF;
    ELSIF v_profile.scope_type <> 'platform' THEN
      RAISE EXCEPTION 'M1C-1D-F: unsupported transit profile scope %', v_profile.scope_type;
    END IF;
  END IF;

  -- Origin compatibility.
  IF v_lane.origin_scope_type = 'exact_origin' THEN
    IF v_profile.origin_scope_type = 'exact_origin' THEN
      IF v_profile.fulfillment_origin_id IS DISTINCT FROM v_lane.fulfillment_origin_id THEN
        RAISE EXCEPTION 'M1C-1D-F: exact-origin transit profile belongs to a different fulfillment origin';
      END IF;
    ELSIF v_profile.origin_scope_type <> 'origin_country' THEN
      RAISE EXCEPTION 'M1C-1D-F: unsupported transit origin scope %', v_profile.origin_scope_type;
    END IF;
  ELSE
    -- origin_country rate lane
    IF v_profile.origin_scope_type <> 'origin_country' THEN
      RAISE EXCEPTION 'M1C-1D-F: a country-wide rate lane may not bind an exact-origin transit profile';
    END IF;
  END IF;

  -- Supersession must move strictly forward within the same lane.
  IF NEW.supersedes_binding_id IS NOT NULL THEN
    SELECT version_number INTO v_prev_ver
      FROM public.shipping_rate_lane_transit_profile_bindings
     WHERE id = NEW.supersedes_binding_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C-1D-F: superseded binding % not found', NEW.supersedes_binding_id;
    END IF;
    IF NEW.version_number <= v_prev_ver THEN
      RAISE EXCEPTION 'M1C-1D-F: version_number % must be greater than superseded version %',
        NEW.version_number, v_prev_ver;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- Activation integrity guard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1df_guard_binding_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_lane        public.shipping_rate_lanes%ROWTYPE;
  v_card        public.shipping_rate_cards%ROWTYPE;
  v_profile     public.shipping_transit_time_profiles%ROWTYPE;
  v_origin_st   text;
  v_n           integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_lane FROM public.shipping_rate_lanes
   WHERE id = NEW.shipping_rate_lane_id;
  SELECT * INTO v_card FROM public.shipping_rate_cards
   WHERE id = v_lane.shipping_rate_card_id;
  SELECT * INTO v_profile FROM public.shipping_transit_time_profiles
   WHERE id = NEW.shipping_transit_time_profile_id;

  -- Rate side.
  IF v_card.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, parent rate card is %', v_card.status;
  END IF;
  IF v_lane.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, rate lane is %', v_lane.status;
  END IF;
  IF v_lane.fulfillment_origin_id IS NOT NULL THEN
    SELECT status INTO v_origin_st FROM public.merchant_fulfillment_origins
     WHERE id = v_lane.fulfillment_origin_id;
    IF v_origin_st IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, rate lane exact origin is %',
        COALESCE(v_origin_st, 'missing');
    END IF;
  END IF;

  -- Transit side.
  IF v_profile.status <> 'active' THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, transit profile is %', v_profile.status;
  END IF;
  IF v_profile.fulfillment_origin_id IS NOT NULL THEN
    SELECT status INTO v_origin_st FROM public.merchant_fulfillment_origins
     WHERE id = v_profile.fulfillment_origin_id;
    IF v_origin_st IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, transit profile exact origin is %',
        COALESCE(v_origin_st, 'missing');
    END IF;
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_time_weekday_rules
   WHERE shipping_transit_time_profile_id = v_profile.id;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, transit profile has % handover weekday rows (7 required)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_delivery_weekdays
   WHERE shipping_transit_time_profile_id = v_profile.id;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, transit profile has % delivery weekday rows (7 required)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_time_weekday_rules
   WHERE shipping_transit_time_profile_id = v_profile.id AND handover_supported;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, transit profile supports no handover weekday';
  END IF;

  SELECT count(*) INTO v_n FROM public.shipping_transit_delivery_weekdays
   WHERE shipping_transit_time_profile_id = v_profile.id AND delivery_enabled;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, transit profile enables no delivery weekday';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.shipping_transit_time_profile_calendars a
    JOIN public.shipping_calendar_profiles c
      ON c.id = a.shipping_calendar_profile_id
   WHERE a.shipping_transit_time_profile_id = v_profile.id
     AND c.status <> 'active';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'M1C-1D-F: cannot activate binding, % assigned calendar(s) are not active', v_n;
  END IF;

  -- Single active binding per lane (belt and braces beside the partial unique index).
  SELECT count(*) INTO v_n
    FROM public.shipping_rate_lane_transit_profile_bindings b
   WHERE b.shipping_rate_lane_id = NEW.shipping_rate_lane_id
     AND b.status = 'active'
     AND b.id <> NEW.id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'M1C-1D-F: another active binding already exists for rate lane %',
      NEW.shipping_rate_lane_id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- Immutability guard — BOR-DEC-094
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1df_guard_binding_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.status IN ('active','superseded','retired') THEN
    IF NEW.shipping_rate_lane_id IS DISTINCT FROM OLD.shipping_rate_lane_id
       OR NEW.shipping_transit_time_profile_id IS DISTINCT FROM OLD.shipping_transit_time_profile_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.supersedes_binding_id IS DISTINCT FROM OLD.supersedes_binding_id
       OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'M1C-1D-F: binding % is immutable in status % (create a new version instead)',
        OLD.id, OLD.status;
    END IF;

    IF OLD.status IN ('superseded','retired') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'M1C-1D-F: terminal binding status % cannot be changed', OLD.status;
    END IF;

    IF OLD.status = 'active'
       AND NEW.status NOT IN ('active','superseded','retired') THEN
      RAISE EXCEPTION 'M1C-1D-F: active binding may only move to superseded or retired (got %)', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER srltpb_compatibility
  BEFORE INSERT OR UPDATE ON public.shipping_rate_lane_transit_profile_bindings
  FOR EACH ROW EXECUTE FUNCTION public.m1c1df_guard_binding_compatibility();

CREATE TRIGGER srltpb_immutability
  BEFORE UPDATE ON public.shipping_rate_lane_transit_profile_bindings
  FOR EACH ROW EXECUTE FUNCTION public.m1c1df_guard_binding_immutability();

CREATE TRIGGER srltpb_activation
  BEFORE INSERT OR UPDATE ON public.shipping_rate_lane_transit_profile_bindings
  FOR EACH ROW EXECUTE FUNCTION public.m1c1df_guard_binding_activation();

CREATE TRIGGER srltpb_touch_updated_at
  BEFORE UPDATE ON public.shipping_rate_lane_transit_profile_bindings
  FOR EACH ROW EXECUTE FUNCTION public.m1c1df_guard_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS: enabled + forced, zero policies, owner-only.
-- ---------------------------------------------------------------------
ALTER TABLE public.shipping_rate_lane_transit_profile_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rate_lane_transit_profile_bindings FORCE ROW LEVEL SECURITY;

-- =====================================================================
-- ACL NORMALIZATION SECTION (REVOKE-ONLY, ZERO GRANTS) — R-T21
-- =====================================================================
REVOKE ALL ON TABLE public.shipping_rate_lane_transit_profile_bindings FROM PUBLIC;
REVOKE ALL ON TABLE public.shipping_rate_lane_transit_profile_bindings FROM anon;
REVOKE ALL ON TABLE public.shipping_rate_lane_transit_profile_bindings FROM authenticated;
REVOKE ALL ON TABLE public.shipping_rate_lane_transit_profile_bindings FROM service_role;
REVOKE ALL ON TABLE public.shipping_rate_lane_transit_profile_bindings FROM sandbox_exec;

REVOKE ALL ON FUNCTION public.m1c1df_guard_touch_updated_at() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1c1df_guard_binding_compatibility() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1c1df_guard_binding_activation() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1c1df_guard_binding_immutability() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

-- Re-assert the standing protected inventory (revoke-only, no grants).
DO $acl$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS t
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
        'shipping_calendar_blackout_dates','shipping_transit_time_profile_calendars',
        'shipping_rate_lane_transit_profile_bindings')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.t);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS f
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'm1c1c_guard_%' OR p.proname LIKE 'm1c1db_guard_%'
         OR p.proname LIKE 'm1c1dc_guard_%' OR p.proname LIKE 'm1c1dd_guard_%'
         OR p.proname LIKE 'm1c1df_guard_%' OR p.proname = 'place_order')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec', r.f);
  END LOOP;
END
$acl$;
