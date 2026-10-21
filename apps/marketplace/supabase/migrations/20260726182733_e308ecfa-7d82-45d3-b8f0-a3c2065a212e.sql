-- =====================================================================
-- M1C-1E-E — MANUAL QUOTE ACCEPTANCE, EXPIRY AND INVALIDATION FOUNDATION
-- Owner-only schema + integrity foundation. No RPC, no UI, no orders,
-- no payment, no inventory reservation, no carrier booking, no cron.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. STATUS DOMAIN EXTENSIONS
-- ---------------------------------------------------------------------
ALTER TABLE public.manual_shipping_quote_requests DROP CONSTRAINT msqr_status_ck;
ALTER TABLE public.manual_shipping_quote_requests ADD CONSTRAINT msqr_status_ck
  CHECK (status = ANY (ARRAY['draft','requested','under_review','quoted',
                             'accepted','declined','expired','cancelled','superseded']));

ALTER TABLE public.manual_shipping_quote_requests
  ADD CONSTRAINT msqr_id_family_uk UNIQUE (id, request_family_id);

ALTER TABLE public.manual_shipping_quote_offers DROP CONSTRAINT msqo_status_ck;
ALTER TABLE public.manual_shipping_quote_offers ADD CONSTRAINT msqo_status_ck
  CHECK (status = ANY (ARRAY['draft','offered','superseded','withdrawn',
                             'expired','accepted','invalidated']));

ALTER TABLE public.manual_shipping_quote_offers DROP CONSTRAINT msqo_publication_completeness_ck;
ALTER TABLE public.manual_shipping_quote_offers ADD CONSTRAINT msqo_publication_completeness_ck
  CHECK (
    status = ANY (ARRAY['draft','withdrawn','invalidated'])
    OR (customer_shipping_charge_minor IS NOT NULL
        AND delivery_min_calendar_days_after_acceptance IS NOT NULL
        AND delivery_max_calendar_days_after_acceptance IS NOT NULL
        AND offered_at IS NOT NULL
        AND expires_at IS NOT NULL)
  );

-- at most one accepted offer version per request
CREATE UNIQUE INDEX msqo_single_accepted_version_uk
  ON public.manual_shipping_quote_offers (manual_shipping_quote_request_id)
  WHERE status = 'accepted';

-- ---------------------------------------------------------------------
-- 2. ACCEPTANCE SNAPSHOT
-- ---------------------------------------------------------------------
CREATE TABLE public.manual_shipping_quote_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_family_id uuid NOT NULL,
  manual_shipping_quote_request_id uuid NOT NULL,
  manual_shipping_quote_offer_id uuid NOT NULL,
  offer_version_number integer NOT NULL,
  buyer_principal_id uuid NOT NULL,
  company_id uuid NOT NULL,
  merchant_store_id uuid NOT NULL,
  currency_code text NOT NULL,
  accepted_shipping_charge_minor bigint NOT NULL,
  delivery_min_calendar_days_after_acceptance integer NOT NULL,
  delivery_max_calendar_days_after_acceptance integer NOT NULL,
  carrier_code text,
  service_code text,
  quote_source text NOT NULL,
  responsible_party text NOT NULL,
  fulfillment_origin_id uuid NOT NULL,
  delivery_destination_version_id uuid NOT NULL,
  shipment_form text NOT NULL,
  offer_offered_at timestamptz NOT NULL,
  offer_expires_at timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_actor_type text NOT NULL,
  accepted_by_buyer_principal_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msqa_family_uk UNIQUE (request_family_id),
  CONSTRAINT msqa_request_uk UNIQUE (manual_shipping_quote_request_id),
  CONSTRAINT msqa_offer_uk UNIQUE (manual_shipping_quote_offer_id),
  CONSTRAINT msqa_currency_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT msqa_charge_ck CHECK (accepted_shipping_charge_minor >= 0),
  CONSTRAINT msqa_eta_ck CHECK (delivery_min_calendar_days_after_acceptance >= 0
    AND delivery_max_calendar_days_after_acceptance >= delivery_min_calendar_days_after_acceptance),
  CONSTRAINT msqa_carrier_pair_ck CHECK ((carrier_code IS NULL) = (service_code IS NULL)),
  CONSTRAINT msqa_version_ck CHECK (offer_version_number > 0),
  CONSTRAINT msqa_source_ck CHECK (quote_source = ANY (ARRAY['merchant_store','platform'])),
  CONSTRAINT msqa_responsible_ck CHECK (responsible_party = ANY (ARRAY['merchant_store','platform'])),
  CONSTRAINT msqa_shipment_form_ck CHECK (shipment_form = ANY (ARRAY['parcel','multi_parcel','pallet','freight'])),
  CONSTRAINT msqa_actor_ck CHECK (
    (accepted_by_actor_type = 'buyer' AND accepted_by_buyer_principal_id IS NOT NULL)
    OR (accepted_by_actor_type = 'platform' AND accepted_by_buyer_principal_id IS NULL)),
  CONSTRAINT msqa_expiry_ck CHECK (offer_expires_at > offer_offered_at
                                   AND accepted_at <= offer_expires_at
                                   AND accepted_at >= offer_offered_at),
  CONSTRAINT msqa_request_family_fk FOREIGN KEY (manual_shipping_quote_request_id, request_family_id)
    REFERENCES public.manual_shipping_quote_requests (id, request_family_id) ON DELETE RESTRICT,
  CONSTRAINT msqa_offer_binding_fk FOREIGN KEY
    (manual_shipping_quote_offer_id, manual_shipping_quote_request_id,
     buyer_principal_id, company_id, merchant_store_id, currency_code)
    REFERENCES public.manual_shipping_quote_offers
    (id, manual_shipping_quote_request_id, buyer_principal_id, company_id, merchant_store_id, currency_code)
    ON DELETE RESTRICT,
  CONSTRAINT msqa_origin_tenancy_fk FOREIGN KEY (fulfillment_origin_id, company_id, merchant_store_id)
    REFERENCES public.merchant_fulfillment_origins (id, company_id, merchant_store_id) ON DELETE RESTRICT,
  CONSTRAINT msqa_destination_buyer_fk FOREIGN KEY (delivery_destination_version_id, buyer_principal_id)
    REFERENCES public.customer_delivery_destination_versions (id, buyer_principal_id) ON DELETE RESTRICT,
  CONSTRAINT msqa_buyer_fk FOREIGN KEY (buyer_principal_id) REFERENCES public.profiles (id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.manual_shipping_quote_acceptances IS
  'M1C-1E-E: terminal, immutable acceptance snapshot of exactly one manual shipping quote offer per request family. No order, payment or reservation is implied.';

-- accepted condition snapshot
CREATE TABLE public.manual_shipping_quote_acceptance_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_shipping_quote_acceptance_id uuid NOT NULL
    REFERENCES public.manual_shipping_quote_acceptances (id) ON DELETE RESTRICT,
  condition_number integer NOT NULL,
  condition_code text NOT NULL,
  condition_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msqac_number_uk UNIQUE (manual_shipping_quote_acceptance_id, condition_number),
  CONSTRAINT msqac_code_uk UNIQUE (manual_shipping_quote_acceptance_id, condition_code),
  CONSTRAINT msqac_number_ck CHECK (condition_number > 0),
  CONSTRAINT msqac_code_ck CHECK (condition_code = ANY (ARRAY['curbside_delivery','ground_floor_only',
    'lift_gate_included','lift_gate_excluded','appointment_required','customer_unloading_required',
    'access_restrictions_apply','carrier_terms_apply','other'])),
  CONSTRAINT msqac_text_ck CHECK (
    (condition_code = 'other' AND condition_text IS NOT NULL
      AND length(btrim(condition_text)) BETWEEN 1 AND 500)
    OR (condition_code <> 'other' AND condition_text IS NULL))
);

-- ---------------------------------------------------------------------
-- 3. APPEND-ONLY STATE EVENT LOG
-- ---------------------------------------------------------------------
CREATE TABLE public.manual_shipping_quote_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_family_id uuid NOT NULL,
  manual_shipping_quote_request_id uuid NOT NULL,
  manual_shipping_quote_offer_id uuid,
  subject text NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_type text NOT NULL,
  actor_principal_id uuid,
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msqse_subject_ck CHECK (subject = ANY (ARRAY['request','offer','acceptance'])),
  CONSTRAINT msqse_offer_ref_ck CHECK (
    (subject = 'request' AND manual_shipping_quote_offer_id IS NULL)
    OR (subject <> 'request' AND manual_shipping_quote_offer_id IS NOT NULL)),
  CONSTRAINT msqse_event_ck CHECK (event_type = ANY (ARRAY[
    'request_submitted','request_under_review','request_quoted','request_accepted',
    'request_declined','request_expired','request_cancelled','request_superseded',
    'offer_drafted','offer_published','offer_superseded','offer_withdrawn',
    'offer_expired','offer_invalidated','offer_accepted','acceptance_recorded'])),
  CONSTRAINT msqse_actor_ck CHECK (actor_type = ANY (ARRAY['buyer','merchant_store','platform','system'])),
  CONSTRAINT msqse_actor_id_ck CHECK (
    (actor_type = 'buyer' AND actor_principal_id IS NOT NULL)
    OR (actor_type <> 'buyer' AND actor_principal_id IS NULL)),
  CONSTRAINT msqse_reason_ck CHECK (reason_code IS NULL
    OR reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT msqse_request_family_fk FOREIGN KEY (manual_shipping_quote_request_id, request_family_id)
    REFERENCES public.manual_shipping_quote_requests (id, request_family_id) ON DELETE RESTRICT,
  CONSTRAINT msqse_offer_fk FOREIGN KEY (manual_shipping_quote_offer_id)
    REFERENCES public.manual_shipping_quote_offers (id) ON DELETE RESTRICT
);

CREATE INDEX msqse_family_idx ON public.manual_shipping_quote_state_events (request_family_id, occurred_at);
CREATE INDEX msqse_request_idx ON public.manual_shipping_quote_state_events (manual_shipping_quote_request_id, occurred_at);

COMMENT ON TABLE public.manual_shipping_quote_state_events IS
  'M1C-1E-E: append-only lifecycle audit log for manual shipping quote requests, offers and acceptances.';

-- ---------------------------------------------------------------------
-- 4. PRIVATE READ-ONLY STATUS FUNCTIONS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ee_offer_effective_status(p_offer_id uuid, p_at timestamptz DEFAULT now())
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT CASE
           WHEN o.status = 'offered' AND o.expires_at IS NOT NULL AND o.expires_at <= p_at
             THEN 'expired'
           ELSE o.status
         END
  FROM public.manual_shipping_quote_offers o
  WHERE o.id = p_offer_id;
$$;

CREATE OR REPLACE FUNCTION public.m1c1ee_offer_acceptability(p_offer_id uuid, p_at timestamptz DEFAULT now())
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE
  o public.manual_shipping_quote_offers%ROWTYPE;
  r public.manual_shipping_quote_requests%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.manual_shipping_quote_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RETURN 'offer_not_found'; END IF;
  SELECT * INTO r FROM public.manual_shipping_quote_requests
   WHERE id = o.manual_shipping_quote_request_id;
  IF NOT FOUND THEN RETURN 'request_not_found'; END IF;

  IF o.status <> 'offered' THEN RETURN 'offer_not_published'; END IF;
  IF o.expires_at IS NULL OR o.expires_at <= p_at THEN RETURN 'offer_expired'; END IF;
  IF o.offered_at IS NULL OR o.offered_at > p_at THEN RETURN 'offer_not_yet_effective'; END IF;
  IF r.status <> 'quoted' THEN RETURN 'request_not_quoted'; END IF;
  IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
              WHERE a.request_family_id = r.request_family_id) THEN
    RETURN 'family_already_accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_offers x
              WHERE x.manual_shipping_quote_request_id = r.id
                AND x.version_number > o.version_number
                AND x.status IN ('offered','accepted')) THEN
    RETURN 'superseded_by_newer_version';
  END IF;
  RETURN 'acceptable';
END;
$$;

-- ---------------------------------------------------------------------
-- 5. ACCEPTANCE GUARDS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_acceptance_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  o public.manual_shipping_quote_offers%ROWTYPE;
  r public.manual_shipping_quote_requests%ROWTYPE;
  v_reason text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'M1C1EE: manual quote acceptances are terminal and immutable (% rejected)', TG_OP;
  END IF;

  -- serialize the whole request family to make revision/acceptance races fail closed
  PERFORM 1 FROM public.manual_shipping_quote_requests
   WHERE request_family_id = NEW.request_family_id FOR UPDATE;

  SELECT * INTO o FROM public.manual_shipping_quote_offers
   WHERE id = NEW.manual_shipping_quote_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1EE: accepted offer not found'; END IF;

  SELECT * INTO r FROM public.manual_shipping_quote_requests
   WHERE id = NEW.manual_shipping_quote_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1EE: quote request not found'; END IF;

  IF o.manual_shipping_quote_request_id <> NEW.manual_shipping_quote_request_id THEN
    RAISE EXCEPTION 'M1C1EE: the accepted offer does not belong to the accepted request';
  END IF;
  IF r.request_family_id <> NEW.request_family_id THEN
    RAISE EXCEPTION 'M1C1EE: request family mismatch';
  END IF;

  v_reason := public.m1c1ee_offer_acceptability(o.id, NEW.accepted_at);
  IF v_reason <> 'acceptable' THEN
    RAISE EXCEPTION 'M1C1EE: offer is not acceptable (%)', v_reason;
  END IF;

  IF NEW.offer_version_number <> o.version_number THEN
    RAISE EXCEPTION 'M1C1EE: acceptance must name the exact offer version';
  END IF;
  IF NEW.buyer_principal_id <> o.buyer_principal_id
     OR NEW.company_id <> o.company_id
     OR NEW.merchant_store_id <> o.merchant_store_id
     OR NEW.currency_code <> o.currency_code THEN
    RAISE EXCEPTION 'M1C1EE: acceptance tenancy and currency must match the offer';
  END IF;
  IF NEW.accepted_by_actor_type = 'buyer'
     AND NEW.accepted_by_buyer_principal_id <> r.buyer_principal_id THEN
    RAISE EXCEPTION 'M1C1EE: only the owning buyer may accept a manual quote offer';
  END IF;

  -- frozen commercial snapshot must equal the offer exactly
  IF NEW.accepted_shipping_charge_minor <> o.customer_shipping_charge_minor
     OR NEW.delivery_min_calendar_days_after_acceptance <> o.delivery_min_calendar_days_after_acceptance
     OR NEW.delivery_max_calendar_days_after_acceptance <> o.delivery_max_calendar_days_after_acceptance
     OR NEW.carrier_code IS DISTINCT FROM o.carrier_code
     OR NEW.service_code IS DISTINCT FROM o.service_code
     OR NEW.quote_source <> o.quote_source
     OR NEW.responsible_party <> o.responsible_party
     OR NEW.offer_offered_at <> o.offered_at
     OR NEW.offer_expires_at <> o.expires_at THEN
    RAISE EXCEPTION 'M1C1EE: the acceptance snapshot must match the published offer exactly';
  END IF;

  -- frozen request context must equal the request exactly
  IF NEW.fulfillment_origin_id IS DISTINCT FROM r.fulfillment_origin_id
     OR NEW.delivery_destination_version_id <> r.delivery_destination_version_id
     OR NEW.shipment_form <> r.shipment_form THEN
    RAISE EXCEPTION 'M1C1EE: the acceptance snapshot must match the request origin, destination version and shipment form';
  END IF;

  -- full context revalidation (destination, origin, items, packages, profiles)
  PERFORM public.m1c1ed_guard_publication_integrity(o.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER m1c1ee_acceptance_write_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_acceptances
FOR EACH ROW EXECUTE FUNCTION public.m1c1ee_guard_acceptance_write();

-- atomic settlement: at commit, offer and request must both be 'accepted'
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_acceptance_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v_offer text; v_request text; v_conditions integer; v_expected integer;
BEGIN
  SELECT status INTO v_offer FROM public.manual_shipping_quote_offers
   WHERE id = NEW.manual_shipping_quote_offer_id;
  SELECT status INTO v_request FROM public.manual_shipping_quote_requests
   WHERE id = NEW.manual_shipping_quote_request_id;

  IF v_offer <> 'accepted' THEN
    RAISE EXCEPTION 'M1C1EE: the accepted offer must be settled to status accepted in the same transaction';
  END IF;
  IF v_request <> 'accepted' THEN
    RAISE EXCEPTION 'M1C1EE: the accepted request must be settled to status accepted in the same transaction';
  END IF;

  SELECT count(*) INTO v_expected FROM public.manual_shipping_quote_offer_conditions
   WHERE manual_shipping_quote_offer_id = NEW.manual_shipping_quote_offer_id;
  SELECT count(*) INTO v_conditions FROM public.manual_shipping_quote_acceptance_conditions
   WHERE manual_shipping_quote_acceptance_id = NEW.id;
  IF v_conditions <> v_expected THEN
    RAISE EXCEPTION 'M1C1EE: every published offer condition must be frozen into the acceptance snapshot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.manual_shipping_quote_offer_conditions c
    FULL JOIN public.manual_shipping_quote_acceptance_conditions ac
      ON ac.manual_shipping_quote_acceptance_id = NEW.id
     AND ac.condition_code = c.condition_code
     AND ac.condition_number = c.condition_number
     AND ac.condition_text IS NOT DISTINCT FROM c.condition_text
    WHERE (c.manual_shipping_quote_offer_id = NEW.manual_shipping_quote_offer_id OR c.id IS NULL)
      AND (ac.manual_shipping_quote_acceptance_id = NEW.id OR ac.id IS NULL)
      AND (c.id IS NULL OR ac.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'M1C1EE: acceptance conditions must mirror the published offer conditions exactly';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER m1c1ee_acceptance_settlement_trg
AFTER INSERT ON public.manual_shipping_quote_acceptances
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.m1c1ee_guard_acceptance_settlement();

CREATE OR REPLACE FUNCTION public.m1c1ee_guard_acceptance_condition_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v_offer uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'M1C1EE: acceptance conditions are immutable (% rejected)', TG_OP;
  END IF;
  SELECT manual_shipping_quote_offer_id INTO v_offer
    FROM public.manual_shipping_quote_acceptances
   WHERE id = NEW.manual_shipping_quote_acceptance_id;
  IF v_offer IS NULL THEN RAISE EXCEPTION 'M1C1EE: acceptance not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.manual_shipping_quote_offer_conditions c
     WHERE c.manual_shipping_quote_offer_id = v_offer
       AND c.condition_code = NEW.condition_code
       AND c.condition_number = NEW.condition_number
       AND c.condition_text IS NOT DISTINCT FROM NEW.condition_text
  ) THEN
    RAISE EXCEPTION 'M1C1EE: acceptance condition must mirror a published offer condition exactly';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER m1c1ee_acceptance_condition_write_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_acceptance_conditions
FOR EACH ROW EXECUTE FUNCTION public.m1c1ee_guard_acceptance_condition_write();

-- ---------------------------------------------------------------------
-- 6. APPEND-ONLY EVENT GUARD
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_state_event_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v_family uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'M1C1EE: manual quote state events are append-only (% rejected)', TG_OP;
  END IF;
  IF NEW.manual_shipping_quote_offer_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.manual_shipping_quote_offers o
        WHERE o.id = NEW.manual_shipping_quote_offer_id
          AND o.manual_shipping_quote_request_id = NEW.manual_shipping_quote_request_id) THEN
    RAISE EXCEPTION 'M1C1EE: the event offer must belong to the event request';
  END IF;
  SELECT request_family_id INTO v_family FROM public.manual_shipping_quote_requests
   WHERE id = NEW.manual_shipping_quote_request_id;
  IF v_family IS DISTINCT FROM NEW.request_family_id THEN
    RAISE EXCEPTION 'M1C1EE: the event request family must match the request';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER m1c1ee_state_event_write_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.manual_shipping_quote_state_events
FOR EACH ROW EXECUTE FUNCTION public.m1c1ee_guard_state_event_write();

-- ---------------------------------------------------------------------
-- 7. OFFER LIFECYCLE EXTENSION (accepted / invalidated / expiry proof)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ed_guard_offer_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
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
  IF OLD.status IN ('superseded','withdrawn','expired','accepted','invalidated') THEN
    RAISE EXCEPTION 'M1C1ED: terminal offers are historically frozen';
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft','offered','withdrawn','invalidated') THEN
      RAISE EXCEPTION 'M1C1ED: illegal offer transition from draft to %', NEW.status;
    END IF;
  ELSIF OLD.status = 'offered' THEN
    IF NEW.status NOT IN ('superseded','withdrawn','expired','accepted','invalidated') THEN
      RAISE EXCEPTION 'M1C1ED: illegal offer transition from offered to %', NEW.status;
    END IF;
    IF NEW.status = 'expired' AND (OLD.expires_at IS NULL OR OLD.expires_at > now()) THEN
      RAISE EXCEPTION 'M1C1EE: an offer may only be marked expired at or after its expiry instant';
    END IF;
    IF NEW.status = 'accepted' THEN
      IF OLD.expires_at IS NULL OR OLD.expires_at <= now() THEN
        RAISE EXCEPTION 'M1C1EE: an expired offer can never be accepted';
      END IF;
      IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_offers x
                  WHERE x.manual_shipping_quote_request_id = OLD.manual_shipping_quote_request_id
                    AND x.version_number > OLD.version_number
                    AND x.status IN ('offered','accepted')) THEN
        RAISE EXCEPTION 'M1C1EE: a superseded offer version can never be accepted';
      END IF;
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
$$;

-- accepted offers may never lose their acceptance row
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_offer_acceptance_backing()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.status = 'accepted' AND NOT EXISTS (
    SELECT 1 FROM public.manual_shipping_quote_acceptances a
     WHERE a.manual_shipping_quote_offer_id = NEW.id) THEN
    RAISE EXCEPTION 'M1C1EE: an accepted offer requires a recorded acceptance snapshot';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER m1c1ee_offer_acceptance_backing_trg
AFTER INSERT OR UPDATE ON public.manual_shipping_quote_offers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.m1c1ee_guard_offer_acceptance_backing();

-- ---------------------------------------------------------------------
-- 8. REQUEST LIFECYCLE EXTENSION (supersession, expiry, invalidation)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ec_guard_request_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  s public.manual_shipping_quote_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'M1C1EC: every manual quote request must be created in draft';
    END IF;
    IF NEW.requested_at IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'M1C1EC: draft requests carry no requested_at or expires_at';
    END IF;
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                WHERE a.request_family_id = NEW.request_family_id) THEN
      RAISE EXCEPTION 'M1C1EE: a request family with a recorded acceptance is closed to new versions';
    END IF;
  END IF;

  IF NEW.supersedes_request_id IS NOT NULL THEN
    SELECT * INTO s FROM public.manual_shipping_quote_requests WHERE id = NEW.supersedes_request_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'M1C1EC: superseded request does not exist';
    END IF;
    IF s.buyer_principal_id <> NEW.buyer_principal_id
       OR s.company_id <> NEW.company_id
       OR s.merchant_store_id <> NEW.merchant_store_id
       OR s.currency_code <> NEW.currency_code
       OR s.request_family_id <> NEW.request_family_id THEN
      RAISE EXCEPTION 'M1C1EC: supersession must stay within the same buyer, company, store, currency and request family';
    END IF;
    IF NEW.version_number <= s.version_number THEN
      RAISE EXCEPTION 'M1C1EC: a superseding request must carry a strictly higher version number';
    END IF;
    IF s.status = 'accepted' THEN
      RAISE EXCEPTION 'M1C1EE: an accepted request can never be superseded';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'draft' THEN
      IF NEW.company_id <> OLD.company_id
         OR NEW.merchant_store_id <> OLD.merchant_store_id
         OR NEW.buyer_principal_id <> OLD.buyer_principal_id
         OR NEW.delivery_destination_version_id <> OLD.delivery_destination_version_id
         OR NEW.fulfillment_origin_id IS DISTINCT FROM OLD.fulfillment_origin_id
         OR NEW.shipment_form <> OLD.shipment_form
         OR NEW.currency_code <> OLD.currency_code
         OR NEW.version_number <> OLD.version_number
         OR NEW.request_family_id <> OLD.request_family_id
         OR NEW.supersedes_request_id IS DISTINCT FROM OLD.supersedes_request_id
         OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
        RAISE EXCEPTION 'M1C1EC: submitted request business fields are immutable; issue a new request version';
      END IF;
    END IF;

    IF OLD.status IN ('accepted','declined','expired','cancelled','superseded')
       AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'M1C1EC: terminal manual quote requests are historical and immutable';
    END IF;

    IF NEW.status <> OLD.status THEN
      IF NOT (
        (OLD.status = 'draft'        AND NEW.status IN ('requested','cancelled'))
     OR (OLD.status = 'requested'    AND NEW.status IN ('under_review','cancelled','expired','superseded'))
     OR (OLD.status = 'under_review' AND NEW.status IN ('quoted','cancelled','expired','superseded'))
     OR (OLD.status = 'quoted'       AND NEW.status IN ('accepted','declined','cancelled','expired','superseded'))
      ) THEN
        RAISE EXCEPTION 'M1C1EC: illegal manual quote request status transition % -> %', OLD.status, NEW.status;
      END IF;

      IF NEW.status = 'expired' AND (OLD.expires_at IS NULL OR OLD.expires_at > now()) THEN
        RAISE EXCEPTION 'M1C1EE: a request may only be marked expired at or after its expiry instant';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- invalidation: a closed request may not leave live offers behind;
-- an accepted request must have exactly one acceptance snapshot.
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_request_closure()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.status IN ('declined','expired','cancelled','superseded') THEN
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_offers o
                WHERE o.manual_shipping_quote_request_id = NEW.id
                  AND o.status IN ('draft','offered')) THEN
      RAISE EXCEPTION 'M1C1EE: closing a manual quote request requires every outstanding offer to be withdrawn, expired or invalidated first';
    END IF;
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                WHERE a.manual_shipping_quote_request_id = NEW.id) THEN
      RAISE EXCEPTION 'M1C1EE: an accepted request can never be closed as %', NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'accepted' THEN
    IF NOT EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                    WHERE a.manual_shipping_quote_request_id = NEW.id) THEN
      RAISE EXCEPTION 'M1C1EE: an accepted request requires a recorded acceptance snapshot';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER m1c1ee_request_closure_trg
AFTER UPDATE ON public.manual_shipping_quote_requests
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.m1c1ee_guard_request_closure();

-- ---------------------------------------------------------------------
-- 9. OWNER-ONLY SECURITY POSTURE
-- ---------------------------------------------------------------------
ALTER TABLE public.manual_shipping_quote_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_acceptance_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_acceptance_conditions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipping_quote_state_events FORCE ROW LEVEL SECURITY;

DO $$
DECLARE rl text; roles text[] := ARRAY['PUBLIC','anon','authenticated','service_role','sandbox_exec'];
        t text; tabs text[] := ARRAY[
          'public.manual_shipping_quote_acceptances',
          'public.manual_shipping_quote_acceptance_conditions',
          'public.manual_shipping_quote_state_events'];
        f text; fns text[] := ARRAY[
          'public.m1c1ee_offer_effective_status(uuid, timestamptz)',
          'public.m1c1ee_offer_acceptability(uuid, timestamptz)',
          'public.m1c1ee_guard_acceptance_write()',
          'public.m1c1ee_guard_acceptance_settlement()',
          'public.m1c1ee_guard_acceptance_condition_write()',
          'public.m1c1ee_guard_state_event_write()',
          'public.m1c1ee_guard_offer_acceptance_backing()',
          'public.m1c1ee_guard_request_closure()',
          'public.m1c1ed_guard_offer_write()',
          'public.m1c1ec_guard_request_write()'];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON TABLE %s FROM %s', t, rl);
    END LOOP;
  END LOOP;
  FOREACH f IN ARRAY fns LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', f);
    FOREACH rl IN ARRAY roles LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', f, rl);
    END LOOP;
  END LOOP;
END $$;