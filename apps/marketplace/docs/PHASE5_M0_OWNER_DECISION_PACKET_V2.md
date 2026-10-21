# PHASE 5 — M0 OWNER DECISION PACKET V2

**Status:** V2 — supersedes V1.
**Date:** 2026-07-24
**Precedence:** Where this file conflicts with V1 or any earlier text, V2 supersedes.
**Scope of authorization from V2:** Baseline verification only. R2 – R9 remain blocked.

---

## 1. Decisions 001 – 007 (previously approved, conditions clarified)

> **CORRECTION 2026-07-24 (append-only):** V2's earlier table repurposed `P5-OWN-007` as the "7th merchant test". That collides with the original approved meaning of `P5-OWN-007` (Payment Truth). The original meaning is restored below, and the 7th-merchant test is re-issued under the new identifier `P5-OWN-013`. See `BOR-DEC-022` in the decision log.

| ID | Topic | V2 restatement |
|---|---|---|
| P5-OWN-001 | Canonical product model | `catalog_products` + `catalog_skus` + `channel_listings` are the sole product truth. Storefront must migrate reads first, writes second, and legacy `products` becomes a read-only compatibility view (see P5-OWN-008 conditions). |
| P5-OWN-002 | Inventory ledger enforcement | All stock movements route through Phase 2 canonical RPCs. Direct `products.stock` mutations are forbidden and must be blocked at the database boundary, not by CI alone. |
| P5-OWN-003 | Order model | Parent order + merchant sub-orders + append-only status events. No direct INSERT/UPDATE from `authenticated` on commerce tables (see § 3.I of the owner directive). |
| P5-OWN-004 | Legacy `place_order` retirement | Function is contained (grants revoked) and callers migrated to the new canonical checkout in M3. Rollback in production is **forward-fix**, not re-grant. Reference: `PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md` + hotfix `P5-HF-001` (AUTHORISED AND APPLIED 2026-07-24, see `docs/PHASE5_P5_HF_001_REPORT.md` and `BOR-DEC-021`). |
| P5-OWN-005 | Secret storage | Vault-referenced `secret_ref` columns only. No plaintext, no pattern-based reject trigger. Migration split into R4a/R4b/R4c (inventory → operational Vault migration → drop legacy columns + rotate). |
| P5-OWN-006 | RLS baseline | Full role-scoped policy matrix required (§ 3.D). No blanket `authenticated` writes on commerce/order/payment/inventory tables. Trusted RPCs perform sensitive writes. |
| P5-OWN-007 | Payment truth (RESTORED) | Stripe **Test Mode only** in Phase 5. Prices, tax, shipping and discounts are recomputed **server-side**; the client never supplies the trusted amount. Order transitions to `paid` **only** after a verified idempotent webhook. No payouts, no fund custody, no live PSP in Phase 5. |
| P5-OWN-013 | Seventh Merchant Portability Test (RE-ISSUED) | Adding a seventh external merchant must succeed as a normal tenant with zero code change, zero schema change, no hardcoding, and no exception grants. The six founding merchants receive no permanent technical privileges. Verified in M7 with an explicit E2E scenario. |

## 2. Decisions 008 – 012 (owner ruling recorded here)

### P5-OWN-008 — Legacy `products` retirement
- **Ruling:** Option A — APPROVED WITH CONDITIONS.
- **Path:** backfill → rename `public.products` → `public.products_legacy` → create `public.products` as read-only view → block all writes.
- **Binding conditions:**
  1. Full dependency scan before rename/swap: FKs, views, RPCs, triggers, policies, source routes, seed scripts, reports.
  2. Persistent mapping table `legacy_product_mappings(legacy_product_id, company_id, catalog_product_id, catalog_sku_id, storefront_listing_id, backfill_batch_id, source_hash, created_at)` — not JSON metadata.
  3. Unmapped/unowned rows go to an exception queue; ownership is never guessed.
  4. Legacy IDs preserved or explicitly mapped for every downstream relation.
  5. `products_legacy` is **not** dropped during Phase 5.
  6. Once real orders reference the canonical model, destructive rollback is forbidden — forward-fix only.

### P5-OWN-009 — Storefront read model
- **Ruling:** Option A — APPROVED WITH CONDITIONS.
- **Model:** `channel_accounts.kind = 'borvat_direct'` represents Borvat as an internal channel; publication uses `channel_listings`.
- **Binding conditions:**
  - DB constraint prohibits mixing `borvat_direct` with external OAuth/`secret_ref`, live dispatch, or external reconciliation.
  - Unique constraint ensures at most one `borvat_direct` `channel_account` per company.
  - `merchant_stores` remains an independent domain object (name, slug, branding, status, sale terms, returns policy, shipping profiles, customer-facing info) and is **not** replaced by `channel_accounts`.
  - `channel_accounts` is a publication/integration surface, not the storefront identity.

### P5-OWN-010 — Tax version binding
- **Ruling:** Option A — APPROVED.
- **Order-line snapshot columns:** `tax_version_id`, `tax_rate_snapshot`, `taxable_amount_cents`, `tax_amount_cents`, `price_including_tax_cents`, plus `jurisdiction` / `tax_category` when applicable.
- **Rules:** paid lines are immutable; tax versions in use cannot be edited (only superseded); overlapping periods for the same `(tax_code, jurisdiction)` rejected by exclusion constraint. Seeded rates require external legal confirmation at implementation time; plan-time numbers are not legal approval.

### P5-OWN-011 — Multi-merchant cart atomicity
- **Ruling:** Option A — APPROVED FOR ALPHA.
- **Rule:** ALL-OR-NOTHING across the full cart in a single trusted DB transaction. No application-level chained `create_reservation` calls. Locks acquired in a deterministic order (company → sku → inventory row) to avoid deadlocks. On any failure: rollback reservations, allocations, parent order draft, merchant order drafts, payment prep state. No final PaymentIntent before full reservation success.
- **Deferred:** partial-merchant checkout reconsidered post-Alpha only by a fresh owner decision.

### P5-OWN-012 — Communication outbox
- **Ruling:** Option A — APPROVED.
- **Streams:** dedicated `comms_outbox_events` + `comms_outbox_dead_letters` with their own RPCs and worker.
- **Requirements:** idempotency/dedupe key mandatory; template id + template version; locale; recipient type; order/channel source; `company_id`; retry/backoff; lease recovery; DLQ workflow; PII/secret redaction in logs; per-channel compliance policy evaluated before send; Bol order emails never converted to Borvat marketing/loyalty; suppression/unsubscribe and transactional-vs-marketing classification enforced at send time; rate limiting; DLQ admin procedure.

## 3. Amendments to prior packet text (owner directive § 3, applied)

- Rename `R1` → `M0-E1`. Not a migration. Not committed under `supabase/migrations/`.
- Baseline regression suites must be re-run in scratch/test **before** any schema-changing remediation, per V2 verification report § 3.
- R2 rollback is forward-fix or a temporary compatibility RPC, never re-grant of the vulnerable function.
- R3 GRANT matrix rewritten (see plan V2 § R3): no blanket writes to `orders`, `order_items`, or any commerce table from `authenticated`.
- R4 replaced by R4a/R4b/R4c; pattern-based reject trigger is removed from the plan.
- R5 blocked on `PHASE5_R5_DEPENDENCY_AND_MAPPING_REPORT.md`; adds the mapping table required by P5-OWN-008.
- R6 broadened beyond CI grep to cover `src/**`, migrations, SQL functions, triggers, edge workers, test helpers, scripts, generated server functions, and adds a DB test that direct stock mutation fails.
- R7/R8 reordered: tax versions ship first, order model second.
- R9 hardened per P5-OWN-012.

## 4. Mandatory outputs status (from V1)

| Output | Status |
|---|---|
| Migration manifest | Present at `docs/PHASE5_M0_MIGRATION_MANIFEST.json` (repo-side hashes; live-replay hashes pending M0-E1). |
| Baseline regression evidence | Pending M0-E1. Table in verification report § 3. |
| Drift diff | Pending M0-E1. |
| `place_order` exposure report | Delivered. Hotfix `P5-HF-001` proposed, owner approval required. |
| RLS matrix | Rewritten in plan V2 § R3. |
| Vault migration plan | Rewritten in plan V2 § R4a/b/c. |
| Product backfill dependency + mapping report | Blocked until owner authorises R5 phase. Placeholder path: `docs/PHASE5_R5_DEPENDENCY_AND_MAPPING_REPORT.md`. |

## 5. Halt

The only authorised work now is baseline verification and the deliverables listed in the owner directive § 4. R2 – R9 and M1 remain blocked pending an explicit `BASELINE ACCEPTED — R2 AUTHORIZED` decision.
