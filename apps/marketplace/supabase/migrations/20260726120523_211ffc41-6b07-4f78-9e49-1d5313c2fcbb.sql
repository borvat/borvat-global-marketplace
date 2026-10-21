DROP FUNCTION IF EXISTS public._m1b3c4_verify();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tax_rate_versions FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tax_rate_bands FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tax_categories FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.catalog_product_tax_classifications FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.company_tax_profiles FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.merchant_store_offer_prices FROM sandbox_exec;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.borvat_direct_listing_publications FROM sandbox_exec;