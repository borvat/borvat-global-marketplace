-- ============================================================================
-- Phase 5 forward-fix — restore EXECUTE on the three RLS helper functions
--
-- SPEC:     docs/engineering/inventory-single-writer/SPEC.md (acceptance A5)
-- Evidence: docs/engineering/inventory-single-writer/CHAIN-REBUILD-EVIDENCE.md
-- Mandate:  2026-11-02 A5 follow-up — REVOKE/GRANT only. No DDL on tables,
--           no data change, no change to any already-applied migration.
--
-- THE DEFECT
--   20260726222737 (M1B-0R) revokes EXECUTE on EVERY public routine from
--   PUBLIC, anon, authenticated, service_role, sandbox_exec, then re-grants an
--   explicit list of application RPCs. Three row-level helper functions were
--   not on that list, so every policy that calls them raises
--   42501 "permission denied for function ..." instead of filtering rows:
--     companies.companies_select_members_or_owner
--     company_members.company_members_select_same_company / _update_manager / _delete_manager
--     inventory_lots.lots_read, inventory_lots.lots_update
--     inventory_serials.serials_read, inventory_serials.serials_update
--     inventory_balances.inv_balances_read
--     inventory_transactions.inv_tx_read, inventory_transaction_entries.inv_entries_read
--     inventory_reservation_headers/lines/allocations read policies
--
-- WHY RE-GRANTING IS THE CORRECT FIX, NOT A LOOSENING
--   1. All three helpers are SECURITY DEFINER, STABLE, SET search_path = '' and
--      begin with:
--        IF auth.role() = 'authenticated' AND _user_id IS DISTINCT FROM auth.uid()
--          THEN RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
--      so an authenticated caller can only ask about itself; impersonation is
--      rejected inside the function body, not by the grant.
--   2. apps/marketplace/scripts/phase5-acl-gate/approved-routines.json
--      (BOR-DEC-142) already lists all three with roles
--      ["authenticated","service_role"]. Their absence is drift against the
--      approved surface, not a deliberate deny.
--   3. This restores EXECUTE on three helpers. The blast radius is wider than the
--      inventory surface and is stated here rather than understated: 75 policies on
--      44 tables call these helpers (44 SELECT, 12 INSERT, 11 UPDATE, 8 DELETE).
--      Before this migration those policies failed closed with 42501; after it they
--      evaluate. Phase A revoked write privileges only on inventory tables, so
--      authenticated still holds INSERT/UPDATE/DELETE on 19 tables (catalog_*,
--      channel_*, companies, company_members, warehouses, ...). Those write paths
--      are gated by their own policies (company_member_has_permission), and the
--      sample test scripts/chain-rebuild/verify-write-paths.cjs exercises the
--      catalog_products and warehouses shapes. It is a sample, not an exhaustive
--      proof of all 44 tables.
--
-- REVERSAL
--   apps/marketplace/supabase/scripts/rollback_rls_helper_execute.sql
-- ============================================================================

DO $fix$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT v.sig
    FROM (VALUES
      ('public.is_company_member(uuid,uuid)'),
      ('public.is_company_owner(uuid,uuid)'),
      ('public.company_member_has_permission(uuid,uuid,text)')
    ) AS v(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'helper function missing, refusing partial fix: %', r.sig;
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, sandbox_exec', r.sig);
  END LOOP;
END $fix$;

-- ACL normalization tail: re-affirm the permanent P5-HF-001 invariant so this
-- migration cannot be read as reopening any legacy surface.
REVOKE ALL ON FUNCTION public.place_order(uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;

COMMENT ON FUNCTION public.is_company_member(uuid, uuid) IS
  'RLS helper (row-level membership). SECURITY DEFINER with self-only guard; EXECUTE granted to authenticated, service_role per BOR-DEC-142. Do not revoke: policies depend on it.';
COMMENT ON FUNCTION public.is_company_owner(uuid, uuid) IS
  'RLS helper (row-level ownership). SECURITY DEFINER with self-only guard; EXECUTE granted to authenticated, service_role per BOR-DEC-142. Do not revoke: policies depend on it.';
COMMENT ON FUNCTION public.company_member_has_permission(uuid, uuid, text) IS
  'RLS helper (permission check). SECURITY DEFINER with self-only guard; EXECUTE granted to authenticated, service_role per BOR-DEC-142. Do not revoke: policies depend on it.';
