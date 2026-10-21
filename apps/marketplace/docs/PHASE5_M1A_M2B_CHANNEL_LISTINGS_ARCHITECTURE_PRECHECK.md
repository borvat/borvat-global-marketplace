# PHASE 5 · M1A · Migration #2B — Channel Listings Architecture Precheck

**Status:** READ-ONLY ANALYSIS. No migration applied, no data mutated, no
listings created, no publication path activated.
**Scope authority:** Owner authorization "M1A #2B PRECHECK — CHANNEL LISTINGS
ARCHITECTURE COMPATIBILITY" (read-only, analytical).
**Author:** Lovable agent.
**Related:** BOR-DEC-031 (M1A #1), BOR-DEC-032 (M1A #2A), Phase 3 M1 (outbox
lockdown), Phase 4 M4 (Bol live outbound).

---

## 0. Confirmation of non-mutation

- Zero `INSERT` / `UPDATE` / `DELETE` / `ALTER` / `CREATE` executed against
  the database in this precheck. All observations come from `pg_catalog`,
  `information_schema`, `pg_get_functiondef`, and repository file reads.
- No file under `supabase/migrations/` was added or modified.
- No RPC, worker, edge function, or outbox handler was invoked.
- `place_order` remains locked (P5-HF-001). `bol.live_authorized_at` remains
  NULL. Phase 4 M5 live-write lock unchanged.

---

## 1. `channel_listings` — live schema findings

### 1.1 Columns

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `channel_account_id` | uuid | NOT NULL | — |
| `sku_id` | uuid | NULL | — |
| `offer_id` | uuid | NULL | — |
| `external_listing_id` | text | NULL | — |
| `units_per_offer` | integer | NOT NULL | `1` |
| `channel_cap` | integer | NULL | — |
| `control_state` | `p2_channel_control_state` | NOT NULL | `'read_only_import'` |
| `published_quantity` | integer | NOT NULL | `0` |
| `published_version` | bigint | NOT NULL | `0` |
| `last_published_at` | timestamptz | NULL | — |
| `status` | `p2_lifecycle_status` | NOT NULL | `'draft'` |
| `created_at` / `updated_at` | timestamptz | NOT NULL | `now()` |

### 1.2 Keys, constraints, indexes

- **PK:** `id`.
- **FKs (all `ON DELETE RESTRICT`):**
  `channel_account_id → channel_accounts(id)`,
  `company_id → companies(id)`,
  `sku_id → catalog_skus(id)`,
  `offer_id → catalog_offers(id)`.
- **Unique:** `(channel_account_id, external_listing_id)`.
- **CHECK `channel_listings_check`:** `(sku_id IS NOT NULL) <> (offer_id IS NOT NULL)`
  — enforces **SKU XOR Offer**, i.e. every listing points at exactly one
  publishable object.
- **CHECK:** `channel_cap IS NULL OR channel_cap >= 0`
  (NULL = unlimited, confirmed).
- **CHECK:** `published_quantity >= 0`, `units_per_offer > 0`.
- **Indexes:** company, account, unique external.

### 1.3 Triggers

- `channel_listings_immutable_company_id` (BEFORE UPDATE) — freezes tenancy.
- `channel_listings_touch` (BEFORE UPDATE) — bumps `updated_at`.
- `channel_listings_validate_refs` (BEFORE INSERT/UPDATE, SECURITY DEFINER,
  `search_path=''`) — asserts `channel_account.company_id`,
  `catalog_skus.company_id`, and `catalog_offers.company_id` all equal
  `NEW.company_id`. **This is DB-level tenant isolation for listings.**

### 1.4 RLS and policies

RLS **enabled**. Policies (`TO authenticated`):

| Policy | Cmd | Predicate |
|---|---|---|
| `channel_listings_select` | SELECT | `company_member_has_permission(company_id, auth.uid(), 'channels.read')` |
| `channel_listings_insert` | INSERT | `company_member_has_permission(company_id, auth.uid(), 'listings.manage')` |
| `channel_listings_update` | UPDATE | same |

There is **no DELETE policy** → DELETE is RLS-blocked for every role that
respects RLS.

### 1.5 GRANT matrix (from `pg_class.relacl`)

| Role | S | I | U | D |
|---|---|---|---|---|
| `postgres` | ✓ | ✓ | ✓ | ✓ |
| `service_role` | ✓ | ✓ | ✓ | ✓ |
| `authenticated` | ✓ | ✓ | ✗ (revoked by P3 M1) | ✓ (privilege only; RLS blocks) |
| `anon` | ✓ | ✓ | ✗ | ✓ (privilege only; RLS blocks) |
| `sandbox_exec` | ✓ | ✓ | ✗ | ✗ |

**Residual finding RR-2B-A:** `authenticated` and `anon` retain table
`INSERT` / `DELETE` privileges (RLS-gated). This is not exploitable via the
Data API (RLS + permission checks reject writes), but it does not match the
"RPC-only writes" hardening pattern used by `merchant_stores` and
`channel_accounts`. **Do not widen; consider tightening in the next
authorized hardening pass.** Do not tighten in this precheck.

### 1.6 Referenced-by

- `channel_listing_audit`, `outbox_events`, `channel_live_dispatches`,
  `channel_shadow_dispatches`, `channel_reconciliation_findings` — all
  `ON DELETE RESTRICT`. A listing cannot be silently removed once any
  auditable/outbox row exists.

### 1.7 Row-count by provider

```
provider=bol · status=draft : 115
```
All existing rows are Bol, all `draft`, no Bol live activation. Zero rows for
any other provider (`borvat_direct`, `shopify`).

### 1.8 Semantic classification

`channel_listings` is a **channel publication** of one internal publishable
object (a SKU **or** an Offer) onto one channel account, with its own
version, published quantity, cap, and lifecycle. It is **not** a product, not
a SKU, not an offer, and not a mixed concept. Product / SKU / Offer identity
lives in `catalog_products` / `catalog_skus` / `catalog_offers`; the listing
row is the *projection* onto a channel.

---

## 2. Writers, readers, and dispatch paths

### 2.1 Functions referencing `channel_listings` (live DB)

| Function | Role | Provider assumption |
|---|---|---|
| `_channel_listings_validate_refs` | trigger, tenancy guard | provider-agnostic |
| `set_channel_published_quantity` | trusted RPC, publishes a new quantity + version, writes audit | provider-agnostic; does **not** enqueue outbox by itself |
| `_p4_enqueue_bol_write` | P4 M4 outbound writer | **Bol-only** — hard-codes `channel_connections.provider = 'bol'` and raises `no bol connection for channel account` otherwise |
| `enqueue_outbox_event` | P3 M1 outbox insert | provider-agnostic on shape; caller decides |
| `reenqueue_drift_finding` | P3 M3 reconciliation replay | reads listing, calls back through Bol-gated path |
| `run_reconciliation` | P3 M3 | reads listings within a batch; provider-agnostic read; downstream findings feed `_p4_enqueue_bol_write` |

### 2.2 Repository writers (grep-audited)

- `supabase/migrations/*` — DDL only.
- `scripts/phase2-mig4-*`, `scripts/phase3-m3-tests.ts`,
  `scripts/phase4-m3-tests.ts`, `scripts/phase4-m4-*` — test suites; write
  listings via `service_role` in isolated schemas. Not app code.
- `src/lib/outbox/bol-adapter.ts`, `src/lib/outbox/bol-worker.ts` — read
  outbox rows and dispatch to **Bol** endpoints only. They never read
  `channel_listings` directly; they consume outbox events whose upstream
  producer is `_p4_enqueue_bol_write`. **A listing that never produces an
  outbox event never reaches the adapter.**
- `src/routes/**`, `src/lib/mcp/tools/**`, `src/lib/order-status*` — no
  writes to `channel_listings`. No client-side seller UI creates listings.

### 2.3 External-dispatch reachability for a hypothetical `borvat_direct` listing

A row with `channel_account_id` pointing at a `borvat_direct` account would:

1. Insert-time: cleared by `_channel_listings_validate_refs` (provider-
   agnostic).
2. `set_channel_published_quantity`: **would run**. It updates
   `published_quantity` / `published_version` and writes
   `channel_listing_audit`. **It does not enqueue an outbox event.** So this
   alone does not cause any external dispatch.
3. `_p4_enqueue_bol_write`: **would refuse** — the SELECT on
   `channel_connections WHERE provider='bol'` finds nothing for a
   `borvat_direct` account (there is no channel_connection at all for
   `borvat_direct`, and the account is fail-closed at `control_state='paused'`
   / `status='draft'`). It raises `no bol connection for channel account`.
4. Bol worker / adapter: reads `outbox_events` only. With no event enqueued,
   nothing to dispatch. Even if a stray outbox row were injected, the adapter
   authenticates against Bol credentials keyed on the `channel_connection`,
   which does not exist for `borvat_direct`. **No external dispatch is
   possible.**
5. Reconciliation: `run_reconciliation` requires a Bol snapshot batch and a
   Bol channel account; `borvat_direct` accounts do not receive Bol
   snapshots.

**Result:** `borvat_direct` listings are inert against every Bol-only writer
in the system. There is **no path** by which a `borvat_direct` row can be
dispatched externally through the current code base.

---

## 3. Inventory model impact

- `channel_listings.published_quantity` is a **channel-side declaration of
  what has been published to the outside world**, versioned and audited. It
  is **explicitly separate from inventory truth** — the founding comment in
  the P2 M3 migration (line 305) states this in-source: *"published quantity
  is EXPLICITLY separate from inventory & reservations."*
- Inventory truth lives in `inventory_balances`, `inventory_lots`,
  `inventory_reservation_*`, and `inventory_transaction_*`. Creating a
  `channel_listings` row **does not** touch any of those tables. No trigger,
  no RPC, and no worker performs `channel_listings → inventory` writes.
- `channel_cap IS NULL` is treated as unlimited by `set_channel_published_quantity`
  (only cap-crossing is rejected; NULL cap short-circuits the check).
- Double-subtraction risk: none from listing creation — inventory movement
  flows only through `place_order` / reservation RPCs and the Phase 2
  fulfilment path, all of which are independently locked
  (`place_order` EXECUTE is revoked under P5-HF-001; `borvat_direct` has no
  storefront/checkout wired).
- A draft listing can be created without any reservation or stock mutation.

---

## 4. Pricing / tax model impact

- **`channel_listings` carries no price, no currency, no VAT.** Price lives
  on `catalog_offers.price_cents` + `merchant_stores.currency` /
  `merchant_stores.locale` and (for Bol) on Bol's own side of the sync.
- No table column encodes "gross vs net", "VAT snapshot", or "publish price"
  on the listing row.
- Creating a listing does not surface a price to any customer route. No
  public storefront reads `channel_listings`; buyer-facing routes (`/`,
  `/product.$id`, `/search`) read `products` / `catalog_*` and the seeded
  demo catalog.
- There is no code assuming price arrives via a Bol import path on the
  listing row itself; Bol price is written through
  `bol.offer.price.set` outbox events, gated on the same
  `_p4_enqueue_bol_write` (Bol-only).

Pricing is therefore **out of the surface area** of this precheck and does
not need to be resolved before a draft-only Borvat-Direct listing shape can
exist.

---

## 5. Lifecycle safety

`p2_lifecycle_status` values: `draft`, `active`, `inactive`, `archived`.
`p2_channel_control_state`: `read_only_import`, `shadow`, `active`, `paused`.

Default row shape: `status='draft'`, `control_state='read_only_import'`,
`published_quantity=0`, `published_version=0`, `last_published_at=NULL`.

Behavioral audit of `draft` + `read_only_import` (or `paused`):

| Concern | Behavior | Evidence |
|---|---|---|
| Customer visibility | None — no buyer route reads `channel_listings`. | `rg channel_listings src/routes` returns nothing. |
| External publish | None — `_p4_enqueue_bol_write` is the sole outbox producer and is Bol-only. | Function body. |
| Inventory sync | None — no trigger/worker writes inventory from listing state. | grep + function inventory. |
| Outbox emission | Requires an explicit `_p4_enqueue_bol_write` call — a raw INSERT never enqueues. | Function inventory. |
| Adapter dispatch | Worker consumes `outbox_events`; without an event, nothing runs. | `src/lib/outbox/bol-worker.ts`. |
| Search index | No search index over listings; catalog search reads `products`. | grep. |

`status='draft'` on a `borvat_direct` account (which is itself
`control_state='paused'`, `status='draft'`, `live_authorized_at IS NULL`,
`external_account_id IS NULL`) therefore satisfies **all six** safety
predicates simultaneously.

**Verdict:** A safe Borvat-Direct draft state **already exists** using the
existing enum values. No new lifecycle state is required for a precheck-safe
draft listing. **NO SAFE STATE ⇒ NOT TRUE.** This finding is recorded
positively rather than as a blocker.

---

## 6. RLS and tenant isolation (theoretical proof)

1. `channel_listings_select/insert/update` predicate is
   `company_member_has_permission(company_id, auth.uid(), <perm>)`. A user
   who is not a member of `company_id` fails the predicate; RLS strips the
   row. Company A cannot read Company B's listings.
2. `_channel_listings_validate_refs` (SECURITY DEFINER, `search_path=''`)
   verifies at write time that the referenced `channel_account`, `sku`, and
   `offer` all share `NEW.company_id`. Store A cannot bind a listing to Store
   B's channel account, because Store B's account belongs to Company B.
3. `merchant_store_id` is derivable from `channel_account_id` in one join
   (added by M1A #2A, `channel_accounts.merchant_store_id`). A listing does
   **not** need its own `merchant_store_id` column; the derivation is
   authoritative and enforced by the store↔account company-consistency
   trigger added in M1A #2A.
4. Using a foreign company's `channel_account_id` is blocked by the same
   validate-refs trigger (company mismatch).
5. `authenticated` still has table-level `INSERT`/`DELETE` privileges. RLS
   blocks DELETE (no policy) and INSERT (predicate). This is the RR-2B-A
   grant-hygiene residual from §1.5 — **not** a tenant-leak path.
6. No `PUBLIC` or `anon` policy exists; `anon` RLS predicates evaluate false.
7. No new `sandbox_exec` privilege is required to reuse this table; its
   current `SELECT/INSERT` is sufficient for existing test harnesses. **We
   will not widen it.**

---

## 7. External-provider assumption map

| Path | Provider assumption | Effect on a `borvat_direct` listing |
|---|---|---|
| `_p4_enqueue_bol_write` (RPC) | Hard `provider='bol'` on connection | Refuses. **Safe.** |
| `bol-adapter.ts`, `bol-worker.ts` | Consume outbox events for Bol | Never invoked (no event). **Safe.** |
| `channel_connections` lookups | Every callsite filters on `provider='bol'` | Empty result for `borvat_direct`. **Safe.** |
| Reconciliation (`run_reconciliation`, `channel_snapshot_batches`) | Requires Bol snapshots | Never fires for `borvat_direct`. **Safe.** |
| `channel_ean_map`, `channel_imported_offers` | Bol import queue | Not reached. **Safe.** |
| Provider-generic writes | `set_channel_published_quantity` is provider-agnostic and does **not** dispatch externally | Runs; is DB-only; still requires `listings.manage` permission. **Safe by design.** |
| OAuth / credentials | `seller_bol_credentials`, `channel_connections.secret_ref` — Bol only | Not reached. **Safe.** |

No path routes `borvat_direct` rows into Bol/Shopify dispatch. No
`ARCHITECTURE BLOCKER` identified.

---

## 8. Alternatives (analysis only — no application)

### Alternative A — Reuse `channel_listings` directly, no schema change

- **Shape:** Insert `borvat_direct` rows with `status='draft'`,
  `control_state='read_only_import'` (or `'paused'`), `published_quantity=0`,
  `published_version=0`, `sku_id` or `offer_id` set per the existing XOR.
- **Pros:** Zero migrations. Zero new source of truth. Reuses all existing
  RLS, tenancy triggers, and audit trail. Fully additive at the *data*
  level.
- **Cons:** RR-2B-A (broad `authenticated` INSERT privilege) stays open.
  `_p4_enqueue_bol_write` remains the only version-bumping publish path
  aware of provider; a future Borvat-Direct publish RPC would need to be
  authored to avoid the Bol path. `external_listing_id` semantics are
  undefined for internal-channel rows (nullable, unique per account — OK).
- **Objects touched:** none (writes are data, and this precheck applies
  none).
- **RLS:** unchanged.
- **Migration count:** 0 for shape; 1 later if we choose to tighten grants
  or add a small classification column.
- **Rollback:** N/A (no schema change).
- **Phase 2–4 impact:** none — Bol-only paths ignore these rows by
  construction.
- **Duplicate source of truth?** No.

### Alternative B — Small additive extension on `channel_listings`

- **Shape:** Add nullable columns and an internal-channel classifier, e.g.
  `merchant_store_id uuid REFERENCES merchant_stores(id)` (denormalized for
  fast filtering; validated by a trigger to match the account's store),
  plus optionally an `internal_channel boolean GENERATED ALWAYS AS
  (channel_account_id IN (SELECT id FROM channel_accounts WHERE provider =
  'borvat_direct')) STORED` — or, more safely, a plain nullable
  `internal_channel_kind text` set only by the trusted RPC.
- **Pros:** Explicit classification for future publishers and dashboards.
  Fast index for "list my Borvat-Direct drafts". Tightens tenancy: a
  `channel_listings_validate_refs`-style extension can assert
  `merchant_store_id` matches the account's store.
- **Cons:** One additional migration. Requires backfill NULL semantics
  (safe: existing 115 Bol rows leave `merchant_store_id NULL`).
- **Objects touched:** `channel_listings` (additive columns + trigger
  extension), potentially one new partial index.
- **RLS:** unchanged; policies already scope on `company_id`.
- **Migration count:** 1.
- **Rollback:** drop columns and trigger extension; harmless because Bol
  paths never read them.
- **Phase 2–4 impact:** none.
- **Duplicate source of truth?** No.

### Alternative C — Separate `borvat_direct_publications` table

- **Shape:** Parallel publication table keyed on
  `(merchant_store_id, sku_id or offer_id)` with its own status/version.
- **Pros:** Zero risk of cross-provider bleed.
- **Cons:** **Creates a duplicate source of truth** for the concept of
  "channel publication." Doubles the number of tables downstream code
  (reconciliation, outbox, dashboards) must union. Violates the master
  blueprint's canonical model (single publication table per SKU/offer×channel).
- **Objects touched:** new table + policies + grants + triggers.
- **RLS:** must be re-authored from scratch.
- **Migration count:** ≥2.
- **Rollback:** drop table (safe only if never used).
- **Phase 2–4 impact:** requires later merge/cutover, which contradicts the
  "no cutover" constraint of the Phase 5 spec.
- **Duplicate source of truth?** **Yes.** Not recommended.

---

## 9. Architectural recommendation

Answering each mandated question explicitly:

1. **Can `channel_listings` be reused without changing the source of truth?**
   **Yes.** Its identity, tenancy triggers, XOR (sku/offer) constraint,
   RLS, and versioning are provider-agnostic; the Bol-only assumptions live
   in `_p4_enqueue_bol_write`, the outbox worker, and reconciliation — all
   of which reject or never see `borvat_direct` rows.
2. **Can we create a Borvat-Direct *draft* listing without stock mutation,
   price publication, outbox emission, external dispatch, or customer
   visibility?** **Yes**, and simultaneously — the default row shape and the
   fail-closed `borvat_direct` account together produce that state.
3. **Does the listing need its own `merchant_store_id`, or is derivation
   enough?** Derivation via `channel_accounts.merchant_store_id` (added in
   M1A #2A) is **sufficient for correctness**. A denormalized column is a
   *performance / clarity* choice, not a correctness one — pushed to
   Alternative B if we ever adopt it.
4. **SKU-level or Product-level binding?** **SKU-level (or Offer-level).**
   The existing XOR constraint is the canonical model and matches how
   inventory, price, and reservations resolve. Publishing at product level
   would lose variant identity.
5. **Minimum additive migration?** **Zero** for a precheck-safe path.
   Alternative A carries no schema change. Alternative B (one migration)
   is optional and can be deferred until the M1A publication RPC needs it.
6. **What is deferred?** Everything price/tax/inventory-publication: the
   Borvat-Direct *publish* RPC, price snapshotting, VAT modeling, customer
   visibility routes, search indexing, and any storefront rendering. Those
   belong to later, explicitly-authorized milestones.

**Recommended path:** Alternative A (reuse `channel_listings` as-is for
draft rows), with the option to promote to Alternative B **only if** a
subsequent authorized milestone requires the classifier or store denorm for
a specific RPC or dashboard.

---

## 10. Residual risks (recorded, not fixed here)

- **RR-2B-A** — `authenticated` and `anon` retain table INSERT/DELETE
  privileges on `channel_listings` (RLS-gated; not exploitable via the API,
  but inconsistent with the RPC-only pattern of `merchant_stores` and
  `channel_accounts`). Do not tighten in this precheck.
- **RR-2B-B** — `sandbox_exec` retains SELECT/INSERT on `channel_listings`.
  Consistent with prior policy; **do not widen**.
- **RR-2B-C** — `_p4_enqueue_bol_write` is the sole enforcement point of
  the Bol-only outbox rule at the RPC layer. Any future publish RPC must
  independently gate on provider; a copy-paste of that RPC without changing
  the `provider='bol'` clause would allow cross-provider dispatch.
- **RR-2B-D** — No lifecycle state prevents a **future** internal
  Borvat-Direct publisher from silently going live if authored without
  the equivalent of P4 M5's live-write lock. Any Borvat-Direct publish RPC
  must be authored with an explicit `live_authorized_at`-style gate.
- **RR-2B-E** — `external_listing_id` semantics for an internal channel are
  undefined; the unique index `(channel_account_id, external_listing_id)`
  still holds. Convention (e.g. `store-slug/sku-id`) should be fixed **when**
  a publish RPC is authorized, not now.

---

## Final verdict

**CHANNEL_LISTINGS COMPATIBLE — SAFE ADDITIVE PATH IDENTIFIED**

`channel_listings` can host Borvat-Direct rows in the existing `draft` +
fail-closed shape without any schema change, without any external dispatch
path, without customer visibility, without inventory or price mutation, and
without weakening Phase 2/3/4 guarantees. Alternative A is the recommended
minimal path; Alternative B remains available as a one-migration
enhancement if a later authorized milestone requires it. Alternative C is
**not recommended** (duplicate source of truth).

**No migration is being applied.** Any actual Migration #2B (creation of the
first Borvat-Direct listing shape, or any accompanying schema change)
requires a separate Owner authorization.
