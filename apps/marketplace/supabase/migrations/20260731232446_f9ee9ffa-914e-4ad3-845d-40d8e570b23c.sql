-- P0-1 — GRANT HARDENING (REVOKE-only + policy-derived allowlist re-grant)
-- Authority: Owner-approved Decision Packet V1 (BOR-DEC-100..112). Phase 0.
-- Rows changed: 0. Schema changed: none. Reversible: yes.
-- Allowlist derived mechanically from pg_policies (roles anon/authenticated/public).
-- service_role and sandbox_exec grants are intentionally UNTOUCHED (R-T21 is out of scope).

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- Re-grant: anon — SELECT only, policy-derived (6 tables reachable via USING=true or anon-targeted policies)
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.inventory_dispositions TO anon;
GRANT SELECT ON public.permissions TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.role_permissions TO anon;
GRANT SELECT ON public.system_company_roles TO anon;

-- Re-grant: authenticated — policy-derived commands only
GRANT DELETE ON public.agent_memory TO authenticated;
GRANT DELETE ON public.cart_items TO authenticated;
GRANT DELETE ON public.catalog_offer_components TO authenticated;
GRANT DELETE ON public.catalog_offers TO authenticated;
GRANT DELETE ON public.catalog_products TO authenticated;
GRANT DELETE ON public.catalog_skus TO authenticated;
GRANT DELETE ON public.company_member_roles TO authenticated;
GRANT DELETE ON public.company_members TO authenticated;
GRANT DELETE ON public.order_items TO authenticated;
GRANT DELETE ON public.products TO authenticated;
GRANT DELETE ON public.seller_bol_credentials TO authenticated;
GRANT DELETE ON public.warehouse_locations TO authenticated;
GRANT DELETE ON public.warehouses TO authenticated;
GRANT DELETE ON public.wishlist_items TO authenticated;
GRANT INSERT ON public.agent_memory TO authenticated;
GRANT INSERT ON public.cart_items TO authenticated;
GRANT INSERT ON public.catalog_offer_components TO authenticated;
GRANT INSERT ON public.catalog_offers TO authenticated;
GRANT INSERT ON public.catalog_products TO authenticated;
GRANT INSERT ON public.catalog_skus TO authenticated;
GRANT INSERT ON public.channel_accounts TO authenticated;
GRANT INSERT ON public.channel_listings TO authenticated;
GRANT INSERT ON public.companies TO authenticated;
GRANT INSERT ON public.company_member_roles TO authenticated;
GRANT INSERT ON public.company_members TO authenticated;
GRANT INSERT ON public.inventory_lots TO authenticated;
GRANT INSERT ON public.inventory_serials TO authenticated;
GRANT INSERT ON public.order_items TO authenticated;
GRANT INSERT ON public.orders TO authenticated;
GRANT INSERT ON public.products TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT INSERT ON public.seller_bol_credentials TO authenticated;
GRANT INSERT ON public.user_roles TO authenticated;
GRANT INSERT ON public.warehouse_locations TO authenticated;
GRANT INSERT ON public.warehouses TO authenticated;
GRANT INSERT ON public.wishlist_items TO authenticated;
GRANT SELECT ON public.agent_audit_log TO authenticated;
GRANT SELECT ON public.agent_memory TO authenticated;
GRANT SELECT ON public.borvat_direct_listing_publications TO authenticated;
GRANT SELECT ON public.cart_items TO authenticated;
GRANT SELECT ON public.catalog_offer_components TO authenticated;
GRANT SELECT ON public.catalog_offers TO authenticated;
GRANT SELECT ON public.catalog_product_tax_classifications TO authenticated;
GRANT SELECT ON public.catalog_products TO authenticated;
GRANT SELECT ON public.catalog_skus TO authenticated;
GRANT SELECT ON public.categories TO authenticated;
GRANT SELECT ON public.channel_accounts TO authenticated;
GRANT SELECT ON public.channel_api_audit TO authenticated;
GRANT SELECT ON public.channel_connections TO authenticated;
GRANT SELECT ON public.channel_ean_map TO authenticated;
GRANT SELECT ON public.channel_import_batches TO authenticated;
GRANT SELECT ON public.channel_imported_offers TO authenticated;
GRANT SELECT ON public.channel_kill_switches TO authenticated;
GRANT SELECT ON public.channel_listing_audit TO authenticated;
GRANT SELECT ON public.channel_listings TO authenticated;
GRANT SELECT ON public.channel_live_dispatches TO authenticated;
GRANT SELECT ON public.channel_order_events TO authenticated;
GRANT SELECT ON public.channel_order_inbox TO authenticated;
GRANT SELECT ON public.channel_order_lines TO authenticated;
GRANT SELECT ON public.channel_orders TO authenticated;
GRANT SELECT ON public.channel_reconciliation_findings TO authenticated;
GRANT SELECT ON public.channel_reconciliation_reports TO authenticated;
GRANT SELECT ON public.channel_shadow_dispatches TO authenticated;
GRANT SELECT ON public.channel_shipment_events TO authenticated;
GRANT SELECT ON public.channel_shipments TO authenticated;
GRANT SELECT ON public.channel_snapshot_batches TO authenticated;
GRANT SELECT ON public.channel_snapshots TO authenticated;
GRANT SELECT ON public.channel_sync_cursors TO authenticated;
GRANT SELECT ON public.channel_sync_runs TO authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT ON public.company_member_roles TO authenticated;
GRANT SELECT ON public.company_members TO authenticated;
GRANT SELECT ON public.company_tax_profiles TO authenticated;
GRANT SELECT ON public.inventory_balances TO authenticated;
GRANT SELECT ON public.inventory_dispositions TO authenticated;
GRANT SELECT ON public.inventory_lots TO authenticated;
GRANT SELECT ON public.inventory_reservation_allocations TO authenticated;
GRANT SELECT ON public.inventory_reservation_headers TO authenticated;
GRANT SELECT ON public.inventory_reservation_lines TO authenticated;
GRANT SELECT ON public.inventory_serials TO authenticated;
GRANT SELECT ON public.inventory_transaction_entries TO authenticated;
GRANT SELECT ON public.inventory_transactions TO authenticated;
GRANT SELECT ON public.merchant_stores TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.outbox_dead_letters TO authenticated;
GRANT SELECT ON public.outbox_events TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.product_suggestions TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.seller_bol_credentials TO authenticated;
GRANT SELECT ON public.shipment_outbox_dead_letters TO authenticated;
GRANT SELECT ON public.shipment_outbox_events TO authenticated;
GRANT SELECT ON public.system_company_roles TO authenticated;
GRANT SELECT ON public.tax_categories TO authenticated;
GRANT SELECT ON public.tax_rate_versions TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.warehouse_locations TO authenticated;
GRANT SELECT ON public.warehouses TO authenticated;
GRANT SELECT ON public.wishlist_items TO authenticated;
GRANT UPDATE ON public.agent_memory TO authenticated;
GRANT UPDATE ON public.cart_items TO authenticated;
GRANT UPDATE ON public.catalog_offer_components TO authenticated;
GRANT UPDATE ON public.catalog_offers TO authenticated;
GRANT UPDATE ON public.catalog_products TO authenticated;
GRANT UPDATE ON public.catalog_skus TO authenticated;
GRANT UPDATE ON public.channel_accounts TO authenticated;
GRANT UPDATE ON public.channel_listings TO authenticated;
GRANT UPDATE ON public.companies TO authenticated;
GRANT UPDATE ON public.company_members TO authenticated;
GRANT UPDATE ON public.inventory_lots TO authenticated;
GRANT UPDATE ON public.inventory_serials TO authenticated;
GRANT UPDATE ON public.order_items TO authenticated;
GRANT UPDATE ON public.products TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT UPDATE ON public.seller_bol_credentials TO authenticated;
GRANT UPDATE ON public.warehouse_locations TO authenticated;
GRANT UPDATE ON public.warehouses TO authenticated;
GRANT UPDATE ON public.wishlist_items TO authenticated;

-- ============ ASSERTIONS (fail => full rollback) ============
DO $$
DECLARE
  bad_writes int;
  anon_tables int;
  auth_meta int;
BEGIN
  SELECT count(*) INTO bad_writes FROM (
    SELECT c.relname, a.privilege_type FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace, aclexplode(c.relacl) a
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND pg_get_userbyid(a.grantee)='anon'
      AND a.privilege_type <> 'SELECT'
  ) s;
  IF bad_writes <> 0 THEN
    RAISE EXCEPTION 'A1 FAIL: anon still holds % non-SELECT table privileges', bad_writes;
  END IF;
  RAISE NOTICE 'A1 PASS: anon holds zero INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN';

  SELECT count(DISTINCT c.relname) INTO anon_tables FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace, aclexplode(c.relacl) a
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_get_userbyid(a.grantee)='anon';
  IF anon_tables > 6 THEN
    RAISE EXCEPTION 'A2 FAIL: anon reaches % tables (max 6)', anon_tables;
  END IF;
  RAISE NOTICE 'A2 PASS: anon reaches % tables, SELECT only', anon_tables;

  SELECT count(*) INTO auth_meta FROM (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, aclexplode(c.relacl) a
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND pg_get_userbyid(a.grantee)='authenticated'
      AND a.privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN')
  ) s;
  IF auth_meta <> 0 THEN
    RAISE EXCEPTION 'A3 FAIL: authenticated still holds % TRUNCATE/TRIGGER/REFERENCES/MAINTAIN privileges', auth_meta;
  END IF;
  RAISE NOTICE 'A3 PASS: authenticated holds no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN';
END $$;