-- ============================================================================
-- rollback_inventory_single_writer.sql
--   Single, consistent command that restores the FULL previous inventory
--   authority for the single-writer guard (SPEC §5.1).
--
-- Executes as ONE space/backtick-delimited batch: begin + GRANT block + commit.
-- It restores privileges ONLY;  no table, row or data is touched.
-- Run only in a disaster-recovery scenario, after a staged test in a sandbox.
-- ============================================================================
-- BEGIN BATCH
BEGIN;

-- Restore inventory write RPC EXECUTE on `authenticated`
GRANT EXECUTE ON FUNCTION public.post_inventory_transaction(
  uuid, text, jsonb, text, uuid, text, jsonb, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation(uuid, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_reservation_allocation(
  uuid, integer, uuid, uuid, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;

-- Restore BOL reservation write EXECUTE on `service_role`
GRANT EXECUTE ON FUNCTION public.reserve_bol_order_line(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_bol_order_line(uuid, text) TO service_role;

-- Restore local INSERT/UPDATE on the two writeable inventory tables
GRANT INSERT, UPDATE ON public.inventory_lots TO authenticated;
GRANT INSERT, UPDATE ON public.inventory_serials TO authenticated;

-- Restore p4_writes_allowed on service_role (per separate review gate)
GRANT EXECUTE ON FUNCTION public.p4_writes_allowed(uuid) TO service_role;

-- COMMIT BATCH
COMMIT;
