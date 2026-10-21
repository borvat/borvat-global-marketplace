-- =====================================================================
-- M1C-1E-E-R3 — ACCEPTANCE SETTLEMENT REPAIR AND FAMILY SERIALIZATION
-- HARDENING ONLY.
--
-- Scope: zero new tables, zero new columns, zero new statuses, zero grants,
-- zero RPC, zero UI. Function bodies of existing guards are replaced, plus one
-- owner-only helper guard (m1c1ee_guard_family_lock) which is required because
-- a transaction-level family lock cannot be expressed inside the existing
-- guards without duplicating the same advisory-key derivation in five places.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Owner-only family serialization helper (documented exception).
--    Derives a stable transaction-scoped advisory key from the logical
--    request family UUID. Every state-changing path takes this lock FIRST,
--    before any row lock, which also fixes the lock ordering and prevents
--    deadlocks between the acceptance and revision paths.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_family_lock(p_request_family_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF p_request_family_id IS NULL THEN
    RAISE EXCEPTION 'M1C1EE: a request family id is required for family serialization';
  END IF;
  -- 4919 is a fixed namespace seed for the manual-quote family lock domain.
  PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(p_request_family_id::text, 4919));
END;
$function$;

REVOKE ALL ON FUNCTION public.m1c1ee_guard_family_lock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m1c1ee_guard_family_lock(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.m1c1ee_guard_family_lock(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.m1c1ee_guard_family_lock(uuid) FROM service_role;

-- ---------------------------------------------------------------------
-- 2. P0 REPAIR — acceptance settlement guard.
--    The dropped table manual_shipping_quote_acceptance_conditions is no
--    longer referenced. Accepted conditions are pinned through the exact
--    immutable manual_shipping_quote_offer_id and are NOT duplicated.
--    Settlement now also requires the lifecycle event in the same transaction.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_acceptance_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_offer   text;
  v_request text;
  v_events  integer;
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

  SELECT count(*) INTO v_events
    FROM public.manual_shipping_quote_state_events e
   WHERE e.subject = 'acceptance'
     AND e.event_type = 'acceptance_recorded'
     AND e.manual_shipping_quote_request_id = NEW.manual_shipping_quote_request_id
     AND e.manual_shipping_quote_offer_id = NEW.manual_shipping_quote_offer_id;
  IF v_events <> 1 THEN
    RAISE EXCEPTION 'M1C1EE: exactly one acceptance_recorded lifecycle event must be written in the same transaction (found %)', v_events;
  END IF;

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. W1 REPAIR (acceptance path) — family lock first, then re-validate
--    under the lock: no prior acceptance, no newer revision, this request
--    is the acceptable version, the offer is still acceptable.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_acceptance_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  o public.manual_shipping_quote_offers%ROWTYPE;
  r public.manual_shipping_quote_requests%ROWTYPE;
  v_reason text;
  v_max_version integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'M1C1EE: manual quote acceptances are terminal and immutable (% rejected)', TG_OP;
  END IF;

  -- Family-level serialization BEFORE any eligibility or settlement check.
  PERFORM public.m1c1ee_guard_family_lock(NEW.request_family_id);

  -- Re-validate under the lock: no earlier acceptance in this family.
  IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
              WHERE a.request_family_id = NEW.request_family_id
                AND a.id <> NEW.id) THEN
    RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
      USING ERRCODE = 'BVQ01';
  END IF;

  -- Keep the row lock as the second line of defence.
  PERFORM 1 FROM public.manual_shipping_quote_requests
   WHERE request_family_id = NEW.request_family_id FOR UPDATE;

  SELECT * INTO r FROM public.manual_shipping_quote_requests
   WHERE id = NEW.manual_shipping_quote_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1EE: quote request not found'; END IF;
  IF r.request_family_id <> NEW.request_family_id THEN
    RAISE EXCEPTION 'M1C1EE: request family mismatch';
  END IF;

  -- Re-validate under the lock: this request must be the newest revision.
  SELECT max(version_number) INTO v_max_version
    FROM public.manual_shipping_quote_requests
   WHERE request_family_id = NEW.request_family_id;
  IF v_max_version IS DISTINCT FROM r.version_number THEN
    RAISE EXCEPTION 'M1C1EE: offer is not acceptable (superseded_by_newer_request_revision)';
  END IF;

  SELECT * INTO o FROM public.manual_shipping_quote_offers
   WHERE id = NEW.manual_shipping_quote_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'M1C1EE: accepted offer not found'; END IF;

  IF o.manual_shipping_quote_request_id <> NEW.manual_shipping_quote_request_id THEN
    RAISE EXCEPTION 'M1C1EE: the accepted offer does not belong to the accepted request';
  END IF;

  v_reason := public.m1c1ee_guard_offer_acceptability(o.id, NEW.accepted_at);
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
$function$;

-- ---------------------------------------------------------------------
-- 4. W1 REPAIR (request revision / supersession path) — the same family
--    lock, taken before the insert or the state change is validated, so a
--    concurrent revision can no longer slip past an in-flight acceptance.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ec_guard_request_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  s public.manual_shipping_quote_requests%ROWTYPE;
BEGIN
  -- Family-level serialization for every request insert and every state change.
  IF TG_OP = 'INSERT'
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.supersedes_request_id IS DISTINCT FROM OLD.supersedes_request_id THEN
    PERFORM public.m1c1ee_guard_family_lock(NEW.request_family_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'M1C1EC: every manual quote request must be created in draft';
    END IF;
    IF NEW.requested_at IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'M1C1EC: draft requests carry no requested_at or expires_at';
    END IF;
    -- Re-validated under the family lock.
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                WHERE a.request_family_id = NEW.request_family_id) THEN
      RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
        USING ERRCODE = 'BVQ01';
    END IF;
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_requests x
                WHERE x.request_family_id = NEW.request_family_id
                  AND x.status = 'accepted') THEN
      RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
        USING ERRCODE = 'BVQ01';
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
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                WHERE a.request_family_id = NEW.request_family_id) THEN
      RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
        USING ERRCODE = 'BVQ01';
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

      -- A family with a recorded acceptance admits no further transition other
      -- than the settling transition of the accepted request itself.
      IF NEW.status <> 'accepted'
         AND EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                      WHERE a.request_family_id = NEW.request_family_id) THEN
        RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
          USING ERRCODE = 'BVQ01';
      END IF;

      IF NEW.status = 'expired' AND (OLD.expires_at IS NULL OR OLD.expires_at > now()) THEN
        RAISE EXCEPTION 'M1C1EE: a request may only be marked expired at or after its expiry instant';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5. W1 REPAIR (offer path) — offer creation, revision, withdrawal,
--    supersession and expiry recording all serialize on the same family
--    lock, taken before any other work, in the same order as the
--    acceptance path.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.m1c1ed_guard_offer_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  r_status text;
  prev_version integer;
  v_family uuid;
BEGIN
  -- Family-level serialization first, for every offer write including DELETE.
  SELECT request_family_id INTO v_family
    FROM public.manual_shipping_quote_requests
   WHERE id = CASE WHEN TG_OP = 'DELETE'
                   THEN OLD.manual_shipping_quote_request_id
                   ELSE NEW.manual_shipping_quote_request_id END;
  IF v_family IS NOT NULL THEN
    PERFORM public.m1c1ee_guard_family_lock(v_family);
  END IF;

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
    IF v_family IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                    WHERE a.request_family_id = v_family) THEN
      RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
        USING ERRCODE = 'BVQ01';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('superseded','withdrawn','expired','accepted') THEN
    RAISE EXCEPTION 'M1C1ED: terminal offers are historically frozen';
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft','offered','withdrawn') THEN
      RAISE EXCEPTION 'M1C1ED: illegal offer transition from draft to %', NEW.status;
    END IF;
  ELSIF OLD.status = 'offered' THEN
    IF NEW.status NOT IN ('superseded','withdrawn','expired','accepted') THEN
      RAISE EXCEPTION 'M1C1ED: illegal offer transition from offered to %', NEW.status;
    END IF;
    IF NEW.status = 'expired' AND (OLD.expires_at IS NULL OR OLD.expires_at > now()) THEN
      RAISE EXCEPTION 'M1C1EE: an offer may only be marked expired at or after its expiry instant';
    END IF;
    IF NEW.status <> 'accepted'
       AND v_family IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.manual_shipping_quote_acceptances a
                    WHERE a.request_family_id = v_family) THEN
      RAISE EXCEPTION 'M1C1EE: request_family_already_accepted'
        USING ERRCODE = 'BVQ01';
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
$function$;
