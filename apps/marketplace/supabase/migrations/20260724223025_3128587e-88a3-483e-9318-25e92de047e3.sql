-- Test-harness parity: sandbox_exec is Lovable's tooling role and is not
-- reachable from any JWT-facing role. Restoring EXECUTE mirrors the posture
-- kept for create_merchant_store / update_merchant_store_profile.
GRANT EXECUTE ON FUNCTION public.create_borvat_direct_account(uuid, text)
  TO sandbox_exec;
