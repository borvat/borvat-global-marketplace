-- M1B-3C-5 — TAX / PRICING / PUBLICATION ACL HARDENING (privileges only)
DO $$
DECLARE
  t text;
  r text;
  f text;
  cnt bigint;
BEGIN
  -- fail-closed guard: this stage must not run against populated tax/pricing/publication data
  SELECT (SELECT count(*) FROM public.tax_rate_versions)
       + (SELECT count(*) FROM public.catalog_product_tax_classifications)
       + (SELECT count(*) FROM public.company_tax_profiles)
       + (SELECT count(*) FROM public.merchant_store_offer_prices)
       + (SELECT count(*) FROM public.borvat_direct_listing_publications)
    INTO cnt;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'M1B-3C-5 aborted: expected 0 rows in tax/pricing/publication tables, found %', cnt;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'public.tax_categories',
    'public.tax_rate_bands',
    'public.tax_rate_versions',
    'public.catalog_product_tax_classifications',
    'public.company_tax_profiles',
    'public.merchant_store_offer_prices',
    'public.borvat_direct_listing_publications'
  ] LOOP
    FOREACH r IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role','sandbox_exec'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %s', t, r);
    END LOOP;
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.msop_guard_tax_integrity()',
    'public.msop_guard_active_immutable()',
    'public.msop_guard_store_sku_ownership()',
    'public.trg_tax_rate_versions_band_country()',
    'public._borvat_direct_publication_provider_guard()',
    'public._borvat_direct_publication_touch_updated_at()'
  ] LOOP
    FOREACH r IN ARRAY ARRAY['PUBLIC','anon','authenticated','service_role','sandbox_exec'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s', f, r);
    END LOOP;
  END LOOP;
END
$$;

COMMENT ON TABLE public.tax_rate_versions IS
  'Borvat operational tax rate versions. platform_valid_from/platform_valid_to are Borvat operational approval windows, NOT legal commencement claims; legal_effective_* are optional historical metadata (NULL = not yet proven inside Borvat). Deny-by-default ACL (BOR-DEC-055): no direct DML/SELECT for PUBLIC/anon/authenticated/service_role/sandbox_exec; writes only via approved migration or trusted RPC.';