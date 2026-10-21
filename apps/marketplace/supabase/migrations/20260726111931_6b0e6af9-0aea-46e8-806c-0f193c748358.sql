-- M1B-3C-1 remediation: remove test row and revoke sandbox_exec write privilege
DELETE FROM public.tax_rate_bands WHERE country_code = 'FR';

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.tax_rate_bands FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.tax_rate_versions FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.catalog_product_tax_classifications FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.company_tax_profiles FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.tax_categories FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.merchant_store_offer_prices FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.borvat_direct_listing_publications FROM sandbox_exec;

DO $$
DECLARE v_bands int;
BEGIN
  SELECT count(*) INTO v_bands FROM public.tax_rate_bands;
  IF v_bands <> 9 THEN RAISE EXCEPTION 'M1B3C1R: expected 9 bands, got %', v_bands; END IF;
  IF (SELECT count(*) FROM public.tax_rate_versions) <> 0 THEN RAISE EXCEPTION 'M1B3C1R: rate versions must be empty'; END IF;
END $$;