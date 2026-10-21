# PHASE 5 — M1B-2D — JURISDICTION TAX RATE-BAND SCHEMA CORRECTION REPORT

**Scope:** Structural correction of the Tax Foundation so that jurisdictions
(e.g. Belgium) can carry multiple concurrent bands under the same legal
treatment (e.g. two distinct "reduced" bands at 6% and 12%). Schema and
integrity only — no real VAT rates or classifications inserted.

---

## 1. Migrations applied

| # | Purpose |
|---|---|
| 1 | `20260726104226…` — Structural correction: reclassify `tax_categories` as a global TREATMENT taxonomy; create `public.tax_rate_bands`; swap `tax_rate_versions` and `catalog_product_tax_classifications` from `tax_category_id` to `tax_rate_band_id`; rebuild `btree_gist` exclusion constraints on band; add composite `(tax_rate_band_id, country_code)` FK to prevent cross-country band usage; rewrite `msop_guard_tax_integrity()` for band-match semantics. |
| 2 | `20260726104424…` — Temporary owner-privileged behavioural runner `public._m1b2d_verify()` (SECURITY DEFINER, `search_path=''`). |
| 3 | `20260726104554…` — Runner v2 with corrected fixture columns. |
| 4 | `20260726104625…` — Drop `public._m1b2d_verify()` (zero-delta cleanup). |

Only migration 1 introduces persistent objects. Migrations 2–4 are self-cleaning verification scaffolding and leave no residual objects.

---

## 2. Structural changes

### `public.tax_categories` — reclassified
Now the **global treatment taxonomy** (`standard`, `reduced`, `zero`,
`exempt`). Comment updated. No jurisdictional coupling.

### `public.tax_rate_bands` — NEW
Keyed by `(country_code, band_code)`. Provides a **stable jurisdiction-level
band identity** independent of the numeric rate.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| country_code | text (`^[A-Z]{2}$`) | not null |
| band_code | text | not null |
| tax_category_id | uuid FK → tax_categories | treatment classification |
| display_name | text | not null |
| status | text | `draft` / `approved` / `superseded` / `retired` |
| created_at / updated_at | timestamptz | |

Uniqueness: `UNIQUE (country_code, band_code)` — supports concurrent bands
of the same treatment (e.g. BE `REDUCED_A` @ 6%, BE `REDUCED_B` @ 12%).
Composite key `UNIQUE (id, country_code)` enables the composite FK on the
classification table below.

RLS: `ENABLE + FORCE`, no policies, no grants to app roles.

### `public.tax_rate_versions` — retargeted
- Replaced `tax_category_id` → `tax_rate_band_id` (FK → `tax_rate_bands`).
- Added trigger `trg_tax_rate_versions_band_country` enforcing
  `NEW.country_code = band.country_code`.
- Rebuilt exclusion constraint using `btree_gist` on
  `(tax_rate_band_id WITH =, tstzrange(valid_from, valid_to) WITH &&)`
  filtered by `status = 'approved'`. Overlaps within a band are rejected;
  same window across different bands is allowed.

### `public.catalog_product_tax_classifications` — retargeted
- Replaced `tax_category_id` → `tax_rate_band_id`.
- Added composite FK `(tax_rate_band_id, country_code) →
  tax_rate_bands (id, country_code)` — a classification cannot reference a
  band from another country.
- Rebuilt exclusion constraint on `(product_id, country_code)` — one
  approved classification per product/country window (band-agnostic).

### `public.msop_guard_tax_integrity()` — rewritten
Active-price integrity now performs **band-to-band matching**:
- Load approved classification for `(product, country, valid_from)`.
- Load approved rate version for `(country, valid_from)` scoped to the
  price's `tax_rate_version_id`.
- Reject if either missing, country mismatched, or bands differ.
- Legacy category-match path removed.

---

## 3. Behavioural test results

Executed inside a self-rolling-back SECURITY DEFINER runner
(`_m1b2d_verify`, since dropped): **PASS = 23, FAIL = 1 (test-fixture
assertion only)**. After the R-T9 terminology correction in §3.1 the
scoreboard reads **24 / 24 PASS** (no schema change involved).


| # | Scenario | Result |
|---|---|---|
| 1 | `tax_rate_bands` exists with `FORCE RLS` | PASS |
| 2 | `tax_categories` reclassified as treatment taxonomy | PASS |
| 3 | Two reduced bands in same country coexist | PASS |
| 4 | Duplicate `(country, band_code)` rejected | PASS |
| 5 | Invalid country format rejected | PASS |
| 6 | Invalid band status rejected | PASS |
| 7 | Invalid treatment FK rejected | PASS |
| 8 | Rate version with unknown band rejected | PASS |
| 9 | Rate country ≠ band country rejected | PASS |
| 10 | Different bands, same country, same window accepted | PASS |
| 11 | Overlapping approved rate on same band rejected (`23P01`) | PASS |
| 12 | Same window, different band accepted | PASS |
| 13 | Classification with band from wrong country rejected (composite FK) | PASS |
| 14 | Valid classification accepted | PASS |
| 15 | Overlapping classification same product+country rejected (`23P01`) | PASS |
| 16 | Same product, different country accepted | PASS |
| 17 | Active price with matching band accepted | PASS |
| 18 | Active price with band mismatch rejected | PASS |
| 19 | Active price with country mismatch rejected | PASS |
| 20 | Active price with out-of-window rate rejected | PASS |
| 21 | `tax_rate_versions.tax_category_id` removed | PASS |
| 22 | `catalog_product_tax_classifications.tax_category_id` removed | PASS |
| 23 | Zero-rate treatment distinct from exempt | **PASS (assertion corrected)** — see §3.1. |
| 24 | Fixtures created inside rollback envelope only | PASS |

Post-rollback row counts (verified independently):

```
tax_rate_bands                       = 0
tax_rate_versions                    = 0
catalog_product_tax_classifications  = 0
merchant_store_offer_prices          = 0
```

### 3.1 R-T9 correction — category code vs treatment semantic

The original runner asserted `tax_categories.code IN ('zero_rated','exempt')`.
That assertion was wrong: `zero_rated` is the **semantic name of the legal
treatment**, not the **stored category code**. The live taxonomy stores the
code `zero`, whose `label`/`description` express the `zero_rated` semantic.

Live taxonomy (re-verified against the database):

| `code` | `label` | `description` | Treatment semantic |
|---|---|---|---|
| `standard` | Standard rate | Default VAT rate unless a specific reduced/zero/exempt classification is approved | standard-rated |
| `reduced` | Reduced rate | Reduced VAT rate for eligible product categories per destination law | reduced-rated |
| `zero` | Zero rate | Zero-rated supplies (rate = 0, still taxable and reportable) | **zero_rated** |
| `exempt` | Exempt | Exempt from VAT (not zero-rated) | exempt |

Corrected assertion (documentation of intent; the temporary runner
`_m1b2d_verify()` was already dropped, so no migration is required):

```sql
-- WRONG: code IN ('zero_rated','exempt')
-- RIGHT:
SELECT count(*) = 2
FROM public.tax_categories
WHERE code IN ('zero', 'exempt');
```

Terminology rule adopted project-wide: write **category code `zero`** when
referring to the stored identifier and **treatment `zero_rated`** when
referring to the legal/accounting semantic. The two must never be used
interchangeably without qualification. The seed taxonomy was **not** changed
to match the assertion.

No semantic mismatch exists between the code and its treatment, so
**TAXONOMY SEMANTIC MISMATCH is NOT raised**. All 20 behavioural
(constraint/trigger) scenarios passed; T23 now reads PASS under the corrected
assertion. No re-migration required.


---

## 4. Persistence / zero-delta evidence

- No real tax data inserted.
- Persistent net objects added: `tax_rate_bands` table + indexes,
  `trg_tax_rate_versions_band_country` trigger. Existing tables retargeted
  in place. Guard function `msop_guard_tax_integrity` replaced (definition
  only).
- No public storefront visibility. Publication remains fail-closed. Bol
  Live, Stripe Live, `place_order` remain disabled/locked.

---

## 5. Belgium reduced-rate conflict — resolved

Under the corrected model, Belgium's 6% reduced band and 12% reduced band
are separate `tax_rate_bands` rows (`BE / REDUCED_A`, `BE / REDUCED_B`),
each carrying its own approved `tax_rate_versions` chain. The exclusion
constraint on rate versions is keyed by band, not by treatment, so both
bands can be simultaneously active without violation. Classifications
pin the product to a band, so an active price is unambiguous.

---

## 6. Residual risks

Recorded/retained:

- **R-T7** — No official rate data (bands, versions, or classifications)
  loaded. No active price can be constructed outside test fixtures.
- **R-T8** — Band lifecycle (retire / supersede) has schema support but no
  operational workflow yet.
- **R-T9 CLOSED — TEST ASSERTION ALIGNED WITH LIVE TAXONOMY.** The T23
  assertion referenced the treatment semantic `zero_rated` instead of the
  stored category code `zero`. Corrected in §3.1 (docs-only; runner already
  dropped). Live taxonomy left unchanged; code↔treatment semantics verified
  coherent, so no TAXONOMY SEMANTIC MISMATCH.

- **R-5**, **R-D7**, **R-D8** — unchanged.
- **R-P1..R-P4**, **R-PR1..R-PR7** — unchanged; publication and pricing
  workflows still blocked.

None of these block this correction.

---

## 7. Decision

- **BOR-DEC-050 — JURISDICTION TAX RATE-BAND MODEL ADOPTED**: Global
  treatment taxonomy plus per-country stable bands. `tax_rate_versions`
  and `catalog_product_tax_classifications` retargeted to bands. Pricing
  guard rewritten for band-match semantics. No real rates persisted.

---

## Final verdict

**M1B-2D PASS WITH RESIDUAL RISKS.**

Halted. Awaiting separate Owner authorisation before: Tax data loading,
Seller draft-price workflow, Price activation/withdrawal, Shipping
foundation, Publication transitions, Public Storefront, Checkout/Orders
reactivation.
