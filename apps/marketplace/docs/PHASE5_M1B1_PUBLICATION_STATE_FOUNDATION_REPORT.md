# PHASE 5 — M1B-1 Publication State Foundation Report

**Scope:** Schema-only foundation for Borvat Direct publication state. No publish workflow, no public visibility, no pricing/tax/shipping, no inventory integration, no UI.

**Verdict:** `M1B-1 PASS WITH RESIDUAL RISKS`

---

## 1. Schema Choice Rationale

Introduced a **new one-to-one entity** `public.borvat_direct_listing_publications` rather than reusing `channel_listings.status` or `control_state`:

- `channel_listings` also carries Bol and future external channels; injecting Borvat Direct customer-visibility semantics would pollute cross-channel state.
- `status` is Lifecycle; `control_state` is channel/operational control. Customer visibility has different semantics (composite, fail-closed, derived).
- Keeps Bol rows untouched — no risk of assigning a synthetic publication state to 115 existing Bol listings.

## 2. Why `control_state` Was Not Modified

`control_state` governs internal channel dispatch (shadow/live/paused kill-switch). It is not a customer-facing signal and must not be repurposed. Reusing it would (a) conflate operational safety with commercial visibility and (b) allow Bol listings to accidentally acquire visibility semantics. Left untouched.

## 3. Migration

- **Filenames:** `20260725225154_*` (create table + triggers + RLS) and `20260725225245_*` (revoke public defaults, re-grant SELECT to authenticated).
- Applied via Lovable Cloud managed migration flow (SHA-256 not exposed by tooling; migration bodies are archived in the SQL history).

## 4. Table / Constraints / Indexes

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `channel_listing_id` | uuid | NO | PK, FK → `channel_listings.id` `ON DELETE CASCADE` |
| `publication_status` | text | NO | default `not_ready`; CHECK ∈ {`not_ready`,`ready`,`published`,`paused`,`withdrawn`} |
| `first_published_at` | timestamptz | YES | immutable after first publish (contract) |
| `last_published_at` | timestamptz | YES | |
| `last_unpublished_at` | timestamptz | YES | |
| `status_changed_at` | timestamptz | NO | default `now()` |
| `version` | bigint | NO | default `1` |
| `created_at` | timestamptz | NO | default `now()` |
| `updated_at` | timestamptz | NO | default `now()`, maintained via trigger |

**Constraints:** `PRIMARY KEY (channel_listing_id)`, `FOREIGN KEY → channel_listings(id) ON DELETE CASCADE`, `CHECK` on `publication_status`.

**Triggers:**
- `borvat_direct_publication_provider_guard` (BEFORE INSERT / UPDATE OF `channel_listing_id`) — rejects non-`borvat_direct` listings and refuses INSERT rows whose initial `publication_status` is not `not_ready`.
- `borvat_direct_publication_touch_updated_at` (BEFORE UPDATE) — refreshes `updated_at`.

**Index:** `borvat_direct_publications_status_idx (publication_status, status_changed_at DESC)`.

## 5. RLS & Grant Matrix

RLS: **ENABLED**.

Table privileges (verified via `has_table_privilege`):

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `anon` | ❌ | ❌ | ❌ | ❌ |
| `authenticated` | ✅ (RLS-gated) | ❌ | ❌ | ❌ |
| `service_role` | ❌ | ❌ | ❌ | ❌ |
| `sandbox_exec` | ❌ | ❌ | ❌ | ❌ |
| `PUBLIC` | ❌ | ❌ | ❌ | ❌ |

Policies (both `SELECT` only, role `authenticated`):

- `borvat_direct_publications_seller_read` — `EXISTS` join to `channel_listings` + `company_member_has_permission(cl.company_id, auth.uid(), 'listings.read')`.
- `borvat_direct_publications_admin_read` — `has_role(auth.uid(),'admin')`.

No `INSERT`/`UPDATE`/`DELETE` policies — fail-closed for every application role.

## 6. Backfill Counts by Provider

| Provider | channel_listings rows | Publication rows created |
|---|---|---|
| `bol` | 115 | 0 |
| `borvat_direct` | 0 | 0 |
| **Total** | **115** | **0** |

No fixtures inserted. Bol rows untouched: `sum(published_quantity)=4465` unchanged, all 115 rows retain their pre-migration `status` and `control_state`.

## 7. State Semantics

- **`not_ready`** — default; all new rows start here and stay here in this phase.
- **`ready`** — eligibility gate passed; not yet reachable (no workflow).
- **`published`** — customer-visible; not yet reachable (no workflow, no visibility evaluator).
- **`paused`** — temporarily withdrawn; not yet reachable.
- **`withdrawn`** — permanently retired (drives 410 Gone); not yet reachable.

The `CHECK` includes future values so the workflow can add them without another migration, but **no path currently mutates state**. Documented explicitly in the table `COMMENT`.

## 8. Timestamp Semantics

- `first_published_at` — set once at first successful publish, never overwritten thereafter.
- `last_published_at` — updated on every successful publish.
- `last_unpublished_at` — updated on `paused`/`withdrawn`.
- `status_changed_at` — updated on every state transition.
- `updated_at` — technical row update, maintained by trigger.

All published timestamps are `NULL` at end of M1B-1. No synthetic timestamps introduced.

## 9. Eligibility Contract (documented, not enforced)

A transition to `ready` will require ALL of the following (to be implemented in later stages):
1. Merchant store active & eligible.
2. Borvat Direct channel account active & eligible.
3. Catalog product active.
4. Catalog SKU active.
5. Content complete (title, images, description).
6. Price valid (M1B-2).
7. Tax version valid (M1B-3).
8. Shipping policy valid (M1B-4).
9. Inventory / publication policy valid.
10. Compliance clear.
11. No duplicate visible listing for the same SKU + store.

Because Pricing/Tax/Shipping tables do not exist yet, every publication row is structurally locked to `not_ready`.

## 10. Tests

All tests executed inside session (fixtures rolled back where applicable):

| # | Test | Result |
|---|---|---|
| 1 | Table exists, RLS enabled | ✅ |
| 2 | Two SELECT policies present, both scoped to `authenticated` | ✅ |
| 3 | PK, FK to `channel_listings` with CASCADE, CHECK constraint present | ✅ |
| 4 | One-to-one uniqueness (PK on `channel_listing_id`) | ✅ |
| 5 | Bol listing INSERT rejected (`SQLSTATE 23514`, provider=`bol`) | ✅ |
| 6 | Unknown `channel_listing_id` rejected via trigger not-found branch | ✅ |
| 7 | Invalid `publication_status` rejected by CHECK | ✅ |
| 8 | `authenticated` has no direct INSERT / UPDATE / DELETE | ✅ |
| 9 | `anon` has no SELECT / INSERT / UPDATE / DELETE | ✅ |
| 10 | `service_role` receives no grants | ✅ |
| 11 | `sandbox_exec` INSERT/SELECT default grants revoked | ✅ |
| 12 | `channel_listings.status` untouched (115 rows) | ✅ |
| 13 | `control_state` untouched (115 rows) | ✅ |
| 14 | `published_quantity` untouched (sum=4465) | ✅ |
| 15 | Publication row count = 0 | ✅ |
| 16 | `borvat_direct` listings count = 0 (no backfill needed) | ✅ |
| 17 | No public/anon SELECT grant surfaces (validated via `has_table_privilege`) | ✅ |
| 18 | No publish / unpublish / customer-visible RPC created | ✅ |
| 19 | No pricing / tax / shipping tables introduced | ✅ |
| 20 | No inventory / outbox mutation | ✅ |
| 21 | P5-HF-001 still in force (place_order blocked) | ✅ (unchanged) |
| 22 | Bol Live & Stripe Live remain disabled | ✅ (unchanged) |

## 11. Zero-Delta Confirmation

No modifications to: `channel_listings`, `channel_accounts`, `outbox_events`, `agent_audit_log`, `orders`, `order_items`, inventory tables, `merchant_stores`, `catalog_*`, `user_roles`, RLS on any pre-existing table, existing RPCs, or existing policies.

## 12. Residual Risks

Opened:
- **R-P1** — Publication eligibility cannot complete without Pricing/Tax/Shipping foundations.
- **R-P2** — No publication transition audit yet.
- **R-P3** — No seller publish workflow.
- **R-P4** — No public visibility evaluator.

Carried, blocking future stages:
- **R-5** must close before Seller publish RPC.
- **R-D8** must close before live public storefront.
- **R-D7** must close before Admin publish-on-behalf.

Neither blocks M1B-1 itself, but each gates a downstream stage.

## 13. Rollback / Forward-Fix

Rollback:

```sql
DROP TABLE IF EXISTS public.borvat_direct_listing_publications CASCADE;
DROP FUNCTION IF EXISTS public._borvat_direct_publication_provider_guard();
DROP FUNCTION IF EXISTS public._borvat_direct_publication_touch_updated_at();
```

No dependencies exist yet, so rollback is safe and side-effect-free.

Forward-fix path (future authorized stages only): M1B-2 Pricing → M1B-3 Tax → M1B-4 Shipping → M1B-5 Eligibility evaluator → M1B-6 Seller publish workflow (requires R-5 closed) → M1B-7 Public read RPCs → M1B-8 Public storefront (requires R-D8 closed).

## 14. Confirmation — No Customer Visibility

- No `is_customer_visible` column exists.
- No public RPC exposes publication state.
- No `anon` grant on the table.
- No route or component consumes it (no UI created).
- All publication rows locked to `not_ready` (currently zero rows).

**Customer visibility is not reachable through any code path introduced by M1B-1.**

## 15. HTTP Behavior Contract (Owner Correction Applied)

The "never 404" wording from the M1B Precheck is **rescinded**. The authoritative contract is:

- **404 Not Found** — never-published listing or unknown URL. Draft existence is not disclosed.
- **410 Gone** — previously published, now permanently withdrawn.
- **200 with purchase disabled** — temporarily unavailable or out of stock.
- **410 / hidden** — compliance emergency per legal & operations decision.

Recorded in Decision Log as **BOR-DEC-044**.

---

**Halted.** No pricing, tax, shipping, publish workflow, admin action, seller button, or storefront work will begin without a separate Owner authorization.
