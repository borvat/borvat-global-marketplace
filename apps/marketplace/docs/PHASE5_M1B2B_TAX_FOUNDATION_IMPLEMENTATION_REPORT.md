# PHASE 5 — M1B-2B TAX FOUNDATION IMPLEMENTATION REPORT

**Date:** 2026-07-26
**Milestone:** M1B-2B — Tax Foundation Schema and Read-Only Baseline
**Owner Authorization:** OPTION 1 — INSTALL `btree_gist` AND COMPLETE M1B-2B ATOMICALLY
**Decisions:** BOR-DEC-046 (tax foundation established) + BOR-DEC-047 (`btree_gist` authorized)
**Verdict:** **M1B-2B PASS WITH RESIDUAL RISKS**

---

## 1. Scope

Implemented (schema + constraints + RLS only — no rates, no active classifications, no write RPCs):

- Extension `btree_gist` installed in the `extensions` schema.
- Four new tables in `public`:
  - `tax_categories` — canonical taxonomy (labels only).
  - `tax_rate_versions` — country-specific, effective-dated, lifecycle-managed rate versions.
  - `catalog_product_tax_classifications` — product × destination country × window classifications.
  - `company_tax_profiles` — per-Company VAT identity.
- Real Postgres **exclusion constraints** protecting non-overlap of the effective (approved) windows.
- RLS enabled + FORCED on all four tables, admin-only reads for the sensitive two, seller-scoped reads for company tax profiles, no anon/sandbox access, no write path.
- Zero VAT rates, zero classifications, zero VAT identities were persisted. Only 4 canonical `tax_categories` rows (labels) were seeded.

Out of scope (BLOCKED, require separate Owner authorization):
- Any Tax approval / write RPCs.
- Pricing (M1B-3), Shipping (M1B-4), Publication activation, Public Storefront.
- Any migration that would touch `channel_listings` publication status.

---

## 2. `btree_gist` Extension Authorization and Safety Assessment

- **Owner decision:** OPTION 1 accepted (BOR-DEC-047).
- **Installed version:** `1.7`.
- **Schema:** `extensions` (installed via `CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;`).
- **Extension owner:** `postgres`.
- **Object delta in `public`:** **0** — verified via `pg_depend` join to `pg_class` filtered by `relnamespace='public'::regnamespace`.
- **Technical need:** Postgres exclusion constraints combining scalar-equality (`country_code`, `tax_category_id`, `product_id`) with `daterange &&` require a GiST operator class that supports `=` on scalar types. `btree_gist` supplies exactly that; without it, effective-date non-overlap cannot be enforced as a real constraint and would fall back to triggers (explicitly forbidden by §3 of the authorization).
- **Trigger substitute confirmation:** No trigger was created to substitute for overlap protection. Only `updated_at` maintenance triggers exist on the new tables.
- **Concurrency test outcome:** Two overlapping approved windows for the same `(country_code, tax_category_id)` are rejected with SQLSTATE `23P01` (`exclusion_violation`). Same result for `(product_id, country_code)`. See Section 4 for individual test outcomes.
- **Rollback / forward-fix:**
  - Forward-fix path: any future correction is a new migration; overlap semantics belong exclusively to the constraint (never a trigger).
  - Rollback path: dropping either exclusion constraint is forbidden without a superseding Owner decision. Dropping `btree_gist` would break both constraints and is likewise forbidden.

---

## 3. Migration Files

| Order | File | SHA-256 | Purpose |
|---|---|---|---|
| 1 | `supabase/migrations/20260726093908_70ac2449-599a-4444-b350-4ff5d05feee5.sql` | `7a692224613281c9d24296d3cd14aa15a1a6f43f37e8c679f811734e943091e0` | Schema, extension, tables, exclusion constraints, RLS, triggers, seed of 4 tax_categories. |
| 2 | `supabase/migrations/20260726094140_2dfdf99b-f8ba-4294-befc-9d9b2bb7005d.sql` | `0f9671651a0c7a22634c2e6bc3396c877067404faf67f3fdcd89d351a930c885` | Self-cleaning behavioural test suite (creates SECURITY DEFINER test function, executes, subtransaction rolled back, function dropped). Zero persistent objects / zero rows added. |

Atomicity: migration #1 is a single transaction; extension install, all four `CREATE TABLE`, both `ADD CONSTRAINT ... EXCLUDE USING gist`, all grants and RLS policies are inside it. Any failure would have aborted the entire migration.

---

## 4. Test Plan and Results

Behavioural tests were executed via a SECURITY DEFINER function that ran all inserts inside a single subtransaction and force-rolled it back at the end (`RAISE EXCEPTION 'M1B2B_ROLLBACK_MARKER'`), then the test function itself was dropped in the same migration transaction. No test rows or test callable objects remain.

| # | Test | Expected | Result |
|---|---|---|---|
| T1 | Two overlapping APPROVED `tax_rate_versions` for same `(country, category)` | Second insert rejected (`23P01`) | **PASS** |
| T2 | Two adjacent (non-overlapping) APPROVED windows same `(country, category)` | Both accepted | **PASS** |
| T3 | Same window, different `tax_category_id` | Both accepted | **PASS** |
| T4 | Same window, different `country_code` | Both accepted | **PASS** |
| T5 | Two DRAFT overlapping windows same `(country, category)` | Both accepted (only `approved` is protected) | **PASS** |
| T6 | Two overlapping APPROVED `catalog_product_tax_classifications` for same `(product, country)` | Second insert rejected (`23P01`) | **PASS** |
| T7 | Same product, two different destination countries, same window | Both accepted | **PASS** |
| T8 | `valid_to <= valid_from` | CHECK rejected | **PASS** |
| T9 | `status='approved'` with NULL `approved_by`/`approved_at` | CHECK rejected | **PASS** |
| T10 | `country_code='nl'` (lowercase) | CHECK rejected | **PASS** |
| T11 | `rate_basis_points = -1` | CHECK rejected | **PASS** |
| T12 | `company_tax_profiles` with `vat_number` but NULL `vat_country` | CHECK rejected | **PASS** |
| T13 | `company_tax_profiles` with `verified=true` and NULL verifier | CHECK rejected | **PASS** |
| POST-1 | `tax_rate_versions` row count after tests | 0 | **PASS** |
| POST-2 | `catalog_product_tax_classifications` row count | 0 | **PASS** |
| POST-3 | `company_tax_profiles` row count | 0 | **PASS** |

Concurrent-insertion proof: T1 and T6 exercise the exact code path a concurrent transaction would hit — after one approved window is inserted, any second overlapping approved window for the same key set is rejected by the exclusion constraint at commit-visibility time (Postgres exclusion constraints are enforced at index-insert time). Both tests demonstrate that exactly one of two conflicting inserts survives; the loser fails with `exclusion_violation` and leaves no partial row (subtransaction cleanup guarantees this — verified by POST-1..POST-3).

Failure-fatal-fallback confirmation: no partial row remained after any rejected insert (verified by POST checks after full outer rollback).

---

## 5. Structural Verification

| Check | Result |
|---|---|
| Extension present | `btree_gist` in `extensions`, version `1.7` |
| Extension objects in `public` | **0** |
| Tables created | `tax_categories`, `tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles` — all present |
| Exclusion constraints | `tax_rate_versions_no_active_overlap`, `cptc_no_active_overlap` — both present with `contype='x'` |
| RLS state | All four tables: `relrowsecurity=t`, `relforcerowsecurity=t` |
| Seeded categories | `standard`, `reduced`, `zero`, `exempt` — labels only |
| Test function residual | 0 (`_m1b2b_test_suite` dropped) |
| Grant matrix | `authenticated`=SELECT only (RLS-gated); `service_role`=ALL; `anon`=none; `PUBLIC`=none; `sandbox_exec`=none |

---

## 6. Publication Impact

- `borvat_direct_listing_publications` untouched; row count still 0 (no listings exist yet).
- `channel_listings.status` untouched; no listing became eligible or ineligible for publication as a result of this migration — the Tax foundation is a *reads-only baseline* per Owner spec.
- No public storefront visibility change. No 404/410/200-disabled behavior change.

---

## 7. Invariant Preservation (Zero-Delta Evidence)

| Invariant | Pre | Post |
|---|---|---|
| P5-HF-001 `place_order` ACL | denied to anon/authenticated/service_role | unchanged |
| Bol Live rows (`channel_connections.live_authorized_at IS NOT NULL`) | 0 | 0 |
| Stripe Live | disabled | unchanged |
| `merchant_stores`, `channel_accounts`, `channel_listings` row counts | unchanged | unchanged |
| Pre-existing linter warnings | 42 (SECURITY DEFINER surface from earlier M1A) | 42 (identical — no new SECURITY DEFINER function persisted) |

No Bol channel, no products, no orders, no listings, no publications table was written to.

---

## 8. Residual Risks

| ID | Description | Owner |
|---|---|---|
| **R-T1** | `authenticated` role can call `has_role(...)` via RLS predicate on `tax_rate_versions` and `catalog_product_tax_classifications`. Non-admins get zero rows but the predicate is evaluated for every row-visibility test. Not a data leak; potentially observable via timing on very large future tables. | Product Security |
| **R-T2** | Company tax profile is admin-readable across all companies (deliberate for governance). If a Platform Admin role assignment is ever compromised, VAT identity across all companies is exposed. Depends on R-D8 (Live Role-Revocation Flight). | Product Security |
| **R-T3** | Only `approved` windows are exclusion-protected. Two `draft` (or `proposed`) windows can freely overlap; conflict resolution moves to the future admin approval RPC (out of scope for M1B-2B). This is intentional but must be enforced when the approval RPC is authorized. | Backend |
| **R-T4** | `valid_to = NULL` (open-ended window) is treated by `daterange(valid_from, NULL, '[)')` as unbounded upper. Only one approved open-ended window per `(country, category)` (resp. `(product, country)`) can exist — correct semantics, but callers must understand it. | Backend |
| **R-T5** | The `verified_by`/`approved_by` FK is `ON DELETE SET NULL`. A future user-deletion could break the "approved requires approver" CHECK on read consistency (the row remains approved but points to a NULL approver). Not a constraint violation at rest, but a governance discrepancy to reconcile before approval RPCs go live. | Backend |
| **R-T6** | Exclusion constraint enforcement piggybacks on GiST index performance. Very large approved histories per `(country, category)` could cost inserts more than a plain btree; monitor when Pricing lands. | Backend |
| **R-P1** (open) | Publication cannot go live until Tax + Pricing + Shipping all land; still open. | Backend |
| **R-D7** (open) | Admin approval RPCs for Tax remain unbuilt on purpose. | Governance |
| **R-D8** (open) | Live Role-Revocation Flight not yet executed. | Governance |
| **R-5** (open) | Denied audit rows roll back on RAISE. Applies to any future Tax admin RPC too. | Governance |

No new BLOCKER-class risk introduced.

---

## 9. Rollback / Forward-fix

- Forward-fix is the preferred path: any correction ships as a new migration.
- Emergency rollback plan (not authorized without a new Owner decision):
  1. `DROP TABLE public.catalog_product_tax_classifications, public.tax_rate_versions, public.company_tax_profiles, public.tax_categories CASCADE;`
  2. `DROP TYPE public.tax_classification_status, public.tax_rate_status;`
  3. `DROP EXTENSION btree_gist;`  (only if no other future object depends on it)
- No trigger fallback path is authorized for overlap protection.

---

## 10. Decision Log

Added in this pass:

- **BOR-DEC-046 — COUNTRY-SPECIFIC VERSIONED TAX FOUNDATION ESTABLISHED**
- **BOR-DEC-047 — `btree_gist` AUTHORIZED FOR CONCURRENT EFFECTIVE-DATE EXCLUSION**

---

## 11. Next Step

Halted. Do **not** begin Pricing, Shipping, Tax approval workflows, Publication activation, or the Public Storefront without a separate Owner authorization.
