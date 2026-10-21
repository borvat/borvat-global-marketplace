# PHASE 5 — M0 READ-ONLY PREFLIGHT REPORT

**Date:** 24 July 2026
**Author:** Lovable engineering agent
**Mode:** Read-only inspection. No migrations executed. No code, schema or data changed during M0.
**Reference documents inspected:**
- `docs/BORVAT_MASTER_BLUEPRINT_V1.md`
- `docs/BORVAT_CURRENT_STATE_V1.md`
- `docs/BORVAT_DECISION_LOG_V1.md`
- `docs/BORVAT_PHASE_5_EXECUTION_SPEC_V1.md`
- `ARCHITECTURE_PROPOSAL.md` (Revisions 2, 3, 3.1)
- All Phase 1–4 closure reports and charters

**Final verdict (§ 12):** `NOT READY` — Phase 5 cannot begin M1 until the blocking Stop Conditions in § 3 are resolved by owner decision. This is a governance halt, not a rejection of the plan.

---

## 1. Real project state (evidence-based)

### 1.1 Migrations physically present
`supabase/migrations/` contains **36 migration files** dated 2026-07-23 → 2026-07-24. They correspond to the Phase 0 → Phase 4 M5 baseline described in `BORVAT_CURRENT_STATE_V1.md`. No Phase 5 migration exists. The latest migration is
`20260724195929_8cebda88-d1dd-4bf3-b032-28173668d808.sql` — a purely additive change to `public.products` adding `brand`, `highlights`, `specs`, `gallery`.

**Not verified in M0 (would require execution, forbidden):**
- Clean-room rebuild from an empty database.
- Reproducing the historical 633 test count from a fresh checkout.
- Migration file hashes vs any external manifest.

### 1.2 Live database inventory (60 tables in `public`)

Grouped by owning phase:

| Phase | Tables |
|---|---|
| Phase 0 (buyer MVP, still live) | `products`, `categories`, `cart_items`, `orders`, `order_items`, `wishlist_items`, `profiles`, `product_suggestions`, `seller_bol_credentials` (legacy) |
| Phase 1 (tenancy) | `companies`, `company_members`, `company_member_roles`, `system_company_roles`, `permissions`, `role_permissions`, `user_roles`, `agent_audit_log`, `agent_memory` |
| Phase 2 (catalog + inventory + fulfilment) | `catalog_products`, `catalog_skus`, `catalog_offers`, `catalog_offer_components`, `warehouses`, `warehouse_locations`, `inventory_balances`, `inventory_lots`, `inventory_serials`, `inventory_dispositions`, `inventory_transactions`, `inventory_transaction_entries`, `inventory_reservation_headers`, `inventory_reservation_lines`, `inventory_reservation_allocations` |
| Phase 3 (outbox + reconciliation) | `outbox_events`, `outbox_dead_letters`, `channel_accounts`, `channel_listings`, `channel_listing_audit`, `channel_snapshot_batches`, `channel_snapshots`, `channel_reconciliation_reports`, `channel_reconciliation_findings`, `channel_sync_cursors`, `channel_sync_runs` |
| Phase 4 M1–M5 (Bol channel) | `channel_connections`, `channel_connections_safe` (view), `channel_api_audit`, `channel_kill_switches`, `channel_import_batches`, `channel_imported_offers`, `channel_ean_map`, `channel_order_inbox`, `channel_orders`, `channel_order_lines`, `channel_order_events`, `channel_shadow_dispatches`, `channel_live_dispatches`, `channel_shipments`, `channel_shipment_events`, `shipment_outbox_events`, `shipment_outbox_dead_letters` |

### 1.3 Live database inventory — RPCs (representative)
Confirmed present via `pg_proc`:
- **Auth / tenancy:** `has_role`, `company_member_has_permission`, `transfer_company_ownership`, `_companies_after_insert_bootstrap_owner` (trigger fn), `_company_member_roles_guard_owner_role`.
- **Inventory & reservation:** `post_inventory_transaction`, `create_reservation`, `cancel_reservation`, `_refresh_reservation_status`.
- **Channel control plane:** `authorize_channel_live`, `begin_offer_import_batch`, `close_offer_import_batch`, `begin_sync_run`, `link_imported_offer_to_sku`, `reject_imported_offer`.
- **Bol write plane:** `bol_enqueue_offer_price_set`, `..._stock_set`, `..._fulfilment_set`, `..._delivery_promise_set`, `..._resync`, `_p4_enqueue_bol_write`.
- **Bol orders + shipments:** `ingest_bol_order`, `_p4_resolve_initial_line_state`, `cancel_bol_order_line`, `record_internal_ship_and_enqueue_confirmation`.
- **Outbox workers:** `claim_outbox_batch`, `complete_outbox_event`, `complete_outbox_event_shadow`, `complete_outbox_event_live`, `defer_outbox_event`, `claim_shipment_outbox_batch`, `complete_shipment_outbox_event`.
- **Reconciliation:** `open_reconciliation_batch`, `record_channel_snapshot`, `close_reconciliation_batch`, `run_reconciliation`, `reenqueue_drift_finding`.
- **Suggestions:** `decide_product_suggestion`.
- **Legacy buyer MVP:** `place_order` — see § 3.1.

### 1.4 Frontend surface (`src/routes/**`)
- **Buyer:** `index.tsx`, `search.tsx`, `c.$slug.tsx`, `product.$id.tsx`, `cart.tsx`, `_authenticated/checkout.tsx`, `_authenticated/orders.tsx`, `_authenticated/wishlist.tsx`, `seller.$id.tsx`, `seller.tsx`, `account.tsx`, `auth.tsx`.
- **Seller:** `_authenticated/seller.dashboard.tsx`, `seller.products.tsx`, `seller.products.new.tsx`, `seller.products.$id.edit.tsx`, `seller.orders.tsx`, `seller.suggestions.tsx`.
- **Admin dashboard:** **absent.** No route directory or component exists.
- **MCP:** `src/routes/mcp.ts`, `src/routes/[.mcp]/*`, 20 tools under `src/lib/mcp/tools/`.
- **Workers:** `src/lib/outbox/{worker.ts,bol-worker.ts,bol-adapter.ts,mock-adapter.ts}` (Phase 3 + Phase 4 M4).

### 1.5 Tests physically present
16 test scripts under `scripts/`. Line counts (not assertion counts):

```
phase1-tenancy-tests.ts    395    phase4-m1-tests.ts          420
phase2-mig1-tests.ts       281    phase4-m2-tests.ts          417
phase2-mig2-tests.ts       427    phase4-m3-tests.ts          561
phase2-mig3-tests.ts       307    phase4-m4-adapter-tests.ts  842
phase2-mig4-tests.ts       319    phase4-m4-tests.ts          488
phase3-m1-tests.ts         350    phase4-m5-tests.ts          658
phase3-m2-tests.ts         568    security-tests.ts           182
phase3-m3-tests.ts         448    redaction-tests.ts          107
```

The historical **633 tests-passed** figure in `BORVAT_CURRENT_STATE_V1.md` § 2 is **not re-verified in M0** (execution was out of scope). It must be treated as claimed-but-unverified until Phase 5 clean-room rebuild in M10.

### 1.6 RLS coverage
`pg_policies` reports policies on every Phase 1–4 table listed above. Notable, verbatim from the DB:

| Table | Policy | cmd | Roles |
|---|---|---|---|
| `products` | `products_public_read_published` | SELECT | anon, authenticated |
| `products` | `products_seller_read_own` / `_update_own` / `admin manages all products` | mixed | authenticated |
| `orders` | `users read own orders` / `users create own orders` | SELECT / INSERT | **public** |
| `order_items` | `buyer reads own order items` / `buyer inserts own order items` / `seller reads own order items` | SELECT / INSERT / SELECT | **public** |
| `cart_items` | `users manage own cart` | ALL | **public** |
| `channel_connections` | `members view own company connections` (SELECT only) | SELECT | authenticated |
| Phase 2/3/4 tables | tenant-scoped `company_member_has_permission(...)` / owner-only patterns | mixed | authenticated |

Policies attached to `roles={public}` grant anon PostgREST access; they are only safe because their `USING`/`WITH CHECK` clauses require `auth.uid()`. This is a legacy Phase 0 shape and should be normalised to `authenticated` during Phase 5 M3 hardening.

### 1.7 Governance docs
All four governance documents are present in `docs/` and were read in full:
- `BORVAT_MASTER_BLUEPRINT_V1.md`
- `BORVAT_CURRENT_STATE_V1.md`
- `BORVAT_DECISION_LOG_V1.md` (14 approved decisions, latest BOR-DEC-014)
- `BORVAT_PHASE_5_EXECUTION_SPEC_V1.md` (1,556 lines)
plus `README_BORVAT_GOVERNANCE.md`, `PHASE_5_PROGRAMMER_START_COMMAND.txt`, and all Phase 2/3/4 closure reports.

---

## 2. Reuse / Extend / Missing matrix

### 2.1 Reusable **without change** (Phase 5 must build on top of these, not replace them)

| Concern | Canonical asset |
|---|---|
| Tenancy identity | `companies`, `company_members`, `company_member_roles`, `system_company_roles`, `permissions`, `role_permissions`, `has_role`, `company_member_has_permission`, `transfer_company_ownership` |
| Canonical product/SKU/offer | `catalog_products`, `catalog_skus`, `catalog_offers`, `catalog_offer_components` |
| Warehouses & locations | `warehouses`, `warehouse_locations` |
| Inventory ledger | `inventory_transactions`, `inventory_transaction_entries`, `inventory_balances`, `inventory_lots`, `inventory_serials`, `inventory_dispositions`, `post_inventory_transaction` |
| Reservation engine | `inventory_reservation_headers/lines/allocations`, `create_reservation`, `cancel_reservation` |
| Outbox + workers | `outbox_events`, `outbox_dead_letters`, `claim_outbox_batch`, `complete_outbox_event*`, `defer_outbox_event`, `src/lib/outbox/worker.ts` |
| Channel model (external) | `channel_accounts`, `channel_connections` (secret_ref), `channel_listings`, `channel_kill_switches`, `channel_api_audit`, `channel_sync_runs/cursors` |
| Bol adapter & shipment stream | `bol-adapter.ts`, `channel_shipments`, `channel_shipment_events`, `shipment_outbox_events`, `record_internal_ship_and_enqueue_confirmation` |
| Reconciliation | `channel_snapshot_*`, `channel_reconciliation_*`, `run_reconciliation` |
| Audit | `agent_audit_log` (append-only), `channel_api_audit` (with token-redaction triggers) |

### 2.2 Needs **extension** (additive, must not fork a second source of truth)

| Concern | Existing anchor | Phase 5 extension |
|---|---|---|
| Borvat as a channel | `channel_accounts` + `channel_listings` | Add a well-known `channel_accounts` row per company representing `channel = 'borvat'`, with new `borvat_marketplace_listings` extension table keyed 1:1 to `channel_listings.id` for gross price, tax_category, shipping_profile, publication metadata, moderation state. **Do not** duplicate SKU/product into a `marketplace_products` table (§ 4.2 forbids it). |
| Storefront read model | `catalog_products` + `catalog_skus` | Add public read views scoped to `active` merchant store + `active` listing. Add narrow `TO anon` SELECT policies on the views only, projecting safe columns. |
| Buyer identity | `profiles` (id, email) | Extend with `customer_addresses`, `customer_consents`, `customer_order_access` tables. Keep `profiles` as the pivot. |
| Inventory availability for storefront | `inventory_balances` (on_hand, reserved, safety-buffer) | Add read-only exposure via a function (no direct table grant to anon). |
| Reservation source_kind | `create_reservation(_source_kind, _source_id, _lines)` | Add new source kind values (`checkout_session`, `borvat_order`) — no schema change required if the parameter is text. To be verified in M3 against the current CHECK. |
| Outbox | `outbox_events` (currently keyed per `channel_listing`) | Reserve a new `aggregate_type` namespace (`borvat_order`, `checkout`, `payment`, `refund`, `return`, `communication`, `usage_meter`) with its own `one_in_flight_per_target` semantics if needed; alternatively add a parallel `commerce_outbox_events` stream. Owner decision required (§ 6). |
| Communications | Static templates under `src/lib/email-templates/*` and `send-email.ts` | Add persistent `communication_outbox` with idempotency key + template version + source policy. Do **not** rely on the current fire-and-forget send path. |

### 2.3 **Missing entirely** (must be created additively in Phase 5)

Nothing in `public` today implements:

- `merchant_stores` (store identity distinct from `companies`), store status machine, slug.
- `shipping_profiles`, `shipping_zones`, `shipping_methods`, `shipping_rules`, `shipping_quote_snapshots`.
- `carts` (parent), `cart_quote_versions`, `checkout_sessions`, checkout state machine.
- `payment_attempts`, `payment_provider_events`, `payment_allocations`, `refunds`, `refund_events`.
- Parent marketplace `order` + merchant `suborder` + line snapshots (title, unit_gross/net/tax, commission version, fulfillment node, address snapshots).
- `return_requests`, `return_items`, `return_events`, `return_inspections`.
- `tax_categories`, `tax_rates` (versioned), tax-resolution RPC.
- `customer_addresses`, `customer_consents`, `customer_order_access`.
- `subscription_plans`, `merchant_subscriptions`, `usage_events`, `billing_periods`, `invoice_previews`, `invoice_preview_lines`.
- Platform `feature_flags` / global kill switches (only `channel_kill_switches` scoped to Bol exists).
- `platform_roles` distinct from `system_company_roles`, `support_access_sessions`, admin audit stream.
- Admin dashboard UI (no route directory).
- Seller Operations Dashboard action queues (current `seller.dashboard.tsx` is a 3-stat placeholder).
- Stripe test-mode payment adapter (`checkout.tsx` calls `place_order` directly with no PSP).

---

## 3. Conflicts, dual sources of truth, and Stop Conditions

Per Phase 5 spec § 21, the following are **binding Stop Conditions** discovered by M0. Each is documented, not fixed.

### 3.1 STOP — `place_order` violates Phase 2/§3/§7/§8 simultaneously

`public.place_order(p_user_id uuid, p_total_cents integer, p_shipping_address jsonb)` (body inspected in full via `pg_get_functiondef`) currently:

1. Accepts `p_user_id` as a **client parameter** instead of `auth.uid()` → any authenticated caller can create orders for any other user (privilege escalation; violates § 3.4, § 15.1–15.3).
2. Accepts `p_total_cents` from the client and inserts it as the order total → **price manipulation** (violates § 3.4, § 8.3 "amount cannot be modified from frontend").
3. Reads/decrements `public.products.stock` (Phase 0 column) and **bypasses `inventory_balances`, `create_reservation`, `post_inventory_transaction` entirely** → dual source of truth for inventory (violates § 3.3, § 4.1, § 21).
4. Sets `orders.status = 'paid'` synchronously with no PSP verification → violates § 8.3 and DoD.
5. Non-atomic `IF r.stock < r.quantity … UPDATE stock` inside a `FOR` loop with no row lock or advisory lock → **oversell under concurrency** (violates § 7.4 last-unit invariant).
6. No `client_request_id` / idempotency key → violates § 3.5 and § 7.3.
7. No parent/merchant sub-order — a single flat `orders` row + `order_items` — cannot express multi-merchant checkout, per-merchant shipping totals, or independent merchant fulfilment (violates § 5.6).

Frontend proof: `src/routes/_authenticated/checkout.tsx` is the only surface referencing Stripe/payment terms and it calls `place_order` — there is no PSP intent creation, no webhook verification path.

### 3.2 STOP — Dual product/order source of truth

`public.products` (19 cols; buyer-facing; RLS `products_public_read_published`) is the storefront's source of product identity, stock and price. `catalog_products/catalog_skus/catalog_offers` (Phase 2) is the canonical model but **is not wired to any buyer surface**. Similarly `orders/order_items` is disjoint from the canonical parent/merchant order model Phase 5 requires. Continuing to build M1 on top of `public.products` without a documented migration path re-creates exactly the failure mode Phase 5 § 25 warns against.

### 3.3 STOP — RLS shape on `orders`, `order_items`, `cart_items` uses `roles={public}`

The policies are technically safe because their predicates check `auth.uid()`, but the shape does not match § 15 ("no broad grants by default"). It must be normalised to `TO authenticated` in Phase 5 M3.

### 3.4 STOP — No secret-storage model documentation

`BORVAT_DECISION_LOG_V1.md` BOR-DEC-011 records that channel secrets must not be stored plaintext and that "one final model must be documented." `channel_connections` uses a `secret_ref` column and `channel_connections_safe` view; a legacy `seller_bol_credentials` table also exists. `Current State V1` § 4 lists this as an open gap. Phase 5 § 15.6 requires the final model in writing before M4 (payments) touches PSP secrets. Owner decision needed.

### 3.5 STOP — Test count discrepancy carried forward

`Current State V1` § 4 flags "Phase 1: 28 vs 34" as unresolved. M0 did not execute tests to adjudicate. This must be resolved before M10 clean-room rebuild is meaningful.

### 3.6 STOP — Phase 5 § 21 items observed but **not** triggered

The following Stop Conditions from § 21 are **not** currently triggered and are recorded for completeness:
- No request in-flight to open Bol live mode.
- No proposal to hardcode any founding-six company.
- No locked Phase 1–4 migration would need to be edited under the current M1–M10 plan below.

---

## 4. Data / RLS / tenancy / idempotency risk register

| ID | Risk | Evidence | Severity |
|---|---|---|---|
| R-01 | Client-controlled order totals & user_id in `place_order` | § 3.1 | Critical |
| R-02 | Oversell race in `place_order` under concurrency | § 3.1 (5) | Critical |
| R-03 | `orders.status='paid'` set without PSP verification | § 3.1 (4) | Critical |
| R-04 | Dual product SoT: `products` vs `catalog_*` | § 3.2 | High |
| R-05 | Dual order SoT: `orders/order_items` vs canonical parent/merchant model | § 3.2 | High |
| R-06 | Buyer tables use `roles={public}` policies | § 3.3 | Medium (hardening) |
| R-07 | Secret-storage model not written down | § 3.4 | High (blocks M4) |
| R-08 | No idempotency keys on any buyer-side mutation | § 3.1 (6), § 7.3 | Critical (before M3/M4) |
| R-09 | No communication outbox — email send is fire-and-forget | § 2.3 → communications | High (before M7) |
| R-10 | `seller_bol_credentials` legacy table still present alongside `channel_connections` | § 1.2 | Medium (cleanup path needed) |
| R-11 | Historical 633-tests figure unverified from clean state | § 1.5, § 3.5 | Medium (governance) |
| R-12 | No `merchant_stores`; storefront identity implicitly = `profiles.id` (seller) | § 2.3 | High (blocks M1) |
| R-13 | No tax model; VAT-inclusive display is hardcoded in the UI (no `tax_category`/versioned rate) | § 6.5, no schema | High (blocks M2) |
| R-14 | No parent/merchant order → multi-merchant cart cannot be represented | § 5.6, § 3.2 | Critical (blocks M3) |

---

## 5. Impact of Phase 5 on the locked Phase 1–4 core

Phase 5, executed under the plan in § 7, is **additive only** and does **not** require altering any locked Phase 1–4 migration. Specific interactions:

- **Phase 1 (tenancy):** Reused as-is. Phase 5 introduces `merchant_stores` referencing `companies(id)`; no change to `company_members`.
- **Phase 2 (catalog + inventory + reservation):** Reused unchanged. Phase 5 wires the buyer storefront to `catalog_products`/`catalog_skus`/`catalog_offers` and calls `create_reservation` from `checkout_session` instead of decrementing `products.stock`. A one-way migration path retires the Phase 0 `products.stock` column at M8, gated on § 6 owner decision.
- **Phase 3 (outbox + reconciliation):** Reused. Phase 5 either (a) publishes commerce events on the same `outbox_events` table with new `aggregate_type` values, or (b) creates a sibling `commerce_outbox_events` stream mirroring the existing worker contract. Owner decision required (§ 6).
- **Phase 4 M1–M5 (Bol channel):** Reused unchanged. Phase 5 introduces Borvat as a peer channel via a new `channel_accounts` row (`channel = 'borvat'`) and a `borvat_marketplace_listings` extension table — not a fork of `channel_listings`.
- **Bol live lock:** Untouched. Phase 5 does **not** call `authorize_channel_live`.

---

## 6. Architectural decisions requiring owner approval before M1 starts

These map to Phase 5 spec §§ 4.2, 4.3, 5, 7, 8, 15.6, 22 and the six Stop Conditions above. None of them can be silently decided by the implementer.

1. **`place_order` deprecation path.** M3 replaces it with `create_checkout_session` + `finalize_paid_order`. What happens to existing rows in `orders`/`order_items`? Options: (a) freeze legacy table read-only + build new `commerce_orders` alongside, (b) rename legacy to `orders_legacy` in a Phase 5 M3 migration and cut the buyer UI over. Recommendation: (a).
2. **Storefront product source.** M1 must switch buyer routes from `public.products` to `catalog_*`. Does `public.products` become a compatibility view over `catalog_products` (owner-hidden migration), or is the buyer UI rewritten against canonical tables directly? Recommendation: rewrite against canonical, expose read via server-side views only.
3. **Outbox stream choice.** Extend `outbox_events` with new aggregate namespaces, or create sibling `commerce_outbox_events`. Recommendation: sibling stream, so the Phase 3 `one_in_flight_per_target` semantic tuned for Bol is not diluted.
4. **Borvat channel modelling.** Confirm `channel_accounts.channel = 'borvat'` + `borvat_marketplace_listings` extension table (§ 4.2 preferred path). This decision is binding: forbid `marketplace_products`.
5. **Merchant store cardinality.** One store per company for Alpha, or many? Recommendation: one, marked in a `default_store_id` on `companies` extension.
6. **Secret storage model.** BOR-DEC-011 must be closed with a written model (Vault-only vs encrypted DB vs hybrid) before M4 touches Stripe test-mode secrets.
7. **PSP scope.** Confirm Stripe test-mode is the only PSP for Phase 5, with adapter abstraction preserving Mollie/Adyen as future options. § 22 defers the production PSP.
8. **Tax model scope.** NL + BE only, VAT-inclusive display, server-side resolution with versioned rates; block checkout on tax-resolution failure (§ 6.5). Confirm.
9. **Founding-merchant flag.** Confirm this is a boolean/config value on `merchant_stores` with no code branches.
10. **Communication outbox scope.** Confirm Phase 5 introduces a persistent `communication_outbox` with idempotency + template version + source policy. The current fire-and-forget path is out of compliance with § 11.
11. **Admin/platform role model.** Confirm a `platform_roles` table separate from `system_company_roles`, with support-access sessions (§ 10.3) audited via a new stream (not `agent_audit_log`).
12. **`orders`/`order_items` legacy RLS shape.** Confirm hardening to `TO authenticated` is inside Phase 5 scope (recommended: M3 alongside `place_order` retirement).

---

## 7. Proposed M1–M10 execution plan with dependencies (migrations proposed, **not executed**)

Dependency notation `<-` = "depends on".

### M1 — Merchant Store & Borvat Listing Publication
- **Proposed migrations:** `p5_m1_merchant_stores`, `p5_m1_borvat_channel_account_seed_rpc`, `p5_m1_borvat_marketplace_listings`, `p5_m1_public_read_views`, `p5_m1_moderation_state`.
- **New tables:** `merchant_stores`, `borvat_marketplace_listings`, `merchant_store_moderation_events`.
- **New RPCs (SECURITY DEFINER, `service_role` or `company_member_has_permission`):** `create_merchant_store`, `submit_store_for_review`, `activate_store`, `suspend_store`, `publish_borvat_listing`, `unpublish_borvat_listing`.
- **RLS:** anon SELECT via views only; authenticated members via `company_member_has_permission`.
- **Tests required:** suspended store cannot checkout, inactive listing not public, cross-tenant listing edit denied, same SKU offered by different companies without ownership leakage. **≥ 20 assertions.**
- **Depends on:** owner decisions 4, 5, 9.

### M2 — Shipping Profiles, VAT & Quote Engine
- **Proposed migrations:** `p5_m2_shipping_profiles`, `p5_m2_shipping_zones_rules`, `p5_m2_tax_categories_rates`, `p5_m2_quote_snapshots`, `p5_m2_quote_engine_rpc`.
- **New tables:** `shipping_profiles`, `shipping_zones`, `shipping_methods`, `shipping_rules`, `shipping_quote_snapshots`, `tax_categories`, `tax_rates_versioned`.
- **New RPCs:** `resolve_tax(_country, _postcode, _tax_category, _at)`, `compute_shipping_quote(_cart_snapshot)`, `sign_quote_snapshot(_inputs)`.
- **Tests:** €50 threshold applies per seller only, two sellers → two shipping charges, stale quote rejected, tax-resolution failure blocks checkout, frontend cannot override shipping amount. **≥ 25 assertions.**
- **Depends on:** M1, owner decision 8.

### M3 — Multi-Merchant Cart, Checkout Session & Atomic Reservation
- **Proposed migrations:** `p5_m3_carts`, `p5_m3_cart_quote_versions`, `p5_m3_checkout_sessions`, `p5_m3_commerce_orders`, `p5_m3_place_order_deprecation`, `p5_m3_rls_hardening`.
- **New tables:** `carts`, `cart_quote_versions`, `checkout_sessions`, `commerce_orders` (parent), `commerce_merchant_orders`, `commerce_order_lines`.
- **New RPCs:** `create_checkout_session(_client_request_id, _cart_id)`, `reserve_checkout_session(_checkout_id)` → calls `create_reservation` per merchant atomically, `release_checkout_session(_checkout_id)`, `finalize_paid_order(_checkout_id, _payment_ref)`.
- **Deprecates:** `place_order` (owner decision 1).
- **RLS hardening:** normalise `cart_items`, `orders`, `order_items` policies to `TO authenticated`; freeze legacy `orders`/`order_items` writes.
- **Tests:** oversell concurrency (8 parallel checkouts on last unit), all-or-nothing reservation, idempotent `client_request_id`, changed payload with same key → conflict, expiry releases exactly once, paid session not released by expiry worker. **≥ 30 assertions incl. 3 concurrency scenarios.**
- **Depends on:** M2, owner decisions 1, 2, 3, 12.

### M4 — Payment Adapter, Stripe Test Mode & Order Finalization
- **Proposed migrations:** `p5_m4_payment_attempts`, `p5_m4_payment_provider_events`, `p5_m4_payment_allocations`, `p5_m4_refunds`, `p5_m4_refund_events`, `p5_m4_recovery_queue`.
- **New route:** `src/routes/api/public/webhooks/stripe.ts` (raw HTTP, HMAC verified) — falls under `/api/public/*` per platform rules.
- **New adapter:** `src/lib/payments/adapter.ts` + `src/lib/payments/stripe-test.ts`.
- **Tests:** redirect alone does not mark paid, duplicate webhook → single order, amount mismatch quarantined, success + worker retry → single order, partial refund updates derived state. **≥ 25 assertions incl. 2 concurrency scenarios.**
- **Depends on:** M3, owner decisions 6, 7.

### M5 — Seller Operations Dashboard
- **No new tables** (read-only reshaping over existing data), possibly small `seller_dashboard_saved_views` for UX.
- Rewrites `seller.dashboard.tsx` around action queues defined in § 9.
- **Exit gate:** non-technical staff completes full flow without SQL. Evidence: recorded screencast + E2E script.
- **Depends on:** M1–M4.

### M6 — Admin & Compliance Dashboard
- **Proposed migrations:** `p5_m6_platform_roles`, `p5_m6_support_access_sessions`, `p5_m6_admin_audit_stream`, `p5_m6_feature_flags`, `p5_m6_kill_switches_platform`.
- **New routes:** `src/routes/_authenticated/admin/*` gated by platform role.
- **Tests:** admin action requires platform role, support session expiry enforced, no silent cross-tenant mutation, kill switch blocks new action but preserves records. **≥ 15 assertions.**
- **Depends on:** M1, M3, owner decision 11.

### M7 — Communications & Source-Aware Policy
- **Proposed migrations:** `p5_m7_communication_outbox`, `p5_m7_templates_versioned`, `p5_m7_source_policy_rules`.
- **New worker:** `src/lib/comms/worker.ts` mirroring outbox worker semantics (bounded retries, dead-letter, idempotency key).
- **Tests:** Borvat order → Borvat template; Bol order → no Borvat marketing; duplicate event → single send; email failure does not roll back shipped state. **≥ 12 assertions.**
- **Depends on:** M3, M4, owner decision 10.

### M8 — Founding Six Onboarding + Seventh-Tenant Test
- **No new tables**; introduces `scripts/phase5-m8-onboarding.ts` and `scripts/phase5-m8-seventh-tenant.ts`.
- **Retires** Phase 0 `products.stock` behind a compatibility layer (owner decision 1/2).
- **Exit gate:** seventh synthetic tenant onboarded via UI/RPCs with zero code changes and zero access to founding six.
- **Depends on:** M1–M7.

### M9 — SaaS Metering & Invoice Preview
- **Proposed migrations:** `p5_m9_subscription_plans`, `p5_m9_merchant_subscriptions`, `p5_m9_usage_events`, `p5_m9_billing_periods`, `p5_m9_invoice_previews`.
- **New RPCs:** `record_usage_event(_key)` — key = `company_id + source_order_id + billable_event_type + plan_version`; `preview_invoice(_company_id, _period)`.
- **Tests:** order counted once, replay does not double-bill, tier boundary at 3,000, adjustment append-only, invoice reconciles to events. **≥ 20 assertions.**
- **Depends on:** M3.

### M10 — Security, E2E, Alpha Release Gate
- Full RLS suite regression, ≥ 8 concurrency scenarios, ≥ 15 E2E Playwright flows, observability dashboards, runbooks, rollback plan, clean-room rebuild, `PHASE_5_FINAL_REPORT.md` + 7 sibling reports (§ 19).
- **Exit gate:** owner sign-off; no Bol live; Stripe stays test; controlled Alpha flag only.
- **Depends on:** M1–M9.

**Cross-cutting hard gates enforced every milestone:** no Bol live, no Stripe live, no seller payouts, no hardcoding of founding-six, additive migrations only, every RPC pinned `SECURITY DEFINER` + `SET search_path = public`, revoke from `anon`/`authenticated` on worker RPCs, per-milestone traceability matrix.

---

## 8. Tests required per milestone (assertion floor, not test-file count)

| Milestone | Backend/RLS | Concurrency | E2E |
|---|---:|---:|---:|
| M0 | — (this report) | — | — |
| M1 | 20 | 0 | 0 |
| M2 | 25 | 0 | 0 |
| M3 | 30 | 3 | 2 |
| M4 | 25 | 2 | 2 |
| M5 | 10 | 0 | 3 |
| M6 | 15 | 0 | 1 |
| M7 | 12 | 1 | 1 |
| M8 | 15 | 1 | 2 (incl. seventh-tenant) |
| M9 | 20 | 1 | 1 |
| M10 | 8 (gap-fill) | 0 (rerun) | 3 (regression) |
| **Total** | **180** | **8** | **15** |

Matches the § 18.9 floor exactly. No inflation with shape-only tests.

---

## 9. Work-size estimate per milestone (relative units, not calendar time)

Units are "story points" style, calibrated so Phase 4 M5 (which shipped 79 tests + 1 new outbox stream + 2 tables) = **8 units**.

| Milestone | Units | Rationale |
|---|---:|---|
| M1 | 8 | New store aggregate + Borvat channel wiring + public views. |
| M2 | 10 | Shipping engine + versioned tax + quote signing is the heaviest math layer. |
| M3 | 13 | New order aggregate + cart/checkout/reservation glue + `place_order` retirement + concurrency proof. Highest risk. |
| M4 | 11 | PSP adapter + webhook route + refund state derivation + recovery queue. |
| M5 | 7 | Mostly UI wiring over existing data, but action-queue correctness matters. |
| M6 | 8 | Platform role model + support sessions + admin routes. |
| M7 | 6 | Comm outbox + templating + source policy. |
| M8 | 9 | Six real tenants + seventh test + legacy retirement. Coordination-heavy. |
| M9 | 7 | Metering engine + invoice preview. |
| M10 | 8 | E2E + clean-room + reports. |
| **Total** | **87** | |

---

## 10. Evidence appendix (files, tables, functions, migrations)

- Migrations: `supabase/migrations/2026072311*.sql` … `supabase/migrations/20260724195929_*.sql` (36 files).
- Table inventory: 60 tables in `public` (list in § 1.2).
- Legacy buyer schema: `products` (19 cols incl. `seller_id`, `stock`, `price_cents`, `image_url`, `is_active`, `is_draft`, `brand`, `highlights`, `specs`, `gallery`); `orders` (6 cols); `order_items` (16 cols incl. `tracking_*`, per-item `status`, `seller_id`).
- Legacy RPC: `place_order(p_user_id uuid, p_total_cents integer, p_shipping_address jsonb) RETURNS uuid SECURITY DEFINER` — full body in `pg_get_functiondef`; findings in § 3.1.
- Canonical stack: `catalog_products`, `catalog_skus`, `catalog_offers`, `catalog_offer_components`, `warehouses`, `warehouse_locations`, `inventory_*` (7 tables), `create_reservation`, `post_inventory_transaction`.
- Outbox stack: `outbox_events`, `outbox_dead_letters`, `claim_outbox_batch`, `complete_outbox_event*`, `defer_outbox_event`; workers `src/lib/outbox/worker.ts`, `bol-worker.ts`.
- Bol stack: `channel_connections` (with `secret_ref`, `live_authorized_at`), `channel_kill_switches`, `authorize_channel_live`, `channel_shipments`, `shipment_outbox_events`, `record_internal_ship_and_enqueue_confirmation`.
- Test scripts: 16 files in `scripts/` totalling ~6,770 lines; the 633-passed figure is historical and unverified in M0.
- Frontend gap: no admin routes; `src/routes/_authenticated/seller.dashboard.tsx` is a 90-line placeholder.
- Payments gap: `src/routes/_authenticated/checkout.tsx` is the only Stripe-related file — no adapter, no webhook route.
- Governance: BOR-DEC-001…BOR-DEC-014 approved; BOR-DEC-011 (secrets) and Phase 5 approval are open.

---

## 11. Adherence to M0 rules

- ✅ No migration executed.
- ✅ No code, schema or data changed.
- ✅ No fix applied (even trivial ones like the `roles={public}` normalisation).
- ✅ Nothing assumed from prior reports — every claim in § 1, § 3, § 5 is backed by `pg_proc` / `pg_policies` / `information_schema` / on-disk file inspection.
- ✅ Bol live untouched. Stripe live untouched. No production setting changed.
- ✅ Report structured per § 20 of the Execution Spec.

---

## 12. Verdict

**NOT READY.**

Reason: § 3 Stop Conditions 3.1–3.4 are triggered. Concretely:
- `place_order` violates four Phase 5 invariants simultaneously (auth, pricing, inventory SoT, PSP verification) and is currently the only path the buyer UI uses.
- Dual product & order sources of truth would be entrenched, not resolved, if M1 built on top of `public.products` and `public.orders`.
- Secret-storage model (BOR-DEC-011) is undocumented and must be closed before M4 handles PSP secrets.
- Twelve owner architectural decisions (§ 6) are open.

**None of these are blockers to Phase 5 itself** — they are exactly the reasons Phase 5 spec § 0.2 mandates a preflight before writing code. The recommended next step is:

1. Owner reviews and signs off § 6 decisions 1–12.
2. Owner acknowledges the four Stop Conditions above are accepted risks addressed inside Phase 5 M3/M4.
3. Owner authorises M1 explicitly.
4. Only then M1 begins with `p5_m1_merchant_stores` as the first additive migration.

M0 halts here per the Programmer Start Command. No M1 work will begin without explicit owner approval of the plan in § 7 and the decisions in § 6.

— End of M0 Preflight Report —
