# Phase 2 — Final Closure Report

**Status:** ✅ CLOSED — APPROVED
**Scope:** Product/SKU Catalog · Warehousing · Inventory Ledger · Reservations · Fulfilment · Channels
**Baseline:** `ARCHITECTURE_PROPOSAL.md` §21 (Revision 3.1)
**Subtraction model:** Single — logical reservations only
**Tenancy:** All objects scoped by `company_id`; RLS enforced; `anon` denied on every RPC

---

## 1. Migrations Applied

| # | Migration | Scope |
|---|-----------|-------|
| 1 | `phase2_catalog_warehouses_dispositions` | `products`, `skus`, `offers`, warehouses, locations, dispositions |
| 2 | `phase2_inventory_ledger` | `inventory_transactions`, append-only `inventory_transaction_entries`, `post_inventory_transaction`, `rebuild_inventory_balances` |
| 3 | `phase2_reservations` | Reservation headers/lines/allocations, `create_reservation`, `pick_reservation_allocation`, `release_reservation`, `sku_active_reserved` |
| 4 | `phase2_fulfilment_channels` | `packed_quantity` / `shipped_quantity` on allocations, `pack_reservation_allocation`, `ship_reservation_allocation`, `reverse_pack_allocation`; `channel_accounts`, `channel_listings`, append-only `channel_listing_audit`, `set_channel_published_quantity` |
| 4-hotfix | `phase2_mig4_hotfix` | (1) Idempotency short-circuit **before** capacity/state checks in `pack_*` / `ship_*`. (2) OCC error in `set_channel_published_quantity` changed from `SQLSTATE 40001` → `P0001` to prevent PostgREST auto-retry masking real version conflicts. |

Invariants enforced: `shipped ≤ packed ≤ picked`; no partial short reservations (all-or-nothing rollback); monotonic `channel_listing` versions; append-only audit trails; immutable `company_id` on all tenant rows.

---

## 2. Hotfix Detail (Migration 4)

Both fixes are logic-level, not test reruns:

1. **Idempotent replay correctness** — `pack_reservation_allocation` and `ship_reservation_allocation` now look up `inventory_transactions._idempotency_key` **first**. A replay returns the original result even when the allocation's remaining shippable quantity is exhausted. Without this, replayed calls raised spurious capacity errors after successful first execution.

2. **OCC surfacing** — `set_channel_published_quantity` version conflicts now raise `P0001`. PostgREST silently retries `40001` (serialization_failure), which converted deterministic OCC rejections into upstream timeouts and hid real concurrent-writer conflicts from clients.

---

## 3. Test Evidence

All scripts live under `scripts/` and were executed against the production database.

| Suite | File | Result |
|-------|------|--------|
| Migration 1 — Catalog & Warehouses | `phase2-mig1-tests.ts` | **37 / 37 passed** |
| Migration 2 — Inventory Ledger | `phase2-mig2-tests.ts` | **34 / 34 passed** |
| Migration 3 — Reservations | `phase2-mig3-tests.ts` | **33 / 33 passed** |
| Migration 4 — Fulfilment & Channels (full) | `phase2-mig4-tests.ts` | **43 / 43 passed** |
| Migration 4 — Isolated hotfix regression | `phase2-mig4-isolated.ts` | **6 / 6 passed** |
| **Phase 2 total** | | **153 / 153 passed** |

Isolated suite specifically re-runs the two previously-timeout scenarios (C.01 idempotent replay of `ship`, H.04 stale-version OCC conflict) without concurrent PostgREST pressure. Both now pass deterministically, proving the failures were masked bugs, not flaky infra.

---

## 4. Acceptance Criteria — Verified

- Atomic `pack → ship` transitions; replay-safe via idempotency keys.
- Cannot ship allocations that are not `picked`, or that are cancelled / released.
- No double subtraction of balances or reservations across pack, ship, reverse, or replay paths.
- Explicit separation: physical company inventory vs. logical reserved quantity vs. per-channel published quantity.
- Every `channel_listing` quantity change is versioned, audit-logged, and rejects stale writers via OCC.
- RLS + `anon` + cross-company tests confirm no tenant leakage on any Phase 2 object or RPC.
- Concurrency proof points held on rerun:
  - 30× parallel 5-unit reservations against 94 available → exactly 18 succeed (90 units), zero oversell.
  - 10× parallel cancels of one header → exactly one release.
  - Parallel OCC writers on the same listing → exactly one winner per version.

---

## 5. Deferred Decisions Honoured (from Phase 1 sign-off)

- Partial short reservations are not allowed — enforced by full-rollback on any short line.
- `NULL channel_cap` = unlimited — respected in `set_channel_published_quantity`.
- Warehouse location requirements are not enforced by cross-table `CHECK` — enforced by RPC logic + triggers instead.

---

## 6. Closure

Phase 2 (Migrations 1–4 + Migration 4 hotfix) is empirically verified and **locked** as the production baseline. Migrations, RPCs, and test scripts are frozen; no silent amendments.

**Awaiting authorization to open the next phase.**
