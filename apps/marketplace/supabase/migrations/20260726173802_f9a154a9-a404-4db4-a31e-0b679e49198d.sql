DROP TRIGGER m1c1ec_request_submission_trg ON public.manual_shipping_quote_requests;

CREATE CONSTRAINT TRIGGER m1c1ec_request_submission_trg
  AFTER UPDATE ON public.manual_shipping_quote_requests
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.m1c1ec_guard_request_submission();