# PHASE 5 — M1B-3C-3 — TAX TEMPORAL SEMANTICS AND TRANSACTION-TREATMENT CORRECTION PRECHECK

**Type:** Analysis and design only. **No migration, no rate versions, no band-status
change, no classifications, no prices, no shipping, no publication, no storefront,
no checkout.**

**Zero-delta statement (verified at end of round):** no DDL, no DML, no function
replacement, no grant/RLS change was executed in this round. All reads were
`SELECT` against catalogs (`information_schema`, `pg_constraint`, `pg_proc`) and
row counts.

---

## 1. Current temporal semantics (as built)

### `public.tax_rate_versions`
| Column | Type | Null | Meaning **as currently built** |
|---|---|---|---|
| `id` | uuid | NO | PK |
| `country_code` | text `^[A-Z]{2}$` | NO | jurisdiction (trigger-checked against band country) |
| `tax_rate_band_id` | uuid → `tax_rate_bands` | NO | band identity |
| `rate_basis_points` | integer 0..100000 | NO | the percentage (2100 = 21%) |
| `valid_from` | **date** | NO | **overloaded — see §2** |
| `valid_to` | date | YES | overloaded, open-ended allowed |
| `status` | `tax_rate_status` | NO | `draft` / `approved` / … |
| `approved_by` / `approved_at` | | YES | required when `status='approved'` |

Integrity in force:
- `CHECK (valid_to IS NULL OR valid_to > valid_from)`
- `EXCLUDE USING gist (tax_rate_band_id WITH =, daterange(valid_from, valid_to, '[)') WITH &&) WHERE (status='approved')`
- `CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))`
- trigger `trg_tax_rate_versions_band_country`: `NEW.country_code = band.country_code`

### `public.catalog_product_tax_classifications`
`(product_id, country_code, tax_rate_band_id, valid_from date, valid_to date, status)`
with composite FK `(tax_rate_band_id, country_code) → tax_rate_bands(id, country_code)`
and `EXCLUDE gist (product_id =, country_code =, daterange(valid_from, valid_to,'[)') &&) WHERE (status='approved')`.

### `public.merchant_store_offer_prices`
Gross price with `tax_rate_version_id` (nullable), `valid_from/valid_to timestamptz`,
`status draft|active|superseded|withdrawn`, exclusion on active windows per
`(store, sku, destination, currency)`.

### Live counts (re-verified this round)
`tax_categories=4`, `tax_rate_bands=9` (all `draft`), `tax_rate_versions=0`,
`catalog_product_tax_classifications=0`, `company_tax_profiles=0`,
`merchant_store_offer_prices=0`, `borvat_direct_listing_publications` fail-closed.
Because the four temporal tables are **empty**, a schema correction is available at
**zero data-migration cost**.

---

## 2. Why "Contract A" fails in its current form

`tax_rate_versions.valid_from` is a single column that today is silently asked to
represent **four different facts**:

1. **Legal rate commencement** — the statutory date the jurisdiction's rate took effect.
2. **Platform operational validity** — the date Borvat is allowed to use the rate for new orders.
3. **Product-scope validity** — whether a given product sits in the band (belongs on the classification, not the rate).
4. **Transaction treatment validity** — whether the supply is domestic/intra-EU/export at all.

Consequences of the overload:
- **(a)** Loading a current rate with `valid_from = <verification date>` fabricates a legal
  commencement date. Forbidden by BOR-DEC-051 / BOR-DEC-053.
- **(b)** Loading the true historical legal date (where provable) would silently license
  **backdating**: the guard compares `price.valid_from` against `rate.valid_from`, so a
  1971-era legal date would authorise prices/orders dated before Owner approval existed.
- **(c)** With one column there is no way to say "rate is real, legally-dated evidence is
  missing" — the row is either fabricated or impossible.
- **(d)** The exclusion constraint is keyed on the same overloaded column, so any later
  reinterpretation silently changes what "overlap" means.

This is exactly why M1B-3C-2 returned `ready_for_seed = true` for **0 of 7** rows: the
blocker is the *model*, not the research.

---

## 3. Legal validity vs platform validity

| Concept | Question it answers | Owner of truth | Consequence if wrong |
|---|---|---|---|
| **Legal commencement** (`legal_effective_from/to`) | "From when did the state impose this rate?" | primary legislation | historical mis-statement, audit exposure |
| **Platform validity** (`platform_valid_from/to`) | "From when may Borvat apply this rate to new orders?" | Owner approval | wrong tax charged on a live order |

They are independent: a rate can be legally in force for decades while Borvat's platform
validity starts on the Owner-approval date. Platform validity is **never** earlier than the
approval timestamp; legal metadata is **optional** and may be `NULL` (evidence pending).
Legal metadata is **display/audit only** and must never drive checkout arithmetic.

---

## 4. Rate validity vs product-scope validity (R-T16)

Schema inspection confirms the separation is **already structurally supported**:

- Rate percentage per band over time → `tax_rate_versions` (exclusion keyed on
  `tax_rate_band_id`, not on treatment, not on product).
- Product membership of a band over time → `catalog_product_tax_classifications`
  (independent exclusion keyed on `(product_id, country_code)`).

Therefore:
- Belgium moving a good between Table A and Table B, or adding/removing a good,
  **requires no new rate version** when the percentage is unchanged; it requires
  **closing one classification window and opening another** for that product.
- A change of the **percentage** of a band requires a **new rate version** (close the
  previous window, open the next).

> **R-T16 — RESOLVED BY RATE-VERSION / PRODUCT-SCOPE SEPARATION.** The separation is
> implementable on the existing schema with no structural change; only the temporal
> columns of `tax_rate_versions` need the §5 correction.

---

## 5. Options evaluated

### Option A — Reinterpret the rate-version temporal columns (RECOMMENDED)
Rename `valid_from`/`valid_to` → `platform_valid_from`/`platform_valid_to` and add
optional legal metadata:

| New column | Type | Null | Purpose |
|---|---|---|---|
| `platform_valid_from` | date (renamed) | NO | first date Borvat may apply the rate |
| `platform_valid_to` | date (renamed) | YES | exclusive end of platform use |
| `legal_effective_from` | date | YES | proven statutory commencement, else `NULL` |
| `legal_effective_to` | date | YES | proven statutory end, else `NULL` |
| `legal_effective_date_status` | text | NO | `unverified` / `primary_source_verified` / `secondary_source_only` / `not_applicable` |
| `legal_source_reference` | text | YES | citation (act/article/URL) |
| `verified_at` | timestamptz | YES | when the citation was checked — **explicitly not a legal date** |

Impact assessment (measured, not assumed):
- **Exclusion constraint** on `tax_rate_versions` must be rebuilt on
  `daterange(platform_valid_from, platform_valid_to, '[)')`. One constraint.
- **`CHECK (valid_to > valid_from)`** must be rebuilt. One constraint.
- **`msop_guard_tax_integrity()`** reads `valid_from`/`valid_to` of the rate version —
  one `SELECT` and one window test to update (§8). One function.
- **`trg_tax_rate_versions_band_country`** touches `country_code` only — **unaffected**.
- **`catalog_product_tax_classifications`** keeps its own `valid_from/valid_to`
  (product-scope semantics) — **unaffected, and must not be renamed**.
- **`merchant_store_offer_prices`** references the rate only by `tax_rate_version_id` —
  **unaffected**.
- **Application code:** `rg` over `src/` finds these columns only in the auto-generated
  `src/integrations/supabase/types.ts` (regenerated after any migration). No hand-written
  component, route, server function or script reads `tax_rate_versions` — no pricing/tax
  surface exists yet. Zero hand-written code churn.
- **Data:** 0 rows. No backfill, no ambiguity.
- Additional guard obtainable cheaply: `CHECK (legal_effective_date_status <> 'primary_source_verified' OR legal_effective_from IS NOT NULL)`.

### Option B — Keep `valid_from` legal, add a separate platform-usage table
Adds a second table (`tax_rate_version_platform_windows`) plus a second exclusion
constraint, a join in every checkout/guard path, and a genuine dual-source-of-truth
hazard: the rate row would carry a legal window that *looks* usable while the real
authority lives elsewhere. Also forces `valid_from NOT NULL` to stay a legal date —
which is precisely the fabrication we are forbidding, since no legal date is proven.
**Rejected** (higher complexity, worse fail-mode).

### Option C — Load historical legal dates only
Remains **forbidden** under BOR-DEC-053 while the date is unproven for each rate, and
even where proven it re-opens the backdating hazard of §2(b). **Rejected.**

### Recommendation
> **OPTION A — PLATFORM VALIDITY SEPARATED FROM OPTIONAL LEGAL-HISTORY METADATA.**

---

## 6. Operational contract guaranteed by Option A

1. A rate is never applied before `platform_valid_from`.
2. `platform_valid_from` may never precede the Owner approval date → **no backdating**.
3. Checkout resolves the rate version whose platform window contains the **order creation
   instant** (destination-scoped).
4. The order line stores a **snapshot** (band, rate basis points, rate-version id, gross/net/VAT
   amounts). Snapshots are immutable.
5. Editing legal metadata later **never** changes a past order and never recomputes VAT.
6. Ending or replacing a rate is done by closing the current version's platform window and
   inserting a **new version** — never by editing a rate in place.
7. Product classifications carry their **own** effective window, independent of rate windows.
8. A change to the product list of a band creates/ends **classification** versions only; the
   rate version is untouched while the percentage is unchanged (§4).

---

## 7. Product-classification validity (definition adopted for design)

A classification window means: *the period during which this product belongs to this rate
band in this jurisdiction.* It is independent of the product creation date, of any price
date, of the band's legal commencement, and of Borvat's platform activation date.

Future checkout must find a **valid intersection** of five facts, all at order time:
platform rate validity ∩ product classification validity ∩ price validity ∩ destination ∩
transaction treatment. Absence of any one is a **hard fail-closed** (no fallback rate, no
default 21%, no "assume standard").

---

## 8. ZERO / EXEMPT boundary (R-T17)

`ZERO` is not a domestic product band. Zero-rating depends on **transaction context**:
export outside the EU, intra-EU supply, statutory transaction-specific treatment, buyer
identity/VAT-number validity, and documentary evidence. `EXEMPT` is a different regime
again (no output VAT **and** no deduction right) and must never be represented as "0%".

Adopted boundary (design-time, nothing executed):
- NL/`ZERO` and BE/`ZERO` **stay `draft`**; reserved taxonomy only.
- No automatic product classification into `ZERO` or `EXEMPT`.
- No price activation may reference a `ZERO`/`EXEMPT` band.
- Neither may appear in B2C local destination pricing baseline until a separate
  **transaction-tax design** exists.

### Deferred transaction-treatment model (design sketch only — not implemented)
A future `transaction_tax_treatment` resolution layer, evaluated per order line, distinguishing:
`domestic_b2c_destination_vat`, `intra_eu_b2b_reverse_charge`, `export_outside_eu_zero_rated`,
`exempt_supply`, `zero_rated_with_deduction`. Inputs: seller VAT identity, buyer VAT number
(+validation result and validation timestamp), ship-from/ship-to countries, evidence flags
(proof of transport, customs document), and the product's band classification. The band
classification is **one input, never the decision**.

---

## 9. Pricing-guard impact — `msop_guard_tax_integrity()`

Current guard (verified this round) checks: `status='active'` gate → `tax_rate_version_id NOT NULL`
→ rate exists → rate `status='approved'` → rate country = price destination → price
`valid_from` inside `[rate.valid_from, rate.valid_to)` → SKU has product → approved
classification exists for `(product, destination, valid_from)` → classification country
matches → classification band = rate band.

Required future changes (to be executed only under a separate authorization):
1. Read `platform_valid_from`/`platform_valid_to` instead of `valid_from`/`valid_to`, and
   change the message to "rate not platform-valid at price valid_from".
2. Reject when `price.valid_from` precedes `platform_valid_from` (explicit
   **no-backdating** error, distinct from the window error).
3. Reject any active price whose band resolves to treatment `zero` or `exempt`
   (baseline B2C guard, per §8) until the transaction-tax layer exists.
4. Keep band-match, destination-match, and classification-window checks unchanged.
5. Never consult `legal_effective_from` — legal metadata must not influence the guard.

**Not modified in this round.**

---

## 10. Proposed future migration strategy (not executed)

One small **atomic** correction migration, data-free:
1. `ALTER TABLE public.tax_rate_versions RENAME COLUMN valid_from TO platform_valid_from;`
   and the same for `valid_to`.
2. `ADD COLUMN legal_effective_from/to date`, `legal_effective_date_status text NOT NULL DEFAULT 'unverified'` (+ CHECK on the allowed values and the "verified ⇒ date present" CHECK), `legal_source_reference text`, `verified_at timestamptz`.
3. Drop and recreate the rate-version exclusion constraint and the `valid_to > valid_from`
   CHECK on the renamed columns.
4. `CREATE OR REPLACE FUNCTION public.msop_guard_tax_integrity()` per §9.
5. Refresh `COMMENT ON COLUMN/TABLE` so the legal/platform distinction is documented in the
   database itself.
6. Preserve RLS + FORCE RLS, zero policies, and the current ACLs; **issue no new grants**
   and keep `sandbox_exec` DML-free (R-T14 stays closed).
7. **No data** in the correction migration. Any seed is a later, separately authorized migration.

Rollback: inverse rename + column drops + constraint/function restore; trivially safe while
the tables hold 0 rows.

---

## 11. Future current-rate seed contract (design only — do not execute)

After the §10 correction, a **draft, unusable** current-rate dataset becomes safe because
platform validity no longer implies a legal claim. Conditions, all mandatory:

| Condition | Rule |
|---|---|
| Source | government tax-authority page confirming the **current** rate (Belastingdienst / Rijksoverheid; FOD Financiën) |
| `rate_basis_points` | as published (NL 2100 / 900; BE 2100 / 1200 / 600) |
| `platform_valid_from` | **deferred** to the future Owner-activation date; never the migration/verification/current date |
| `legal_effective_from` | `NULL` while unproven |
| `legal_effective_date_status` | `unverified` |
| `verified_at` | retrieval timestamp, labelled as verification only |
| `status` | `draft` (never `approved`; approval requires R-T15 capability) |
| Usage | not referenced by any price, guard-passing row, publication or checkout |
| Claim | report must state the legal history is **incomplete** |

**Eligible future dataset (5 rows only):** NL `STANDARD`, NL `REDUCED_A`, BE `STANDARD`,
BE `REDUCED_A`, BE `REDUCED_B`.
**Excluded from the customer B2C activation baseline:** all `ZERO` and `EXEMPT` bands (§8).

Answer to §5 of the authorization: **yes** — a government source confirming the current rate
is sufficient to create a **draft, non-usable** rate version once platform validity is
separated, **provided** activation remains a separate, independently reviewed step.

---

## 12. Test plan (to run with the future correction, not now)

| # | Assertion |
|---|---|
| 1 | `platform_valid_from` is documented/labelled as platform validity, never surfaced as a legal date |
| 2 | `legal_effective_from` accepts `NULL` |
| 3 | `legal_effective_date_status='primary_source_verified'` with `legal_effective_from IS NULL` is rejected |
| 4 | A `draft` rate with no legal date cannot back an active price (guard rejects) |
| 5 | A price with `valid_from < platform_valid_from` is rejected with the no-backdating error |
| 6 | A rate whose platform window has ended cannot back a new active price |
| 7 | Product-scope change (classification close/open) requires **no** new rate version |
| 8 | Rate-percentage change requires a new version; overlapping approved windows on one band rejected (`23P01`) |
| 9 | Classification windows are independent of rate windows (same product, different windows, both valid) |
| 10 | Active price on a `ZERO` band rejected |
| 11 | `EXEMPT` never evaluates as 0% in any computation path |
| 12 | Editing legal metadata leaves order snapshots byte-identical (once orders exist) |
| 13 | Correction migration adds **0** rows to `tax_rate_versions` |
| 14 | `merchant_store_offer_prices` and `borvat_direct_listing_publications` unchanged (counts + statuses) |
| 15 | P5-HF-001 intact — `place_order` EXECUTE false for `anon`/`authenticated` |
| 16 | Bol Live = 0, Stripe Live off |
| 17 | RLS + FORCE RLS retained, zero policies, no new grants, `sandbox_exec` DML denied |

---

## 13. Risks (updated)

| Risk | Status after this precheck |
|---|---|
| **R-T13** — historical legal commencement dates unproven | **DOWNGRADED from system-wide blocker to: "Historical legal-date metadata incomplete."** Still blocks any historical claim and any backdating; no longer blocks a draft current-rate dataset once platform validity is separated |
| **R-T15** — no authorized approval capability for tax data | **Blocker** — blocks approval and activation of any rate version |
| **R-T16** — BE reduced bands have no single legal commencement | **RESOLVED BY RATE-VERSION / PRODUCT-SCOPE SEPARATION** (§4; separation verified implementable) |
| **R-T17** — ZERO is transaction-contextual, not a domestic band | **Blocker** for using `ZERO` as a local product band / in B2C pricing (§8) |
| **R-T11 / R-T12** — BE consolidated primary text not retrieved | Residual |
| **R-T14** — `sandbox_exec` DML | Closed (no DML) |
| **R-T7 / R-T8** | Open, unchanged |
| **R-5, R-D7, R-D8, R-P1..R-P4, R-PR1..R-PR7** | Unchanged |

---

## 14. Proposed decision (not yet written to the log)

> **BOR-DEC-054 — PLATFORM TAX VALIDITY SEPARATED FROM HISTORICAL LEGAL COMMENCEMENT**
> `tax_rate_versions.valid_from/valid_to` are reinterpreted as
> `platform_valid_from/platform_valid_to` (the window in which Borvat may apply the rate to
> new orders), with optional, non-operational legal metadata
> (`legal_effective_from/to`, `legal_effective_date_status`, `legal_source_reference`,
> `verified_at`). Platform validity may never precede Owner approval; legal metadata may be
> `NULL` and never drives computation. Rate versions represent a band's percentage over time;
> product membership of a band is represented solely by classification windows. `ZERO` and
> `EXEMPT` bands remain reserved taxonomy, excluded from B2C price activation pending a
> separate transaction-tax design.

---

## Final verdict

**SAFE TAX TEMPORAL CORRECTION DESIGN IDENTIFIED.**

No change executed. Halted — awaiting separate Owner authorisation before the schema
correction migration, any rate seed, seller pricing workflow, price activation, shipping
foundation, publication transitions, public storefront, or checkout reactivation.
