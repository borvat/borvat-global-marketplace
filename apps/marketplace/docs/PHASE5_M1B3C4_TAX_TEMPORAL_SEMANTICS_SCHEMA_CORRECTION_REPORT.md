# PHASE 5 — M1B-3C-4 — TAX TEMPORAL SEMANTICS SCHEMA CORRECTION REPORT

**Scope:** schema + guard correction only. No rate versions, no VAT percentages, no band-status
change, no product classifications, no company tax profiles, no prices, no approval RPC/UI, no
shipping, no publication, no storefront, no checkout.

**Executed:** 2026-07-26. Environment: Lovable-native (managed Postgres).

---

## 1. Dependency scan (PostgreSQL catalogs + repository)

Sources scanned: `information_schema.columns`, `pg_constraint`, `pg_proc.prosrc`, `pg_trigger`,
`pg_views` / `pg_matviews`, `pg_policies`, `pg_attrdef`, `pg_description`, plus `rg` over
`src/`, `scripts/`, `supabase/`.

| Consumer of `tax_rate_versions.valid_from` / `valid_to` | Kind | Action |
|---|---|---|
| `tax_rate_versions_valid_range` | CHECK | rebuilt as `tax_rate_versions_platform_range` |
| `tax_rate_versions_no_active_overlap` | EXCLUDE gist | rebuilt as `tax_rate_versions_no_platform_overlap` |
| `public.msop_guard_tax_integrity()` | trigger function (BEFORE INSERT/UPDATE on `merchant_store_offer_prices`) | rewritten |
| `public.trg_tax_rate_versions_band_country()` | trigger function | **unaffected** (reads `country_code` only — verified in `prosrc`) |
| Views / matviews | — | **none** (`pg_views`/`pg_matviews` scan: 0 hits) |
| RLS policies | `tax_rate_versions_read_admin_only` (SELECT, `has_role(auth.uid(),'admin')`) | does not reference temporal columns — unchanged |
| Generated columns / column defaults | — | none on the temporal columns |
| Comments | none existed on these columns | added (§8) |
| RPCs | none | no tax RPC exists |
| Repository code | only `src/integrations/supabase/types.ts` (auto-generated, regenerated post-migration) | no hand-written consumer |
| Live checkout/order path | `place_order` does not read tax tables; `merchant_store_offer_prices` references the rate only by `tax_rate_version_id` | none |

**Result: no undocumented consumer, no live checkout/order dependency.**
`ARCHITECTURE BLOCKER — UNDOCUMENTED TAX TEMPORAL DEPENDENCY` was **not** triggered.

## 2. Pre-migration zero-row assertions

Enforced inside the migration itself (`DO` block, aborts the whole migration on any non-zero sum)
and independently measured before DDL:

| Table | Rows before |
|---|---|
| `tax_rate_versions` | 0 |
| `catalog_product_tax_classifications` | 0 |
| `company_tax_profiles` | 0 |
| `merchant_store_offer_prices` | 0 |
| `borvat_direct_listing_publications` | 0 |
| `tax_rate_bands` (must be preserved) | 9 (all `draft`) |

No silent reinterpretation of existing data was possible.

## 3. Migrations applied

| # | File | SHA-256 | Purpose |
|---|---|---|---|
| 1 | `supabase/migrations/20260726120009_4ad063cd-695b-4e39-acf9-0e91465f502d.sql` | `f22ea07c7c40736354060ed61ea32ac78302855937fceb4cc36ebd31fdb98503` | **the correction** (rename, legal metadata, constraints, guard, comments, ACL) |
| 2 | `supabase/migrations/20260726120330_bf2eb983-0550-42e2-9f1e-0dec263b6525.sql` | `33a2a38a416c38c7c6deb912d03ad684fa63ec8eedc38f3ef2e4903974841906` | temporary test runner `public._m1b3c4_verify()` (SECURITY DEFINER, `sandbox_exec`-only) |
| 3 | `20260726120424_…` | — | one-line bug fix inside the test runner (array append) |
| 4 | `20260726120523_…` | — | **DROP** of the test runner + `sandbox_exec` DML revocation (§9 finding) |

Test runner deleted: `pg_proc` count for `_m1b3c4_verify` = **0**.

## 4. Columns before / after (`public.tax_rate_versions`)

| Before | After | Note |
|---|---|---|
| `valid_from date NOT NULL` | `platform_valid_from date NOT NULL` | renamed, meaning fixed |
| `valid_to date NULL` | `platform_valid_to date NULL` | renamed, exclusive end |
| — | `legal_effective_from date NULL` | added, no default |
| — | `legal_effective_to date NULL` | added, no default |
| — | `legal_effective_date_status text NOT NULL DEFAULT 'unverified'` | allowlist `unverified\|verified\|conflicting` |
| — | `legal_source_reference text NULL` | added (did not exist) |
| — | `verified_at timestamptz NULL` | added (did not exist) |
| — | `verified_by uuid NULL → auth.users(id) ON DELETE SET NULL` | added (did not exist) |

All other columns untouched. No default of "today" on any legal field. Platform dates are never
copied into legal dates (test T14).

## 5. Constraints before / after

Dropped: `tax_rate_versions_valid_range`, `tax_rate_versions_no_active_overlap`.

Added:

```
tax_rate_versions_platform_range
  CHECK (platform_valid_to IS NULL OR platform_valid_to > platform_valid_from)

tax_rate_versions_legal_status_allowlist
  CHECK (legal_effective_date_status IN ('unverified','verified','conflicting'))

tax_rate_versions_legal_to_requires_from
  CHECK (legal_effective_to IS NULL OR legal_effective_from IS NOT NULL)

tax_rate_versions_legal_range
  CHECK (legal_effective_from IS NULL OR legal_effective_to IS NULL
         OR legal_effective_to > legal_effective_from)

tax_rate_versions_legal_verified_requires_evidence
  CHECK (legal_effective_date_status <> 'verified'
         OR (legal_effective_from IS NOT NULL
             AND legal_source_reference IS NOT NULL
             AND length(btrim(legal_source_reference)) > 0
             AND verified_at IS NOT NULL
             AND verified_by IS NOT NULL))
```

Unchanged: PK, both FKs to `auth.users`, band FK, `country_code` format,
`rate_basis_points 0..100000`, `approved_requires_approver`, trigger
`trg_tax_rate_versions_band_country`, `trg_tax_rate_versions_updated_at`.

## 6. Exclusion constraint (as built)

```
tax_rate_versions_no_platform_overlap
  EXCLUDE USING gist (
    tax_rate_band_id WITH =,
    daterange(platform_valid_from, platform_valid_to, '[)') WITH &&
  ) WHERE (status = 'approved'::tax_rate_status)
```

- keyed on `tax_rate_band_id` → overlapping operational versions of the same band are rejected
  (`23P01`, test T10); different bands may share a window (T12); non-overlapping windows on the
  same band are accepted (T11).
- `btree_gist` used; **no trigger substitute**.
- status predicate preserved **verbatim** from the live schema (`'approved'`); no new status invented.

**Documented deviation from the authorization text (§6, `tstzrange`).** The columns are `date`,
and the `date → timestamptz` cast is only `STABLE`, so `tstzrange(platform_valid_from,
platform_valid_to, '[)')` is not index-immutable and Postgres rejects it inside an exclusion
constraint. `daterange` is retained (same semantics, `[)` half-open, same key, same predicate) and
the reason is recorded in a `COMMENT ON CONSTRAINT`. Column type change was out of scope.

## 7. Pricing guard — `public.msop_guard_tax_integrity()`

`SECURITY DEFINER`, `search_path = ''`, all references schema-qualified, no dynamic SQL.
`prosrc` MD5 after correction: `cd1ff7515e7d420c3f1d0f9018b57ef5` (before: the M1B-3B body reading
`valid_from`/`valid_to`; replaced in full).

Checks enforced, in order, for `status='active'` prices only:

1. `tax_rate_version_id NOT NULL`.
2. rate version exists; joined to its band and tax category.
3. rate `status='approved'` (live operational contract).
4. rate `country_code = destination_country_code`.
5. **B2C baseline treatment allowlist:** `standard` / `reduced` only — `zero` and `exempt` are
   rejected (R-T17) until the transaction-treatment design exists.
6. **No backdating:** `price.valid_from >= platform_valid_from`, distinct error message.
7. **Ended window:** `platform_valid_to IS NULL OR price.valid_from < platform_valid_to`.
8. SKU → product resolution required.
9. approved product classification whose **own** window contains the price date.
10. classification country = destination; classification band = rate band.

Legal metadata (`legal_effective_*`, `verified_*`) is **never read** by the guard.
Product classification windows were not modified and remain independent.

## 8. Comments added

`COMMENT ON COLUMN` on `platform_valid_from`, `platform_valid_to`, `legal_effective_from`,
`legal_effective_to`, `legal_effective_date_status`, `legal_source_reference`, `verified_at`,
`verified_by`; `COMMENT ON CONSTRAINT tax_rate_versions_no_platform_overlap`;
`COMMENT ON FUNCTION public.msop_guard_tax_integrity()`; `COMMENT ON TABLE public.tax_rate_versions`.

They state explicitly: platform validity is operational and **not** a legal commencement claim;
legal dates are optional historical metadata; **`NULL` means the historical date has not yet been
proven inside Borvat — not that a legal basis is absent**; a platform date must never be used to
make a historical legal claim. Verified present for all five mandated columns.

## 9. RLS / ACL matrix (measured after migration)

| Object | anon | authenticated | service_role | sandbox_exec | PUBLIC |
|---|---|---|---|---|---|
| `public.tax_rate_versions` | none | `SELECT` (+MAINTAIN) — no DML | `SELECT` (+MAINTAIN) — no DML | `SELECT` only | none |
| `public.tax_rate_bands` | none | none | none | `SELECT` only | none |
| `public.tax_categories` | none | DML granted but RLS-blocked (pre-existing) | DML granted but RLS-blocked | `SELECT` only | none |
| `public.catalog_product_tax_classifications` | none | DML granted but RLS-blocked (pre-existing) | DML granted but RLS-blocked | `SELECT` only | none |
| `public.company_tax_profiles` | none | DML granted but RLS-blocked (pre-existing) | DML granted but RLS-blocked | `SELECT` only | none |
| `public.merchant_store_offer_prices` | none | none | none | `SELECT` only | none |
| `public.borvat_direct_listing_publications` | none | `SELECT` | full (fail-closed by RLS) | `SELECT` only | none |
| `msop_guard_tax_integrity()` | revoked | revoked | EXECUTE (trigger owner path) | EXECUTE | revoked |

RLS **enabled + FORCE** retained on `tax_rate_versions`; policy set unchanged (single admin-only
SELECT policy). `search_path=''` retained on both tax trigger functions.

**Finding raised and fixed in this round (new R-T14 re-open → then closed):** `sandbox_exec` held
`INSERT` on the tax/pricing/publication tables **and** carries `BYPASSRLS`, so RLS was not the
effective barrier it was believed to be. A single probe row was inserted during the ACL check and
was **deleted immediately**; `tax_rate_versions` is back to 0 rows. `INSERT/UPDATE/DELETE/TRUNCATE`
were then revoked from `sandbox_exec` on `tax_rate_versions`, `tax_rate_bands`, `tax_categories`,
`catalog_product_tax_classifications`, `company_tax_profiles`, `merchant_store_offer_prices` and
`borvat_direct_listing_publications`. Re-probe after revocation: `permission denied for table
tax_rate_versions`. Counts re-verified at 0.

## 10. Zero-data confirmation (final, persistent)

| Table | Rows |
|---|---|
| `tax_rate_bands` | **9** (all `draft`, unchanged) |
| `tax_rate_versions` | **0** |
| `catalog_product_tax_classifications` | **0** |
| `company_tax_profiles` | **0** |
| `merchant_store_offer_prices` | **0** |
| `borvat_direct_listing_publications` | **0** |

No current-rate draft rows, no legal dates, no platform dates, no classifications, no prices, no
publication transitions were created.

## 11. Test results — 23/23 PASS

Structural (catalog reads, outside any transaction):

| # | Assertion | Result |
|---|---|---|
| S1 | `valid_from` / `valid_to` no longer exist on `tax_rate_versions` | PASS |
| S2 | `platform_valid_from` / `platform_valid_to` exist | PASS |
| S3 | all six legal-metadata columns exist | PASS |
| S4 | no default on any legal date / `verified_at` | PASS |
| S5 | exclusion constraint uses the platform range + `tax_rate_band_id` + gist | PASS |
| S6 | guard body reads platform columns and no legal columns | PASS |
| S7 | comments present on all five mandated columns | PASS |
| S8 | `place_order` EXECUTE = `postgres`, `sandbox_exec` only (P5-HF-001 intact) | PASS |

Behavioural (all fixtures created and rolled back inside a sentinel-aborted subtransaction of the
temporary runner):

| # | Assertion | Result |
|---|---|---|
| T5 | `verified` without `legal_effective_from` rejected | PASS (`23514`) |
| T6 | `verified` without source reference rejected | PASS (`23514`) |
| T7 | invalid legal range rejected | PASS (`23514`) |
| T7b | `legal_effective_to` without `legal_effective_from` rejected | PASS (`23514`) |
| T8 | invalid platform range rejected | PASS (`23514`) |
| T9 | band/country mismatch still rejected (trigger unaffected) | PASS |
| T10 | overlapping platform window, same band | PASS (`23P01`) |
| T11 | non-overlapping window, same band accepted (rate-percentage change ⇒ new version) | PASS |
| T12 | identical window on a different band accepted | PASS |
| T13 | draft rate with NULL legal dates accepted | PASS |
| T14 | platform dates not copied into legal dates (`unverified`, all legal fields NULL) | PASS |
| T15 | standard rate + matching classification inside platform window accepted | PASS |
| T16 | price before `platform_valid_from` rejected — "no backdating" message | PASS |
| T17 | price after ended platform window rejected — "window ended" message | PASS |
| T18 | expired classification window rejected | PASS |
| T19 | band mismatch rejected | PASS |
| T20 | destination-country mismatch rejected | PASS |
| T21 | `zero` treatment rejected in B2C baseline pricing | PASS |
| T22 | `exempt` treatment rejected in B2C baseline pricing | PASS |
| T23 | `reduced` treatment accepted with sound fixtures | PASS |
| T24 | product-scope change (classification close/open) needs **no** new rate version | PASS |
| T25 | all fixtures rolled back (sentinel abort) | PASS |
| T26 | persistent counts still 0/0/0/0/0 with 9 bands | PASS |

Environment invariants re-verified: RLS+FORCE retained, `sandbox_exec` DML denied, P5-HF-001
intact, Bol Live = 0 dispatches / live mode off, Stripe Live off, test runner dropped.

## 12. Object delta (scope-only)

Added: 6 columns, 5 CHECK constraints, 1 exclusion constraint, 1 FK (`verified_by`), 11 comments.
Renamed: 2 columns. Replaced: 1 function body. Dropped: 2 constraints, 1 temporary function.
Revoked: DML on 7 tables for `sandbox_exec`; DML on `tax_rate_versions` for
`authenticated`/`service_role`/PUBLIC/anon; EXECUTE on the guard for PUBLIC/anon/authenticated.
No new tables, no new enums, no new RPC, no new policy, no data.

## 13. Residual risks after the correction

| Risk | Status |
|---|---|
| **R-T13** | **HISTORICAL LEGAL COMMENCEMENT METADATA INCOMPLETE** — no longer a blocker for a *draft* current-rate seed. Still blocks: backdating, historical legal claims, historical order recalculation. |
| **R-T15** | **Blocker** — no authorized approval/activation capability for rate versions. |
| **R-T16** | **CLOSED** — rate-version / product-scope separation implemented and tested (T24). |
| **R-T17** | **Blocker** for ZERO/EXEMPT transaction use; now additionally enforced in code by the guard's treatment allowlist. |
| **R-T11 / R-T12** | Residual — BE consolidated primary text not retrieved. |
| **R-T14** | **Closed (re-verified this round by probe, not by assumption)** — `sandbox_exec` DML now revoked on all tax/pricing/publication tables; `BYPASSRLS` on that role means grants, not RLS, are the barrier. |
| **R-T18 (new)** | `authenticated` / `service_role` still hold table-level DML grants on `tax_categories`, `catalog_product_tax_classifications`, `company_tax_profiles` (pre-existing; currently blocked only by RLS FORCE with no write policy). Recommend explicit revocation in a later ACL-hygiene round. |
| **R-T7 / R-T8, R-5, R-D7, R-D8, R-P1..R-P4, R-PR1..R-PR7** | Unchanged. |

## 14. Rollback / forward-fix

Rollback (safe while all four temporal tables hold 0 rows): rename `platform_valid_from/to` back,
drop the six added columns and five added CHECKs, restore `tax_rate_versions_valid_range` and
`tax_rate_versions_no_active_overlap` on `daterange(valid_from, valid_to,'[)')`, and
`CREATE OR REPLACE` the M1B-3B guard body. Forward-fix is preferred: the correction is additive
plus two renames, is data-free, and no application code references the columns.

## 15. Confirmation

**No rate data was loaded.** No VAT percentage, legal date, platform date, classification, price,
publication transition, shipping rule, storefront surface or checkout path was created or enabled
in this round.

---

## Final verdict

**M1B-3C-4 PASS WITH RESIDUAL RISKS**

Residuals: the documented `daterange` deviation from the `tstzrange` wording of §6 (forced by
`date` column immutability), R-T18 (legacy `authenticated` DML grants on three tax tables), and the
unchanged R-T15 / R-T17 / R-T11 / R-T12 blockers.

Halted. No rate seed, no tax approval workflow, no seller pricing, no price activation, no
shipping, no publication transition, no storefront and no checkout reactivation without separate
Owner authorization.
