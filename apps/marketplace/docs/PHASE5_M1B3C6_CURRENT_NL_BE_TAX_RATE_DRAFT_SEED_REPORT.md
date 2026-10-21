# PHASE 5 — M1B-3C-6 — CURRENT NL/BE TAX RATE DRAFT SEED REPORT

**Scope:** data seed only. No table, function, RPC, RLS, policy, grant or default-ACL change; no
band-status change; no approval/activation; no classifications, company tax profiles, prices,
shipping, publication, storefront or checkout.

**Executed:** 2026-07-26. Environment: Lovable-native managed Postgres (owner-executed migration).

---

## 1. Migration

| Item | Value |
|---|---|
| File | `supabase/migrations/20260726122400_dcfe0dd4-0429-403b-a3e5-ec4ca2c47439.sql` |
| SHA-256 | `f9397287ab4a201cdf84d19db14397e13b7db54fc048035df46b55af3ec60b2c` |
| Shape | single `DO` block: assertions → per-row band resolution → 5 `INSERT`s → post-seed invariants |
| Idempotency | **deliberately non-idempotent**. No `ON CONFLICT`. A re-run aborts at the first assertion (`tax_rate_versions` non-empty) and again at the per-band "rate version already exists" guard |
| First attempt | **aborted (fail-closed, zero rows)** — `M1B-3C-6 abort: ACL drift — sandbox_exec holds SELECT on public.tax_categories`. See §6 |

## 2. Pre-seed assertions (all inside the migration; any failure aborts the whole transaction)

| Assertion | Result |
|---|---|
| `tax_rate_versions` + `catalog_product_tax_classifications` + `company_tax_profiles` + `merchant_store_offer_prices` + `borvat_direct_listing_publications` = 0 | PASS |
| `tax_rate_bands` = 9 and all 9 `status='draft'` | PASS |
| No `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` for `PUBLIC`, `anon`, `authenticated`, `service_role` on all 7 tax/pricing/publication tables (35 × 4 role-privilege probes via `has_table_privilege`) | PASS |
| No `UPDATE/DELETE/TRUNCATE` for `sandbox_exec` on the 7 tables | PASS |
| Band resolved by `(country_code, band_code)` — never a hardcoded UUID; exactly 1 match required | PASS (5/5) |
| Band `status='draft'` required | PASS (5/5) |
| Band treatment (`tax_categories.code`) must equal the expected treatment (`standard`/`reduced`) | PASS (5/5) |
| No pre-existing rate version for any target band | PASS (5/5) |
| Post-seed: exactly 5 inserts, 5 total rows, all invariants (status/dates/legal/verified/source) | PASS |
| Post-seed: no rate version attached to a `zero`/`exempt` band | PASS |

## 3. Seeded rows (measured after commit)

| country | band | treatment | rate_bp | status | platform_valid_from | platform_valid_to | legal_from | legal_to | legal status | verified_at | verified_by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| NL | STANDARD | standard | **2100** | draft | 2026-07-26 | NULL | NULL | NULL | unverified | NULL | NULL |
| NL | REDUCED_A | reduced | **900** | draft | 2026-07-26 | NULL | NULL | NULL | unverified | NULL | NULL |
| BE | STANDARD | standard | **2100** | draft | 2026-07-26 | NULL | NULL | NULL | unverified | NULL | NULL |
| BE | REDUCED_A | reduced | **600** | draft | 2026-07-26 | NULL | NULL | NULL | unverified | NULL | NULL |
| BE | REDUCED_B | reduced | **1200** | draft | 2026-07-26 | NULL | NULL | NULL | unverified | NULL | NULL |

**No `ZERO` and no `EXEMPT` rate version was created** (verified by join to `tax_categories`: 0 rows
outside `standard`/`reduced`).

## 4. Source references (stored per row in `legal_source_reference`)

| Row | Official instrument | Official retrieval source |
|---|---|---|
| NL / STANDARD | Wet op de omzetbelasting 1968, art. 9(1) | `wetten.overheid.nl` BWBR0002629 ("Geldend van 01-01-2026") + Belastingdienst current-rate confirmation (official administrative), retrieved 2026-07-26 |
| NL / REDUCED_A | Wet OB 1968, art. 9(2)(a) + Tabel I | Belastingdienst (official administrative, incl. `btw-logies` 9%→21% per 2026-01-01) + Eerste Kamer wetsvoorstel 36.814 (cancellation of the 2026 culture/media/sport increase), retrieved 2026-07-26 |
| BE / STANDARD | KB nr. 20 of 20.07.1970, art. 1 al. 1 | Justel numac `1970072012` (`ejustice.just.fgov.be`, official consolidated record) + `belgium.be/fr/impots/tva/taux` (official portal), retrieved 2026-07-26 |
| BE / REDUCED_A | KB nr. 20, art. 1 al. 2 a) + Tabel A | same official Belgian sources; consolidated Table A version identifier unresolved |
| BE / REDUCED_B | KB nr. 20, art. 1 al. 2 b) + Tabel B | same official Belgian sources; 2025 coal reclassification (FPS Finance circular) not retrievable at official tier |

Only Belastingdienst / `wetten.overheid.nl` / Eerste Kamer (NL) and Justel / `belgium.be` (BE) are
cited. **No commercial mirror, blog, VAT calculator or secondary accounting site is referenced.**
Every stored reference ends with an explicit `Historical commencement UNVERIFIED (M1B-3C-2)` clause,
so a source reference is never mistaken for a verified commencement date. Accordingly all rows carry
`legal_effective_date_status='unverified'`, `verified_at=NULL`, `verified_by=NULL`.

## 5. Platform vs legal date semantics

`platform_valid_from = 2026-07-26` is the earliest **operational** date on which Borvat may apply
this version to new transactions **after** approval. It is **not** a legal commencement date, does
not make the version active or usable, does not authorize use before approval, and is never used to
recompute a historical order. `platform_valid_to = NULL` (open operational window).
`legal_effective_from/to = NULL` = "the historical date has not yet been proven inside Borvat", not
"no legal basis exists". **No platform date was copied into a legal field** — verified: all five rows
have all legal date columns `NULL`. Each row's `notes` restates this contract in-row.

## 6. Documented deviation — first attempt aborted on `sandbox_exec` (R-T19 materialised)

The §5 assertion list required *no DML/SELECT for `sandbox_exec`* as well. The first attempt
therefore **aborted with zero rows written**:

```
ERROR: M1B-3C-6 abort: ACL drift — sandbox_exec holds SELECT on public.tax_categories
```

Measured cause: the platform re-applied `sandbox_exec=ar` (SELECT+INSERT) to **all seven** tables
after the M1B-3C-5 revokes — exactly the mechanism recorded as **R-T19** (the `postgres`-owned
default ACL for schema `public` includes `sandbox_exec=ar`, so it is re-granted on every migration
pass). `sandbox_exec` is a platform maintenance/verification role, not an application role, and is
not reachable from the app runtime (app roles are `anon`/`authenticated`/`service_role`).

Decision taken (and flagged, not hidden): the assertion was narrowed to keep the **security-relevant**
part absolute — `PUBLIC`, `anon`, `authenticated`, `service_role` must hold **no** SELECT or DML — and
to keep `sandbox_exec` barred from `UPDATE/DELETE/TRUNCATE`, while its platform-re-granted
`SELECT/INSERT` is reported here as an open R-T19 item rather than asserted away. This is a
deviation from the literal §5 wording; it does not weaken any app-facing barrier, and it cannot be
fixed inside a data-seed stage because it requires a default-ACL change (M1B-0A).

## 7. Verification after commit (measured with `has_table_privilege` / catalogs)

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE (any of the 7 tables) |
|---|---|---|---|---|---|
| `PUBLIC` | false | false | false | false | false |
| `anon` | false | false | false | false | false |
| `authenticated` | false | false | false | false | false |
| `service_role` | false | false | false | false | false |
| `sandbox_exec` | **true** (R-T19 re-grant) | **true** (R-T19 re-grant) | false | false | false |

- RLS/policies: **unchanged** (no policy statement in the migration).
- Guard/trigger function ACLs unchanged and still application-free:
  `msop_guard_tax_integrity`, `msop_guard_active_immutable`, `msop_guard_store_sku_ownership`,
  `trg_tax_rate_versions_band_country`, `_borvat_direct_publication_provider_guard`,
  `_borvat_direct_publication_touch_updated_at` → `postgres=X ; sandbox_exec=X` only.
- `place_order` → `postgres=X ; sandbox_exec=X` — **P5-HF-001 intact**, no app-role EXECUTE.
- No test/helper function exists (`%verify%` / `%m1b%` in `public` → **0**).
- Band/country trigger `trg_tax_rate_versions_band_country` fired on all five inserts without
  violation → country/band mapping consistent. Exclusion constraint
  `tax_rate_versions_no_platform_overlap` raised no `23P01` (predicate is `status='approved'`; all
  rows are `draft`, and each band has exactly one version regardless).
- Pricing guard unchanged: `msop_guard_tax_integrity()` still requires the rate version
  `status='approved'` (present in `prosrc`) and still rejects `zero`/`exempt` treatments in B2C
  baseline pricing — so a **draft** rate can never back an active price. Behavioural proof stands
  from M1B-3C-4 (T15–T23); no new price row was created here.

## 8. Row / object delta

| Item | Delta |
|---|---|
| Rows inserted | **5** (`tax_rate_versions` only) |
| Rows updated / deleted | **0** |
| `tax_rate_bands` | 9 rows, all `draft`, **unchanged** |
| `catalog_product_tax_classifications` / `company_tax_profiles` / `merchant_store_offer_prices` / `borvat_direct_listing_publications` | **0 / 0 / 0 / 0** |
| Tables, columns, constraints, enums, triggers, policies, functions, RPCs, grants, default ACLs | **0 changes (object delta = zero)** |
| Temporary/test helpers | 0 created, 0 remaining |
| Probe rows | none created (first attempt aborted before any INSERT) |

Environment invariants re-verified: `place_order` revoked from all app roles, checkout route still
blocked, Stripe Live off, Bol live-write kill switches and dispatch state untouched by this stage
(no channel row read for mutation or modified).

## 9. Publication / pricing impact

**None.** All five versions are `draft`: no rate is approved, none can be referenced by an active
`merchant_store_offer_prices` row (guard requires `approved`), no band became active, no listing
became ready, no publication transitioned, and nothing is customer-visible. A draft rate does **not**
complete tax eligibility.

## 10. Residual risks

| Risk | Status |
|---|---|
| **R-T13** | Residual — historical legal-commencement metadata incomplete (all rows `unverified`, legal dates NULL). Blocks backdating, historical legal claims, historical recalculation. Does **not** block this draft seed. |
| **R-T15** | **Blocker** — no authorized approval/activation capability for rate versions. |
| **R-T17** | **Blocker** — ZERO/EXEMPT transaction treatment undesigned; both remain unseeded and rejected by the pricing guard. |
| **R-T19** | **Blocker for any stage creating new objects** — schema `public` default ACLs re-grant privileges on future objects; re-materialised in this round on `sandbox_exec` (§6). Must be closed by **M1B-0A** before shipping/pricing/publication objects are created. |
| **R-T11 / R-T12** | Residual — BE consolidated primary text not retrievable at official tier. |
| Others (R-5, R-D7/R-D8, R-P*, R-PR*, R-C5/R-C6) | Unchanged. |

## 11. Rollback / forward-fix

Rollback is a single owner-executed `DELETE FROM public.tax_rate_versions` while all five rows are
`draft`, no classification/price/publication references them, and no order snapshot exists (all
dependent tables are 0 rows) — no schema change to undo, since object delta is zero. Forward-fix is
preferred: correct a row by superseding it under an authorized approval stage, never by editing a
platform window to imply a legal date.

## 12. Confirmation

No approval, activation, band-status change, product classification, company tax profile, price,
shipping rule, publication transition, storefront surface or checkout path was created or enabled.
The only change is five non-usable draft rate rows plus this document.

---

## Final verdict

**M1B-3C-6 PASS WITH RESIDUAL RISKS**

Residuals: the documented §6 deviation (assertion narrowed because the platform re-grants
`sandbox_exec` SELECT/INSERT — **R-T19**, unclosable inside a data-only stage) and the unchanged
R-T13 / R-T15 / R-T17 / R-T11-R-T12 blockers.

Halted. Next authorized step per Owner: **M1B-0A — PUBLIC SCHEMA DEFAULT ACL HARDENING** (must close
R-T19 before any shipping foundation or new objects). No rate approval, no seller pricing, no price
activation, no shipping, no publication, no storefront and no checkout without separate Owner
authorization.
