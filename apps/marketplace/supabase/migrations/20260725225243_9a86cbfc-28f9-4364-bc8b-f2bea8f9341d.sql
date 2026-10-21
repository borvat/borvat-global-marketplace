REVOKE ALL ON public.borvat_direct_listing_publications FROM PUBLIC;
REVOKE ALL ON public.borvat_direct_listing_publications FROM anon;
REVOKE ALL ON public.borvat_direct_listing_publications FROM authenticated;
REVOKE ALL ON public.borvat_direct_listing_publications FROM sandbox_exec;
GRANT SELECT ON public.borvat_direct_listing_publications TO authenticated;