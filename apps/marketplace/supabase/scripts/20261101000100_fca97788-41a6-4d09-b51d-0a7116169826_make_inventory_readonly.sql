-- ============================================================================
-- Phase 5 Migration 3 — Make inventory read-only (single-writer guard, Phase B)
--
-- SPEC: docs/engineering/inventory-single-writer/SPEC.md (card t_513cd88c)
--
-- CONDITION BEFORE APPLYING (SPEC 4.2):
--   WMS must be proven to cover the full sales cycle in staging with synthetic
--   test data only (no production data).  This migration is PREPARED but NOT
--   EXECUTED in this card until that coverage proof exists.
--
-- Phase B actions (SPEC 4.2):
--   1. REVOKE INSERT, UPDATE ON the nine inventory tables FROM authenticated.
--   2. Redefine remaining write policies to SELECT only (pending WMS proof).
--   3. approved-routines.json already reflects "no inventory write in any role".
--   4. The WMS-stopped sale-prevention test is activated after coverage proof.
-- ============================================================================

-- Phase B-1: read-only on all nine inventory tables
REVOKE INSERT, UPDATE ON public.inventory_dispositions FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_lots FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_serials FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_transactions FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_transaction_entries FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_balances FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_reservation_headers FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_reservation_lines FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_reservation_allocations FROM authenticated;

-- Phase B-2: read-only policies (to be applied once WMS coverage is proven;
-- the tables below already expose SELECT-only read policies, so this section
-- is guarded and ready for the coverage trigger).
--   inventory_lots      -> drop lots_write, lots_update (keep lots_read)
--   inventory_serials   -> drop serials_write, serials_update (keep serials_read)
