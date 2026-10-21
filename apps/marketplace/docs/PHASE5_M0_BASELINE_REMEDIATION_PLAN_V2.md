# PHASE 5 — M0 BASELINE REMEDIATION PLAN V2

**Status:** V2 — supersedes V1.
**Date:** 2026-07-24
**Precedence:** Where V2 conflicts with V1, V2 wins.
**Authorization envelope:** Plan text only. No step below has executed. R2 – R9 remain blocked.

---

## 0. Global rules

- Every migration is additive; no historical migration edited.
- Every migration ships a documented rollback and a documented **point-of-no-return** (see § Rollback policy).
- Migrations are idempotent or marker-gated.
- Tax version tables land before any FK from order lines to them.
- No blanket `authenticated` write grants on commerce/order/payment/inventory tables — sensitive writes go through trusted RPCs only.
- No pattern-based reject triggers for "secret-shaped" values.

## M0-E1 — Baseline Reproducibility & Drift Verification (was R1)

- **Not a migration.** Not under `supabase/migrations/`. Produces reports only.
- Deliverables: clean-room replay log, migration execution log, per-migration hash manifest, schema-only dump of scratch DB, schema-only dump of production clone, structural diff with `expected` / `undocumented` / `dangerous` classification, list of non-idempotent migrations, RPC/policy/index/constraint comparison.
- Exit gate: zero `dangerous` deltas; `undocumented` deltas either owner-cleared or reclassified as blockers.
- Blocks: R2 and everything after it.

## R2 — Legacy `place_order` containment

- Dependency scan first: enumerate every overload/signature in `pg_proc`, every wrapper in `pg_proc.prosrc`, every `src/**` reference (already: exactly one route, `src/routes/_authenticated/checkout.tsx`), every log line matching the function name in the last N days.
- Actions: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; keep `service_role`. `COMMENT ON FUNCTION` marks it deprecated. Insert into `deprecated_objects` registry (created in R2). Feature-flag `/checkout` so the route no longer calls it.
- **No re-grant rollback in production.** Rollback = forward-fix or a narrowly scoped, audited compatibility RPC that the owner explicitly approves.
- Test: authenticated caller receives `permission denied for function place_order`; no wrapper/trigger indirectly reaches it. Positive-path new-checkout tests belong to M3, not R2.
- Emergency path: if M0-E1 confirms the pre-remediation exposure, apply `P5-HF-001` (see exposure report § 6) immediately after owner approval; do not wait for M1.
- Blocks: M3.

## R3 — Legacy RLS remediation

- Rewrites policies with explicit roles and drops any surviving `TO public`.
- **GRANT matrix (V2):**

| Table | `anon` | `authenticated` | `service_role` | Path for writes |
|---|---|---|---|---|
| `products` (post-R5 view) | `SELECT` | `SELECT` | `ALL` | canonical RPCs only |
| `orders` | none | `SELECT` (scoped by `auth.uid()`) | `ALL` | canonical checkout RPC (M3) |
| `order_items` | none | `SELECT` (via joined `orders.user_id = auth.uid()` or seller ownership) | `ALL` | canonical RPCs |
| `cart_items` | none | `SELECT/INSERT/UPDATE/DELETE` scoped by `auth.uid()` | `ALL` | direct (buyer cart) |
| `wishlist_items` | none | `SELECT/INSERT/DELETE` scoped by `auth.uid()` | `ALL` | direct |
| `categories` | `SELECT` | `SELECT` | `ALL` | admin RPC |
| `profiles` | none | `SELECT` self + limited public projection, `UPDATE` self | `ALL` | direct scoped |
| `seller_bol_credentials` | none | none (superseded by `channel_connections` after R4) | `ALL` | Vault-only |
| `product_suggestions` | none | `SELECT` owner, `INSERT` any authenticated, `UPDATE` only where `has_permission(auth.uid(), company_id, 'product_suggestions:update')` | `ALL` | RPC for status transitions |

- Sensitive commerce columns (`status`, `total_cents`, `paid_at`, `tracking_*`) are never granted `UPDATE` to `authenticated`; a status-transition RPC exists in M3.
- Table GRANTs audited alongside policies — dropping a policy without dropping the GRANT is not remediation.
- Rollback: restore prior policies from the M0-E1 dump (pre-cutover only).
- Blocks: M1, M3.

## R4a / R4b / R4c — Secret storage finalisation

- **R4a (schema prep, additive):** inventory every secret-bearing column on `seller_bol_credentials`, `channel_connections`, `channel_api_audit`; add nullable `secret_ref TEXT` where missing; add DB-level constraint blocking new writes into legacy secret columns (NOT via pattern heuristic — via `CHECK (legacy_col IS NULL)` once the column becomes write-frozen).
- **R4b (operational Vault migration, out-of-schema):** per-connection checklist that copies each real secret into Vault, records `secret_ref`, verifies worker retrieval, redacts logs. No plaintext or Vault export ever committed as a migration artefact.
- **R4c (cleanup, additive migration):** rotate Bol/API secrets where possible, then `ALTER TABLE … DROP COLUMN` the legacy ciphertext columns, re-run redaction tests, update `BOR-DEC-011`.
- Rollback: R4a and R4c retain their pre-migration structure via M0-E1 dump. R4b rollback is a re-issue of Vault entries, not a schema step.
- Blocks: M1 (channel connection creation), M4, M7.

## R5 — Canonical product backfill + `products` view

- **Preflight:** `docs/PHASE5_R5_DEPENDENCY_AND_MAPPING_REPORT.md` must exist and be owner-approved. It enumerates every FK to `products`, every query keyed on product IDs, cart/wishlist/order references, seller ownership mapping, seed migration, unresolved rows, ID-compatibility plan, backfill verification queries, row-count and hash reconciliation, and a view performance plan.
- **Mapping table:** create `legacy_product_mappings` (schema per P5-OWN-008 condition 2). Every backfilled row writes here — `metadata->>'backfill_batch_id'` alone is not sufficient.
- **Ownership rule:** rows lacking `company_id` or a defensible owner go into `product_backfill_exceptions`; ownership is never guessed.
- **Rename & view:** `public.products` → `public.products_legacy` (never dropped in Phase 5); create `public.products` as a read-only view over the canonical model. `REVOKE INSERT/UPDATE/DELETE` on the view. `INSTEAD OF` triggers reject writes and point callers at the canonical RPC.
- **Rollback:** pre-cutover only, executed by restoring M0-E1 baseline. Post-cutover is forward-fix only.
- Blocks: M1, M3.

## R6 — Canonical inventory enforcement (broadened)

- View-level `INSTEAD OF UPDATE` trigger rejects any attempt to write `stock` on the compatibility view, pointing to `post_inventory_transaction`.
- Static enforcement across `src/**`, `supabase/migrations/**`, SQL functions, triggers, edge workers, test helpers, `scripts/**`, and generated server functions. CI grep is a supporting control, not the primary one.
- **DB test:** an assertion migration/test that attempts direct stock mutation as `authenticated` and `service_role` and confirms failure with the guided error.
- Blocks: M3.

## R7 — Tax version tables (previously R8)

- Creates `tax_versions(id, code, jurisdiction, rate, effective_from, effective_to, superseded_by, created_at)` with an exclusion constraint preventing overlapping `(code, jurisdiction)` periods.
- Seeds NL 21% / 9% / 0% versions only after owner confirmation the numbers match a current legal source at implementation time.
- Immutability: rows referenced by any commerce order line are non-updatable; a new version supersedes an old one.
- Blocks: R8, M2, M3.

## R8 — Commerce order model (previously R7)

- Creates `commerce_orders`, `commerce_merchant_orders`, `commerce_order_lines`, `commerce_order_status_events`.
- Line snapshot columns per P5-OWN-010: `tax_version_id` (FK to R7), `tax_rate_snapshot`, `taxable_amount_cents`, `tax_amount_cents`, `price_including_tax_cents`, `jurisdiction`.
- Additional line fields: currency snapshot, price snapshot, shipping snapshot, discount snapshot, reservation id, payment correlation id, immutability flag when paid.
- Parent-order idempotency key (unique), explicit state machine, append-only `commerce_order_status_events`.
- **RLS:** no direct `INSERT/UPDATE` for `authenticated`. Customer sees own orders. Merchant sees own sub-order only. Admin access audited. Cross-company RLS tests mandatory.
- Reservations wired to Phase 2 RPCs.
- Blocks: M3, M4.

## R9 — Comms outbox stream

- Creates `comms_outbox_events`, `comms_outbox_dead_letters` and dedicated RPCs (`claim_comms_outbox_batch`, `complete_…`, `fail_…`, `recover_expired_leases`). Worker at `src/lib/outbox/comms-worker.ts`.
- Columns include: unique `(company_id, dedupe_key)` constraint; `template_id`, `template_version`; `locale`; `recipient_type`; `recipient_ref` (opaque; PII stored separately with encrypted or hashed handles as per privacy design); `order_source` (`bol` | `borvat_direct` | `admin`); `channel_policy_evaluated_at`; `classification` (`transactional` | `marketing`); `suppression_status`; retry/backoff fields; DLQ correlation.
- Channel compliance policy evaluated before send; Bol order comms never re-classified as Borvat marketing/loyalty.
- Rate limiting per company + template.
- DLQ admin procedure documented alongside migration.
- Blocks: M8.

## Frontend transition plan (unchanged in intent; sequencing per V2 dependencies)

Executed in **M1**, gated on R5 landing:
1. Introduce `src/lib/catalog.functions.ts` returning canonical shapes.
2. Route order: `search.tsx` → `c.$slug.tsx` → `product.$id.tsx` → `index.tsx` → `cart.tsx` (cart key on `sku_id`) → `_authenticated/checkout.tsx` (replaced by M3 canonical checkout) → `wishlist.tsx` (key on `sku_id`) → seller routes.
3. Compatibility view stays readable throughout; removed only after M3 stability.

## Preventing a third source of truth

- CI grep in `scripts/ci-guards/` rejects new references from `src/routes/**` and `src/lib/**` to legacy tables (allowlist: migrations, `products_legacy` rename step).
- `deprecated_objects` registry consulted by a nightly job that alerts on `pg_stat_user_tables` activity against deprecated objects.
- Governance rule added to `README_BORVAT_GOVERNANCE.md`: any PR introducing a new product/order/inventory table cites an owner-approved decision ID.

## Impact on M1 – M10

| Milestone | Depends on | Effect |
|---|---|---|
| M1 Merchant stores & listings | M0-E1, R3, R4a, R5 | Reads canonical from day one; writes via new RPCs. |
| M2 Shipping & versioned tax | R7 | Tax versions in place before shipping wiring. |
| M3 Multi-merchant checkout | R2, R5, R6, R7, R8 | Legacy `place_order` un-callable; canonical reservation path only. |
| M4 Payments (Stripe test) | R8 | Order model exists for PaymentIntent linkage. |
| M5 Seller dashboard | R3, R5, R8 | Canonical reads/writes only. |
| M6 Admin tools | R3 | RLS baseline clean. |
| M7 Founding merchant onboarding | R4a/b/c | Vault-only secret path. 7th-merchant test executes here. |
| M8 Comms outbox | R9 | Isolated stream. |
| M9 SaaS metering | R8 | Metering hooks on canonical order events. |
| M10 Alpha gate | all | Clean-room rebuild + full regression + 7th merchant test. |

## Rollback policy (V2)

- Pre-traffic migrations are technically rollback-safe against the M0-E1 dump.
- **Points of no return** — after any of the following, destructive rollback is forbidden and forward-fix is the only path:
  - R5 canonical cutover once new reads land in production.
  - First real order written against the R8 commerce order model.
  - Any Vault migration in R4b that has already retired a plaintext secret.
  - First live Bol write (locked separately; not part of Phase 5).
- Each migration ships:
  - Pre-cutover backup instructions.
  - Validation gate (data-integrity checks required before flipping traffic).
  - Emergency read-only mode toggle (feature flag) for the affected surface.
  - Forward-fix procedure with owner sign-off template.

## What this plan does not do

- Does not edit historical migrations.
- Does not touch production data destructively.
- Does not enable Bol live or Stripe live.
- Does not hardcode the six founding merchants.
- Does not drop `products_legacy` during Phase 5.

## Halt

Plan V2 is proposal only. Execution begins with M0-E1 (baseline verification), then pauses for `BASELINE ACCEPTED — R2 AUTHORIZED` before any migration under `supabase/migrations/` runs.
