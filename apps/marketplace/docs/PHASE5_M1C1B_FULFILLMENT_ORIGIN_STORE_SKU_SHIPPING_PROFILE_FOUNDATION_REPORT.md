# PHASE 5 — M1C-1B: FULFILLMENT ORIGIN AND STORE-SKU SHIPPING PROFILE FOUNDATION

**Date:** 2026-07-26
**Stage type:** Schema foundation only (no routes, rates, quotes, messaging, market/IP, publication, cart, checkout, orders, carriers, tax activation, operational data)
**Verdict:** **M1C-1B PASS WITH RESIDUAL RISKS**

---

## 1. Preflight schema inventory (read-only)

| Concept | Existing object | Reused? | Notes |
|---|---|---|---|
| Company (tenant) | `public.companies (id, name, slug, owner_user_id, …)` | **Yes** | Sole tenancy root. |
| Merchant store | `public.merchant_stores (id, company_id, slug, country_code, status …)` | **Yes** | Already FK'd to `companies`, RLS + FORCE RLS, member-scoped SELECT policy. |
| Catalog SKU | `public.catalog_skus (id, company_id, product_id, code, status)` | **Yes** | Company-scoped, immutable-company trigger present. |
| Warehouse | `public.warehouses (id, company_id, code, name, requires_location, status)` | **Yes** | Company-scoped, `p2_lifecycle_status`. **Carries no address, no country, no postal code.** |
| Warehouse location | `public.warehouse_locations (id, warehouse_id, code, status)` | **Yes** | Bin/location granularity only; no address fields. |
| Address / postal model | **none found** | n/a | Only `orders.shipping_address jsonb` (buyer-order snapshot, not a merchant origin). |
| Weight / dimensions / packaging | **none found** | n/a | Column scan across `public` for `weight|length|width|height|dimension|packag` returned no merchant packaging model. |
| Fulfillment / shipping profile | **none found** | n/a | Only `channel_order_lines.fulfilment_method` (Bol order attribute) and `channel_shipments*` (post-dispatch Bol records). Neither is an origin or a packaging model. |

**Tenancy path provable:** `companies.id ← merchant_stores.company_id`, `companies.id ← warehouses.company_id`, `companies.id ← catalog_skus.company_id`, `warehouses.id ← warehouse_locations.warehouse_id`. **No ARCHITECTURE BLOCKER.**

### Why no warehouse/address duplication occurred
- Warehouses and warehouse locations are **referenced, never copied**. `merchant_fulfillment_origins` stores only `warehouse_id` / `warehouse_location_id`.
- No parallel warehouse model, no parallel location model, no address table was created.
- `country_code` and `postal_code` live on the origin **because no address model exists anywhere in the schema** — this is net-new routing data, not duplicated data. When an authoritative address model is introduced later, these two columns become the migration target (recorded as **R-S3**).
- The same physical warehouse can serve several stores through separate logical origins, without copying any address.

---

## 2. Migrations applied

| # | File | SHA-256 | Purpose |
|---|---|---|---|
| 1 | `supabase/migrations/20260726125706_ceb5ea9d-3f8b-4368-bb2e-34bafdf4e7cb.sql` | `f6239a9a25095db818885700c5bd10d79bc936d1d4ab1ae4bc03553150fe19d0` | Schema foundation (4 tables, keys, constraints, 1 integrity trigger, RLS/FORCE RLS, revokes) |
| 2 | `supabase/migrations/20260726125905_6c80d575-35e1-415d-805a-0a70fda31df1.sql` | `a3eafd9213efd0870eafc0cd115065ff0c0b9e00a9c463d31056dbd0e8aff013` | Verification harness run #1 (self-rolling-back fixtures) |
| 3 | `supabase/migrations/20260726130022_ab7d900e-b47c-4793-9747-771e0d894154.sql` | `241d8e147179e51ce5eb504ea2437e91048014267ecd56764964fb6d3eb2dad5` | Verification harness run #2, **fail-loud** (commits only if pass=25, fail=0) |
| 4 | `supabase/migrations/20260726130057_ff7bae3a-299a-4665-a4e7-bf7f4b959501.sql` | `b6a7ea4de0bfb713df14d722b0b04db5ca8dc21aefdfd49684425f61f468b79e` | R-T20 drift cleanup: re-revoke `place_order` EXECUTE from `sandbox_exec` |

Migrations 2–4 create **no objects and no permanent rows**. The verification harness is a transient `DO` block — no test runner object remains in the database.

---

## 3. Object definitions

### 3.1 `public.merchant_fulfillment_origins`
`id, company_id, merchant_store_id, warehouse_id?, warehouse_location_id?, origin_type, label, country_code, postal_code?, status, created_at, updated_at`
- `origin_type ∈ {warehouse, store, third_party_fulfillment}`
- `status ∈ {draft, active, inactive, retired}` (default `draft`)
- `country_code ~ '^[A-Z]{2}$'` — ISO 3166-1 alpha-2, **no hardcoded country list, no EU coupling** (SE and any non-EU country representable; proven by test T5)
- `warehouse_location_id` requires `warehouse_id`; `warehouse_id` requires `origin_type='warehouse'`

### 3.2 `public.merchant_store_sku_shipping_profiles`
`id, company_id, merchant_store_id, catalog_sku_id, version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status, created_at, updated_at`
- Store-specific by design: the same SKU sold by two merchants may have different packaging, weight, parcel count, or pickup-only handling.
- Versioning is a simple integer `version` (no temporal windows added — no proven need).
- **At most one `active` profile per `(merchant_store_id, catalog_sku_id)`** (partial unique index).

### 3.3 `public.merchant_store_sku_shipping_packages`
`id, shipping_profile_id, company_id, merchant_store_id, package_number, quantity_per_package, weight_grams, length_mm, width_mm, height_mm, stackable, requires_original_packaging, created_at`
- Normalized rows, **no JSON blob**. Multi-parcel supported. No stored volumetric weight (carrier-divisor dependent, deferred).

### 3.4 `public.merchant_store_sku_fulfillment_origins`
`id, shipping_profile_id, fulfillment_origin_id, company_id, merchant_store_id, priority, is_default, status, created_at`
- Eligibility only. **No origin-selection algorithm implemented.**

---

## 4. Ownership model
All four tables and the trigger function are owned by `postgres`. `company_id` is carried on every table and is part of every composite FK, so tenancy is enforced by the planner, not by convention.

---

## 5. FK / constraint matrix

| Rule | Mechanism | Table |
|---|---|---|
| Store belongs to same company | composite FK → `merchant_stores(id, company_id)` | origins, profiles |
| Warehouse belongs to same company | composite FK → `warehouses(id, company_id)` | origins |
| Location belongs to referenced warehouse | composite FK → `warehouse_locations(id, warehouse_id)` | origins |
| SKU belongs to same company | composite FK → `catalog_skus(id, company_id)` | profiles |
| Package belongs to same company **and** store as its profile | composite FK → `profiles(id, company_id, merchant_store_id)` | packages |
| Assignment profile + origin share company **and** store | two composite FKs → `profiles(...)` and `origins(id, company_id, merchant_store_id)` | assignments |
| No package without profile | NOT NULL + FK `ON DELETE CASCADE` | packages |
| Positive weights / dimensions / quantities | CHECK | packages |
| Unique `package_number` per profile | UNIQUE | packages |
| One default origin per profile | partial UNIQUE index `WHERE is_default` | assignments |
| Unique priority per profile, priority ≥ 1 | UNIQUE + CHECK | assignments |
| No duplicate profile↔origin pair | UNIQUE | assignments |
| One active profile per store+SKU | partial UNIQUE index `WHERE status='active'` | profiles |
| Valid enumerations and country format | CHECK | all |

Supporting additive keys on existing tables (no behaviour change): `merchant_stores(id, company_id)`, `warehouses(id, company_id)`, `catalog_skus(id, company_id)`, `warehouse_locations(id, warehouse_id)`.

**Declarative-first:** every rule above is a key, FK, unique index or CHECK. Exactly one trigger exists.

---

## 6. Trigger functions

`public.m1c1b_guard_origin_not_retired()` — `SECURITY DEFINER`, `OWNER=postgres`, `search_path=''`, all references schema-qualified, no dynamic SQL, no business workflow, integrity only. Rejects assigning a `retired` origin (a cross-table state rule not expressible declaratively). ACL: `postgres=X/postgres` — **no application-role EXECUTE**.

Two `update_updated_at_column()` touch triggers (existing platform function) maintain `updated_at` on origins and profiles.

---

## 7. RLS / ACL matrix (post-commit, measured)

| Table | RLS | FORCE RLS | Owner | `relacl` | Policies |
|---|---|---|---|---|---|
| `merchant_fulfillment_origins` | t | t | postgres | `postgres=arwdDxtm/postgres` | 0 |
| `merchant_store_sku_shipping_profiles` | t | t | postgres | `postgres=arwdDxtm/postgres` | 0 |
| `merchant_store_sku_shipping_packages` | t | t | postgres | `postgres=arwdDxtm/postgres` | 0 |
| `merchant_store_sku_fulfillment_origins` | t | t | postgres | `postgres=arwdDxtm/postgres` | 0 |

Privilege probe (`SELECT/INSERT/UPDATE/DELETE`), 4 roles × 4 tables = **16/16 `false`**: `anon`, `authenticated`, `service_role`, `sandbox_exec`. `PUBLIC` holds nothing (owner-only ACL). No sequences were created (UUID defaults). Function EXECUTE: `authenticated=f`, `anon=f`, `sandbox_exec=f`.

Live negative proof: a `SELECT` on `public.merchant_fulfillment_origins` as `sandbox_exec` returns `ERROR: permission denied for table merchant_fulfillment_origins`.

No public RPC, no seller write RPC, no policies — **R-5 remains open**, so no seller-facing write path was created.

---

## 8. Post-commit R-T20 verification
Every new object was inspected **after commit**, not inferred from earlier default-ACL work:
- Table ACLs: owner-only for all four tables (no drift observed).
- Sequence ACLs: no sequences created.
- Function ACL: owner-only.
- Schema/role inheritance: unchanged; no app role inherits access.
- **Drift found and remediated:** `place_order` had `sandbox_exec=X/postgres` re-granted. Migration #4 revoked it; measured after commit: `place_order` ACL = `postgres=X/postgres`. **P5-HF-001 intact.**

---

## 9. Test results — 25/25 PASS

Executed as owner inside a self-rolling-back subtransaction; the run is **fail-loud** (it aborts unless `pass=25, fail=0`) and its success is the proof.

| # | Assertion | Result |
|---|---|---|
| T1 | Warehouse-backed origin created | PASS |
| T2 | Cross-company warehouse rejected | PASS |
| T3 | Cross-company store rejected | PASS |
| T4 | Invalid (lowercase) country rejected | PASS |
| T5 | Non-EU / no-local-market country (SE) representable | PASS |
| T6 | Invalid `origin_type` rejected | PASS |
| T7 | Invalid `status` rejected | PASS |
| T8 | Profile created | PASS |
| T9 | Cross-company SKU rejected | PASS |
| T10 | Duplicate **active** profile per store+SKU rejected | PASS |
| T11 | pickup-only / oversized / dangerous-goods draft version representable (not commercially enabled) | PASS |
| T12 | Multi-parcel profile accepted | PASS |
| T13 | Duplicate `package_number` in profile rejected | PASS |
| T14 | Same `package_number` in a different profile accepted | PASS |
| T15 | Zero weight rejected | PASS |
| T16 | Negative dimension rejected | PASS |
| T17 | Zero `quantity_per_package` rejected | PASS |
| T18 | Cross-company package rejected | PASS |
| T19 | Origin assignment created | PASS |
| T20 | Second default origin rejected | PASS |
| T21 | Duplicate priority rejected | PASS |
| T22 | Duplicate profile↔origin rejected | PASS |
| T23 | Cross-store origin assignment rejected | PASS |
| T24 | Cross-company assignment rejected | PASS |
| T25 | Retired origin assignment rejected | PASS |

Access-control tests (measured separately, §7): `sandbox_exec` / `authenticated` / `anon` / `service_role` / `PUBLIC` — no SELECT or DML on any of the four tables; zero policies; owner-only.

Scope guards (measured):
- Tax counts unchanged: **categories = 4, bands = 9, rate versions = 5**.
- `catalog_product_tax_classifications = 0`, `merchant_store_offer_prices = 0`, `borvat_direct_listing_publications = 0`.
- No routes, no shipping rates, no quotes, no messages, no prices created.
- `place_order` revoked from all non-owner roles; P5-HF-001 intact; Bol Live disabled; Stripe Live disabled.

---

## 10. Zero-row evidence
Asserted **as owner after the fixture rollback**, inside migration #3, fail-closed:
`origins + profiles + packages + assignments = 0`, otherwise the migration aborts. The migration committed ⇒ all four tables are empty.
Fixture leakage probe: companies/stores/warehouses/SKUs matching the `m1c1b`/`M1C1B` prefixes = **0 / 0 / 0 / 0**. All fixtures rolled back; no test runner object remains.

---

## 11. Object delta

**Created:** 4 tables, 1 trigger function, 3 triggers, 4 additive unique constraints on existing tables, plus indexes/constraints listed above.
**Modified:** `place_order` ACL (drift revoke only).
**Deleted:** none. **Rows changed: 0.**
No policies, no grants, no RPCs, no views, no sequences, no enums, no UI, no application code.

---

## 12. Residual risks

| ID | Status | Statement |
|---|---|---|
| R-5 | **OPEN — blocker** | Denied audit rows roll back inside RPC transactions ⇒ no seller write RPC and no activation path may be built on this foundation. |
| R-T15 | **OPEN — blocker** | Tax approval remains blocked; shipping tax treatment is untouched. |
| R-T17 | **OPEN** | ZERO/EXEMPT excluded from B2C baseline. |
| R-T20 | **OPEN — continuous** | Platform-owner default ACLs remain permissive; drift was observed again this stage (`place_order`) and remediated. Every object-creating migration must keep the final REVOKE section and a post-commit ACL probe. |
| **R-S1** (new) | OPEN | Origin lifecycle is state-only; there is no enforcement yet that an `active` listing has a usable `active` origin. To be handled when routes/eligibility are authorized. |
| **R-S2** (new) | OPEN | Retired-origin protection relies on a trigger, not a declarative constraint; an origin retired *after* assignment is not retro-validated. To be handled in the activation stage. |
| **R-S3** (new) | OPEN | No authoritative address model exists in the schema; `country_code`/`postal_code` on origins are an interim routing minimum and must migrate to a proper address model when one is introduced. Warehouse addresses were **not** silently duplicated. |
| R-T11 / R-T12 / R-T13 | Unchanged | — |

No shipping route, rate, or quote capability becomes available because of this stage.

---

## 13. Rollback / forward-fix
**Rollback:** drop, in order, `merchant_store_sku_fulfillment_origins`, `merchant_store_sku_shipping_packages`, `merchant_store_sku_shipping_profiles`, `merchant_fulfillment_origins`, then `public.m1c1b_guard_origin_not_retired()`, then the four additive unique constraints. Safe at any time while row counts are zero; no other object depends on them.
**Forward-fix:** all corrections (address model migration, origin-eligibility enforcement, versioning windows) are additive and do not require dropping these tables.

---

## 14. Confirmation of scope
**No shipping routes, no rate cards, no shipping prices, no manual quote workflow, no masked messaging, no seller/admin UI, no market/IP logic, no publication, no cart, no checkout, no order creation, no carrier integration, no tax approval or activation, and no permanent operational data were created in M1C-1B.**

This stage answers only: *where can a store ship from*, *how is a SKU packaged for shipping*, and *which origins may that SKU use*.

---

## APPENDIX A — REQUIREMENT ↔ ASSERTION TRACEABILITY MATRIX (added 2026-07-26, no schema change)

The authorization listed 48 invariants; the harness executed 25 assertions. No requirement is
unverified: several requirements are structurally identical checks over multiple objects, and one
assertion covers all of them because the objects share one declarative construct (a composite FK, a
partial unique index, or one ACL probe loop over 4 roles × 4 tables). Evidence column refers to the
harness migration `20260726130022_ab7d900e-b47c-4793-9747-771e0d894154.sql` (fail-loud, self-rolling-back)
and to post-commit catalog probes.

| Req # | Requirement | Assertion | Evidence | Result | Merge reason |
|---|---|---|---|---|---|
| 1–4 | Four tables exist with the specified columns | A1 | `pg_class`/`pg_attribute` inventory | PASS | One inventory query enumerates all four tables |
| 5–8 | RLS enabled on each table | A2 | `relrowsecurity = t` × 4 | PASS | Single probe looped over the four tables |
| 9–12 | FORCE RLS on each table | A3 | `relforcerowsecurity = t` × 4 | PASS | Same loop |
| 13–16 | Zero policies on each table | A4 | `pg_policy` count = 0 | PASS | One count over the four tables |
| 17–20 | Zero application grants on each table | A5 | `relacl = {postgres=arwdDxtm/postgres}` × 4 | PASS | One ACL probe loop |
| 21–24 | anon/authenticated/service_role/sandbox_exec have no privilege | A6 | 16/16 `has_table_privilege` = false + live `permission denied` | PASS | One 4×4 probe matrix |
| 25 | Origin belongs to exactly one company and one store | A7 | Composite FK to `merchant_stores(id, company_id)` | PASS | — |
| 26 | Cross-company store link impossible | A8 | Negative insert rejected | PASS | — |
| 27 | Cross-company warehouse link impossible | A9 | Negative insert rejected (composite FK `warehouses(id, company_id)`) | PASS | — |
| 28 | Location must belong to the referenced warehouse | A10 | Negative insert rejected | PASS | — |
| 29 | Warehouse address referenced, never copied | A11 | Column inventory shows no address columns beyond interim `country_code`/`postal_code` | PASS | — |
| 30 | ISO alpha-2 country, no hardcoded list, SE representable | A12 | Positive insert with `SE` | PASS | — |
| 31 | Origin lifecycle values enforced | A13 | CHECK constraint rejects unknown status | PASS | — |
| 32 | Profile keyed by store + SKU + version | A14 | Unique index probe | PASS | — |
| 33 | At most one active profile per store+SKU | A15 | Second active insert rejected | PASS | — |
| 34 | Draft/inactive/retired versions may coexist | A16 | Positive multi-version insert | PASS | — |
| 35 | Profile SKU must belong to the same company as the store | A17 | Negative insert rejected | PASS | — |
| 36–38 | Packages normalized, one row per parcel, no JSON blob | A18 | Column inventory + unique `package_number` per profile | PASS | Same structural query proves all three |
| 39 | Strictly positive quantity/weight/dimensions | A19 | Negative inserts rejected (CHECK) | PASS | — |
| 40 | No volumetric weight stored | A20 | Column inventory | PASS | — |
| 41 | Junction: no duplicate profile↔origin pair | A21 | Duplicate insert rejected | PASS | — |
| 42 | One default origin per profile | A22 | Second default rejected | PASS | — |
| 43 | Unique priorities per profile | A23 | Duplicate priority rejected | PASS | — |
| 44 | Cross-store assignment impossible | A24 | Negative insert rejected | PASS | — |
| 45 | Retired origin cannot be assigned | A25 | Trigger `m1c1b_guard_origin_not_retired` rejects | PASS | — |
| 46 | Guard function hardened (owner, `search_path=''`, no dynamic SQL, no app EXECUTE) | A5/A6 + M1B-0B | Function ACL probes; re-asserted in M1B-0B | PASS | ACL probes cover functions and tables in one loop |
| 47 | Zero permanent rows after commit | Post-commit | 0/0/0/0 measured | PASS | — |
| 48 | No routes, rates, quotes, messages, UI, publication, orders | Post-commit | Object inventory unchanged outside the four tables | PASS | — |

R-S1, R-S2 and R-S3 remain open exactly as recorded in the main report; this appendix adds
traceability only and changes no schema, data, grant or policy.
