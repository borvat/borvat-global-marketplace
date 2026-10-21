-- =====================================================================
-- M1C-1E-D — VERSIONED MANUAL SHIPPING QUOTE OFFER FOUNDATION
-- Schema foundation only. Owner-only. Zero rows. No acceptance/payment/UI.
-- =====================================================================

-- 0. Declarative prerequisite: prove request identity + buyer + tenant + currency
ALTER TABLE public.manual_shipping_quote_requests
  ADD CONSTRAINT msqr_offer_binding_uk
  UNIQUE (id, buyer_principal_id, company_id, merchant_store_id, currency_code);

-- 1. Offers ------------------------------------------------------------
CREATE TABLE public.manual_shipping_quote_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_shipping_quote_request_id uuid NOT NULL,
  company_id uuid NOT NULL,
  merchant_store_id uuid NOT NULL,
  buyer_principal_id uuid NOT NULL,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  quote_source text NOT NULL,
  responsible_party text NOT NULL,
  currency_code text NOT NULL,
  customer_shipping_charge_minor bigint,
  delivery_min_calendar_days_after_acceptance integer,
  delivery_max_calendar_days_after_acceptance integer,
  carrier_code text,
  service_code text,
  offered_at timestamptz,
  expires_at timestamptz,
  supersedes_offer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT msqo_request_binding_fk
    FOREIGN KEY (manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id, currency_code)
    REFERENCES public.manual_shipping_quote_requests (id, buyer_principal_id, company_id, merchant_store_id, currency_code)
    ON DELETE RESTRICT,
  CONSTRAINT msqo_version_ck CHECK (version_number > 0),
  CONSTRAINT msqo_status_ck CHECK (status = ANY (ARRAY['draft','offered','superseded','withdrawn','expired'])),
  CONSTRAINT msqo_source_ck CHECK (quote_source = ANY (ARRAY['merchant_store','platform'])),
  CONSTRAINT msqo_responsible_ck CHECK (responsible_party = ANY (ARRAY['merchant_store','platform'])),
  CONSTRAINT msqo_currency_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT msqo_charge_ck CHECK (customer_shipping_charge_minor IS NULL OR customer_shipping_charge_minor >= 0),
  CONSTRAINT msqo_eta_min_ck CHECK (delivery_min_calendar_days_after_acceptance IS NULL OR delivery_min_calendar_days_after_acceptance >= 0),
  CONSTRAINT msqo_eta_range_ck CHECK (
    delivery_min_calendar_days_after_acceptance IS NULL
    OR delivery_max_calendar_days_after_acceptance IS NULL
    OR delivery_max_calendar_days_after_acceptance >= delivery_min_calendar_days_after_acceptance),
  CONSTRAINT msqo_eta_pair_ck CHECK (
    (delivery_min_calendar_days_after_acceptance IS NULL) = (delivery_max_calendar_days_after_acceptance IS NULL)),
  CONSTRAINT msqo_carrier_pair_ck CHECK ((carrier_code IS NULL) = (service_code IS NULL)),
  CONSTRAINT msqo_carrier_code_ck CHECK (carrier_code IS NULL OR carrier_code ~ '^[A-Z0-9][A-Z0-9_]{1,31}$'),
  CONSTRAINT msqo_service_code_ck CHECK (service_code IS NULL OR service_code ~ '^[A-Z0-9][A-Z0-9_]{1,31}$'),
  CONSTRAINT msqo_draft_offered_at_ck CHECK (status <> 'draft' OR offered_at IS NULL),
  CONSTRAINT msqo_expiry_ck CHECK (
    expires_at IS NULL OR (offered_at IS NOT NULL AND expires_at > offered_at)),
  CONSTRAINT msqo_publication_completeness_ck CHECK (
    status IN ('draft','withdrawn')
    OR (customer_shipping_charge_minor IS NOT NULL
        AND delivery_min_calendar_days_after_acceptance IS NOT NULL
        AND delivery_max_calendar_days_after_acceptance IS NOT NULL
        AND offered_at IS NOT NULL
        AND expires_at IS NOT NULL)),
  CONSTRAINT msqo_supersedes_self_ck CHECK (supersedes_offer_id IS NULL OR supersedes_offer_id <> id),
  CONSTRAINT msqo_request_version_uk UNIQUE (manual_shipping_quote_request_id, version_number),
  CONSTRAINT msqo_supersede_binding_uk
    UNIQUE (id, manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id, currency_code)
);

ALTER TABLE public.manual_shipping_quote_offers
  ADD CONSTRAINT msqo_supersedes_binding_fk
  FOREIGN KEY (supersedes_offer_id, manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id, currency_code)
  REFERENCES public.manual_shipping_quote_offers (id, manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id, currency_code)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX msqo_single_offered_version_uk
  ON public.manual_shipping_quote_offers (manual_shipping_quote_request_id)
  WHERE status = 'offered';

COMMENT ON TABLE public.manual_shipping_quote_offers IS
  'M1C-1E-D. Versioned commercial shipping offer bound to exactly one immutable manual shipping quote request (same buyer, company, merchant store and currency, proven by composite FK). Carries no acceptance, payment, order, inventory reservation or product price. Destination, packages, items, origin and shipment form are NOT copied; they are pinned inside the referenced request.';
COMMENT ON COLUMN public.manual_shipping_quote_offers.customer_shipping_charge_minor IS
  'Commercial shipping charge payable by the customer, in minor currency units, BEFORE final checkout VAT. Not a carrier cost, not input VAT, not platform margin, not a product amount and not a checkout total.';
COMMENT ON COLUMN public.manual_shipping_quote_offers.delivery_min_calendar_days_after_acceptance IS
  'Contractual CALENDAR-day duration (not business days) counted from future customer acceptance. Internal automatic ETA, if used for comparison, is NOT the contractual ETA of a manual offer.';
COMMENT ON COLUMN public.manual_shipping_quote_offers.delivery_max_calendar_days_after_acceptance IS
  'Contractual CALENDAR-day duration (not business days) counted from future customer acceptance. Internal automatic ETA, if used for comparison, is NOT the contractual ETA of a manual offer.';
COMMENT ON COLUMN public.manual_shipping_quote_offers.quote_source IS
  'Who produced the price/duration: merchant_store or platform. No actor identity is stored.';
COMMENT ON COLUMN public.manual_shipping_quote_offers.responsible_party IS
  'Who carries responsibility for the shipping terms; independent of quote_source. A carrier code never implies a direct carrier-customer contract.';
COMMENT ON COLUMN public.manual_shipping_quote_offers.expires_at IS
  'Absolute TIMESTAMPTZ. An offer whose expires_at has passed is never acceptable, even while status is still offered.';

-- 2. Offer conditions ---------------------------------------------------
CREATE TABLE public.manual_shipping_quote_offer_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_shipping_quote_offer_id uuid NOT NULL
    REFERENCES public.manual_shipping_quote_offers (id) ON DELETE CASCADE,
  condition_number integer NOT NULL,
  condition_code text NOT NULL,
  condition_text text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT msqoc_number_ck CHECK (condition_number > 0),
  CONSTRAINT msqoc_code_ck CHECK (condition_code = ANY (ARRAY[
    'curbside_delivery','ground_floor_only','lift_gate_included','lift_gate_excluded',
    'appointment_required','customer_unloading_required','access_restrictions_apply',
    'carrier_terms_apply','other'])),
  CONSTRAINT msqoc_text_ck CHECK (
    (condition_code = 'other' AND condition_text IS NOT NULL AND length(btrim(condition_text)) BETWEEN 1 AND 500)
    OR (condition_code <> 'other' AND condition_text IS NULL)),
  CONSTRAINT msqoc_number_uk UNIQUE (manual_shipping_quote_offer_id, condition_number),
  CONSTRAINT msqoc_code_uk UNIQUE (manual_shipping_quote_offer_id, condition_code)
);

COMMENT ON TABLE public.manual_shipping_quote_offer_conditions IS
  'M1C-1E-D. Normalized coded conditions of a manual shipping quote offer. Free text is allowed only for code=other and must never contain contact identity, addresses, door codes, payment instructions or external URLs. No regex here claims complete redaction: a future application workflow MUST apply moderation/validation before free text is accepted.';

-- 3. Guards -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ed_guard_publication_integrity(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  o public.manual_shipping_quote_offers%ROWTYPE;
  r public.manual_shipping_quote_requests%ROWTYPE;
  v_rows integer;
  v_bad integer;
BEGIN
  SELECT * INTO o FROM public.manual_shipping_quote_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1ED: offer not found'; END IF;

  SELECT * INTO r FROM public.manual_shipping_quote_requests
   WHERE id = o.manual_shipping_quote_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1ED: quote request not found'; END IF;

  IF r.status NOT IN ('under_review','quoted') THEN
    RAISE EXCEPTION 'M1C1ED: an offer may only be published while the request is under_review or quoted';
  END IF;
  IF r.currency_code <> o.currency_code THEN
    RAISE EXCEPTION 'M1C1ED: offer currency must match the request currency';
  END IF;
  IF o.customer_shipping_charge_minor IS NULL OR o.customer_shipping_charge_minor < 0 THEN
    RAISE EXCEPTION 'M1C1ED: a published offer requires a non-negative customer shipping charge';
  END IF;
  IF o.delivery_min_calendar_days_after_acceptance IS NULL
     OR o.delivery_max_calendar_days_after_acceptance IS NULL THEN
    RAISE EXCEPTION 'M1C1ED: a published offer requires calendar-day delivery minimum and maximum';
  END IF;
  IF o.offered_at IS NULL OR o.expires_at IS NULL OR o.expires_at <= o.offered_at THEN
    RAISE EXCEPTION 'M1C1ED: a published offer requires offered_at and a later expires_at';
  END IF;
  IF (o.carrier_code IS NULL) <> (o.service_code IS NULL) THEN
    RAISE EXCEPTION 'M1C1ED: carrier_code and service_code must both be present or both absent';
  END IF;

  -- destination version must still be active and its parent not retired
  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_delivery_destination_versions v
    JOIN public.customer_delivery_destinations d
      ON d.id = v.customer_delivery_destination_id
     AND d.buyer_principal_id = v.buyer_principal_id
    WHERE v.id = r.delivery_destination_version_id
      AND v.buyer_principal_id = r.buyer_principal_id
      AND v.status = 'active'
      AND d.status <> 'retired'
  ) THEN
    RAISE EXCEPTION 'M1C1ED: destination version must still be active and its parent not retired';
  END IF;

  -- exact origin still active
  IF r.fulfillment_origin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.merchant_fulfillment_origins x
    WHERE x.id = r.fulfillment_origin_id
      AND x.company_id = r.company_id
      AND x.merchant_store_id = r.merchant_store_id
      AND x.status = 'active'
  ) THEN
    RAISE EXCEPTION 'M1C1ED: the exact fulfillment origin must still be active for this store';
  END IF;

  SELECT count(*) INTO v_rows FROM public.manual_shipping_quote_request_items
   WHERE manual_shipping_quote_request_id = r.id;
  IF v_rows = 0 THEN RAISE EXCEPTION 'M1C1ED: the request has no items'; END IF;

  SELECT count(*) INTO v_rows FROM public.manual_shipping_quote_request_packages
   WHERE manual_shipping_quote_request_id = r.id;
  IF v_rows = 0 THEN RAISE EXCEPTION 'M1C1ED: the request has no packages'; END IF;

  SELECT count(*) INTO v_bad
  FROM public.manual_shipping_quote_request_items i
  JOIN public.merchant_store_sku_shipping_profiles p ON p.id = i.shipping_profile_id
  WHERE i.manual_shipping_quote_request_id = r.id
    AND (p.company_id <> r.company_id OR p.merchant_store_id <> r.merchant_store_id
         OR p.status <> 'active');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M1C1ED: every item shipping profile must still be active and same-store';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.manual_shipping_quote_request_items i
  JOIN public.merchant_store_sku_shipping_profiles p ON p.id = i.shipping_profile_id
  WHERE i.manual_shipping_quote_request_id = r.id
    AND (p.pickup_only OR p.dangerous_goods OR p.handling_class = 'cold_chain');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M1C1ED: pickup-only, dangerous-goods and cold-chain fail closed for manual quote offers';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.manual_shipping_quote_request_items i
  WHERE i.manual_shipping_quote_request_id = r.id
    AND NOT EXISTS (
      SELECT 1 FROM public.merchant_store_sku_fulfillment_origins e
      WHERE e.shipping_profile_id = i.shipping_profile_id
        AND e.fulfillment_origin_id = r.fulfillment_origin_id
        AND e.status = 'active');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M1C1ED: every item must still be eligible for the exact fulfillment origin';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ed_guard_offer_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  r_status text;
  prev_version integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'M1C1ED: only draft offers may be deleted';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO r_status FROM public.manual_shipping_quote_requests
   WHERE id = NEW.manual_shipping_quote_request_id;
  IF r_status IS NULL THEN
    RAISE EXCEPTION 'M1C1ED: quote request not found';
  END IF;

  IF NEW.supersedes_offer_id IS NOT NULL THEN
    SELECT version_number INTO prev_version FROM public.manual_shipping_quote_offers
     WHERE id = NEW.supersedes_offer_id;
    IF prev_version IS NULL THEN
      RAISE EXCEPTION 'M1C1ED: superseded offer not found';
    END IF;
    IF NEW.version_number <= prev_version THEN
      RAISE EXCEPTION 'M1C1ED: a superseding offer must carry a strictly higher version number';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','offered') THEN
      RAISE EXCEPTION 'M1C1ED: an offer must be created as draft or offered';
    END IF;
    IF NEW.status = 'draft' AND r_status NOT IN ('requested','under_review') THEN
      RAISE EXCEPTION 'M1C1ED: a draft offer requires a requested or under_review request';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status IN ('superseded','withdrawn','expired') THEN
    RAISE EXCEPTION 'M1C1ED: terminal offers are historically frozen';
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft','offered','withdrawn') THEN
      RAISE EXCEPTION 'M1C1ED: illegal offer transition from draft to %', NEW.status;
    END IF;
  ELSIF OLD.status = 'offered' THEN
    IF NEW.status NOT IN ('superseded','withdrawn','expired') THEN
      RAISE EXCEPTION 'M1C1ED: illegal offer transition from offered to %', NEW.status;
    END IF;
    IF NEW.manual_shipping_quote_request_id <> OLD.manual_shipping_quote_request_id
       OR NEW.company_id <> OLD.company_id
       OR NEW.merchant_store_id <> OLD.merchant_store_id
       OR NEW.buyer_principal_id <> OLD.buyer_principal_id
       OR NEW.version_number <> OLD.version_number
       OR NEW.currency_code <> OLD.currency_code
       OR NEW.quote_source <> OLD.quote_source
       OR NEW.responsible_party <> OLD.responsible_party
       OR NEW.customer_shipping_charge_minor IS DISTINCT FROM OLD.customer_shipping_charge_minor
       OR NEW.delivery_min_calendar_days_after_acceptance IS DISTINCT FROM OLD.delivery_min_calendar_days_after_acceptance
       OR NEW.delivery_max_calendar_days_after_acceptance IS DISTINCT FROM OLD.delivery_max_calendar_days_after_acceptance
       OR NEW.carrier_code IS DISTINCT FROM OLD.carrier_code
       OR NEW.service_code IS DISTINCT FROM OLD.service_code
       OR NEW.offered_at IS DISTINCT FROM OLD.offered_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.supersedes_offer_id IS DISTINCT FROM OLD.supersedes_offer_id THEN
      RAISE EXCEPTION 'M1C1ED: published offer commercial terms are immutable; create a new offer version';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ed_guard_offer_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF NEW.status = 'offered' AND (TG_OP = 'INSERT' OR OLD.status <> 'offered') THEN
    PERFORM public.m1c1ed_guard_publication_integrity(NEW.id);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.m1c1ed_guard_condition_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  o_status text;
  o_id uuid;
BEGIN
  o_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.manual_shipping_quote_offer_id
               ELSE NEW.manual_shipping_quote_offer_id END;
  SELECT status INTO o_status FROM public.manual_shipping_quote_offers WHERE id = o_id;
  IF o_status IS NULL THEN
    RAISE EXCEPTION 'M1C1ED: offer not found for condition row';
  END IF;
  IF o_status <> 'draft' THEN
    RAISE EXCEPTION 'M1C1ED: conditions of a non-draft offer are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.manual_shipping_quote_offer_id <> OLD.manual_shipping_quote_offer_id THEN
    RAISE EXCEPTION 'M1C1ED: a condition may not be moved between offers';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$fn$;

CREATE TRIGGER m1c1ed_offer_write_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_offers
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ed_guard_offer_write();

CREATE CONSTRAINT TRIGGER m1c1ed_offer_publication_trg
  AFTER INSERT OR UPDATE ON public.manual_shipping_quote_offers
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ed_guard_offer_publication();

CREATE TRIGGER m1c1ed_condition_write_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_offer_conditions
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ed_guard_condition_write();

-- 4. RLS + ACL (owner-only, zero policies, zero grants) -----------------
ALTER TABLE public.manual_shipping_quote_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_offer_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_offer_conditions FORCE ROW LEVEL SECURITY;

DO $$
DECLARE r record; roles text[] := ARRAY['PUBLIC','anon','authenticated','service_role','sandbox_exec'];
        rl text;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS rel FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname LIKE 'manual_shipping_quote_%'
  LOOP
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %s', r.rel, rl);
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (p.proname LIKE 'm1c1ec_guard_%' OR p.proname LIKE 'm1c1ed_guard_%')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', r.sig);
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.sig, rl);
    END LOOP;
  END LOOP;
END $$;