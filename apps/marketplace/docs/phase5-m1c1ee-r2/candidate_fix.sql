-- DISPOSABLE CLONE ONLY — NOT APPLIED TO PRODUCTION.
-- Candidate repair for the P0 defect found by the R2 harness:
-- public.m1c1ee_guard_acceptance_settlement() still references
-- public.manual_shipping_quote_acceptance_conditions, which the M1C-1E-E-R1
-- cleanup migration dropped. Every acceptance therefore aborts at COMMIT with
-- SQLSTATE 42P01. The dangling block is removed; nothing else changes.
CREATE OR REPLACE FUNCTION public.m1c1ee_guard_acceptance_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_offer text; v_request text;
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

  RETURN NULL;
END;
$function$;
