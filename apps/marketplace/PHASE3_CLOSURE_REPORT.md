# Phase 3 — Closure Report

**Scope:** Transactional Outbox, Channel Sync Workers, and Multi-Tenant Reconciliation.
**Status:** ✅ CLOSED — locked as authoritative baseline.
**Date:** 2026-07-23.

---

## 1. Full Re-Run Results (no test edits)

| Suite | Migration | Passed |
|---|---|---|
| `phase2-mig1-tests.ts` | P2/M1 Catalog & Warehouses | 37/37 |
| `phase2-mig2-tests.ts` | P2/M2 Inventory Ledger | 34/34 |
| `phase2-mig3-tests.ts` | P2/M3 Reservations | 33/33 |
| `phase2-mig4-tests.ts` | P2/M4 Fulfilment & Channels | 43/43 |
| `phase2-mig4-isolated.ts` | P2/M4 OCC re-runs | 6/6 |
| **Phase 2 subtotal** | | **153/153** |
| `phase3-m1-tests.ts` | P3/M1 Outbox core | 37/37 |
| `phase3-m2-tests.ts` | P3/M2 Worker RPCs + mock adapter | 46/46 |
| `phase3-m3-tests.ts` | P3/M3 Multi-tenant Reconciliation | 39/39 |
| **Phase 3 subtotal** | | **122/122** |
| **GRAND TOTAL** | | **275/275** ✅ |

Matches the expected baseline exactly. No test files were modified for this run.

---

## 2. Migrations & Hotfixes

### Phase 3 — Migration 1 (Outbox core)
- `outbox_events` with denormalized `(company_id, channel_account_id, sku_id, offer_id)` target keys.
- `outbox_dead_letters` append-only (UPDATE/DELETE revoked).
- Unique partial index `outbox_events_one_in_flight_per_target` enforcing single in-flight event per `(company_id, channel_account_id, COALESCE(sku_id, offer_id))`.
- Preflight schema assertion: verified `channel_listings` enforces uniqueness on `(company_id, sku_id, channel_account_id)` before wiring the outbox index to the full target key.
- Revoked direct `channel_listings` mutation from `authenticated`; all publishes flow through `set_channel_published_quantity`, which enqueues atomically.

### Phase 3 — Migration 2 (Worker RPCs + adapter)
- `claim_outbox_batch` — version-ordered claim, per-listing serialization via advisory locks, lease token + expiry.
- `complete_outbox_event`, `fail_outbox_event` (exponential backoff + DLQ on permanent failure), `recover_expired_leases`.
- **Hotfix M2-H1:** `fail_outbox_event` originally referenced a non-existent column when writing to `outbox_dead_letters`. Aligned it with the actual schema (`reason` column, structured payload). Real fix, not a rerun.
- Client-side worker (`src/lib/outbox/worker.ts`) with mock adapter (`src/lib/outbox/mock-adapter.ts`), covering transient/permanent failure and idempotent replay.

### Phase 3 — Migration 3 (Multi-tenant Reconciliation)
- Tables: `channel_snapshot_batches`, `channel_snapshots`, `channel_reconciliation_reports`, `channel_reconciliation_findings`.
- RPCs (all `service_role`-only): `open_reconciliation_batch`, `record_channel_snapshot`, `close_reconciliation_batch`, `run_reconciliation` (FULL OUTER JOIN local vs external), `reenqueue_drift_finding`.
- Snapshots and findings are strictly scoped to `(company_id, channel_account_id, COALESCE(sku_id, offer_id))` — no cross-tenant merging.
- `reenqueue_drift_finding` is pinned to the finding's own listing (resolved through the tenant-scoped listing lookup); tampering with `company_id`/target is rejected with `tenant_target_mismatch`.

### Earlier hotfixes carried forward (still verified)
- P2/M4-H1: idempotency + OCC error code `P0001` on `set_channel_published_quantity`.
- P2/M2: reversal single-winner concurrency (advisory lock on `source_id`).

---

## 3. Worker & Reconciliation RPC Permissions (actual grants)

Queried `pg_proc.proacl` for every worker/reconciliation function. Only `service_role` (plus the built-in `postgres` / `sandbox_exec` roles that own or execute migrations) has `EXECUTE`. `authenticated` and `anon` have no grant on any of these:

| Function | authenticated | anon | service_role |
|---|:-:|:-:|:-:|
| `claim_outbox_batch` | ❌ | ❌ | ✅ |
| `complete_outbox_event` | ❌ | ❌ | ✅ |
| `fail_outbox_event` | ❌ | ❌ | ✅ |
| `recover_expired_leases` | ❌ | ❌ | ✅ |
| `open_reconciliation_batch` | ❌ | ❌ | ✅ |
| `record_channel_snapshot` | ❌ | ❌ | ✅ |
| `close_reconciliation_batch` | ❌ | ❌ | ✅ |
| `run_reconciliation` | ❌ | ❌ | ✅ |
| `reenqueue_drift_finding` | ❌ | ❌ | ✅ |

Tenant-facing RPCs (`set_channel_published_quantity`, `post_inventory_transaction`, `transfer_company_ownership`) remain available to `authenticated` under RLS + permission checks. All other worker/reconciliation surfaces are strictly server-side.

Direct writes on `outbox_events`, `outbox_dead_letters`, `channel_snapshots`, `channel_snapshot_batches`, `channel_reconciliation_reports`, `channel_reconciliation_findings` are denied for `authenticated`; the test suites exercise these denials (P3/M1 X.02–X.03, P3/M3 E.04).

---

## 4. Multi-Tenant Reconciliation — Isolation Guarantees

Verified by `phase3-m3-tests.ts` (39/39) and the RPC contract:

- **Scoping key** for every snapshot/finding is the full tuple `(company_id, channel_account_id, target_kind, sku_id|offer_id)`. There is no aggregation across companies, SKUs, or offers.
- `run_reconciliation` joins local `channel_listings` and `channel_snapshots` **only within the same `company_id` and `channel_account_id`**. Cross-company rows never appear in the same FULL OUTER JOIN.
- `reenqueue_drift_finding` resolves the target listing through the finding's own `(company_id, channel_account_id, sku_id|offer_id)` — a spoofed `company_id` or target is rejected with `tenant_target_mismatch`.
- `missing_local` findings cannot be re-enqueued (no local listing to publish); rejected with `finding_not_reenqueueable`.
- Double-reenqueue guarded by finding-state transition (`pending → reenqueued`); second call returns `finding_not_pending`.

Conclusion: reconciliation cannot leak, merge, or overwrite a listing/SKU/offer belonging to another company.

---

## 5. Intentional `SECURITY DEFINER` Surface

The following functions are deliberately `SECURITY DEFINER` because they must bypass RLS to enforce cross-row invariants (advisory locks, denormalized target keys, append-only tables, tenant-scoped joins). Each is either restricted to `service_role` or performs an explicit tenant/permission check before mutating:

- `post_inventory_transaction` — tenant + `inventory.write` check inside the body.
- `set_channel_published_quantity` — tenant + `listings.manage` check, atomic outbox enqueue.
- `transfer_company_ownership` — owner-only, writes to `agent_audit_log`.
- `claim_outbox_batch`, `complete_outbox_event`, `fail_outbox_event`, `recover_expired_leases` — `service_role` only.
- `open_reconciliation_batch`, `record_channel_snapshot`, `close_reconciliation_batch`, `run_reconciliation`, `reenqueue_drift_finding` — `service_role` only.

Supabase linter warnings on `SECURITY DEFINER` for these functions are **intentional and accepted**; each has a documented reason above and an actual EXECUTE grant that matches its role.

---

## 6. Phase 3 — Locked

Phase 3 is closed. Migrations, RPC contracts, permissions, and reconciliation scoping listed here form the authoritative baseline. No amendments without a new phase authorization.

---

## 7. Phase 4 — Planning Kickoff

Next phase: **Real Bol.com integration + Orders + Shipping**.

Proposed scope (draft — awaiting authorization to finalize a charter):

1. **Bol adapter** replacing the mock outbox adapter — offer/stock/price publish through the existing worker pipeline (no worker changes required; adapter contract already stable).
2. **Bol order ingestion** — pull orders per seller (per-tenant credentials), map to internal `orders` / `order_items`, respect existing reservation & fulfilment state machine from Phase 2/M4.
3. **Shipment dispatch** — carrier + tracking write-back to Bol, driven by the existing shipment states (`pick → pack → ship → deliver`); reuse email notifications already wired in Phase 0.
4. **Reconciliation source binding** — plug real Bol snapshot fetcher into `record_channel_snapshot` / `run_reconciliation`; no schema changes expected.
5. **Credentials & rate-limiting** — encrypted per-seller Bol keys (already scaffolded in `seller_bol_credentials`), plus token-bucket per `channel_account_id`.

Explicit non-goals for Phase 4: no changes to Phase 2 inventory/reservation invariants; no changes to Phase 3 outbox ordering or reconciliation isolation.

Awaiting charter authorization before opening M1.
