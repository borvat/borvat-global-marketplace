-- Strip platform default ACLs from merchant_stores + its 3 functions.
-- Additive-only corrective step within Migration #1 scope.

REVOKE ALL ON TABLE public.merchant_stores FROM anon, authenticated;
GRANT SELECT ON TABLE public.merchant_stores TO authenticated;
-- NO grants to anon whatsoever. Writes remain RPC-only.

REVOKE ALL ON FUNCTION public.create_merchant_store(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_merchant_store_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._merchant_store_can_manage(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_merchant_store(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_merchant_store_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._merchant_store_can_manage(UUID, UUID) TO authenticated, service_role;