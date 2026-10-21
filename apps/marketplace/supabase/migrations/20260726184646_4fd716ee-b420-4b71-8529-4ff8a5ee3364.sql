-- M1C-1E-E-R1 SCOPE RECONCILIATION AND CLOSEOUT ONLY (forward-only)

-- 1. remove duplicated acceptance conditions snapshot (offer id is the pin)
DROP TABLE IF EXISTS public.manual_shipping_quote_acceptance_conditions;
DROP FUNCTION IF EXISTS public.m1c1ee_guard_acceptance_condition_write();

-- 2. status resolver removal / guard reclassification
DROP FUNCTION IF EXISTS public.m1c1ee_offer_effective_status(uuid, timestamptz);

ALTER FUNCTION public.m1c1ee_offer_acceptability(uuid, timestamptz)
  RENAME TO m1c1ee_guard_offer_acceptability;

DO $rec$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.m1c1ee_guard_acceptance_write()'::regprocedure);
  d := replace(d, 'public.m1c1ee_offer_acceptability(',
                  'public.m1c1ee_guard_offer_acceptability(');
  EXECUTE d;
END
$rec$;

REVOKE ALL ON FUNCTION public.m1c1ee_guard_offer_acceptability(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1c1ee_guard_acceptance_write()
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

-- 3. remove unauthorised 'invalidated' offer state
ALTER TABLE public.manual_shipping_quote_offers DROP CONSTRAINT msqo_status_ck;
ALTER TABLE public.manual_shipping_quote_offers ADD CONSTRAINT msqo_status_ck
  CHECK (status = ANY (ARRAY['draft','offered','superseded','withdrawn','expired','accepted']));

ALTER TABLE public.manual_shipping_quote_offers DROP CONSTRAINT msqo_publication_completeness_ck;
ALTER TABLE public.manual_shipping_quote_offers ADD CONSTRAINT msqo_publication_completeness_ck
  CHECK (
    status = ANY (ARRAY['draft','withdrawn'])
    OR (customer_shipping_charge_minor IS NOT NULL
        AND delivery_min_calendar_days_after_acceptance IS NOT NULL
        AND delivery_max_calendar_days_after_acceptance IS NOT NULL
        AND offered_at IS NOT NULL
        AND expires_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.m1c1ed_guard_offer_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.m1c1ee_guard_request_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('declined','expired','cancelled','superseded') THEN
    IF EXISTS (SELECT 1 FROM public.manual_shipping_quote_offers o
                WHERE o.manual_shipping_quote_request_id = NEW.id
                  AND o.status IN ('draft','offered')) THEN
      RAISE EXCEPTION 'M1C1EE: closing a manual quote request requires every outstanding offer to be superseded, withdrawn or expired first';
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
$function$;

REVOKE ALL ON FUNCTION public.m1c1ed_guard_offer_write() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;
REVOKE ALL ON FUNCTION public.m1c1ee_guard_request_closure() FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;