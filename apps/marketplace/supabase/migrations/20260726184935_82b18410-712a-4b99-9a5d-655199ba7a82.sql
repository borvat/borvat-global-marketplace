REVOKE ALL ON TABLE public.company_tax_profiles,
                   public.catalog_product_tax_classifications,
                   public.borvat_direct_listing_publications
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;