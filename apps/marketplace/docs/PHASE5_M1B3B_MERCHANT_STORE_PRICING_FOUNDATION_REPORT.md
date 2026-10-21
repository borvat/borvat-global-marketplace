# PHASE 5 — M1B-3B — MERCHANT STORE PRICING FOUNDATION REPORT

**Scope:** Schema, integrity, RLS, and read-only baseline for the
country-aware gross-price foundation used exclusively by the Borvat
Direct sales channel. No prices are persisted. No seller/admin RPCs.
No pricing UI. Publication remains blocked.

---

## 1. Migrations applied

| # | Filename (Supabase-generated) | Purpose |
|---|---|---|
| 1 | `20260726101035_*.sql` | Create `public.merchant_store_offer_prices` foundation (table, indexes, exclusion constraint, guard triggers, RLS force, revoke-all grants). |
| 2 | `20260726101419_*.sql` | Introduce temporary owner-privileged behavioural test runner `public._msop_verify_m1b3b()`. |
| 3 | `20260726101528_*.sql` | Fix `tax_categories.code` fixture format in test runner. |
| 4 | `20260726101603_*.sql` | Drop `public._msop_verify_m1b3b()` (zero-delta cleanup). |

Only migration 1 introduces persistent objects. Migrations 2-4 are
self-cleaning verification scaffolding and leave no residual objects.

---

## 2. Store/SKU ownership chain

- `public.merchant_stores.company_id → public.companies.id`
- `public.catalog_skus.company_id → public.companies.id`
- A single trusted trigger (`msop_guard_ownership`,
  `public.msop_guard_store_sku_ownership()`) enforces that
  `merchant_stores.company_id = catalog_skus.company_id` on every
  INSERT/UPDATE. The trigger is SECURITY DEFINER with
  `search_path = ''` and fully qualified references; no dynamic SQL.

---

## 3. Table `public.merchant_store_offer_prices`

Fields:

| Column | Type | Nullability | Notes |
|---|---|---|---|
| id | uuid PK | not null | `gen_random_uuid()` |
| merchant_store_id | uuid | not null | FK → `merchant_stores(id)` ON DELETE RESTRICT |
| catalog_sku_id | uuid | not null | FK → `catalog_skus(id)` ON DELETE RESTRICT |
| destination_country_code | text | not null | `^[A-Z]{2}$` |
| currency_code | text | not null | `^[A-Z]{3}$` |
| gross_amount_minor | bigint | not null | `> 0` (no zero, no negative, no floating point) |
| tax_rate_version_id | uuid | nullable | FK → `tax_rate_versions(id)` ON DELETE RESTRICT |
| status | text | not null | one of `draft`,`active`,`superseded`,`withdrawn` (default `draft`) |
| valid_from | timestamptz | not null | |
| valid_to | timestamptz | nullable | `valid_to IS NULL OR valid_to > valid_from` |
| supersedes_price_id | uuid | nullable | self-FK; `<> id` |
| version | bigint | not null | default 1, `>= 1` |
| created_by / updated_by | uuid | nullable | FK → `auth.users(id)` ON DELETE SET NULL |
| created_at / updated_at | timestamptz | not null | `updated_at` maintained by `update_updated_at_column()` |

Indexes: `msop_store_sku_idx`, `msop_status_idx`, `msop_scope_idx`.

---

## 4. Constraints

- `msop_country_format`, `msop_currency_format` (regex).
- `msop_gross_positive` (`> 0`).
- `msop_status_check` (allowed set).
- `msop_valid_range` (`valid_to IS NULL OR valid_to > valid_from`).
- `msop_no_self_supersession` (`supersedes_price_id <> id`).
- `msop_version_positive`.
- **Exclusion constraint** `msop_no_active_overlap` using `btree_gist`
  on `(merchant_store_id, catalog_sku_id, destination_country_code,
  currency_code, tstzrange(valid_from, valid_to, '[)'))` filtered by
  `status = 'active'`. Real Postgres-level protection, no trigger
  substitute. Draft/superseded/withdrawn rows do not participate.

---

## 5. Guard triggers

| Trigger | Function | When | Purpose |
|---|---|---|---|
| `msop_guard_ownership` | `public.msop_guard_store_sku_ownership()` | BEFORE INSERT/UPDATE | Store/SKU same-company. Supersession scope match. |
| `msop_guard_tax` | `public.msop_guard_tax_integrity()` | BEFORE INSERT/UPDATE | When `status='active'`: require approved tax rate (matching country & window) + approved product tax classification (matching product/country/window & category). Draft rows unaffected. |
| `msop_guard_immutable` | `public.msop_guard_active_immutable()` | BEFORE UPDATE | When `OLD.status='active'`: reject changes to store, SKU, country, currency, gross, tax version, or `valid_from`; only lifecycle transitions to `superseded`/`withdrawn` allowed. |
| `msop_touch_updated_at` | `public.update_updated_at_column()` | BEFORE UPDATE | `updated_at` maintenance. |

All three guard functions are `SECURITY DEFINER`, `SET search_path = ''`,
fully schema-qualified, no dynamic SQL. `EXECUTE` revoked from
`PUBLIC`, `anon`, `authenticated`, `sandbox_exec`. They are reachable
only via table triggers (no direct call surface).

---

## 6. RLS and grant matrix

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.
- **No policies defined** → deny-all for policy-subject roles.
- `REVOKE ALL` on the table from `PUBLIC`, `anon`, `authenticated`,
  `service_role`, `sandbox_exec`.
- Verified: `sandbox_exec` (which has `rolbypassrls`) cannot SELECT the
  table (`permission denied for table merchant_store_offer_prices`),
  proving that grants alone gate access — the table is unreachable to
  every application role.
- No seller `pricing.read` permission exists in `public.permissions`;
  no SELECT policy has been introduced. Seller and Admin reads remain
  deferred pending an explicit permission foundation.

---

## 7. Test results

Behavioural tests were executed inside a self-rolling-back
SECURITY DEFINER runner (`_msop_verify_m1b3b`, since dropped):

**Result: pass=24, fail=0.**

Scenarios exercised:

1. Gross = 0 rejected.
2. Gross < 0 rejected.
3. Invalid country format (`nl`) rejected.
4. Invalid currency format (`eur`) rejected.
5. Invalid status (`weird`) rejected.
6. `valid_to <= valid_from` rejected.
7. Store/SKU cross-company mismatch rejected.
8. Invalid store FK rejected.
9. Invalid SKU FK rejected.
10. Draft without tax version accepted.
11. Active without tax version rejected.
12. Active with draft tax rate rejected.
13. Active with different-country tax rate rejected.
14. Active with expired tax rate rejected.
15. Active with missing product classification rejected.
16. Active with classification category ≠ rate category rejected.
17. Active with fully-valid tax fixtures accepted.
18. Active-row commercial field mutation rejected.
19. Lifecycle transition `active → superseded` accepted.
20. Overlapping active window rejected by exclusion constraint
    (`exclusion_violation`, error code `23P01`).
21. Non-overlapping active window accepted.
22. Same store/SKU, different destination country accepted.
23. Draft overlapping active window accepted (drafts do not
    participate in exclusion).
24. Self-supersession via UPDATE rejected by CHECK.

All fixtures rolled back inside the runner. `sandbox_exec` post-test
denial of SELECT independently confirms the runtime deny-all posture.

---

## 8. Overlap proof

Exclusion constraint definition (from `pg_indexes`):

```
EXCLUDE USING gist (
  merchant_store_id WITH =,
  catalog_sku_id WITH =,
  destination_country_code WITH =,
  currency_code WITH =,
  tstzrange(valid_from, valid_to, '[)') WITH &&
) WHERE (status = 'active')
```

Overlap rejection observed at Postgres constraint level (Test #20 →
`23P01`). No trigger-based substitute is in use.

---

## 9. Zero-delta / persistence evidence

- Persisted row count post-verification: **0** (`SELECT count(*) FROM
  public.merchant_store_offer_prices` via privileged read).
- No legacy price fields backfilled.
- `products.price_cents`, `order_items.price_cents`,
  `channel_imported_offers`, auction and wholesale pricing untouched.
- Publication rows (`borvat_direct_listing_publications`) remain in
  `not_ready` status.
- Bol Live, Stripe Live, place_order remain disabled/locked
  (P5-HF-001 invariants preserved).
- No public storefront route now exposes any pricing surface.
- The temporary verification function was dropped; the only net new
  objects are the foundation table, its indexes/constraints, and its
  three guard functions/triggers plus the `updated_at` toucher.

---

## 10. Publication impact

- No publication row transitions to `ready`.
- Public storefront routes continue to return 404 for never-published
  listings, 410 for withdrawn ones, and 200 with purchase disabled for
  temporarily unavailable/out-of-stock ones once storefront is
  eventually enabled.
- Because no active prices exist and because no seller draft-price
  workflow exists, the pricing gate of the 9-point publication
  eligibility criteria remains fail-closed for every listing.

---

## 11. Residual risks

Recorded/retained:

- **R-PR1** — no seller draft-price workflow.
- **R-PR2** — no price activation/withdrawal workflow.
- **R-PR3** — no official tax data (rates or classifications) exists;
  no active price is currently constructible outside test fixtures.
- **R-PR4** — no destination-aware public price resolver.
- **R-PR5** — no checkout repricing/revalidation.
- **R-PR6** — no promotion/discount model.
- **R-PR7** — no shipping price integration.
- **R-5** — audit-row rollback on trusted-RPC exception (unchanged).
- **R-D7** — audit-row rollback on admin read exception (unchanged).
- **R-D8** — live role-revocation flight not yet executed (unchanged).
- **R-P1..R-P4** — publication residuals from M1B-1 (unchanged).
- **R-T1..R-T6** — tax foundation residuals; `R-T6` remains only in
  its concurrent-session-proof interpretation because the real
  exclusion constraint is already enforced at Postgres level.

These block publication and purchase; they do not block this schema
foundation.

---

## 12. Rollback / forward-fix

- Rollback: `DROP TABLE public.merchant_store_offer_prices CASCADE;`
  plus `DROP FUNCTION` for the three guard functions. Because no rows
  exist and no other object references the table, rollback is
  non-destructive to any customer or seller data.
- Forward-fix path: introduce a `pricing.read` permission, then a
  seller draft-price RPC (M1B-3D), then an activation RPC after R-5 is
  closed (M1B-3E). None of this is authorised yet.

---

## 13. Decision

- **BOR-DEC-049 — COUNTRY-SPECIFIC STORE/SKU GROSS PRICE FOUNDATION
  ESTABLISHED**: schema, constraints, guards, and deny-all RLS/grants
  applied. No prices persisted. No public visibility. No workflows.

---

## Final verdict

**M1B-3B PASS WITH RESIDUAL RISKS.**

Halted. Awaiting separate Owner authorisation before any of: Tax data
loading, Seller draft-price workflow, Price activation/withdrawal
workflow, Shipping foundation, Publication transitions, Public
Storefront, Checkout/Orders reactivation.
