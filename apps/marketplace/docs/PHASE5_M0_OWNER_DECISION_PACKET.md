# PHASE 5 — M0 OWNER DECISION PACKET

**Status:** M0 PREFLIGHT ACCEPTED — M0 CLOSURE WITHHELD
**Date:** 24 July 2026
**Author:** Lovable engineering agent
**Purpose:** Present the 12 architectural decisions surfaced by the M0 read-only preflight so the owner can approve, amend, or reject each one before M1 begins. No migration, code, or schema change has been executed.

This packet is the sole gating artefact between M0 and M1. Until every decision below has an explicit owner ruling, the safe default listed per row applies and M1 remains blocked.

Seven of the twelve decisions have already been ruled by the owner in the message accompanying this packet (P5-OWN-001 … P5-OWN-007). They are reproduced here **verbatim as binding** in § 2 so this file is self-contained. The remaining five (P5-OWN-008 … P5-OWN-012) still require owner input.

---

## 1. How to read each row

Each decision uses a fixed schema:

- **ID** — stable identifier used in all later migrations, tests, and docs.
- **Question** — the single yes/no or option choice put to the owner.
- **Proven problem** — what M0 found, stated as fact, not opinion.
- **Evidence** — exact migration file / RPC name / table / policy / source file so the owner can audit.
- **Options** — the actual choices, not a summary.
- **Recommendation** — the engineering recommendation, with reasoning.
- **Impact per option** — schema, code, RLS, tests, and timeline effect.
- **Risks** — what can go wrong per option.
- **Blocks** — which milestones (M1/M2/M3/M4) cannot start until this is ruled.
- **Safe default** — what happens if the owner does not rule; always the most conservative option, never silently permissive.

---

## 2. Binding decisions already ruled by owner

The following seven decisions are **APPROVED AND BINDING** as of this packet. They are recorded here only for traceability; they are not open for re-debate inside Phase 5. Any conflict with earlier text is resolved in favour of the text below.

### P5-OWN-001 — Canonical Product Model — RULED

Canonical model is `central_product_family → sellable_sku → channel_listing` (implemented as `catalog_products → catalog_skus → channel_listings` in the live schema). Legacy `public.products` is **not** a source of truth for ownership, inventory, or sellable quantity. It may remain temporarily as a read-only compatibility surface for the storefront during the M1→M3 transition, but only with a documented retirement plan (see P5-OWN-008 in § 3).

### P5-OWN-002 — Canonical Inventory Model — RULED

Sole inventory source of truth: `inventory_transactions`, `inventory_transaction_entries`, `inventory_balances`, `inventory_reservation_headers/lines/allocations`, and Phase 2 RPCs (`post_inventory_transaction`, `create_reservation`, `cancel_reservation`). **Direct writes to `products.stock` or any legacy stock column are forbidden.** Any code path that mutates them must be removed or gated off before Alpha.

### P5-OWN-003 — Commerce Order Model — RULED

A new Borvat Direct order model will be introduced:
- Customer parent order.
- Merchant sub-order per merchant in the cart.
- Merchant order lines linked to `catalog_skus` and reservations.
- Snapshotted shipping profile, tax version, payment intent, and status timeline.

Bol order tables (`channel_order_*`) remain a **channel ingress model only** and must not be reused as the general Borvat Direct order model.

### P5-OWN-004 — Legacy `place_order` Containment — RULED

Historical migrations remain immutable. A new additive migration must, before any Alpha checkout traffic:
1. `REVOKE EXECUTE ON FUNCTION public.place_order(...) FROM PUBLIC, anon, authenticated`.
2. Mark it deprecated in a machine-checkable way (comment + registry row).
3. Feature-flag or remove the legacy checkout route so no client can call it.
4. Provide a data-migration plan for any existing rows created via it.
5. Ship evidence (grep of `src/**`) that no route or client still depends on it.

The function is **not dropped** in Phase 5 (dependency scan first), but it must be un-callable from any authenticated session.

### P5-OWN-005 — Secret Storage — RULED

Final model:
- Real secrets (Bol `client_secret`, refresh tokens, webhook signing keys) live in Vault / secret manager only.
- Database stores `secret_ref` + non-sensitive metadata only.
- No ciphertext of client secrets or refresh tokens in Postgres.
- Secrets never appear in API responses, logs, or audit rows.
- Any legacy ciphertext columns must be inventoried and given a retirement migration.
- Decryption keys must not live in the same database.
- `BOR-DEC-011` is updated once this is implemented and tested.

### P5-OWN-006 — Legacy RLS Remediation — RULED

Historical migrations remain immutable. New additive migrations must re-issue policies on legacy tables with explicit roles (`TO authenticated`, `TO anon`, `TO service_role` only where documented), a written GRANT matrix, cross-tenant negative tests, and direct-access negative tests. Blanket `PUBLIC` policies on user-owned data are prohibited in Alpha.

### P5-OWN-007 — Payment Truth — RULED

Phase 5 runs Stripe **Test Mode only**. Server re-computes item price, tax, shipping, and discounts; client-supplied totals are ignored. `PaymentIntent` creation is server-side. Orders transition to `paid` only after a verified, idempotent Stripe webhook. No real payouts and no merchant funds custody in Phase 5.

---

## 3. Open decisions requiring owner ruling

The following five decisions were surfaced by M0 and have **no owner ruling yet**. Until ruled, the *safe default* column applies and any milestone in the *Blocks* column cannot start.

### P5-OWN-008 — Legacy `public.products` retirement path

| Field | Content |
|---|---|
| **Question** | Which retirement path do you approve for `public.products` (allowed only as temporary compatibility layer per P5-OWN-001)? |
| **Proven problem** | Storefront routes (`src/routes/index.tsx`, `product.$id.tsx`, `c.$slug.tsx`, `search.tsx`, `cart.tsx`, `wishlist.tsx`) read from `public.products`, which has 19 columns including `stock`, `price`, `seller_id`. Phase 2 canonical tables (`catalog_products`, `catalog_skus`) are populated only for seeded Phase 2 tests. Storefront cannot switch to the canonical model without a mapping layer or a data backfill. |
| **Evidence** | Tables: `public.products` (19 cols, 6 policies), `catalog_products` (11 cols), `catalog_skus` (8 cols), `channel_listings` (15 cols). Routes: `src/routes/index.tsx`, `src/routes/product.$id.tsx`, `src/routes/c.$slug.tsx`, `src/routes/search.tsx`, `src/routes/cart.tsx`. Seed script: `scripts/seed-buyer-catalog.ts` writes to `products`, not `catalog_products`. Migration `20260724195929_*.sql` adds `brand/highlights/specs/gallery` to `products` (not to canonical). |
| **Options** | **A.** Backfill: one-shot migration copies `products` rows into `catalog_products` + `catalog_skus` + a synthetic `channel_listings` row per merchant, storefront reads only canonical, `products` becomes a view over canonical. **B.** Dual-write bridge: keep `products` writable during M1 only via a trigger that mirrors into canonical, storefront migrates route-by-route, `products` frozen at end of M3. **C.** Hard cutover in M1: no bridge, storefront rewritten to canonical in M1, existing seed data re-seeded into canonical. |
| **Recommendation** | **A (backfill + view)**. Deterministic, single source of truth from day one, no dual-write race, view lets existing SQL keep compiling during route migration. |
| **Impact — A** | +1 migration (backfill + view swap), storefront routes changed in M1 & M3, seed script rewritten, low run-time risk, tests must assert `products` is a view not a table before Alpha. |
| **Impact — B** | +2 migrations (trigger, freeze), higher complexity, race window on writes, more test surface, slower to retire. |
| **Impact — C** | Largest M1 blast radius, storefront outage risk if canonical seed incomplete, hardest rollback. |
| **Risks** | A: view performance on hot storefront queries — mitigated by materialised projection later. B: divergence between the two stores if trigger fails silently. C: storefront regressions during M1. |
| **Blocks** | M1 (merchant stores + listing publication reads canonical), M3 (checkout must reserve against canonical SKUs). Does **not** block M2 shipping/tax design. |
| **Safe default** | **A** (backfill + view). No writes to `products` accepted after the migration lands. |

### P5-OWN-009 — Storefront read model for merchant listings

| Field | Content |
|---|---|
| **Question** | When the storefront lists a product, does it read from `channel_listings` filtered to a "Borvat Direct" channel account per merchant, or from a dedicated `merchant_storefront_listings` projection? |
| **Proven problem** | `channel_listings` today models Bol/marketplace listings and carries `channel_account_id`. Borvat Direct needs an equivalent per-merchant publication row, but reusing `channel_listings` couples the storefront to Bol-specific columns. |
| **Evidence** | `channel_listings` (15 cols, 3 policies), `channel_accounts` (9 cols, 3 policies). `PHASE_5_EXECUTION_SPEC_V1` § M1 defines "Merchant Store". No `merchant_storefront_*` table exists. |
| **Options** | **A.** Reuse `channel_listings` with a reserved system `channel_accounts` row per merchant of type `borvat_direct`. **B.** New table `storefront_listings(company_id, sku_id, price, status, ...)` distinct from channel model. **C.** Polymorphic: rename `channel_listings` → `sku_publications` and discriminate by kind. |
| **Recommendation** | **A**. Reuses proven Phase 2/3 invariants (one-in-flight, RLS, outbox already keyed on `channel_account_id`) and lets the storefront share the outbox/reconciliation machinery. |
| **Impact — A** | +1 seed migration (system channel account per company), storefront queries filter by `channel_account.kind = 'borvat_direct'`, small. |
| **Impact — B** | +1 new table + policies + tests, duplicated invariants, larger. |
| **Impact — C** | Rename touches every Phase 3/4 migration reference — high risk. |
| **Risks** | A: semantic overload of "channel"; mitigated by a `kind` column on `channel_accounts` and clear docs. |
| **Blocks** | M1. |
| **Safe default** | **A**. |

### P5-OWN-010 — Tax version binding

| Field | Content |
|---|---|
| **Question** | Which entity carries the tax-version snapshot on a Borvat Direct order line: the parent order, the merchant sub-order, or the line? |
| **Proven problem** | Phase 5 spec § M2 requires versioned VAT so a rate change never retro-changes an existing order. No tax table exists yet. |
| **Evidence** | No `tax_rates` or `tax_versions` table in `public`. `PHASE_5_EXECUTION_SPEC_V1` § M2. |
| **Options** | **A.** Snapshot `tax_version_id` on each order **line** (fine-grained, supports mixed-rate carts). **B.** Snapshot on merchant sub-order (one rate per merchant). **C.** Snapshot on parent order (one rate per checkout). |
| **Recommendation** | **A**. Only correct model when a cart mixes 21%, 9%, and 0% items (books, food, standard goods) — realistic for NL. |
| **Impact — A** | Line-level FK, straightforward. |
| **Impact — B/C** | Simpler now, breaks the first mixed-rate cart. |
| **Risks** | A: slightly bigger line rows. |
| **Blocks** | M2, M3. |
| **Safe default** | **A**. |

### P5-OWN-011 — Multi-merchant cart atomicity boundary

| Field | Content |
|---|---|
| **Question** | On checkout with items from N merchants, is reservation **all-or-nothing across all merchants**, or **per-merchant partial success**? |
| **Proven problem** | Phase 5 spec § M3 mandates atomic reservation; Phase 2 § 21 already bans partial short reservations at the reservation-header level. Behaviour across merchants is not yet defined. |
| **Evidence** | `create_reservation` RPC scoped to one company. `PHASE_5_EXECUTION_SPEC_V1` § M3. Phase 2 §21 amendments. |
| **Options** | **A.** All-or-nothing across all merchants — one merchant out of stock cancels the whole checkout. **B.** Per-merchant partial success — buyer pays for the merchants that succeeded, others are dropped with a notice. |
| **Recommendation** | **A** for Alpha. Simpler payment reconciliation, fewer partial-refund edge cases, matches Phase 2 §21 spirit. Revisit post-Alpha. |
| **Impact — A** | Single Stripe PaymentIntent, single failure path, matches Phase 2 semantics. |
| **Impact — B** | N sub-intents or splits, refund flow required in Alpha, larger. |
| **Risks** | A: worse UX when one merchant is short. B: refund + partial-fulfilment complexity. |
| **Blocks** | M3, M4. |
| **Safe default** | **A**. |

### P5-OWN-012 — Comms outbox reuse vs new stream

| Field | Content |
|---|---|
| **Question** | Do transactional buyer/merchant emails (order confirmed, shipped, delivered) ride the existing `outbox_events` stream, the `shipment_outbox_events` stream, or a **new** `comms_outbox_events` stream? |
| **Proven problem** | Existing streams enforce channel-listing / shipment one-in-flight invariants that are irrelevant for email. Overloading them risks blocking listing publication behind an email retry. |
| **Evidence** | `outbox_events` (19 cols, partial unique index `one_in_flight_per_target`), `shipment_outbox_events` (16 cols). `PHASE_5_EXECUTION_SPEC_V1` § M8. |
| **Options** | **A.** New `comms_outbox_events` with its own claim/complete/fail RPCs mirroring Phase 3 M2 shape. **B.** Reuse `outbox_events` with a new event-type discriminator. **C.** Direct send from server functions, no outbox. |
| **Recommendation** | **A**. Preserves invariants of the existing streams, reuses the audited pattern, isolates comms failures. |
| **Impact — A** | +1 table, +3 RPCs, +worker, ~1 migration. |
| **Impact — B** | Cross-contaminates listing outbox invariants. |
| **Impact — C** | No retry, no audit — unacceptable for Alpha. |
| **Risks** | A: minor duplication of Phase 3 code — mitigated by extracting a shared helper. |
| **Blocks** | M8. Does not block M1–M4. |
| **Safe default** | **A**. |

---

## 4. Status of the mandatory M0 execution artefacts

Per owner instruction, M0 closure requires explicit status per artefact. **Absence of execution is not implicit success.**

| Artefact | Status | Notes |
|---|---|---|
| Clean-room migration run from empty DB | **NOT EXECUTED** | Out of read-only scope. Deferred to M10 alpha rebuild. |
| Re-run of all Phase 1–4 test suites | **NOT EXECUTED** | Historical 633/633 remains claimed-but-unverified. Deferred to M10. |
| Migration file hashes vs external manifest | **NOT EXECUTED** | No external manifest exists to compare against. Recommend introducing one during M0 closure. |
| Baseline failure inventory | **NOT EXECUTED** | Nothing to inventory without a run. |
| Preflight source of truth | **COMPLETED** | Both production schema (`pg_catalog`, `pg_policies`, `pg_proc`) **and** repository migrations (`supabase/migrations/*.sql`) were inspected. |
| Drift check production ↔ repository | **BLOCKED** | Requires clean-room replay to compute a diff. Cannot be answered under read-only rules. Recommend as first Phase 5 execution task. |
| Stop Conditions identified (§ 3 of preflight) | **COMPLETED** | 4 stop conditions documented; each maps to one or more decisions above. |

Explicit consequence: **M0 is not closed** until the *NOT EXECUTED* and *BLOCKED* rows above have an owner-approved execution plan (see the companion `PHASE5_M0_BASELINE_REMEDIATION_PLAN.md`).

---

## 5. What happens next

1. Owner reviews § 3 (decisions P5-OWN-008 … 012).
2. Owner reviews § 4 execution-artefact status and rules on whether M0 closes on the current evidence or requires the clean-room replay first.
3. Owner reviews the companion `PHASE5_M0_BASELINE_REMEDIATION_PLAN.md` (plan only, no execution).
4. Only after explicit written approval of both documents does M1 open.

Until then: no migration, no schema change, no code change to production surfaces. Halt.
