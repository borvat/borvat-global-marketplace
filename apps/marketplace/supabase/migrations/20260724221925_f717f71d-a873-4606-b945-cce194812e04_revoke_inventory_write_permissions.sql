-- ============================================================================
-- Phase 5 Migration 2 — Revoke inventory write permissions
-- (single-writer guard, Phase A)
--
-- SPEC: docs/engineering/inventory-single-writer/SPEC.md (card t_513cd88c)
-- Owner mandate: immutable recovery manifest — NO DATA DELETION, NO PRODUCTION
-- DATA MODIFICATION.  This migration only REVOKEs privileges.
--
-- THIS FILE IS IMMEDIATELY REVERSIBLE.  Every statement below is a REVOKE.
-- Re-apply the matching GRANT statements from rollback_inventory_single_writer.sql
-- (one consistent command) to restore the previous authority.  No row, table or
-- file is touched by these statements.
--
-- Phase A actions (SPEC 2.1, 4.1):
--   1. REVOKE EXECUTE on inventory write RPCs from `authenticated`:
--        post_inventory_transaction, reverse_inventory_transaction,
--        rebuild_inventory_balances, create_reservation,
--        pick_reservation_allocation, release_reservation, cancel_reservation
--   2. REVOKE EXECUTE on BOL reservation write routines from `service_role`:
--        reserve_bol_order_line, cancel_bol_order_line
--   3. REVOKE INSERT, UPDATE on the two locally-writable inventory tables:
--        inventory_lots, inventory_serials
--   4. Each REVOKE is logged in docs/engineering/inventory-single-writer/
--      EXECUTION-STATE.md (this migration); no code or data is modified.
-- ============================================================================

-- Phase A-1: authenticated write RPCs
REVOKE EXECUTE ON FUNCTION public.post_inventory_transaction(
  uuid, text, jsonb, text, uuid, text, jsonb, uuid
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.create_reservation(uuid, text, uuid, jsonb) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.pick_reservation_allocation(
  uuid, integer, uuid, uuid, uuid
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.release_reservation(uuid, jsonb, boolean) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation(uuid) FROM authenticated;

-- Phase A-2: service_role write routines (BOL reservation)
REVOKE EXECUTE ON FUNCTION public.reserve_bol_order_line(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_bol_order_line(uuid, text) FROM service_role;

-- Phase A-3: local write paths on inventory_lots / inventory_serials
REVOKE INSERT, UPDATE ON public.inventory_lots FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_serials FROM authenticated;

-- Verification hook (runs only against a live database; idempotent):
--  - authenticated must no longer hold EXECUTE on any inventory write RPC;
--  - service_role must no longer hold EXECUTE on reserve_bol_order_line /
--    cancel_bol_order_line;
--  - authenticated must be denied INSERT/UPDATE on inventory_lots,
--    inventory_serials.
