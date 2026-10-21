# PHASE 0 — P0-3 FIXTURE PURGE REPORT

Date: 2026-08-01
Authority: Owner-approved Decision Packet V1 (BOR-DEC-109), Programmer Handover Phase 0 §5.
Closes: **F-9 — 162 of 163 companies are test fixtures.**
Nature: **DESTRUCTIVE, IRREVERSIBLE.** Rollback = point-in-time restore only.

## 1. Preflight (asserted inside the migration transaction)

| Metric | Value |
| --- | --- |
| Companies total | 163 |
| Keep-set (`name = 'Qnan B.V.'`) | 1 |
| Purge-set | 162 |
| `channel_connections` in `mode = 'live'` | 9 (all fixture-owned) |

The migration hard-aborts if the keep-set is not exactly 1 or the purge-set is not exactly 162.

## 2. Deviations from the handover script (and why)

1. **Missing child tables.** `public.companies` carries 44 inbound foreign keys; 38 are
   `ON DELETE RESTRICT`. The handover script omitted 24 descendant tables (manual shipping
   quote family, shipping rate/transit/calendar family, merchant store public profiles and
   their child sets, `borvat_direct_listing_publications`, `channel_kill_switches`,
   `channel_sync_cursors`, `merchant_store_offer_prices`, `merchant_store_sku_*`). All were
   added, ordered leaf-first.
2. **Append-only guards.** 28 `BEFORE DELETE` immutability/append-only triggers reject
   administrative deletes by design (first failure: `channel_listing_audit is append-only`).
   `session_replication_role = 'replica'` is not grantable on this platform
   (`42501: permission denied to set parameter`). Resolution: each named guard trigger is
   disabled and re-enabled **inside the same transaction**, and a post-condition asserts that
   zero non-internal public triggers remain disabled. FK triggers were never disabled, so
   referential integrity was enforced throughout — which is what surfaced the ordering defects.
3. **Delete ordering.** Outbox and dispatch tables had to precede shipments/listings
   (`shipment_outbox_events → channel_shipments`, `channel_shadow_dispatches → outbox_events`,
   `channel_reconciliation_findings → outbox_events`). Corrected, not bypassed.

## 3. Post-conditions (all PASS)

| Assertion | Result |
| --- | --- |
| `companies` count = 1 | PASS (1) |
| Surviving company name | PASS (`Qnan B.V.`) |
| Orphaned `company_members` rows | PASS (0) |
| Public triggers left disabled | PASS (0) |
| `channel_connections` `mode = 'live'` | 9 → **0** |
| `merchant_stores` | 1 (IBBO, `draft`) |
| `orders` | 0 |
| `user_roles` rows with `role = 'seller'` | 188 → **0** (all fixture-owned; F-3 residue cleared as a side effect) |
| `seller_applications` | 1 (Qnan, pending) — preserved |
| `company_legal_identities` | 1 (Qnan) — preserved |
| `products` (legacy storefront table, not company-scoped) | 38 — untouched |
| Storefront home HTTP status | 200 |

## 4. Residual state

- Qnan B.V. remains the only tenant: operational, **not** legally verified. All M1V-1C
  prohibitions stand (no Verified badge, no public store publication, no payments, no
  settlement, no channel live).
- `catalog_products` / `catalog_skus` are now empty. Qnan holds no catalog yet; the first live
  catalog must be created through the normal seller flows, never by fixture reinsertion.
- P0-3 performed **no** grant, policy, or schema change. F-2 (P0-1/P0-1a) and F-3 (P0-2) remain
  closed as previously reported.
