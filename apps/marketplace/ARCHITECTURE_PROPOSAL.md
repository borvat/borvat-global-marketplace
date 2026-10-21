# Borvat — Seller Company + Shared Central Commerce Core

**Status:** Revision 3 — proposal for final architectural review. Supersedes Revisions 1 and 2. No migrations, tools or UI have been changed. Nothing will be built until this design is approved.

**Revision 3 is a focused delta on top of Revision 2.** Settled sections from Revision 2 remain authoritative unless explicitly amended in §20 ("Revision 3 amendments") at the end of this document. Where §20 conflicts with earlier sections, §20 wins. Revision 3 addresses: double-entry inventory movements; multi-warehouse reservation allocations; strict SIMPLE_OR_PACK vs BUNDLE XOR on listings; corrected external sync version semantics; listing-level publication revision; real two-person break-glass approval; own-marketplace channel consistency; complete MCP tool impact matrix; separation of platform moderation vs company support access; a minimal matching review UI in Phase 8; corrected ownership constraint wording; safe raw-event replay storage; confirmed phase-level decisions; and phase-plan updates for tests and inbound-event security.

---

## 0. Guiding principles

1. **Central identity vs external listing** are strictly separated. Identity, inventory and reservations are central; price, content, fees and status live on the listing.
2. **Inventory is shared, not pre-allocated.** Every enabled channel sees the same `available_to_sell`, derived from *sellable* balances only.
3. **New channel accounts always start in `READ_ONLY_IMPORT`.** Central control is an explicit, per-account activation, and activation is blocked unless a healthy sync adapter + worker exist for that channel.
4. **Tenant = Company.** Every commerce row carries `company_id`, enforced by RLS and backend validation.
5. **AI proposes → backend validates → user approves → marketplace executes → everything logged.** No autonomous merges, stock changes, cancellations, restocks or auction reservations.
6. **Physical stock ≠ sellable stock.** Sellable is a derived view over eligible warehouse balances in disposition `sellable`, minus active reservations.
7. **One authoritative source of truth per concern**: ownership, inventory quantity, reservation quantity, listing published quantity, sync desired state. No parallel writable copies.

---

## 1. Current schema impact analysis (unchanged summary)

Existing tables owned by a single user via `seller_id` / `user_id`: `products`, `product_suggestions`, `orders`, `order_items`, `cart_items`, `seller_bol_credentials`, `agent_memory`, `agent_audit_log`, `user_roles`, `profiles`, `categories`. All will be re-scoped to `company_id` behind a compatibility layer during migration (§14).

---

## 2. Tenancy and permission foundation

### 2.1 Companies and membership

- `companies(id, slug, legal_name, display_name, country, status, created_at, updated_at)`
  - `status ∈ {active, suspended, closed}`
- `company_members(company_id, user_id, status, invited_at, joined_at, revoked_at, PRIMARY KEY(company_id, user_id))`
  - `status ∈ {invited, active, suspended, revoked}`

### 2.2 Ownership — single source of truth

**Chosen model:** ownership is a *role assignment* in `company_members`, not a column on `companies`. There is **no** `companies.owner_user_id`.

- One role `company_owner` is granted through `company_member_roles` (§2.3).
- Database constraints:
  - Partial unique index guaranteeing **at least one** active `company_owner` per company: enforced by a deferred constraint trigger (`AFTER` statement on `company_members` / `company_member_roles`) that raises when a company would end up with zero active owners.
  - **Cannot delete or revoke the final owner.** Ownership transfer is a single transaction that grants the new owner *before* revoking the old one, and the trigger only sees the post-state.
  - `company_members.status = 'revoked'` cascades to revoking all role assignments for that (company, user).
- Ownership transfer is an explicit, audited RPC (`transfer_company_ownership`) requiring the current owner as caller. Partial transfer is not representable.

### 2.3 Capabilities, not a role hierarchy

Company roles are **not linear**. Model:

- `company_roles(id, company_id NULL, key, label, is_system)` — system roles have `company_id = NULL` and cannot be edited; companies may define custom roles.
- `permissions(key, label, description)` — flat capability list.
- `role_permissions(role_id, permission_key, PRIMARY KEY(role_id, permission_key))`
- `company_member_roles(company_id, user_id, role_id, granted_at, granted_by, PRIMARY KEY(company_id, user_id, role_id))` — a member may hold multiple roles.

System roles: `company_owner`, `company_admin`, `catalog_manager`, `inventory_manager`, `order_manager`, `marketing`, `customer_service`, `finance_viewer`, `read_only`.

Capability keys (initial set, extensible):

- `catalog.read`, `catalog.write`, `catalog.publish`
- `inventory.read`, `inventory.adjust`, `inventory.transfer`, `inventory.stocktake`
- `orders.read`, `orders.manage`, `orders.refund`
- `returns.manage`, `returns.inspect`
- `auctions.read`, `auctions.create`, `auctions.cancel`
- `channels.read`, `channels.connect`, `channels.activate`
- `members.read`, `members.manage`, `members.transfer_ownership`
- `finance.read`
- `agent.invoke`, `agent.approve_suggestions`

**Owner override** is explicit: the `company_owner` system role is seeded with **every** permission via `role_permissions`, and cannot be edited or removed by lower-privileged users. It is not implicit anywhere in code.

### 2.4 Permission check contract

Replaces `is_company_member(company_id, min_role)`.

- `has_company_permission(_user_id uuid, _company_id uuid, _permission text) returns boolean`
  - `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`.
  - Returns true iff: membership row exists with `status = 'active'`, and some assigned role has the permission, and the company is not `suspended`/`closed`.
- All RLS policies and RPCs use `has_company_permission(auth.uid(), row.company_id, '<permission>')`. Membership-only checks use `is_active_company_member(user_id, company_id)`.
- Global platform admin is **not** a wildcard SELECT: see §16 break-glass.

---

## 3. Product model — family, variant, sellable SKU, listing

Separated identities:

- `central_product_family(id, company_id, family_key, brand, title, description, category_id, gtin_family NULL, status, created_at, updated_at)`
  - A family is the marketing/catalog concept (e.g. "Borvat Trail Runner").
- `central_variant_axis(family_id, axis_key, label, position)` — declares the axes (`color`, `size`, `material`).
- `central_variant_axis_value(family_id, axis_key, value_key, label)`
- `sellable_sku(id, company_id, family_id, sku_code, gtin NULL, weight_grams NULL, dims_json NULL, hs_code NULL, status, created_at, updated_at)`
  - **This is the inventory-bearing identity.** Every inventory balance, ledger entry, reservation, bundle component and channel listing points at `sellable_sku.id`.
  - `unique(company_id, sku_code)`, `unique(gtin) where gtin is not null` per company.
- `sellable_sku_axis_value(sku_id, axis_key, value_key)` — resolves which variant a SKU is.
- `channel_listing(id, company_id, channel_account_id, sellable_sku_id, external_listing_id NULL, status, control_state, units_per_offer, channel_cap NULL, created_at, updated_at)`
  - `control_state ∈ {read_only_import, shadow, active, paused}`
  - Never has its own inventory number. `units_per_offer` is the pack/carton factor (§5).
- `channel_bundle_component(listing_id, component_sku_id, quantity_per_offer)` — for multi-SKU bundles; a listing is a bundle iff it has ≥1 row here (and then `units_per_offer` refers to the offer as a whole, with actual component draw defined per row).

Invariants:

- Reservations, ledger, balances **never** reference `central_product_family`.
- A `channel_listing` without bundle components represents a straight pack of `units_per_offer × sellable_sku_id`.

---

## 4. Warehouses, locations and inventory

### 4.1 Warehouse structure

- `warehouses(id, company_id, code, name, country, timezone, is_enabled_for_sales, created_at, updated_at)`
  - `is_enabled_for_sales` gates whether balances in this warehouse contribute to `available_to_sell`.
- `warehouse_locations(id, warehouse_id, code, kind, is_pickable)`
  - `kind ∈ {bin, receiving, quarantine, returns, damage, staging, transit}`
  - Only `is_pickable` locations contribute sellable balance.

### 4.2 Inventory disposition and balances

- `inventory_disposition` (enum): `sellable`, `reserved`, `inbound`, `quarantine`, `returned_pending_inspection`, `damaged`, `write_off`, `in_transfer`.
- `inventory_balance(id, company_id, sellable_sku_id, warehouse_id, location_id, disposition, quantity, updated_at)`
  - `unique(sellable_sku_id, location_id, disposition)`.
  - `CHECK (quantity >= 0)`.

**Balances are a materialized rollup of the ledger** (§4.3). They are never edited directly by application code; every change is a ledger entry, and a trigger/worker keeps balances in sync (or balances are computed views — see §17 phase 3 for the decision boundary; the constraint is that ledger is authoritative).

### 4.3 Ledger (append-only)

`inventory_ledger(id, company_id, sellable_sku_id, warehouse_id, location_id, disposition_from, disposition_to, quantity_delta, reason_code, reference_type, reference_id, actor_user_id, actor_kind, occurred_at, recorded_at)`

- Every physical or logical movement is an entry. Examples of `reason_code`: `receipt`, `putaway`, `pick`, `pack`, `ship`, `return_received`, `inspection_restock`, `inspection_quarantine`, `inspection_damage`, `write_off`, `stocktake_adjustment`, `transfer_out`, `transfer_in`.
- **Append-only** via RLS + `REVOKE UPDATE, DELETE`.
- Balances are always reconcilable from ledger.

### 4.4 Available-to-sell

```
sellable_on_hand(sku) =
  Σ inventory_balance.quantity
  WHERE disposition = 'sellable'
    AND warehouse.is_enabled_for_sales
    AND location.is_pickable

available_to_sell(sku) =
  sellable_on_hand(sku)
  - active_reservations(sku)
  - safety_buffer(sku)      -- optional per-SKU or per-channel buffer
```

`inbound`, `quarantine`, `returned_pending_inspection`, `damaged`, `write_off`, `in_transfer` are **excluded**. Reserved quantity is tracked in the reservation table (§6), not by moving stock to a `reserved` balance row.

---

## 5. Packs, bundles, published quantity

For each `channel_listing`:

```
if listing is a straight pack:
    base_available = available_to_sell(listing.sellable_sku_id)
    offer_available = floor(base_available / listing.units_per_offer)

if listing is a multi-SKU bundle:
    offer_available = min over components c of
        floor(available_to_sell(c.component_sku_id) / c.quantity_per_offer)

published_offer_quantity(listing) =
    min(offer_available, coalesce(listing.channel_cap, offer_available))
```

The same base SKU published as single / 6-pack / 24-carton yields different `published_offer_quantity` values simultaneously; the sync engine (§8) is responsible for pushing each listing's own number.

---

## 6. Reservations

**Single chosen model:** one reservation row per order line / auction line, with mutable quantity buckets and strict invariants. Splitting is done by *quantity movements*, not by splitting the row.

`inventory_reservation(id, company_id, sellable_sku_id, warehouse_id NULL, source_kind, source_id, reserved_quantity, consumed_quantity, released_quantity, status, created_at, updated_at)`

- `source_kind ∈ {order_item, auction_lot_item, manual_hold}`.
- `unique(source_kind, source_id)`.
- `status ∈ {active, fulfilled, released, cancelled}`.
- Invariants (CHECK):
  - `reserved_quantity >= 0`
  - `consumed_quantity >= 0`
  - `released_quantity >= 0`
  - `consumed_quantity + released_quantity <= reserved_quantity`
  - `status = 'fulfilled'` ⇒ `consumed_quantity = reserved_quantity` and `released_quantity = 0`
  - `status = 'released'` ⇒ `released_quantity = reserved_quantity` and `consumed_quantity = 0`
  - `status = 'cancelled'` ⇒ `consumed_quantity + released_quantity = reserved_quantity`
  - `status = 'active'` ⇒ `consumed_quantity + released_quantity < reserved_quantity`
- `active_reservations(sku) = Σ (reserved_quantity - consumed_quantity - released_quantity) WHERE status = 'active'`.

Concurrency: reservation creation and consumption run inside a transaction that takes `FOR UPDATE` locks on the affected `inventory_balance` rows for the SKU + warehouse, computes availability from ledger/balances, and inserts/updates the reservation atomically. Serialization failures are retried by the caller.

Partial cancellation: the reservation row's `released_quantity` is incremented; a corresponding ledger entry is **not** written (nothing physically moved). Partial fulfilment: `consumed_quantity` is incremented and a `pick`/`ship` ledger entry is written.

---

## 7. Orders, external channels, idempotency

### 7.1 Order tables

- `orders(id, company_id, channel_account_id NULL, external_order_id NULL, internal_order_number, buyer_ref, currency, placed_at, status, created_at, updated_at)`
  - `unique(channel_account_id, external_order_id) WHERE external_order_id IS NOT NULL` (partial index).
  - For our own marketplace, `channel_account_id IS NULL`, `external_order_id IS NULL`, `internal_order_number` is generated and unique per company.
- `order_items(id, order_id, sellable_sku_id, listing_id NULL, external_order_item_id NULL, quantity, unit_price_cents, currency, status, created_at, updated_at)`
  - `unique(order_id, external_order_item_id) WHERE external_order_item_id IS NOT NULL`.
  - Internal items: unique via `(order_id, line_no)` where `line_no` is an internal integer.
- Foreign-key composite unique constraints referencing columns that do not exist on `order_items` are removed.

### 7.2 Inbound event inbox

`inbound_channel_events(id, channel_account_id, external_event_id NULL, payload_hash, event_type, event_time NULL, event_version NULL, received_at, payload_jsonb, processing_status, processed_at NULL, error_text NULL)`

- `unique(channel_account_id, external_event_id) WHERE external_event_id IS NOT NULL`.
- `unique(channel_account_id, payload_hash) WHERE external_event_id IS NULL`.
- `processing_status ∈ {pending, processing, processed, failed, skipped_duplicate, dead_letter}`.
- All channel webhooks / poll results **write here first**, before any order mutation. A worker processes events, applies mutations, and marks them processed. Replay = re-process rows.

---

## 8. Synchronization architecture

### 8.1 Adapter contract (before activation)

Each channel adapter (Bol first, later Amazon, Marktplaats, etc.) implements a typed contract:

- `authenticate(company_id, channel_account_id) → session`
- `pull_listings(session, cursor) → { listings[], next_cursor }`
- `pull_orders(session, cursor) → { orders[], next_cursor }`
- `push_stock(session, external_listing_id, quantity, desired_version) → { accepted_version, rate_limit }`
- `push_price(...)` (later phase)
- `describe_rate_limits() → policy`

No channel can be activated unless its adapter passes contract tests and a worker is running.

### 8.2 Outbox and monotonic versions

- `inventory_version(sellable_sku_id, version bigint)` — monotonic per SKU, incremented on every event that changes `available_to_sell`.
- `sync_outbox(id, company_id, channel_listing_id, intent, desired_quantity, desired_version, created_at, not_before, attempts, status, last_error, dead_lettered_at NULL)`
  - Written **in the same transaction** as inventory changes (transactional outbox).
  - Workers claim rows with `FOR UPDATE SKIP LOCKED`, call adapter, and record acceptance.
- `channel_sync_state(channel_listing_id, last_pushed_version, last_pushed_quantity, last_pushed_at, last_ack_at)`
  - Adapter accepts only when `desired_version > last_pushed_version`; older jobs are dropped as stale.
- Rate limits, `Retry-After` and 429/5xx: honoured by workers with exponential backoff and jitter. Persistent failures → `dead_letter` + alert. Reconciliation poll compares external quantity to `last_pushed_quantity` and re-enqueues drift.

### 8.3 Drift and external changes after activation

- After `channel_listing.control_state = 'active'`, external stock changes on Bol/Amazon are **not adopted**.
- Reconciliation detects drift (external ≠ `last_pushed_quantity`).
- Action: raise an alert, keep central number authoritative, re-push central truth. Operators may set a per-account policy `on_drift ∈ {alert_only, auto_repush, pause_listing}`; default `auto_repush` with alert.

---

## 9. Auctions

Replace single-product auctions with lot + items.

- `auction_lots(id, company_id, title, description, currency, starts_at, ends_at, reserve_price_cents NULL, status, created_at, updated_at)`
  - `status ∈ {draft, scheduled, live, ended, cancelled, settled}`.
- `auction_lot_items(id, auction_lot_id, sellable_sku_id, quantity, reservation_id NULL)`
  - A lot has ≥1 item.

Scheduling (`draft → scheduled`) executes in **one transaction**:

- For every `auction_lot_items` row, create an `inventory_reservation` with `source_kind = 'auction_lot_item'`, `source_id = auction_lot_items.id`.
- If **any** reservation fails (insufficient available stock), the whole transaction rolls back and the lot stays in `draft`.
- On `cancelled` before end: release all reservations. On `settled`: consume reservations for the winning bidder's order lines.

---

## 10. Returns and cancellations

### 10.1 Return state machine

`returns(id, company_id, order_item_id, quantity, reason_code, status, opened_at, updated_at, resolution_kind NULL, resolution_at NULL)`

States and transitions:

```
return_requested
    → return_authorized
        → received_at_warehouse
            → inspected
                → restock_sellable      (ledger: quarantine→sellable, or receiving→sellable)
                → quarantine            (ledger: receiving→quarantine)
                → damaged               (ledger: receiving→damaged)
                → write_off             (ledger: receiving→write_off)
    → rejected
```

- Sellable stock only increases on the `inspected → restock_sellable` transition, via a ledger entry. No automatic increase on receipt.
- All inspection outcomes are audited with actor and reason.

### 10.2 Cancellations

- Before pick: cancellation releases the reservation; no ledger entry.
- After pick but before ship: releases reservation and writes a `pick_reverse` ledger entry moving stock back to `sellable`.
- After ship (item physically left warehouse): cancellation does **not** restore stock. It only marks the order line cancelled. Any stock recovery must flow through the return pipeline.

---

## 11. Stocktake and shortages

`stocktakes(id, company_id, warehouse_id, status, started_at, closed_at)` + `stocktake_counts(stocktake_id, sellable_sku_id, location_id, counted_quantity, system_quantity, recorded_at)`.

On close, for each SKU × location:

- If `counted >= sellable_on_hand`: write an `stocktake_adjustment` ledger entry to reconcile.
- If `counted < sellable_on_hand - active_reservations(sku)`: reconcile normally.
- If `counted < active_reservations(sku)` → **shortage state**:
  - Create `inventory_discrepancy(id, sku, warehouse, shortfall_quantity, status, opened_at, resolved_at NULL, resolution_note NULL)`.
  - Block new reservations for the SKU in that warehouse (`inventory_hold`).
  - Flag affected `order_items` for operator review.
  - **Do not silently release, resize or reassign active reservations.**
  - Resolution requires an authorized user with `inventory.stocktake` + `orders.manage`, and is fully audited.

---

## 12. Channel accounts and credentials

- `channel_accounts(id, company_id, channel_key, label, control_state, connected_at, connected_by, health_status, last_ok_at, disabled_at NULL)`
  - `channel_key ∈ {bol, amazon, marktplaats, own_marketplace, …}`.
  - `control_state ∈ {read_only_import, shadow, active, paused}`. Activation requires §8.1 adapter contract compliance and a live worker.
- `channel_account_secrets(channel_account_id, kind, ciphertext, iv, auth_tag, key_version, created_at, rotated_at NULL, retired_at NULL)`
  - `kind ∈ {client_id, client_secret, refresh_token, ...}`.

**Credentials — correction to prior security report:**

- The **current** implementation stores AES-256-GCM ciphertext without `key_version`. Key rotation is not yet supported.
- Revision 2 introduces `key_version` as part of the *proposed* implementation, not present today.
- Migration compatibility: existing ciphertext will be stamped `key_version = 1` on read and re-encrypted lazily to `key_version = 2` on next rotation. `SECURITY_REPORT.md` will be corrected in the same commit that introduces `key_version`.

`seller_bol_credentials` remains for at least one full release after `channel_account_secrets` goes live; the compatibility shim reads both and writes to the new table only.

---

## 13. Security additions

- **SECURITY DEFINER helpers** (`has_company_permission`, `is_active_company_member`, `reserve_inventory`, `consume_reservation`, `release_reservation`, `transfer_company_ownership`, ledger writers):
  - `SET search_path = public, pg_temp`.
  - `REVOKE ALL ON FUNCTION … FROM PUBLIC`.
  - `GRANT EXECUTE … TO authenticated` (or `service_role` where callable only from server).
  - Validate active membership status inside the function body (not just RLS).
- **No unrestricted global admin SELECT.** Platform admin is not a wildcard reader.
- **Break-glass support access**:
  - `support_access_grants(id, granted_to_user_id, company_id, reason, scope_json, expires_at, granted_by, revoked_at NULL)`.
  - RLS grants read/limited-write access **only while** an active grant exists.
  - Every access under a grant is written to `agent_audit_log` with `role_at_time = 'support'`, grant id, reason and scope.
  - Grants require two-person approval for `orders`, `inventory`, `channels`, `members` scopes.
- **Sync payload redaction**: adapter request/response bodies and error strings pass through the existing `redactSensitive` pipeline before being persisted to `sync_outbox.last_error`, `inbound_channel_events.payload_jsonb` (for logs) and `agent_audit_log`. Retention: raw payloads capped at N days (per channel), thereafter reduced to metadata only.

---

## 14. Migration strategy — expand / migrate / switch / contract

**No “no downtime” claim.** Every schema change follows the pattern below and is reversible until the *contract* step.

For each affected table (example: `products`):

1. **Expand.** Create new tables (`central_product_family`, `sellable_sku`, `channel_listing`) alongside `products`. Add nullable `sellable_sku_id` to `order_items`, `cart_items`, `product_suggestions`. Add `company_id` to legacy tables (nullable initially).
2. **Backfill.** For every existing `products` row: create a personal `companies` row (one per current seller), one `central_product_family`, one `sellable_sku`, one `channel_listing` under `own_marketplace`. Backfill `company_id` and `sellable_sku_id` on child rows. Backfill Bol credentials into `channel_account_secrets` with `key_version = 1`.
3. **Dual-write.** MCP tools and RPCs write to both old and new columns. RLS on new tables enforced from day one; RLS on legacy tables tightened to `company_id` where present.
4. **Switch reads.** Frontend, MCP tools and RPCs read from the new model. `products` becomes a **read-only compatibility view** projecting from the new tables *only after* all writers have moved off it. The view is not created while the base table still exists under the same name — the base table is renamed to `products_legacy` first, then the view `products` is created over the new model. All foreign keys, RLS policies, RPCs and existing MCP queries are re-pointed in the same migration.
5. **Rollback plan.** Until step 4 is complete, the legacy table remains the source of truth and rollback = drop new writes + revert code. After step 4, rollback = restore from the pre-switch backup + replay outbox; this is documented but explicitly a recovery event, not routine.
6. **Contract.** Only after a stable transition period (target: one full release cycle in production with zero legacy writes, healthy dashboards and no rollbacks) do we drop `products_legacy`, `seller_bol_credentials`, and the compatibility view. Contract is a separate phase (§17 Phase 14), never bundled with expand.

Dependencies enumerated per table: FKs, RLS policies, triggers, `SECURITY DEFINER` RPCs, MCP tool queries, view definitions. Each is listed in the migration PR with its resolution step.

---

## 15. MCP tool impact

Every existing tool gains a `company_id` context (resolved from the caller's active membership; if the caller belongs to multiple companies, the tool requires an explicit `company_id` argument). Capability checks replace role checks:

- `analyze_catalog`, `analyze_inventory`, `analyze_sales`, `list_my_products` → require `catalog.read` / `inventory.read`.
- `create_product_draft` → `catalog.write`; targets `central_product_family` + `sellable_sku` under `own_marketplace` listing.
- `update_order_status` → `orders.manage`; operates on `order_items` via reservation/ledger, not by mutating status alone.
- `suggest_product_content`, `recommend_price` → `catalog.read`; `decide_product_suggestion` → `catalog.write` + `agent.approve_suggestions`.
- `bol_configure`, `bol_import_products` → `channels.connect`; run against `channel_accounts` + `channel_account_secrets`, respect `control_state = read_only_import`.
- `monitor_marketplace_quality` (admin) → replaced by break-glass audited queries (§13); no wildcard access.

New tools (later phases): `match_listing_to_sku`, `preview_available_to_sell`, `schedule_auction_lot`, `open_return`, `record_return_inspection`, `run_stocktake`.

---

## 16. State machines (summary)

- **Listing control_state:** `read_only_import → shadow → active ↔ paused`. Activation gated by adapter contract + worker health.
- **Reservation status:** `active → fulfilled | released | cancelled`.
- **Return status:** `return_requested → return_authorized → received_at_warehouse → inspected → {restock_sellable | quarantine | damaged | write_off} | rejected`.
- **Auction lot status:** `draft → scheduled → live → ended → settled | cancelled`.
- **Inbound event:** `pending → processing → processed | failed | skipped_duplicate | dead_letter`.
- **Sync outbox row:** `pending → in_flight → acked | stale | failed → dead_letter`.
- **Membership:** `invited → active → suspended → revoked`.

---

## 17. Revised implementation phases

Each phase ends with automated tests (RLS, invariants, adapter contract) and an explicit go/no-go gate. No later phase starts until the prior gate is green.

1. **Phase 1 — Tenancy + permission foundation.** `companies`, `company_members`, `company_roles`, `permissions`, `role_permissions`, `company_member_roles`, ownership invariants, `has_company_permission`, RLS on all new tables.
2. **Phase 2 — Product family / variant / sellable SKU / listing model** (no channel wiring yet).
3. **Phase 3 — Warehouses, locations, inventory ledger + balances**, with balance materialization strategy chosen and tested.
4. **Phase 4 — Reservations + concurrency tests** (row-locking, invariants, partial fulfilment/cancel).
5. **Phase 5 — Channel accounts + encrypted secrets lifecycle** (`key_version`, rotation, redaction), corrected `SECURITY_REPORT.md`.
6. **Phase 6 — Sync engine + channel adapter contracts** (outbox, monotonic version, rate-limit policy, dead-letter, reconciliation), with a mock adapter passing contract tests.
7. **Phase 7 — Read-only Bol import** into `channel_listing` under `read_only_import`, populating `inbound_channel_events` for orders.
8. **Phase 8 — Product matching + seller approval** (unlinked listings → linked to `sellable_sku`).
9. **Phase 9 — Shadow inventory + dry-run reconciliation.** Central inventory is computed and would-be-pushed values are logged; nothing is written to Bol.
10. **Phase 10 — Explicit central inventory activation** per channel account, only when phase 9 shows healthy shadow numbers and a live worker.
11. **Phase 11 — External orders, cancellations and returns**, including the return state machine, cancellation-after-ship rules, and inbound event replay.
12. **Phase 12 — Multi-item auctions**, atomic reservation scheduling.
13. **Phase 13 — Dashboards and agent tools** updated to the new model; break-glass tooling shipped.
14. **Phase 14 — Compatibility cleanup** only after a stable transition period: drop `products_legacy`, `seller_bol_credentials`, compatibility views.

---

## 18. Open questions for reviewer

1. Balance materialization: keep `inventory_balance` as a trigger-maintained rollup, or expose it as a view over `inventory_ledger`? (Trade-off: write cost vs read cost. Recommended: trigger-maintained rollup, with a nightly reconciliation job.)
2. Safety buffer scope: per-SKU only, per-(SKU, channel), or both? (Recommended: both, channel overrides SKU.)
3. Drift policy default: `auto_repush` vs `alert_only`? (Recommended: `auto_repush` with alert.)
4. Support break-glass: two-person approval mandatory for `orders`/`inventory`/`channels`/`members` scopes — confirm.
5. Custom company roles: allowed from day one, or system roles only until Phase 13?

Awaiting review before any implementation.

---

## 20. Revision 3 amendments (authoritative delta)

This section is the authoritative delta on top of Revision 2. Where it conflicts with earlier sections, this section wins. It does not restate settled design.

### 20.1 Double-entry inventory movement model

The single-row `inventory_ledger` is replaced by a two-table double-entry model. Balances are updated **transactionally in the same SQL transaction as the entries**; asynchronous workers may only reconcile/report, never author balances.

**`inventory_transactions`**
- `id` (uuid, PK)
- `company_id` (FK, not null)
- `transaction_type` — enum: `receipt`, `putaway`, `location_transfer`, `warehouse_transfer_out`, `warehouse_transfer_in_arrival`, `disposition_change`, `reservation_allocate`, `reservation_release`, `reservation_consume`, `pick`, `pack`, `ship`, `return_receive`, `return_disposition`, `stocktake_adjust`, `write_off`, `manual_correction`
- `reference_type`, `reference_id` — e.g. `order_item`, `return_line`, `stocktake`, `transfer_order`, `reservation`, `manual`
- `actor` — `{ user_id | system | agent, source }`
- `occurred_at` (timestamptz)
- `idempotency_key` (unique per `company_id`)
- `reason_code` (nullable, required for non-conserving types)
- `notes` (nullable)

**`inventory_transaction_entries`**
- `transaction_id` (FK)
- `sellable_sku_id` (FK)
- `warehouse_id` (FK)
- `location_id` (FK, nullable only where allowed by warehouse config)
- `disposition` — enum: `sellable`, `quarantine`, `damaged`, `in_transfer`, `reserved_hold`, `inbound_expected`, `returned_pending_inspection`
- `quantity_delta` (integer, non-zero; sign carries direction)
- `lot_id` / `serial_id` (optional)
- PK: `(transaction_id, sellable_sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)`

**Invariants (enforced by constraint trigger, DEFERRABLE INITIALLY DEFERRED):**

- **Conserving transactions** (`location_transfer`, `warehouse_transfer_out`, `warehouse_transfer_in_arrival` when paired, `disposition_change`, `reservation_*`, `pick`, `pack`, `ship`, `return_disposition`): `SUM(quantity_delta) = 0` per `sellable_sku_id` across the transaction's entries.
- **Non-conserving transactions** (`receipt`, `write_off`, `stocktake_adjust`, `manual_correction`, `return_receive` from external): allowed only when `reason_code` is present and belongs to an explicitly authorized reason set (`external_receipt`, `damage_write_off`, `stocktake_delta`, `authorized_manual`, `customer_return`). Any other non-conserving transaction is rejected.
- Warehouse-to-warehouse transfers are modeled as either (a) one transaction with `-src sellable` and `+dst in_transfer`, followed by an arrival transaction `-in_transfer` and `+sellable`, or (b) two transactions linked by `reference_type='transfer_order'`. Both variants remain conserving per SKU.
- Every entry updates the corresponding `inventory_balances` row (`sellable_sku_id`, `warehouse_id`, `location_id`, `disposition`) in the same transaction. Negative balances are rejected by check constraint / trigger.

**Reconciliation job:** periodically recomputes balances from entries per SKU and reports divergence. It never writes to `inventory_balances` outside of a controlled `manual_correction` transaction that itself creates entries.

### 20.2 Reservation allocation across warehouses

Reservations remain a single logical row per demand (order line, checkout hold, auction hold), but are allocated to warehouses via a new child table.

**`inventory_reservation_allocations`**
- `id` (uuid, PK)
- `reservation_id` (FK, not null)
- `warehouse_id` (FK, not null)
- `location_id` (FK, nullable)
- `allocated_quantity` (int, ≥ 0)
- `consumed_quantity` (int, ≥ 0)
- `released_quantity` (int, ≥ 0)
- `created_at`, `updated_at`

**Invariants:**
- Per allocation: `consumed_quantity + released_quantity ≤ allocated_quantity`.
- Per reservation: `SUM(allocated_quantity) = reservations.quantity` once fully allocated; `SUM(consumed_quantity) = reservations.consumed_quantity`; `SUM(released_quantity) = reservations.released_quantity`.
- A reservation may be in state `unallocated` only briefly — bounded by `reservation_allocation_deadline` (default: minutes for order lines, order-hold TTL for checkout holds). Picking, packing and fulfilment are forbidden while unallocated.

**Allocation policy:**
- Default order: (1) prefer warehouse currently linked to the channel account's default fulfilment; (2) fewest splits; (3) FIFO by lot age; (4) closest to destination if shipping metadata exists.
- Partial fulfilment: allocations may be reallocated (a `reservation_allocate` transaction with `-src` and `+dst`) while `consumed_quantity = 0` on the source allocation.
- Warehouse shortage: if requested warehouse cannot cover the allocation, the reservation is re-planned across eligible warehouses; if global sellable is insufficient, the reservation moves to `short` and the exception queue is notified. Central control never oversells.

**Stocktake shortage:** a stocktake counts only physical balances in the affected warehouse/location. Shortage calculations subtract only reservation allocations **whose `warehouse_id` (and `location_id` when set) match the counted scope**, never the global reservation total.

### 20.3 Listing type XOR

`channel_listing.listing_type` is an enum: `SIMPLE_OR_PACK` or `BUNDLE`. It is the only supported shape; NULL is forbidden.

**A. `SIMPLE_OR_PACK`**
- `base_sku_id` NOT NULL
- `units_per_offer` INTEGER > 0 (1 for simple, >1 for pack)
- **No** rows in `channel_listing_bundle_components` for this listing

**B. `BUNDLE`**
- `base_sku_id` NULL, unless the bundle is fulfilled from a pre-assembled inventory-bearing SKU (`assembled_bundle_sku_id`), in which case `base_sku_id = assembled_bundle_sku_id` and `units_per_offer = 1`. In that case bundle components MAY still be declared for descriptive purposes but MUST NOT contribute to published quantity (see §20.5).
- One or more rows in `channel_listing_bundle_components(listing_id, component_sku_id, quantity_per_offer > 0)`.

**Enforcement:**
- CHECK: `(listing_type = 'SIMPLE_OR_PACK' AND base_sku_id IS NOT NULL AND units_per_offer > 0)` OR `(listing_type = 'BUNDLE')`.
- Trigger: on INSERT/UPDATE to `channel_listing_bundle_components`, reject if parent `listing_type <> 'BUNDLE'`.
- Trigger: on UPDATE of `listing_type`, block change while conflicting child rows exist; transitions require an explicit migration action.

### 20.4 Corrected external sync version semantics

Internal monotonic versions (`sellable_sku.availability_version`, and per §20.5 `channel_listing.publication_revision`) are **internal** ordering tools only. External channels never see or enforce them.

**Sync engine contract:**
- One ordered execution lane per `channel_listing_id` (advisory lock or per-listing FIFO queue). Only one push in flight per listing.
- Before each external call, load the current `desired_publication_revision`. Attach it to the outbox job as `attempted_revision`.
- After the external call returns (success or retryable error), do **not** mark `acknowledged_revision = attempted_revision` if `current_desired_revision > attempted_revision`. In that case, enqueue/keep a follow-up job with the newest desired state.
- On success where `attempted_revision == current_desired_revision`, set `acknowledged_revision = attempted_revision`.
- For channels with asynchronous processing (Bol, Amazon feeds), reconciliation of the actually-published quantity is done via subsequent pull/webhook, not by trusting the immediate response.
- Never assume the external channel echoes, stores or enforces our version. Versions are used only to decide "is this push still relevant?" and "did a newer desired state appear during the call?".

Retries use exponential backoff bounded per lane; poison messages move to a dead-letter table with an alert.

### 20.5 Listing-level publication revision

SKU-level `availability_version` is insufficient because a bundle listing's published quantity depends on multiple SKUs plus listing-level parameters.

Add to `channel_listing`:
- `publication_revision` (bigint, monotonic per listing)
- `desired_publication_revision`, `acknowledged_publication_revision` (used by the sync engine)

`publication_revision` is incremented (in the same transaction that changed the underlying value) whenever any of the following changes and could affect published quantity:
- any component SKU's sellable availability (for bundles) or the base SKU's sellable availability (for simple/pack)
- `units_per_offer`
- bundle component set or `quantity_per_offer`
- channel cap / publication buffer / SKU safety buffer applicable to this listing
- listing control state (`READ_ONLY_IMPORT`, `SHADOW`, `ACTIVE`, `PAUSED`)

The outbox writes jobs keyed by `(channel_listing_id, publication_revision)`. Sync state (§20.4) is tracked per listing revision, not per SKU version.

Published quantity formula (unchanged in intent, restated for clarity):
- `SIMPLE_OR_PACK`: `floor((available_to_sell(base_sku) - sku_buffer) / units_per_offer) - channel_publication_buffer`, clamped to `[0, channel_cap]`.
- `BUNDLE` (non-assembled): `min over components of floor((available_to_sell(component_sku) - sku_buffer) / quantity_per_offer) - channel_publication_buffer`, clamped to `[0, channel_cap]`.
- `BUNDLE` (assembled): treated as SIMPLE with `assembled_bundle_sku_id`; component rows are descriptive and do not contribute.
- Buffers are never double-subtracted: SKU safety buffer is subtracted from availability at SKU scope; channel publication buffer is subtracted at listing scope.

### 20.6 Break-glass two-person approval

`support_access_grants` (single `granted_by`) is replaced by an explicit request → approval → activation flow.

**`support_access_requests`**
- `id`, `company_id`, `requested_by` (Borvat staff), `scope` (enum: `orders`, `inventory`, `channels`, `members`, `credentials_read_metadata`), `reason` (text, required), `requested_permissions` (jsonb: read-only vs specific mutations), `requested_ttl_minutes`, `status` (`pending`, `approved`, `denied`, `expired`, `revoked`), `created_at`, `expires_at`.

**`support_access_approvals`**
- `id`, `request_id`, `approver_id` (Borvat staff), `decision` (`approve`, `deny`), `decided_at`, `note`.
- Constraint: `approver_id <> support_access_requests.requested_by` for the referenced request.
- Unique `(request_id, approver_id)` — one vote per approver.

**`support_access_grants`** (activated grant, replaces the old table's semantics)
- `id`, `request_id`, `company_id`, `scope`, `granted_permissions`, `activated_at`, `expires_at`, `revoked_at`, `revoked_by`, `revocation_reason`.
- A row exists **only after** the approval threshold is met.
- Threshold: **two distinct approvers** for scopes `orders`, `inventory`, `channels`, `members`, `credentials_read_metadata`. Platform moderation scopes (§20.9.A) do not use this table.
- Enforced by a `SECURITY DEFINER` function that validates: two distinct `approve` decisions exist, neither approver is the requester, request is not expired, and permissions match the request.

**RLS/authorization:**
- Support access is only ever consulted for the exact `company_id` and `scope` in the active grant, and only within `[activated_at, expires_at)` and while `revoked_at IS NULL`.
- Every access under a grant is written to `agent_audit_log` with `grant_id`.
- Revocation is single-actor and logged.

### 20.7 Own marketplace channel consistency

`own_marketplace` is a real channel, not the absence of one.

- On company creation, a system row is inserted in `channel_accounts` with `channel_key = 'own_marketplace'`, `status = 'active'`, `control_state = 'ACTIVE'`, and is not user-deletable.
- Every internal `orders` row has `channel_account_id` set to the company's `own_marketplace` account. `channel_account_id` is **NOT NULL** for all orders.
- Uniqueness:
  - External channels: `UNIQUE (channel_account_id, external_order_id)` — partial index `WHERE external_order_id IS NOT NULL`.
  - Internal orders: `UNIQUE (company_id, internal_order_number)` — the internal order number is issued by our own numbering service.
- Reporting, channel breakdowns and dashboards therefore always join through `channel_accounts` with no NULL branch.

### 20.8 Complete MCP impact matrix

Legend — Ctx: `Public` / `Buyer` / `Company` / `Admin`. R/W: read or write. Approval: user approval required in the UI/agent flow. Company context: required only when the caller belongs to multiple companies; backend membership + capability validation is always mandatory for company-scoped tools.

| # | Tool | Ctx | Required capability | R/W | Approval | Schema impact | Status in Rev 3 |
|---|---|---|---|---|---|---|---|
| 1 | `search_products` | Public | — | R | No | Read-model over listings; no `company_id` param | Unchanged (reads new listing model) |
| 2 | `get_product` | Public | — | R | No | Reads central product/listing | Unchanged |
| 3 | `compare_products` | Public | — | R | No | Reads central product | Unchanged |
| 4 | `get_shop_information` | Public | — | R | No | Reads `companies` public profile | Modified (source table renamed from sellers → companies) |
| 5 | `get_recommendations` | Buyer | authenticated buyer | R | No | Buyer-scoped, no `company_id` | Unchanged |
| 6 | `list_my_orders` | Buyer | authenticated buyer | R | No | Reads `orders` where `buyer_user_id = auth.uid()` | Unchanged (schema field renamed) |
| 7 | `list_my_products` | Company | `catalog.read` | R | No | Requires `company_id` if multi-company; scoped by membership | Modified |
| 8 | `list_seller_orders` | Company | `orders.read` | R | No | Requires `company_id` if multi-company; joins `channel_accounts` | Modified |
| 9 | `analyze_catalog` | Company | `catalog.read` | R | No | Same as #7 | Modified |
| 10 | `analyze_sales` | Company | `orders.read` | R | No | Same as #8 | Modified |
| 11 | `analyze_inventory` | Company | `inventory.read` | R | No | Reads `inventory_balances` + reservations | Modified |
| 12 | `detect_listing_problems` | Company | `catalog.read` | R | No | Reads listings and matching state | Modified |
| 13 | `create_product_draft` | Company | `catalog.write` | W (draft) | Seller publishes | Writes `product_families`/`sellable_skus` in draft state | Modified |
| 14 | `suggest_product_content` | Company | `catalog.read` + `catalog.suggest` | W (suggestion) | Seller accepts | `product_suggestions` scoped to `company_id` | Modified |
| 15 | `recommend_price` | Company | `catalog.suggest` | W (suggestion) | Seller accepts | `product_suggestions` scoped to `company_id` | Modified |
| 16 | `update_order_status` | Company | `orders.write` | W | Backend validates state machine; user-initiated | Uses new order/return state machine | Modified |
| 17 | `bol_configure` | Company | `channels.manage` | W | Explicit user | Writes to `channel_accounts` + encrypted credentials with `key_version` | Modified |
| 18 | `bol_import_products` | Company | `channels.manage` + `catalog.write` | W (import) | Explicit user | Imports into `unlinked_listings`; no auto-match | Modified |
| 19 | `monitor_marketplace_quality` | Admin | `platform.moderation` | R | No | Marketplace-wide aggregates only (see §20.9) | Retained as platform moderation |
| 20 | `forget_memory` | Buyer/Company | self | W | User-initiated | Deletes `agent_memory` scoped to caller | Unchanged |

**New tools deferred to later phases** (documented here for completeness, not added yet): `link_unlinked_listing`, `create_transfer_order`, `record_stocktake`, `request_support_access`, `approve_support_access`. These are Phase 8+/Phase 13 items.

### 20.9 Platform moderation vs company support access

Two distinct authorization surfaces.

**A. Platform moderation / quality (`platform.moderation`)**
- Marketplace-wide aggregates: total active listings, listings without images, duplicate-title clusters, policy-violation flags, fraud/risk signals, dispute rates.
- Legitimate Borvat-admin capability with no per-company approval.
- Must **not** expose private order contents, credentials, membership PII beyond public shop identity, or inventory balances. Aggregates are anonymized or bucketed where possible.
- `monitor_marketplace_quality` remains here.

**B. Company-specific support access (§20.6)**
- Private orders, private inventory, credentials metadata, channels, membership data.
- Requires two-person break-glass approval, scoped, time-bound, fully audited.
- Platform admins do not automatically have this.

The two surfaces are separate roles/capabilities and separate audit streams.

### 20.10 Minimal review UI in matching phase (Phase 8)

Phase 8 ships with a minimal seller review workflow — not the full dashboard.

Included in Phase 8:
- `unlinked_listings` queue view per company (list, filter by channel, search).
- Candidate match panel: side-by-side of the imported listing and up to N central product candidates (GTIN, brand, title similarity, image hash, existing SKU matches).
- Decision actions: **accept match**, **reject**, **create new central product**, **defer**.
- Conflict display: shows conflicting attributes (title, brand, GTIN mismatch) that block auto-accept.
- Full audit trail row per decision in `agent_audit_log` with before/after.
- Backend enforcement: matching only writes when the seller explicitly accepts; the AI proposes, backend validates, seller approves.

Full Seller Company Dashboard remains in Phase 13.

### 20.11 Ownership constraint wording

Clarify what a partial unique index can and cannot do.

- **At most one active owner** per company: enforced by a partial unique index — `CREATE UNIQUE INDEX ON company_member_roles (company_id) WHERE role = 'company_owner' AND status = 'active'`. This guarantees uniqueness, not existence.
- **At least one active owner** per company: enforced by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `company_member_roles` (and on `company_members.status` transitions) that fails the transaction if the count of active `company_owner` rows for that `company_id` would drop below 1 at commit time.
- **Atomic transfer:** ownership transfer is a single transaction that (a) inserts the new active owner role, (b) deactivates the previous owner role, (c) allows the deferred trigger to validate at commit that exactly one active owner exists. No window with zero owners is observable to concurrent readers, and the partial unique index prevents two simultaneous active owners.

The earlier claim that a unique index alone guaranteed existence is retracted.

### 20.12 Raw inbound events and redacted logs

Two-projection model, chosen explicitly:

- **`inbound_events_raw`** — encrypted-at-rest full payload for replay. Contains the raw signed webhook/pull body needed for idempotent reprocessing and dispute resolution. Access restricted to backend replay workers and break-glass `orders`/`channels` scopes. No general read access, not exposed to MCP.
- **`inbound_events_log`** — redacted projection for diagnostics and search: metadata (channel, event type, arrival time, signature status), plus a redacted payload with secrets and PII replaced by `[REDACTED]` markers. **Business-required fields (external order id, line ids, quantities, SKU references, status codes) are preserved verbatim** — logging redaction never mutates these fields. If a business-required field would be redacted, the log entry is written with a `redaction_conflict` flag and the raw table remains the authoritative source.

**Retention & PII:**
- `inbound_events_raw`: encrypted, retained for the shorter of legal retention window or 24 months; deleted on company deletion after settlement is finalized. Read access is audited.
- `inbound_events_log`: retained for 90 days by default, longer for compliance-flagged events. Read access follows platform-moderation or scoped support-access rules.
- Neither table is used as the primary business store — business projections (orders, order items, returns) are written by the event processor from the raw payload.

### 20.13 Phase decisions — confirmed

- `inventory_balance`: transactionally maintained materialized balance, plus periodic reconciliation (§20.1). **Confirmed.**
- Safety buffer: SKU-level central buffer, plus optional channel-level publication buffer/cap; never double-subtracted (§20.5). **Confirmed.**
- Drift policy: `SHADOW` = `alert_only`; `ACTIVE` central control = `auto_repush + alert`. **Confirmed.**
- Break-glass: two-person approval mandatory for `orders`, `inventory`, `channels`, `members`, `credentials_read_metadata` scopes (§20.6). **Confirmed.**
- Custom company roles: system roles only initially; custom roles postponed to Phase 13. **Confirmed.**

### 20.14 Phase plan updates

The 14-phase structure is kept. Deltas:

- **Phase 8 (Matching):** now includes the minimal seller review UI (§20.10). Auto-matching remains proposal-only; nothing is linked without explicit seller approval.
- **New pre-Phase-9 requirement — Inbound raw-event security:** before any real channel events are processed end-to-end, `inbound_events_raw` encryption-at-rest, signature verification, replay-idempotency, and the redacted log projection (§20.12) must be in place and tested.
- **Pre-Phase-10 activation gates (added):**
  - Sync contract tests for each channel adapter (desired vs acknowledged revisions, out-of-order desired states, poison messages).
  - Ordered-listing concurrency tests: one lane per `channel_listing`, no interleaving, correct behavior when a newer `desired_publication_revision` appears during an in-flight push (§20.4, §20.5).
- **Pre-Phase-11 activation gates (added, before external order activation):**
  - Warehouse allocation tests: allocation, reallocation, partial fulfilment, warehouse shortage.
  - Multi-warehouse stocktake tests: shortage math uses only allocations matching the counted warehouse/location (§20.2).
- **Phase 13 (Dashboards & agent tools):** full Seller Company Dashboard, custom company roles, and the deferred MCP tools listed in §20.8.
- **Phase 14 (Compatibility cleanup):** unchanged — only after a stable transition period.

---

Revision 3 is presented for final architectural review. No code, migrations, tools or UI have been changed.

---

## 21. Revision 3.1 amendments (authoritative patch)

This section is a focused authoritative patch on top of Revisions 2 and 3. **Where §21 conflicts with any earlier section (including §20), §21 supersedes and replaces the conflicting text.** No code, migrations, tools or UI are changed by this section.

### 21.1 Canonical availability and published-quantity formulas — SKU safety buffer deducted exactly once

The SKU safety buffer is subtracted **once**, inside `base_available_to_sell`. All downstream formulas consume that value directly; they never re-apply `sku_safety_buffer`.

**Canonical definitions**

```
sellable_on_hand(sku) =
    Σ inventory_balances.quantity
    WHERE disposition = 'sellable'
      AND warehouse.is_enabled_for_sales
      AND location.is_pickable

active_reserved_base_units(sku) =
    Σ (required_base_quantity - consumed_quantity - released_quantity)
    OVER inventory_reservation_lines
    WHERE header.status = 'active' AND line.sellable_sku_id = sku

base_available_to_sell(sku) =
    max(
      0,
      sellable_on_hand(sku)
      - active_reserved_base_units(sku)
      - sku_safety_buffer(sku)
    )
```

**SIMPLE / PACK listing**

```
offer_available(listing) =
    floor( base_available_to_sell(listing.base_sku_id) / listing.units_per_offer )

published_quantity(listing) =
    min(
      channel_cap(listing),
      max(0, offer_available(listing) - channel_publication_buffer(listing))
    )
```

`units_per_offer = 1` recovers the simple case.

**BUNDLE listing (non-assembled)**

```
component_offer_available(listing, c) =
    floor( base_available_to_sell(c.component_sku_id) / c.quantity_per_offer )

offer_available(listing) =
    min over components c of component_offer_available(listing, c)

published_quantity(listing) =
    min(
      channel_cap(listing),
      max(0, offer_available(listing) - channel_publication_buffer(listing))
    )
```

**BUNDLE listing (assembled)**

Treated as SIMPLE with `base_sku_id = assembled_bundle_sku_id` and `units_per_offer = 1`. Descriptive component rows do not contribute to `offer_available`.

**Rule.** SKU safety buffer is deducted **exactly once**, inside `base_available_to_sell`. The channel publication buffer is deducted **exactly once**, at listing scope, and never inside `base_available_to_sell`. `channel_cap` is a hard ceiling, not a subtraction. §20.5's "restated formulas" that also subtract `sku_buffer` outside `base_available_to_sell` are superseded.

### 21.2 Single authoritative reservation model — no double counting

**Chosen model (authoritative):**

- Physical inventory **remains in `sellable` disposition** while it is logically reserved.
- `active_reserved_base_units(sku)` reduces `base_available_to_sell(sku)` (§21.1). This is the **only** effect of a logical reservation on availability.
- Reservation allocation, reallocation and release **do not** create `inventory_transaction_entries`. They emit rows in an append-only reservation event log only.
- Physical inventory movements (pick, pack, ship, return receipt, return restock) create `inventory_transaction_entries` per §21.4.
- The `reserved_hold` disposition introduced in §20.1 is **removed**. If a physical hold use case is ever needed, it must be introduced as a new distinct disposition with an explicit rule about whether it participates in `sellable_on_hand`; until then it does not exist.

**Reservation event log (append-only):**

`reservation_events(id, reservation_id, reservation_line_id NULL, allocation_id NULL, event_type, quantity_delta, actor, occurred_at, reason)`

- `event_type ∈ {reserve, allocate, reallocate_out, reallocate_in, release, consume_start, consume_complete, cancel_before_pick, cancel_after_pick_reversal}`
- Never mutated or deleted; RLS + `REVOKE UPDATE, DELETE`.
- Reservation quantity fields on headers/lines/allocations are the materialized rollup; the event log is the audit source of truth.

**Coordination with physical pick/ship** (see §21.4 for movements):

- `pick` writes a physical entry `sellable → picked` **and**, in the same SQL transaction, increments `inventory_reservation_lines.consumed_quantity` (and the matching allocation) by the picked base quantity, and appends a `consume_start` reservation event. The two happen atomically. Net effect on `base_available_to_sell`:
  - `sellable_on_hand` decreases by the picked base quantity.
  - `active_reserved_base_units` decreases by the same amount.
  - Availability is unchanged (as expected — nothing was released to a new buyer).
- `ship` writes a non-conserving physical issue `-packed_or_staging` and appends `consume_complete`. Reservation line/allocation quantities are unchanged by ship (already decremented at pick). `base_available_to_sell` is unchanged by ship (units left `sellable` at pick time).
- `cancellation before pick` decrements reservation line/allocation and appends `release`; no physical entries. Availability increases by the released base quantity.
- `cancellation after pick, before ship` writes a conserving `picked → sellable` reversal, and appends `release` decrementing `consumed_quantity`. Availability increases by the reversed quantity.
- `cancellation after ship` cannot restore stock; any recovery flows through returns (§21.4).

**Numeric proofs.** Starting state per SKU `S1`: `sellable_on_hand = 100`, `sku_safety_buffer = 0`, `active_reserved_base_units = 0`, `channel_publication_buffer = 0`, `channel_cap = ∞`, `units_per_offer = 1` (so `offer_available = base_available_to_sell`).

| Step | Action | `sellable_on_hand` | `active_reserved_base_units` | `base_available_to_sell` |
|------|--------|-------------------|------------------------------|--------------------------|
| 0 | initial | 100 | 0 | 100 |
| 1 | reserve 10 | 100 | 10 | 90 |
| 2 | allocate 10 to W1 | 100 | 10 | 90 |
| 3 | pick 10 (sellable→picked; consumed+=10) | 90 | 0 | 90 |
| 4 | pack 10 (picked→packed_or_staging) | 90 | 0 | 90 |
| 5 | ship 10 (issue from packed_or_staging) | 90 | 0 | 90 |

Availability at every intermediate step equals the buyer-visible reality; there is never a transient double subtraction or double release.

Cancellation before pick (branch off step 2):

| Step | Action | `sellable_on_hand` | `active_reserved_base_units` | `base_available_to_sell` |
|------|--------|-------------------|------------------------------|--------------------------|
| 2 | (as above) | 100 | 10 | 90 |
| 3' | cancel-before-pick, release 10 | 100 | 0 | 100 |

Cancellation after pick, before ship (branch off step 3):

| Step | Action | `sellable_on_hand` | `active_reserved_base_units` | `base_available_to_sell` |
|------|--------|-------------------|------------------------------|--------------------------|
| 3 | pick 10 | 90 | 0 | 90 |
| 4' | reverse pick (picked→sellable, release 10) | 100 | 0 | 100 |

Cancellation after ship: `sellable_on_hand` stays at 90 in the shipped example; recovery requires a return (§21.4).

`active_reservations` and `active_reserved_base_units` are computed from reservation lines only. §20.1's `reservation_allocate` / `reservation_release` / `reservation_consume` `transaction_type` values on the physical ledger are **superseded** — those are no longer legal physical transaction types.

### 21.3 Reservation model supporting packs and multi-SKU bundles

Replaces §6 and §20.2 with a header/line/allocation model. One reservation per demand (order line or auction lot item), with one line per required SKU.

**`inventory_reservation_headers`**
- `id` (uuid, PK)
- `company_id` (FK, not null)
- `source_kind` — enum: `order_line`, `auction_lot_item`, `manual_hold`
- `source_id`
- `status` — enum: `active`, `fully_consumed`, `fully_released`, `cancelled`, `short`
- `created_at`, `updated_at`
- `UNIQUE (source_kind, source_id)`

**`inventory_reservation_lines`**
- `id` (uuid, PK)
- `reservation_id` (FK to headers, not null)
- `sellable_sku_id` (FK, not null)
- `required_base_quantity` (int, > 0)
- `consumed_quantity` (int, ≥ 0)
- `released_quantity` (int, ≥ 0)
- `UNIQUE (reservation_id, sellable_sku_id)`
- CHECK: `consumed_quantity + released_quantity ≤ required_base_quantity`

**`inventory_reservation_allocations`** (replaces §20.2)
- `id` (uuid, PK)
- `reservation_line_id` (FK, not null)
- `warehouse_id` (FK, not null)
- `location_id` (FK, nullable — see §21.6)
- `allocated_quantity` (int, ≥ 0)
- `consumed_quantity` (int, ≥ 0)
- `released_quantity` (int, ≥ 0)
- `created_at`, `updated_at`
- CHECK: `consumed_quantity + released_quantity ≤ allocated_quantity`

**Required-quantity rules per listing type:**

- `SIMPLE`: exactly one line, `required_base_quantity = order_quantity × 1`.
- `PACK`: exactly one line, `required_base_quantity = order_quantity × units_per_offer`.
- `BUNDLE` (non-assembled): one line per component, `required_base_quantity = order_quantity × component.quantity_per_offer`.
- `BUNDLE` (assembled): one line against `assembled_bundle_sku_id`, `required_base_quantity = order_quantity`.

**Atomicity.** Header + all lines + initial allocations are created in a single SQL transaction. If any component line cannot be reserved (globally insufficient `base_available_to_sell` or warehouse allocation infeasible under the current policy), the whole transaction rolls back. There is no silent partial reservation. If policy allows a header to accept partial creation, it enters `status = 'short'` explicitly, with the shortfall recorded per line; `active_reserved_base_units` still only reflects the successfully reserved portion.

**Cross-line invariants (per header):**

- `SUM(consumed_quantity over lines) + SUM(released_quantity over lines) ≤ SUM(required_base_quantity over lines)` — trivially implied by per-line invariant.
- Per line: `SUM(allocation.allocated_quantity) = line.required_base_quantity` once fully allocated.
- Per line: `SUM(allocation.consumed_quantity) = line.consumed_quantity`, `SUM(allocation.released_quantity) = line.released_quantity`.
- Header `status`:
  - `active` while any line has `consumed + released < required`.
  - `fully_consumed` iff every line has `consumed = required`.
  - `fully_released` iff every line has `released = required`.
  - `cancelled` iff every line has `consumed + released = required` and at least one line has `released > 0` (mixed-outcome cancellation).
  - `short` iff created deliberately with unmet required quantity; blocks fulfilment.

**Bundle numeric example.** Listing `L` is a BUNDLE with components `A` (`quantity_per_offer = 2`) and `B` (`quantity_per_offer = 3`). Order quantity = 5 offers.

- Line for `A`: `required_base_quantity = 5 × 2 = 10`.
- Line for `B`: `required_base_quantity = 5 × 3 = 15`.

Starting `base_available_to_sell(A) = 40`, `base_available_to_sell(B) = 30`. After atomic reserve:

- `active_reserved_base_units(A) += 10` → new `base_available_to_sell(A) = 30`.
- `active_reserved_base_units(B) += 15` → new `base_available_to_sell(B) = 15`.
- Bundle `offer_available(L) = min(floor(30/2), floor(15/3)) = min(15, 5) = 5`.

If `base_available_to_sell(B)` had been `12` at reserve time, line `B` would fail (`required 15 > 12`), rolling back the whole reservation — line `A` is never partially reserved.

**Pack numeric example.** Listing `M` is `PACK` with `units_per_offer = 6` and `base_sku_id = X`, `base_available_to_sell(X) = 100`. Order quantity = 3 offers.

- Line for `X`: `required_base_quantity = 3 × 6 = 18`.
- After reserve: `base_available_to_sell(X) = 82`, `offer_available(M) = floor(82/6) = 13`.

**Stocktake shortage (updated).** For a stocktake in warehouse `W` (and optionally `L`), the reservation quantity offset is `SUM(allocation.allocated_quantity - allocation.consumed_quantity - allocation.released_quantity)` **over allocations with `warehouse_id = W`** (and `location_id = L` when set), summed per SKU. Never use the global line total. This supersedes §20.2's stocktake wording where it was implicit.

### 21.4 Complete physical fulfilment state machine

Physical states materialize as `inventory_balances` rows keyed by `(sellable_sku_id, warehouse_id, location_id, disposition)`. The complete disposition set is:

- `sellable`
- `picked`
- `packed_or_staging`
- `in_transfer`
- `returned_pending_inspection`
- `quarantine`
- `damaged`
- `write_off` (terminal book-keeping only; not physically present)

`inbound_expected` remains a **planned-inbound projection** (not a physical balance) or is dropped from balances entirely — the physical shelf never shows `inbound_expected` stock. This section supersedes any earlier list that included `inbound_expected` or `reserved_hold` as first-class physical dispositions.

**Canonical movements:**

| Movement | Entries | `transaction_type` | Conserving? | Reason required? |
|---|---|---|---|---|
| Pick | `-sellable`, `+picked` (same SKU/WH) | `pick` | Yes | No |
| Pick reversal (pre-ship cancel) | `-picked`, `+sellable` | `pick_reversal` | Yes | No |
| Pack / stage | `-picked`, `+packed_or_staging` | `pack` | Yes | No |
| Ship (customer shipment) | `-packed_or_staging` | `ship` | **No — external issue** | Yes: `customer_shipment` |
| Warehouse transfer out | `-sellable`, `+in_transfer` | `warehouse_transfer_out` | Yes | No |
| Warehouse transfer in | `-in_transfer`, `+sellable` | `warehouse_transfer_in_arrival` | Yes | No |
| Location transfer | `-sellable@L1`, `+sellable@L2` | `location_transfer` | Yes | No |
| Return receipt | `+returned_pending_inspection` | `return_receive` | **No — external receipt** | Yes: `customer_return` |
| Return restock | `-returned_pending_inspection`, `+sellable` | `return_disposition` | Yes | No |
| Return to quarantine | `-returned_pending_inspection`, `+quarantine` | `return_disposition` | Yes | No |
| Return to damaged | `-returned_pending_inspection`, `+damaged` | `return_disposition` | Yes | No |
| Write-off | `-<any>`, `+write_off` | `write_off` | **No — issue** | Yes: `damage_write_off` |
| Receipt (inbound from supplier) | `+sellable` (or `+quarantine`) | `receipt` | **No — external receipt** | Yes: `external_receipt` |
| Stocktake delta | `±sellable` (or affected disposition) | `stocktake_adjust` | **No** | Yes: `stocktake_delta` |
| Manual correction | `±<disposition>` | `manual_correction` | Non-conserving allowed | Yes: `authorized_manual` |

**Rules:**

- `ship` is **not** conserving inside company inventory. It is an authorized external issue that decrements `packed_or_staging` without a matching increment. This corrects §20.1's implicit treatment of `ship` as a conserving type.
- `receipt` and `return_receive` are external inbound; only they may add balance without a matching debit.
- The reservation-linked types `reservation_allocate`, `reservation_release`, `reservation_consume` are removed from the physical `transaction_type` enum (see §21.2). Reservation history lives in `reservation_events`.
- `pick` in the physical ledger is paired atomically with a reservation-line/allocation `consumed_quantity` increment (§21.2), but the reservation increment is not itself a physical entry.

**Availability invariant across the full flow (base units per SKU):**

```
base_available_to_sell
= sellable_on_hand
  - active_reserved_base_units
  - sku_safety_buffer
```

with `sellable_on_hand` counting only `sellable` disposition on `is_enabled_for_sales` warehouses and `is_pickable` locations. `picked`, `packed_or_staging`, `in_transfer`, `returned_pending_inspection`, `quarantine`, `damaged`, `write_off` are excluded from `sellable_on_hand`. Combined with §21.2's pick/ship coordination this guarantees each shipped base unit is subtracted from availability exactly once (at reserve), reappears in `sellable_on_hand` only if physically restocked, and is never counted in two dispositions simultaneously.

### 21.5 Ownership-transfer enforcement (implementable)

The at-most-one active owner must be enforced by a mechanism that admits the documented atomic transfer sequence. A **non-deferrable** partial unique index on `(company_id) WHERE role='company_owner' AND status='active'` blocks the "insert new owner before deactivating old owner" order and is therefore rejected.

**Chosen enforcement:**

1. `transfer_company_ownership(_company_id, _new_owner_user_id)` is a `SECURITY DEFINER` function.
2. It first executes `SELECT pg_advisory_xact_lock(hashtext('company_ownership:' || _company_id))` (or a table row-lock via `SELECT … FROM companies WHERE id = _company_id FOR UPDATE`) to serialize concurrent transfers on the same company.
3. In the same transaction: deactivate the current active `company_owner` role assignment, then insert/activate the new one.
4. A `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `company_member_roles` (and on `company_members.status` transitions that could affect ownership) validates at commit that exactly one active `company_owner` row exists for `_company_id`. Any violation aborts the transaction.
5. **No partial unique index is used for at-most-one.** Uniqueness is enforced by the same deferred trigger checking `COUNT(*) = 1`, not by an index. This keeps the transfer sequence order-agnostic and avoids the impossible-ordering problem.
6. Concurrent readers observe the old committed owner until the transfer commits under standard MVCC; readers never see zero or two owners.
7. Concurrent ownership transfers on the same company block on the advisory/row lock and serialize.

**Concurrency test (documented, to be implemented in the ownership phase):**

- T1: `BEGIN; transfer_company_ownership(C, U2);` (holds lock; deactivates U1, inserts U2 active).
- T2 (parallel): `BEGIN; transfer_company_ownership(C, U3);` — must block on the lock.
- T1 `COMMIT` — deferred trigger validates one active owner; succeeds.
- T2 proceeds — reads U2 as current owner, deactivates U2, inserts U3, commits under same rules.
- Third session concurrently reading `company_members` never observes zero or two active owners at any snapshot.

This section supersedes §2.2 and §20.11 wherever they imply that a partial unique index alone provides at-most-one during the transfer sequence.

### 21.6 Transaction-entry key and balance identity (no nullable PK columns)

`inventory_transaction_entries` uses a synthetic PK; nullable columns never participate in a primary key.

**`inventory_transaction_entries`**
- `id` (uuid, PRIMARY KEY)
- `transaction_id` (FK, not null)
- `sellable_sku_id` (FK, not null)
- `warehouse_id` (FK, not null)
- `location_id` (FK, nullable — see below)
- `disposition` (enum, not null; from §21.4)
- `quantity_delta` (int, non-zero)
- `lot_id` (FK to `inventory_lots`, nullable — see below)
- `serial_id` (FK to `inventory_serials`, nullable — see below)
- `created_at`

**Duplicate-entry prevention within a transaction (optional uniqueness):**

If duplicate lines within the same transaction must be prevented, use a **unique index with `NULLS NOT DISTINCT`**:

```
UNIQUE INDEX ON inventory_transaction_entries
  (transaction_id, sellable_sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)
  NULLS NOT DISTINCT
```

`NULLS NOT DISTINCT` (Postgres 15+) is required so that two rows with the same non-null columns and `location_id = NULL` collide as intended. If policy allows multiple entry lines for the same (SKU, WH, disposition) within one transaction — e.g. a bulk correction split across reasons — omit this index and rely on entries being additive.

**`inventory_balances` — unique identity**

- `id` (uuid, PRIMARY KEY)
- `company_id`, `sellable_sku_id`, `warehouse_id`, `location_id NULL`, `disposition`, `lot_id NULL`, `serial_id NULL`, `quantity`, `updated_at`
- Uniqueness enforced by:
  ```
  UNIQUE INDEX ON inventory_balances
    (sellable_sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)
    NULLS NOT DISTINCT
  ```
- `CHECK (quantity >= 0)`.

**When `location_id` may be NULL:**

- Only for warehouses configured with `requires_location = false` (small/simple warehouses treated as a single bin). A CHECK on `inventory_balances` and on `inventory_transaction_entries` enforces `(location_id IS NOT NULL) OR (warehouse.requires_location = false)`. Location-required warehouses reject NULL `location_id` on both tables.

**Lot-tracked SKUs:**

- `sellable_sku.tracking_mode ∈ {none, lot, serial}`.
- If `tracking_mode = 'lot'`: every entry and balance for that SKU must carry a non-null `lot_id`; a trigger rejects null. Lots live in `inventory_lots(id, sku_id, lot_code, expiry_at NULL, received_at)`, `UNIQUE (sku_id, lot_code)`.
- If `tracking_mode = 'none'`: `lot_id` must be null on entries and balances for that SKU.

**Serial-tracked SKUs:**

- If `tracking_mode = 'serial'`: every entry and balance carries a non-null `serial_id`; `|quantity_delta| = 1` per entry, and balance `quantity ∈ {0, 1}` per serial. Serials live in `inventory_serials(id, sku_id, serial_code, status)`, `UNIQUE (sku_id, serial_code)`.
- If `tracking_mode = 'none'` or `'lot'`: `serial_id` must be null.

**Duplicate-balance prevention.** The `NULLS NOT DISTINCT` unique index on `inventory_balances` is the sole guarantee that a given `(SKU, WH, location, disposition, lot, serial)` has at most one balance row. All writers (entry-applying trigger, reconciliation job) upsert on this key.

This section supersedes §20.1's `PK: (transaction_id, sellable_sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)` and any earlier text implying nullable columns in a primary key.

### 21.7 Canonical permission registry

Every RLS policy, `SECURITY DEFINER` helper, RPC and MCP tool must reference exactly one of these keys. Aliases are forbidden unless explicitly listed here.

**Registry:**

```
catalog.read
catalog.write
catalog.publish
catalog.suggest        -- create suggestions; distinct from write
catalog.approve        -- accept/reject seller-facing suggestions

inventory.read
inventory.adjust
inventory.transfer
inventory.stocktake

orders.read
orders.manage          -- write/update/state-machine transitions on orders and items
orders.refund

returns.manage
returns.inspect

auctions.read
auctions.create
auctions.cancel

channels.read
channels.connect       -- create/configure a channel_account, store credentials
channels.activate      -- transition control_state (read_only_import → shadow → active)
                       -- and manage lifecycle (pause/resume/disable)

members.read
members.manage
members.transfer_ownership

finance.read

agent.invoke
agent.approve_suggestions

platform.moderation    -- marketplace-wide aggregates only; see §20.9
```

**Alias mapping (superseded → canonical):**

| Superseded name (used in §15 / §20.8) | Canonical key |
|---|---|
| `orders.write` | `orders.manage` |
| `channels.manage` | `channels.connect` (credentials/config) **or** `channels.activate` (lifecycle) — pick per action |
| `catalog.suggest` in §20.8 rows 14–15 | `catalog.suggest` (retained; now formally registered) |
| `agent.approve_suggestions` | unchanged; retained |

**MCP tool re-binding (supersedes §20.8 where different):**

- `create_product_draft` → `catalog.write`.
- `suggest_product_content` → `catalog.read` + `catalog.suggest`.
- `recommend_price` → `catalog.read` + `catalog.suggest`.
- `decide_product_suggestion` (RPC) → `catalog.approve` + `agent.approve_suggestions`.
- `update_order_status` → `orders.manage`.
- `bol_configure` → `channels.connect`.
- `bol_import_products` → `channels.connect` + `catalog.write`.
- Channel activation transitions (Phase 10) → `channels.activate`.
- `monitor_marketplace_quality` → `platform.moderation`.
- All read tools (`list_my_products`, `analyze_catalog`, `detect_listing_problems`) → `catalog.read`.
- `analyze_sales`, `list_seller_orders` → `orders.read`.
- `analyze_inventory` → `inventory.read`.
- `forget_memory` → self (no capability key required).

No code, migration or tool has been changed by this section. When implementation begins, every policy and tool must be spelled from the canonical registry above.

### 21.8 Revision 3.1 conflict map

Where §21 conflicts with earlier sections (including §20), §21 supersedes and replaces the conflicting text. All earlier text remains readable for context; the compiler for implementation is §21.

| # | Earlier section | Conflicting earlier statement | Replacement rule in §21 | Status |
|---|---|---|---|---|
| 1 | §4.4, §5, §20.5 | Formulas subtracting `sku_safety_buffer` at availability scope *and* re-subtracting `sku_buffer` at listing scope. | §21.1: `sku_safety_buffer` deducted **exactly once** inside `base_available_to_sell`; listing formulas consume that value directly. | Superseded. |
| 2 | §20.1 | Physical `transaction_type` enum includes `reservation_allocate`, `reservation_release`, `reservation_consume`; `disposition` enum includes `reserved_hold`. | §21.2: logical reservations do **not** write physical entries. `reserved_hold` removed. Reservation history lives in `reservation_events`. | Superseded. |
| 3 | §6, §20.2 | Reservations are one row per source with warehouse-scoped allocations, but no per-component decomposition — cannot represent multi-SKU bundles. | §21.3: `inventory_reservation_headers` + `inventory_reservation_lines` + `inventory_reservation_allocations`. One line per required SKU. Atomic reserve across all components. | Superseded. |
| 4 | §11, §20.2 | Stocktake shortage math referenced global reservation total or all-warehouse allocations. | §21.3: shortage math sums allocations matching the counted `warehouse_id` (and `location_id` when set) per SKU. | Superseded (reaffirming §20.2 direction and extending to lines). |
| 5 | §20.1 | `ship`, `pack`, `pick` treated as conserving physical transactions; `ship` implicit. | §21.4: `ship`, `receipt`, `return_receive`, `stocktake_adjust`, `write_off`, `manual_correction` are non-conserving with required reason codes; `pick`, `pack`, `pick_reversal`, `location_transfer`, `warehouse_transfer_*`, `return_disposition` are conserving. | Superseded. |
| 6 | §4.2, §20.1 | Balance dispositions listed `reserved_hold` and/or `inbound_expected` as physical states. | §21.4: canonical physical dispositions are `sellable`, `picked`, `packed_or_staging`, `in_transfer`, `returned_pending_inspection`, `quarantine`, `damaged`, `write_off`. `reserved_hold` removed; `inbound_expected` is not a physical balance. | Superseded. |
| 7 | §2.2, §20.11 | At-most-one active owner enforced by a partial unique index while the transfer sequence "grants new owner *before* revoking old owner." | §21.5: no partial unique index; a deferred constraint trigger enforces both at-most-one and at-least-one at commit, combined with an advisory/row lock in `transfer_company_ownership`. Transfer order is unconstrained. | Superseded. |
| 8 | §20.1 | `inventory_transaction_entries` PK: `(transaction_id, sellable_sku_id, warehouse_id, location_id, disposition, lot_id, serial_id)` with nullable columns in the PK. | §21.6: PK is synthetic `id uuid`. Optional uniqueness via `NULLS NOT DISTINCT` unique index. `inventory_balances` unique identity via `NULLS NOT DISTINCT` index. Lot/serial tracking modes formalized. | Superseded. |
| 9 | §15, §20.8 | Permission keys `orders.write`, `channels.manage`, `catalog.suggest` (unregistered), alongside `orders.manage`, `channels.connect`, `channels.activate` in earlier sections. | §21.7: canonical registry is authoritative. `orders.write` → `orders.manage`. `channels.manage` → `channels.connect` **or** `channels.activate` per action. `catalog.suggest` and `catalog.approve` registered. `platform.moderation` registered. | Superseded. |
| 10 | §20.1 non-conserving reason set | Listed `external_receipt`, `damage_write_off`, `stocktake_delta`, `authorized_manual`, `customer_return`. | §21.4 adds `customer_shipment` (required for `ship`). Other reasons retained. | Extended (compatible extension). |

### 21.9 Verification

- **Safety-buffer double subtraction:** removed. Only §21.1's `base_available_to_sell` subtracts `sku_safety_buffer`; downstream formulas do not.
- **Reservation double counting:** removed. Physical stock stays in `sellable` while logically reserved; `active_reserved_base_units` provides the sole availability offset; pick pairs the physical decrement with the reservation `consumed_quantity` increment atomically. Worked examples in §21.2 confirm availability at every transition.
- **Packs and bundles:** representable via `inventory_reservation_headers` + one line per required SKU, with base-quantity conversion applied on line creation.
- **Physical fulfilment:** complete disposition set and canonical movements defined; `ship` is explicitly non-conserving.
- **Ownership transfer:** implementable — deferred trigger + advisory/row lock; no non-deferrable partial unique index blocks the sequence.
- **Nullable PK contradiction:** removed — synthetic `id` PK with `NULLS NOT DISTINCT` unique indexes for identity.
- **Permission naming:** single canonical registry with an explicit alias map.

No unresolved contradiction remains between §21 and any earlier section under the precedence rule stated at the top of §21.

---

Revision 3.1 is presented for final architectural review. No code, migrations, tools or UI have been changed.


