# PHASE 5 — M0 BASELINE REMEDIATION PLAN

**Status:** PROPOSAL ONLY — NOT EXECUTED
**Date:** 24 July 2026
**Author:** Lovable engineering agent
**Companion:** `docs/PHASE5_M0_OWNER_DECISION_PACKET.md`
**Scope:** Describe the additive migrations, code moves, and tests required to bring the baseline into a state where M1 can begin safely, without touching historical (locked) migrations. **No step below has been executed.** Nothing runs until the Owner Decision Packet is approved.

Ordering guarantees:
- Every migration is **additive**. No historical migration is edited.
- Every migration has an explicit **rollback**.
- Every migration is **idempotent** where possible or gated by a marker row.
- No milestone in Phase 5 (M1 … M10) may begin until all *M1-blocking* items below are approved and applied.

---

## 1. Migration ladder (additive, in strict order)

Naming: `phase5_r<N>_<slug>.sql` under `supabase/migrations/`, timestamp assigned at execution time.

### R1 — Baseline drift capture (no schema change)

- **Purpose:** Produce the drift report between `supabase/migrations/*.sql` (repo) and the live database (`pg_catalog`), which M0 could not compute under read-only rules.
- **Steps:** clean-room replay in a scratch DB; `pg_dump --schema-only` of both; structural diff; record hashes.
- **Schema change:** none.
- **Rollback:** N/A (report only).
- **Dependencies:** none.
- **Tests:** the diff itself is the artefact; must show `NO DRIFT` or an itemised list. Any drift becomes a blocker for R2.
- **Blocks:** M1.

### R2 — Legacy `place_order` containment (P5-OWN-004)

- **Purpose:** Make the legacy RPC un-callable from any authenticated session without dropping it.
- **Steps:**
  1. `REVOKE EXECUTE ON FUNCTION public.place_order(...) FROM PUBLIC, anon, authenticated;`
  2. `COMMENT ON FUNCTION public.place_order IS 'DEPRECATED — Phase 5 R2. Do not call. Retained for dependency inspection only.';`
  3. Insert a row into a new `deprecated_objects(object_name, deprecated_at, reason)` registry table (created in this migration, RLS-locked to `service_role`).
  4. Feature-flag the legacy checkout route (`src/routes/_authenticated/checkout.tsx`) behind an env flag defaulting to off.
  5. Grep-evidence artefact committed alongside the migration proving no `src/**` still calls `place_order` after the flag flips.
- **Rollback:** re-`GRANT EXECUTE` to `authenticated`, remove `deprecated_objects` row, flip the flag on.
- **Dependencies:** R1.
- **Tests:** negative test asserting `authenticated` gets `permission denied for function place_order`; positive test that new checkout path (once introduced in R6) does not reference it.
- **Blocks:** M3.

### R3 — Legacy RLS remediation (P5-OWN-006)

- **Purpose:** Re-issue policies on legacy tables (`products`, `orders`, `order_items`, `cart_items`, `wishlist_items`, `categories`, `profiles`, `seller_bol_credentials`, `product_suggestions`) with explicit roles.
- **Steps:** for each table: `DROP POLICY IF EXISTS` per legacy policy → `CREATE POLICY … TO authenticated|anon|service_role` per the GRANT matrix appended below → confirm `GRANT` statements are present per the public-schema-grants rule.
- **GRANT matrix (draft, subject to owner ruling under P5-OWN-006):**
  - `products`: `SELECT` to `anon, authenticated`; write to `service_role` only (writes handled by canonical RPCs post-R5).
  - `orders`, `order_items`: `SELECT/INSERT/UPDATE` to `authenticated` scoped by `auth.uid()`; full to `service_role`.
  - `cart_items`, `wishlist_items`: full CRUD to `authenticated` scoped by `auth.uid()`; full to `service_role`.
  - `categories`: `SELECT` to `anon, authenticated`; write to `service_role`.
  - `profiles`: `SELECT` restricted (no public email exposure); write scoped by `auth.uid()`.
  - `seller_bol_credentials`: no `anon`/`authenticated` policies once P5-OWN-005 lands (superseded by `channel_connections`).
  - `product_suggestions`: `SELECT/INSERT` to `authenticated`; `UPDATE` to sellers only.
- **Rollback:** restore prior policies from R1 baseline dump.
- **Dependencies:** R1.
- **Tests:** tenancy negative tests (cross-user read/write forbidden), anon negative tests (write forbidden everywhere except where explicitly allowed), direct-table negative tests where an RPC is the intended path.
- **Blocks:** M1, M3.

### R4 — Secret storage finalisation (P5-OWN-005)

- **Purpose:** Enforce the Vault-only rule for real secrets.
- **Steps:**
  1. Inventory legacy ciphertext columns on `seller_bol_credentials`, `channel_connections`, `channel_api_audit`.
  2. Add nullable `secret_ref TEXT` columns where missing; backfill from Vault import (out-of-band, tracked in a checklist).
  3. `ALTER TABLE … DROP COLUMN` for ciphertext columns **only after** Vault backfill confirmed (a second migration R4b).
  4. Add DB-level `CHECK` and audit trigger rejecting any INSERT/UPDATE that writes a value shaped like a client secret to a non-`secret_ref` column.
  5. Update `BOR-DEC-011` in the decision log.
- **Rollback:** re-add ciphertext columns; leave `secret_ref` in place (harmless).
- **Dependencies:** R1.
- **Tests:** attempt to insert a `sk_…` / `Bearer …` shaped value into any non-`secret_ref` column → rejected; audit rows never contain raw secrets; log-redaction tests re-run.
- **Blocks:** M1 (channel connection creation), M4.

### R5 — Canonical product backfill + `products` view (P5-OWN-001, P5-OWN-008 option A)

- **Purpose:** Make `catalog_products` / `catalog_skus` the sole product source of truth; retire `public.products` as a table.
- **Steps:**
  1. Backfill: for every row in `public.products` create matching `catalog_products` + `catalog_skus` rows keyed by `company_id`.
  2. Create a system `channel_accounts` row per company with `kind = 'borvat_direct'` (P5-OWN-009 option A) and a `channel_listings` row per SKU.
  3. Rename `public.products` → `public.products_legacy`; create a `public.products` **view** projecting canonical data for read compatibility.
  4. `REVOKE INSERT/UPDATE/DELETE` on the view; storefront writes go through canonical RPCs introduced in R6.
  5. Add a migration marker row `deprecated_objects('public.products_legacy', ...)`.
- **Rollback:** drop the view, rename `products_legacy` back to `products`, delete backfilled canonical rows keyed by the backfill batch id (stored in `catalog_products.metadata->>'backfill_batch_id'`).
- **Dependencies:** R1, R3.
- **Tests:** every existing storefront query still returns rows; write attempts to the view are rejected; canonical rows equal legacy rows one-to-one; seed script rewritten to canonical and re-run in a scratch DB.
- **Blocks:** M1, M3.

### R6 — Canonical inventory enforcement (P5-OWN-002)

- **Purpose:** Ensure no code path decrements `products.stock` or its equivalent.
- **Steps:**
  1. Because `products` is now a view (R5), `stock` writes already fail. Add an explicit `INSTEAD OF UPDATE` trigger returning an error message pointing to `post_inventory_transaction`.
  2. Add a CI grep rule (documented in `scripts/`) rejecting any new occurrence of `.update({ stock` or `set stock =` in `src/**`.
- **Rollback:** drop the trigger.
- **Dependencies:** R5.
- **Tests:** attempt UPDATE of `stock` via view fails with the guided error; existing Phase 2 inventory tests still pass.
- **Blocks:** M3.

### R7 — Borvat Direct order model (P5-OWN-003)

- **Purpose:** Introduce parent order + merchant sub-order + lines.
- **Steps:** create `commerce_orders`, `commerce_merchant_orders`, `commerce_order_lines`, `commerce_order_status_events`; wire reservations via existing Phase 2 RPCs; snapshot `tax_version_id` on lines (P5-OWN-010 option A); add GRANTs (`authenticated` scoped by `auth.uid()`, full to `service_role`); enable RLS; add policies; add `updated_at` trigger.
- **Rollback:** drop tables in reverse order.
- **Dependencies:** R3, R5, R6, and P5-OWN-010 ruled.
- **Tests:** create order → reserve → cancel → verify ledger; cross-tenant negative tests; view-vs-table negative tests.
- **Blocks:** M3.

### R8 — Tax version tables (P5-OWN-010)

- **Purpose:** Support versioned VAT.
- **Steps:** create `tax_versions(id, code, rate, effective_from, effective_to)` and seed NL 21% / 9% / 0% versions; FK from `commerce_order_lines.tax_version_id`.
- **Rollback:** drop table (only if no `commerce_order_lines` reference it — enforced by FK).
- **Dependencies:** none for the DDL; must land before R7 activates line-level FK.
- **Tests:** rate change never mutates historical lines.
- **Blocks:** M2, M3.

### R9 — Comms outbox stream (P5-OWN-012)

- **Purpose:** Isolated stream for transactional email.
- **Steps:** create `comms_outbox_events`, `comms_outbox_dead_letters`; mirror Phase 3 M2 RPC shape (`claim_comms_outbox_batch`, `complete_…`, `fail_…`); worker under `src/lib/outbox/comms-worker.ts`; RLS + GRANTs.
- **Rollback:** drop tables and RPCs.
- **Dependencies:** R7 (event producers).
- **Tests:** enqueue → claim → complete happy path; failure backoff; idempotency; no cross-contamination with listing/shipment streams.
- **Blocks:** M8.

---

## 2. Frontend transition plan (Phase 0 → canonical core)

Executed in **M1**, gated on R5 landing:

1. Introduce `src/lib/catalog.functions.ts` — server functions returning `catalog_*` shapes.
2. Route-by-route migration in this exact order to keep the site working every step:
   - `search.tsx` → canonical read
   - `c.$slug.tsx` → canonical read
   - `product.$id.tsx` → canonical read
   - `index.tsx` → canonical read
   - `cart.tsx` → cart items key on `sku_id` instead of `product_id`
   - `_authenticated/checkout.tsx` → replaced by new server function calling reservation + Stripe test PaymentIntent (M3)
   - `wishlist.tsx` → key on `sku_id`
   - `seller.*` seller routes → canonical writes via new RPCs
3. `products` view remains readable throughout; it is removed only in a later migration after M3 goes green.

---

## 3. Preventing a third source of truth

Enforced by:
- **CI grep rule** in `scripts/ci-guards/` rejecting new references to legacy tables from `src/routes/**` and `src/lib/**` (allowlist: migration files, `products_legacy` rename step).
- **DB `deprecated_objects` registry** consulted by a nightly job that alerts on any new `pg_stat_user_tables` activity against deprecated objects.
- **Governance rule** added to `README_BORVAT_GOVERNANCE.md`: any PR introducing a new product/order/inventory table must cite an owner-approved decision ID.

---

## 4. Impact on M1 – M10

| Milestone | Depends on | Effect of remediation |
|---|---|---|
| M1 Merchant stores & listings | R1, R3, R4, R5 | Reads canonical from day one; writes via new RPCs. |
| M2 Shipping & versioned tax | R8 | Tax version table available before shipping engine wires prices. |
| M3 Multi-merchant checkout | R2, R5, R6, R7, R8 | Legacy `place_order` un-callable; canonical reservation path only. |
| M4 Payments (Stripe test) | R7 | Order model exists for PaymentIntent linkage. |
| M5 Seller dashboard | R3, R5, R7 | Canonical reads/writes only. |
| M6 Admin tools | R3 | RLS baseline clean. |
| M7 Founding merchant onboarding | R4 | Vault-only secret path in place. |
| M8 Comms outbox | R9 | Isolated stream. |
| M9 SaaS metering | R7 | Metering hooks on canonical order events. |
| M10 Alpha gate | all | Clean-room rebuild + full test replay is the closing artefact. |

---

## 5. What this plan does **not** do

- No historical migration is edited.
- No production data is destructively changed until R5 backfill is verified in a scratch replay.
- No live Bol write is enabled (§ 0 lock from Phase 4 M5 stands).
- No Stripe live mode.
- No hardcoding of the six founding merchants; every remediation must survive the 7th-merchant test.

---

## 6. Halt

This plan is **proposal only**. Execution of R1 requires:
1. Owner approval of `PHASE5_M0_OWNER_DECISION_PACKET.md` (all 12 decisions).
2. Explicit written approval of this remediation plan.

Until both approvals exist in the decision log, nothing in `supabase/migrations/`, `src/**`, or the database changes.
