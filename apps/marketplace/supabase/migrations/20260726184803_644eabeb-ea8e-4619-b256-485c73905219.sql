-- M1B-0K — ACL DRIFT CYCLE 13 NORMALIZATION ONLY (REVOKE-only)
DO $acl$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'public'
           AND (p.proname = 'place_order'
                OR p.proname ~ '^(m1c1|m1b|p4_)'))
       OR n.nspname = 'internal_shipping'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec',
      r.sig);
  END LOOP;

  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND (c.relname LIKE 'manual_shipping_quote%'
        OR c.relname LIKE 'customer_delivery_destination%'
        OR c.relname LIKE 'shipping_%'
        OR c.relname LIKE 'delivery_promise%'
        OR c.relname LIKE 'merchant_store_sku_%'
        OR c.relname LIKE 'merchant_fulfillment_origins'
        OR c.relname LIKE 'merchant_store_offer_prices'
        OR c.relname LIKE 'tax_%')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated, service_role, sandbox_exec',
      r.rel);
  END LOOP;
END
$acl$;

REVOKE ALL ON SCHEMA internal_shipping FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;