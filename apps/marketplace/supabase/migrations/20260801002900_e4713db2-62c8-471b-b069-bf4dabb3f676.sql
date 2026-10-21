-- ============================================================================
-- BORVAT PHASE 0 — MIGRATION P0-3 : PURGE TEST FIXTURES
-- BOR-DEC-109 / closes F-9. DESTRUCTIVE. Rollback = restore from backup.
-- Append-only guards are disabled for the duration of this transaction only.
-- ============================================================================

CREATE TEMP TABLE _p0_3_keep ON COMMIT DROP AS
  SELECT id FROM public.companies WHERE name = 'Qnan B.V.';

CREATE TEMP TABLE _p0_3_purge ON COMMIT DROP AS
  SELECT id FROM public.companies WHERE id NOT IN (SELECT id FROM _p0_3_keep);

DO $$
DECLARE v_keep int; v_purge int; v_live_before int;
BEGIN
  SELECT count(*) INTO v_keep  FROM _p0_3_keep;
  SELECT count(*) INTO v_purge FROM _p0_3_purge;
  SELECT count(*) INTO v_live_before FROM public.channel_connections WHERE mode='live';
  IF v_keep <> 1 THEN
    RAISE EXCEPTION 'P0-3 ABORT: keep-set is % companies, expected exactly 1 (Qnan B.V.).', v_keep;
  END IF;
  IF v_purge <> 162 THEN
    RAISE EXCEPTION 'P0-3 ABORT: purge-set is % companies, expected exactly 162.', v_purge;
  END IF;
  RAISE NOTICE 'P0-3 preflight OK. keep=% purge=% live_before=%', v_keep, v_purge, v_live_before;
END $$;

-- --- disable append-only / immutability guards (transaction-scoped) --------
ALTER TABLE public.channel_api_audit                    DISABLE TRIGGER trg_channel_api_audit_no_delete;
ALTER TABLE public.channel_listing_audit                DISABLE TRIGGER channel_listing_audit_no_update;
ALTER TABLE public.channel_order_events                 DISABLE TRIGGER p4_events_no_update;
ALTER TABLE public.channel_order_inbox                  DISABLE TRIGGER p4_inbox_no_update;
ALTER TABLE public.channel_shipment_events              DISABLE TRIGGER channel_shipment_events_no_delete;
ALTER TABLE public.company_member_roles                 DISABLE TRIGGER company_member_roles_guard_owner_role;
ALTER TABLE public.company_members                      DISABLE TRIGGER company_members_guard_owner_membership;
ALTER TABLE public.delivery_promise_weekly_schedules    DISABLE TRIGGER trg_dpws_mutable;
ALTER TABLE public.inventory_transaction_entries        DISABLE TRIGGER inv_entries_no_update;
ALTER TABLE public.inventory_transactions               DISABLE TRIGGER inv_tx_guard;
ALTER TABLE public.manual_shipping_quote_acceptances    DISABLE TRIGGER m1c1ee_acceptance_write_trg;
ALTER TABLE public.manual_shipping_quote_offer_conditions DISABLE TRIGGER m1c1ed_condition_write_trg;
ALTER TABLE public.manual_shipping_quote_offers         DISABLE TRIGGER m1c1ed_offer_write_trg;
ALTER TABLE public.manual_shipping_quote_request_items  DISABLE TRIGGER m1c1ec_item_write_trg;
ALTER TABLE public.manual_shipping_quote_request_packages DISABLE TRIGGER m1c1ec_package_write_trg;
ALTER TABLE public.manual_shipping_quote_state_events   DISABLE TRIGGER m1c1ee_state_event_write_trg;
ALTER TABLE public.outbox_dead_letters                  DISABLE TRIGGER outbox_dead_letters_no_delete;
ALTER TABLE public.outbox_events                        DISABLE TRIGGER outbox_events_no_delete;
ALTER TABLE public.seller_application_events            DISABLE TRIGGER m1v1d_application_event_immutable;
ALTER TABLE public.seller_verification_events           DISABLE TRIGGER m1v1c_verification_event_immutable;
ALTER TABLE public.shipping_calendar_blackout_dates     DISABLE TRIGGER scbd_parent_guard;
ALTER TABLE public.shipping_calendar_profiles           DISABLE TRIGGER scp_immutability;
ALTER TABLE public.shipping_rate_lanes                  DISABLE TRIGGER m1c1c_lane_immutability_trg;
ALTER TABLE public.shipping_rate_rules                  DISABLE TRIGGER m1c1c_rule_immutability_trg;
ALTER TABLE public.shipping_transit_delivery_weekdays   DISABLE TRIGGER stdw_parent_guard;
ALTER TABLE public.shipping_transit_time_profile_calendars DISABLE TRIGGER sttpc_parent_guard;
ALTER TABLE public.shipping_transit_time_profiles       DISABLE TRIGGER sttp_immutability;
ALTER TABLE public.shipping_transit_time_weekday_rules  DISABLE TRIGGER sttwr_parent_guard;

-- STEP 0b — OUTBOX FIRST (referenced by shipments/listings) ---------------
DELETE FROM public.channel_live_dispatches         WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_shadow_dispatches       WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_reconciliation_findings WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_reconciliation_reports  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipment_outbox_dead_letters    WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipment_outbox_events          WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.outbox_dead_letters             WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.outbox_events                   WHERE company_id IN (SELECT id FROM _p0_3_purge);

-- STEP 1 — CHANNEL SUBTREE -------------------------------------------------
DELETE FROM public.channel_listing_audit           WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_live_dispatches         WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_shadow_dispatches       WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_shipment_events         WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_shipments               WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_order_events            WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_order_lines             WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_orders                  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_order_inbox             WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_reconciliation_findings WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_reconciliation_reports  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_snapshots               WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_snapshot_batches        WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_imported_offers         WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_import_batches          WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.borvat_direct_listing_publications
  WHERE channel_listing_id IN (SELECT id FROM public.channel_listings
                               WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.channel_listings                WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_sync_runs               WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_api_audit               WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_ean_map                 WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_kill_switches
  WHERE connection_id IN (SELECT id FROM public.channel_connections
                          WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.channel_sync_cursors
  WHERE connection_id IN (SELECT id FROM public.channel_connections
                          WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.channel_accounts                WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.channel_connections             WHERE company_id IN (SELECT id FROM _p0_3_purge);

-- STEP 2 — INVENTORY SUBTREE ----------------------------------------------
DELETE FROM public.inventory_reservation_allocations
  WHERE line_id IN (
    SELECT l.id FROM public.inventory_reservation_lines l
    JOIN public.inventory_reservation_headers h ON h.id = l.reservation_id
    WHERE h.company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.inventory_reservation_lines
  WHERE reservation_id IN (SELECT id FROM public.inventory_reservation_headers
                           WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.inventory_reservation_headers   WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.inventory_transaction_entries   WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.inventory_transactions          WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.inventory_balances              WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.inventory_serials               WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.inventory_lots                  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.warehouse_locations
  WHERE warehouse_id IN (SELECT id FROM public.warehouses
                         WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.warehouses                      WHERE company_id IN (SELECT id FROM _p0_3_purge);

-- STEP 3 — OUTBOX ----------------------------------------------------------
DELETE FROM public.outbox_dead_letters             WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.outbox_events                   WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipment_outbox_dead_letters    WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipment_outbox_events          WHERE company_id IN (SELECT id FROM _p0_3_purge);

-- STEP 4 — CATALOG ---------------------------------------------------------
DELETE FROM public.catalog_offer_components
  WHERE offer_id IN (SELECT id FROM public.catalog_offers
                     WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.merchant_store_offer_prices
  WHERE catalog_sku_id IN (SELECT id FROM public.catalog_skus
                           WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.catalog_offers                  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.merchant_store_sku_delivery_promise_assignments WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.merchant_store_sku_shipping_packages           WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.merchant_store_sku_fulfillment_origins         WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.catalog_product_tax_classifications
  WHERE product_id IN (SELECT id FROM public.catalog_products
                       WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.catalog_skus                    WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.catalog_products                WHERE company_id IN (SELECT id FROM _p0_3_purge);

-- STEP 5 — SHIPPING / STORES / SELLER WORKFLOW -----------------------------
DELETE FROM public.merchant_store_sku_shipping_profiles WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.manual_shipping_quote_acceptances WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.manual_shipping_quote_state_events
  WHERE manual_shipping_quote_request_id IN (SELECT id FROM public.manual_shipping_quote_requests
                                             WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.manual_shipping_quote_offer_conditions
  WHERE manual_shipping_quote_offer_id IN (SELECT id FROM public.manual_shipping_quote_offers
                                           WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.manual_shipping_quote_offers        WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.manual_shipping_quote_request_items WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.manual_shipping_quote_request_packages
  WHERE manual_shipping_quote_request_id IN (SELECT id FROM public.manual_shipping_quote_requests
                                             WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.manual_shipping_quote_requests  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipping_rate_lane_transit_profile_bindings
  WHERE shipping_rate_lane_id IN (
    SELECT l.id FROM public.shipping_rate_lanes l
    JOIN public.shipping_rate_cards c ON c.id = l.shipping_rate_card_id
    WHERE c.company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_rate_rules
  WHERE shipping_rate_lane_id IN (
    SELECT l.id FROM public.shipping_rate_lanes l
    JOIN public.shipping_rate_cards c ON c.id = l.shipping_rate_card_id
    WHERE c.company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_rate_lanes
  WHERE shipping_rate_card_id IN (SELECT id FROM public.shipping_rate_cards
                                  WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_rate_cards             WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.delivery_promise_weekly_schedules
  WHERE delivery_promise_profile_id IN (SELECT id FROM public.delivery_promise_profiles
                                        WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.delivery_promise_profiles       WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipping_transit_time_profile_calendars
  WHERE shipping_transit_time_profile_id IN (SELECT id FROM public.shipping_transit_time_profiles
                                             WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_transit_time_weekday_rules
  WHERE shipping_transit_time_profile_id IN (SELECT id FROM public.shipping_transit_time_profiles
                                             WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_transit_time_profiles  WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.shipping_transit_delivery_weekdays
  WHERE shipping_transit_time_profile_id IN (SELECT id FROM public.shipping_transit_time_profiles
                                             WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_calendar_blackout_dates
  WHERE shipping_calendar_profile_id IN (SELECT id FROM public.shipping_calendar_profiles
                                         WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.shipping_calendar_profiles      WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.merchant_fulfillment_origins    WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.merchant_store_public_profile_categories
  WHERE merchant_store_id IN (SELECT merchant_store_id FROM public.merchant_store_public_profiles
                              WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.merchant_store_public_profile_shipping_countries
  WHERE merchant_store_id IN (SELECT merchant_store_id FROM public.merchant_store_public_profiles
                              WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.merchant_store_public_profiles WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.merchant_stores                 WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.seller_verification_events      WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.seller_application_events       WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.seller_applications             WHERE company_id IN (SELECT id FROM _p0_3_purge);

-- STEP 6 — COMPANY IDENTITY ------------------------------------------------
DELETE FROM public.company_legal_identifiers       WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.company_legal_identities        WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.company_member_roles
  WHERE member_id IN (SELECT id FROM public.company_members
                      WHERE company_id IN (SELECT id FROM _p0_3_purge));
DELETE FROM public.company_members                 WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.company_tax_profiles            WHERE company_id IN (SELECT id FROM _p0_3_purge);
DELETE FROM public.companies                       WHERE id IN (SELECT id FROM _p0_3_purge);

-- --- re-enable every guard -------------------------------------------------
ALTER TABLE public.channel_api_audit                    ENABLE TRIGGER trg_channel_api_audit_no_delete;
ALTER TABLE public.channel_listing_audit                ENABLE TRIGGER channel_listing_audit_no_update;
ALTER TABLE public.channel_order_events                 ENABLE TRIGGER p4_events_no_update;
ALTER TABLE public.channel_order_inbox                  ENABLE TRIGGER p4_inbox_no_update;
ALTER TABLE public.channel_shipment_events              ENABLE TRIGGER channel_shipment_events_no_delete;
ALTER TABLE public.company_member_roles                 ENABLE TRIGGER company_member_roles_guard_owner_role;
ALTER TABLE public.company_members                      ENABLE TRIGGER company_members_guard_owner_membership;
ALTER TABLE public.delivery_promise_weekly_schedules    ENABLE TRIGGER trg_dpws_mutable;
ALTER TABLE public.inventory_transaction_entries        ENABLE TRIGGER inv_entries_no_update;
ALTER TABLE public.inventory_transactions               ENABLE TRIGGER inv_tx_guard;
ALTER TABLE public.manual_shipping_quote_acceptances    ENABLE TRIGGER m1c1ee_acceptance_write_trg;
ALTER TABLE public.manual_shipping_quote_offer_conditions ENABLE TRIGGER m1c1ed_condition_write_trg;
ALTER TABLE public.manual_shipping_quote_offers         ENABLE TRIGGER m1c1ed_offer_write_trg;
ALTER TABLE public.manual_shipping_quote_request_items  ENABLE TRIGGER m1c1ec_item_write_trg;
ALTER TABLE public.manual_shipping_quote_request_packages ENABLE TRIGGER m1c1ec_package_write_trg;
ALTER TABLE public.manual_shipping_quote_state_events   ENABLE TRIGGER m1c1ee_state_event_write_trg;
ALTER TABLE public.outbox_dead_letters                  ENABLE TRIGGER outbox_dead_letters_no_delete;
ALTER TABLE public.outbox_events                        ENABLE TRIGGER outbox_events_no_delete;
ALTER TABLE public.seller_application_events            ENABLE TRIGGER m1v1d_application_event_immutable;
ALTER TABLE public.seller_verification_events           ENABLE TRIGGER m1v1c_verification_event_immutable;
ALTER TABLE public.shipping_calendar_blackout_dates     ENABLE TRIGGER scbd_parent_guard;
ALTER TABLE public.shipping_calendar_profiles           ENABLE TRIGGER scp_immutability;
ALTER TABLE public.shipping_rate_lanes                  ENABLE TRIGGER m1c1c_lane_immutability_trg;
ALTER TABLE public.shipping_rate_rules                  ENABLE TRIGGER m1c1c_rule_immutability_trg;
ALTER TABLE public.shipping_transit_delivery_weekdays   ENABLE TRIGGER stdw_parent_guard;
ALTER TABLE public.shipping_transit_time_profile_calendars ENABLE TRIGGER sttpc_parent_guard;
ALTER TABLE public.shipping_transit_time_profiles       ENABLE TRIGGER sttp_immutability;
ALTER TABLE public.shipping_transit_time_weekday_rules  ENABLE TRIGGER sttwr_parent_guard;

-- STEP 7 — POST-CONDITIONS -------------------------------------------------
DO $$
DECLARE
  v_companies int; v_name text; v_live_after int; v_orphan_members int; v_disabled int;
BEGIN
  SELECT count(*) INTO v_companies FROM public.companies;
  SELECT name INTO v_name FROM public.companies LIMIT 1;
  SELECT count(*) INTO v_live_after FROM public.channel_connections WHERE mode='live';
  SELECT count(*) INTO v_orphan_members
    FROM public.company_members cm
    LEFT JOIN public.companies c ON c.id = cm.company_id
    WHERE c.id IS NULL;
  SELECT count(*) INTO v_disabled
    FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D';

  IF v_companies <> 1 THEN
    RAISE EXCEPTION 'P0-3 FAIL: % companies remain, expected exactly 1.', v_companies;
  END IF;
  IF v_name <> 'Qnan B.V.' THEN
    RAISE EXCEPTION 'P0-3 FAIL: surviving company is "%", expected "Qnan B.V.".', v_name;
  END IF;
  IF v_orphan_members > 0 THEN
    RAISE EXCEPTION 'P0-3 FAIL: % orphaned company_members rows.', v_orphan_members;
  END IF;
  IF v_disabled > 0 THEN
    RAISE EXCEPTION 'P0-3 FAIL: % public triggers left disabled.', v_disabled;
  END IF;

  RAISE NOTICE 'P0-3 PASS. companies=1 (%), mode=live after=%, disabled triggers=0', v_name, v_live_after;
END $$;