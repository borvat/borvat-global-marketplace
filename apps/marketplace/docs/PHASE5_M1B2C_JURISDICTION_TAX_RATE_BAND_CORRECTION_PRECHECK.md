# PHASE 5 — M1B-2C — JURISDICTION TAX RATE BAND MODEL CORRECTION PRECHECK

**Scope:** Analysis and design only. No migration, no schema change, no data
load, no workflow change. This document proposes the structural correction
that must precede any real-world tax data loading (M1B-3C).

---

## 1. Current live model — verbatim

### 1.1 `public.tax_categories`

Columns (from `information_schema.columns`):
`id uuid PK`, `code text NOT NULL`, `label text NOT NULL`,
`description text`, `created_at`, `updated_at`.

Constraints:
- `UNIQUE (code)`
- `CHECK code ~ '^[a-z][a-z0-9_]{1,31}$'`
- `CHECK length(label) BETWEEN 1 AND 128`

Persisted rows (canonical seed, 4 total):

| code | label |
|---|---|
| standard | Standard rate |
| reduced  | Reduced rate |
| zero     | Zero rate |
| exempt   | Exempt |

No country column. Categories are **global**, not per-jurisdiction.

### 1.2 `public.tax_rate_versions`

Columns: `id`, `country_code text NOT NULL`, `tax_category_id uuid NOT NULL
FK → tax_categories(id) ON DELETE RESTRICT`, `rate_basis_points int NOT NULL`,
`valid_from date NOT NULL`, `valid_to date NULL`, `status tax_rate_status
NOT NULL DEFAULT 'draft'` (`draft|approved|superseded|withdrawn`),
`approved_by`, `approved_at`, `created_by`, `created_at`, `updated_at`, `notes`.

Constraints:
- `CHECK country_code ~ '^[A-Z]{2}$'`
- `CHECK rate_basis_points BETWEEN 0 AND 100000`
- `CHECK (valid_to IS NULL) OR (valid_to > valid_from)`
- `CHECK approved status ⇒ approved_by IS NOT NULL AND approved_at IS NOT NULL`
- **Exclusion (btree_gist):**
  `EXCLUDE USING gist (country_code =, tax_category_id =,
   daterange(valid_from, valid_to, '[)') &&) WHERE status='approved'`.

### 1.3 `public.catalog_product_tax_classifications`

Columns: `id`, `product_id uuid NOT NULL FK → catalog_products(id) ON DELETE
CASCADE`, `country_code text NOT NULL`, `tax_category_id uuid NOT NULL FK →
tax_categories(id) ON DELETE RESTRICT`, `status tax_classification_status
NOT NULL DEFAULT 'proposed'` (`proposed|approved|superseded|withdrawn`),
`valid_from date NOT NULL`, `valid_to date NULL`, `proposed_by`, `approved_by`,
`approved_at`, `notes`, `created_at`, `updated_at`.

Constraints:
- `CHECK country_code ~ '^[A-Z]{2}$'`
- `CHECK (valid_to IS NULL) OR (valid_to > valid_from)`
- `CHECK approved status ⇒ approved_by/at NOT NULL`
- **Exclusion (btree_gist):**
  `EXCLUDE USING gist (product_id =, country_code =,
   daterange(valid_from, valid_to, '[)') &&) WHERE status='approved'`.

### 1.4 `public.merchant_store_offer_prices.msop_guard_tax_integrity()`

For `status='active'` rows the trigger requires all of:

1. `tax_rate_version_id` present and referencing an `approved` version.
2. That version's `country_code` = `NEW.destination_country_code`.
3. That version is effective at `NEW.valid_from`.
4. The SKU's product has an `approved` classification for the same country
   effective at that date.
5. **`classification.tax_category_id = rate_version.tax_category_id`.**

Step 5 is the single link between a product's classification and the numeric
rate. It resolves at the granularity of `tax_category_id`.

---

## 2. Current-model conflict

### 2.1 What `tax_category` currently represents

Legally, VAT concepts split into two independent axes:

- **Treatment** — the legal nature of the supply: standard-rated,
  reduced-rated, zero-rated, exempt, reverse charge, outside scope.
  This is a general legal identity, not a rate.
- **Rate band** — inside one jurisdiction, one specific rate slot the law
  assigns to a subset of supplies (e.g. BE 6% band vs BE 12% band).

Today's `tax_categories` conflates the two: `reduced` is a *treatment*, but
the rate version and the exclusion constraint treat it as if it were also
the *rate band*. Concretely the exclusion key is:

```
(country_code, tax_category_id, effective range)  WHERE status='approved'
```

Only one approved row is allowed per `(country, category)` at any date.

### 2.2 Why NL/BE break the model

Real jurisdictions in scope of Alpha:

- **Netherlands (Belastingdienst)**: standard 21%, reduced 9%, plus
  zero-rated supplies, and specific exempt/outside-scope cases.
- **Belgium (SPF Finances / Belastingdienst-equivalent)**: standard 21%,
  reduced 12%, reduced 6%, plus 0% in specific cases and exempt/outside
  scope.

The EU VAT Directive explicitly permits up to two reduced rates per member
state (plus a super-reduced rate and a "parking" rate in some historical
cases). BE uses two of them concurrently.

Under the current model there is **no legal way** to hold both BE 6% and
BE 12% simultaneously in `approved` state: the exclusion constraint
rejects the second insert with `SQLSTATE 23P01`.

### 2.3 Why the classification side is also broken

Even if we could store both rates, `catalog_product_tax_classifications`
points at `tax_categories.id`. A row saying "product X in BE is `reduced`"
is **ambiguous**: it does not say whether BE-6% or BE-12% applies. The
tax integrity guard would match either — a silent-error class of bug.

### 2.4 Why each prohibited shortcut is prohibited

- **Load only one reduced rate**: legally incorrect — a random subset of
  BE catalog would be under-taxed or over-taxed.
- **Disable the exclusion**: reintroduces the multi-approved-window race
  that btree_gist was authorised to close (BOR-DEC-047).
- **Put 6% and 12% under the same row**: violates one-rate-per-version.
- **Encode the rate inside `product_classifications.notes` or category
  code (e.g. `reduced_6`, `reduced_12`)**: rate is a *value*, not an
  *identity*. When Belgium changes the "12% band" to another number, the
  band identity must survive; changing category codes forces rewrites of
  every classification row.
- **Add `rate_basis_points` to the classification**: duplicates the rate
  across two tables and desyncs on legal change.
- **Add `rate_basis_points` to the exclusion key**: allows both rows but
  leaves `classification → rate` mapping ambiguous. Rejected on §3
  grounds below.

Therefore Tax data loading (M1B-3C) is correctly blocked.

---

## 3. Options considered

### Option A — Treatment vs Jurisdiction Rate Band (RECOMMENDED)

**Model.** Split the current `tax_categories` role into two entities:

1. **Treatment** (global, closed enum-like taxonomy): `standard`,
   `reduced`, `zero_rated`, `exempt`, `reverse_charge`, `outside_scope`.
2. **Jurisdiction rate band** (new table, per-country): a stable
   identifier for one legal rate slot inside one country. Rate *value*
   is not part of its identity — it lives in `tax_rate_versions`.

Concretely (naming provisional, not authorised for creation):

```
public.tax_treatments (
  code text PRIMARY KEY,   -- 'standard','reduced','zero_rated','exempt',...
  label text NOT NULL,
  description text
)

public.tax_rate_bands (
  id uuid PRIMARY KEY,
  country_code text NOT NULL,           -- ISO-2 upper
  band_code text NOT NULL,              -- e.g. 'STANDARD','REDUCED_1','REDUCED_2','ZERO'
  treatment text NOT NULL REFERENCES tax_treatments(code) ON DELETE RESTRICT,
  display_name text NOT NULL,           -- 'BE reduced band 6%-slot' (documentation)
  status text NOT NULL,                 -- 'active' | 'retired'
  official_source_ref text NOT NULL,    -- authority URL / document id
  legal_reference text NOT NULL,        -- statute / directive article
  verified_at timestamptz NOT NULL,
  verified_by uuid REFERENCES auth.users(id),
  UNIQUE (country_code, band_code)
)
```

Band identity survives numeric changes. Belgium then holds three active
bands: `BE.STANDARD` (treatment=standard), `BE.REDUCED_1` (treatment=
reduced), `BE.REDUCED_2` (treatment=reduced), plus `BE.ZERO` and any
exempt slots that need to be modelled separately.

**Rates.** `tax_rate_versions` FK moves from `tax_category_id` →
`tax_rate_band_id`. Exclusion key becomes:

```
EXCLUDE USING gist (
  tax_rate_band_id WITH =,
  daterange(valid_from, valid_to, '[)') WITH &&
) WHERE status='approved'
```

Country is implicit in the band, so it need not appear in the exclusion
key (or can be kept as a redundant column with a `CHECK band's country`
verification via trigger, for query ergonomics — flagged as R-C-A).

**Classifications.** `catalog_product_tax_classifications.tax_category_id`
FK → `catalog_product_tax_classifications.tax_rate_band_id` FK to bands.
A product's approved classification names *exactly one band*, so
`product + country + date` resolves without ambiguity.

Exclusion key stays:
```
EXCLUDE USING gist (product_id =, country_code =,
                    daterange(valid_from, valid_to, '[)') &&)
WHERE status='approved'
```
plus an integrity check that the referenced band's `country_code` equals
the row's `country_code`.

**Pricing guard.** `msop_guard_tax_integrity` becomes:

- Classification's band = Rate version's band (strict equality, not
  category); and
- The band's country = price's destination country.

The current "category = category" test is replaced 1:1 by "band = band".
No functional relaxation.

**Effect on scenarios.**

- BE holds `BE.REDUCED_1@6%` and `BE.REDUCED_2@12%` as two *different*
  bands. Each band has one approved rate version. Exclusion satisfied.
- A BE product classified as `BE.REDUCED_1` unambiguously means 6%
  (whatever the current numeric value of that band is). The pricing
  guard finds the one approved rate version for that band and pins it.
- When BE changes the "12% band" numerically, `BE.REDUCED_2` gets a new
  `tax_rate_versions` row via version supersession. Product
  classifications remain valid unchanged.

**Pros.**

- Legally faithful: treatment and rate identity separate.
- Extends to any EU jurisdiction, incl. future super-reduced/parking.
- Zero backfill of real data (all operational rows are still 0 today).
- Preserves btree_gist real exclusion, no trigger substitute.
- Pricing guard change is a 1-for-1 substitution of the joining key.

**Cons.**

- Introduces one new table and one new FK direction on two existing
  tables. Requires a migration that swaps FKs and rebuilds exclusion
  constraints atomically.
- Small increase in surface area (band lifecycle: introduce/retire).

**Verdict.** Only option that leaves treatment identity stable while
allowing multiple concurrent reduced rate slots per country.
Recommended.

### Option B — Country-scoped `tax_categories`

**Model.** Add `country_code` to `tax_categories`, and create per-country
rows like `BE reduced band 1`, `BE reduced band 2`, `NL reduced`.

**Pros.**

- Fewer new tables.
- Conceptually close to what today's schema already stores.

**Cons.**

- Conflates *legal treatment* with *jurisdiction band*. A cross-country
  report of "what is treated as reduced" now requires string-parsing
  category names.
- Every country's rate slots must be enumerated inside a shared table;
  when a country's treatment set changes, migrations touch a mixed
  taxonomy table.
- Product classifications and rates both still resolve at
  `tax_category_id`, so the domain identity is fine, but the taxonomy
  loses its cross-jurisdiction meaning.
- Rate value must still not be part of category identity — has to be
  enforced by convention, not schema.

**Verdict.** Feasible but structurally weaker than A. Rejected.

### Option C — Keep global category, extend overlap key with rate

**Model.** Keep the four global categories; add `rate_basis_points` (or
a `rate_code`) to the exclusion key on `tax_rate_versions`, allowing
multiple approved rows per `(country, category)`.

**Pros.**

- No new table.
- Minimal migration.

**Cons — fatal.**

- `catalog_product_tax_classifications` still points at
  `tax_category_id`. A BE product classified as `reduced` still cannot
  distinguish 6% vs 12%. The tax integrity guard would silently pick
  whichever row it finds first.
- Ambiguity forces callers (Pricing, checkout, reporting) to guess.
  Silent incorrect tax charging is a compliance failure.
- The only fix is to also add a band identity to classifications, at
  which point Option C degenerates into Option A with worse naming.

**Verdict.** Rejected on ambiguity grounds.

---

## 4. Recommendation

**Adopt Option A.** Introduce `public.tax_treatments` (or reuse the
existing `tax_categories` rows as the treatment enum in place — see §5)
and `public.tax_rate_bands`. Retarget `tax_rate_versions` and
`catalog_product_tax_classifications` from `tax_category_id` to a new
`tax_rate_band_id`. Rebuild both exclusion constraints. Rewrite
`msop_guard_tax_integrity` to compare bands, not categories.

---

## 5. Proposed final schema (design only — not to be built in this step)

Two viable shapes for §4. The Owner-facing choice is naming, not
structure:

**5.a** Keep `tax_categories` renamed conceptually to "treatments"
(preserving its 4 seeded rows: `standard`, `reduced`, `zero`, `exempt`)
and add `tax_rate_bands` referencing it. This avoids renaming an
existing table and lets the four seeded codes double as the closed
treatment vocabulary. Add `reverse_charge` and `outside_scope` rows in
the same migration if needed for the Alpha jurisdictions.

**5.b** Introduce a brand-new `tax_treatments` table and mark
`tax_categories` deprecated. Higher naming clarity, at the cost of
carrying a soon-to-be-empty table.

Either way, the operational structure below is identical.

```
tax_treatments / tax_categories (existing)
  code PK: standard | reduced | zero | exempt | reverse_charge | outside_scope
  label, description
  -- global, jurisdiction-agnostic

tax_rate_bands (NEW)
  id uuid PK
  country_code text  CHECK ~ '^[A-Z]{2}$'
  band_code    text  CHECK ~ '^[A-Z][A-Z0-9_]{0,31}$'
  treatment_code text FK → tax_treatments/tax_categories(code) ON DELETE RESTRICT
  display_name text NOT NULL
  status text NOT NULL CHECK IN ('active','retired')
  official_source_ref text NOT NULL
  legal_reference     text NOT NULL
  verified_at timestamptz NOT NULL
  verified_by uuid REFERENCES auth.users(id)
  UNIQUE (country_code, band_code)

tax_rate_versions (existing, altered)
  * drop tax_category_id FK
  * add  tax_rate_band_id uuid NOT NULL FK → tax_rate_bands(id) ON DELETE RESTRICT
  * drop old exclusion (country + category + range)
  * add  EXCLUDE (tax_rate_band_id =, daterange(valid_from, valid_to,'[)') &&)
         WHERE status='approved'
  * keep rate_basis_points/status/lifecycle/approval CHECKs unchanged
  * drop country_code column OR keep as a denormalised copy with a
    BEFORE INSERT/UPDATE trigger asserting equality with the band's
    country. Denormalised copy simplifies queries. Design leans keep.

catalog_product_tax_classifications (existing, altered)
  * drop tax_category_id FK
  * add  tax_rate_band_id uuid NOT NULL FK → tax_rate_bands(id) ON DELETE RESTRICT
  * add  trigger enforcing band.country_code = row.country_code
  * keep exclusion (product_id + country_code + daterange) WHERE approved
```

Guard rewrite (pseudocode delta only):

```
-- msop_guard_tax_integrity, step 5, replace:
--   IF v_cls_category <> v_trv_category THEN raise 'category mismatch'
-- with:
--   IF v_cls_band <> v_trv_band THEN raise 'rate band mismatch'
-- Preserve steps 1..4 unchanged. Country check remains driven by
-- rate_version.country (or via band lookup if country column is dropped).
```

---

## 6. Product classification contract

For any `(product, destination_country, effective_date)` the resolved
tax path must land on **exactly one `tax_rate_band_id`**. That band's
country must equal the classification row's country. The approved
`tax_rate_versions` row for that band at that date supplies the numeric
rate. The `tax_treatment` is a *property of the band*, not an
independent input. Ambiguity such as "reduced (which one?)" is no
longer representable.

---

## 7. Effective dating

- Exclusion on `tax_rate_versions`:
  `(band_id, daterange) WHERE approved` — one approved rate per band per
  moment. Multiple bands active in the same country same day → allowed
  (this is the whole point).
- Exclusion on `catalog_product_tax_classifications`:
  `(product_id, country_code, daterange) WHERE approved` — one approved
  classification per product per country per moment. Unchanged.
- Cross-country classifications: allowed and non-conflicting.
- Historical rate change on a band: new `tax_rate_versions` row
  supersedes the previous one for the same band. Classifications
  unaffected.
- Draft/proposed rows do not participate in exclusions (unchanged).

---

## 8. Migration strategy (design only — not to be executed)

Row counts in scope today:

| Table | Rows |
|---|---|
| `tax_categories` | 4 (seed) |
| `tax_rate_versions` | 0 |
| `catalog_product_tax_classifications` | 0 |
| `company_tax_profiles` | 0 |
| `merchant_store_offer_prices` | 0 |

Zero operational rows on the two FK-carrying tables means we can swap
FKs atomically without a backfill matrix. The Owner-facing migration
(M1B-2D, **not** in scope here) would run inside a single transaction:

1. Ensure `tax_categories` seed contains all six treatment codes
   (add `reverse_charge`, `outside_scope` if not present). Additive only.
2. `CREATE TABLE public.tax_rate_bands (...)` with GRANTs and RLS
   parallel to the tax foundation posture (admin-read only, no
   authenticated/anon).
3. `ALTER TABLE public.tax_rate_versions`:
   - `DROP CONSTRAINT` for the old exclusion.
   - `ADD COLUMN tax_rate_band_id uuid NOT NULL` (safe: 0 rows).
   - `ADD FOREIGN KEY ... REFERENCES tax_rate_bands(id) ON DELETE RESTRICT`.
   - `DROP COLUMN tax_category_id` (safe: 0 rows; forward-only).
   - `ADD CONSTRAINT ... EXCLUDE USING gist (tax_rate_band_id =,
      daterange(valid_from, valid_to,'[)') &&) WHERE status='approved'`.
4. Same on `catalog_product_tax_classifications` (0 rows).
5. `CREATE OR REPLACE FUNCTION public.msop_guard_tax_integrity()` with
   the band-based check. No trigger recreate needed if signature stays
   the same.
6. RLS/GRANTs on `tax_rate_bands` set to admin-read via
   `has_role('admin')`, deny everyone else.
7. All work in one transaction; on failure, whole migration rolls back.
   btree_gist stays installed; no drop.

**Atomicity.** Because the operational tables are empty, either the
whole transaction commits and the model is consistent, or it rolls
back and the current model is unchanged. There is no intermediate
"partial band model" state visible to any session.

**Rollback / forward-fix.** No down-migration is authored (project
policy: forward-fix only). If M1B-2D ever needs to be reverted, a
follow-up migration would reintroduce a `tax_category_id` column and
drop bands — but only if band rows and rate versions were still empty.
Once tax data is loaded (M1B-3C onwards), the correction is one-way.

---

## 9. Impact on downstream stages

Recommended corrected sequence:

1. **M1B-2C** — this precheck. **(this document)**
2. **M1B-2D** — Rate-band schema correction migration (schema only, 0
   rows loaded, guard rewritten, exclusions rebuilt).
3. **M1B-3C** — Official tax data loading & governance (§10).
4. **M1B-3D** — Seller draft-price workflow.
5. **M1B-3E** — Price activation (only after **R-5** is closed).
6. **M1B-4** — Shipping foundation.
7. **M1B-5** — Publication activation.
8. **M1B-6** — Public Storefront read model.
9. **M1B-7** — Checkout re-enable path.

M1B-3B (`merchant_store_offer_prices`) is preserved as-is; only the
pricing guard body needs a 1-for-1 substitution when M1B-2D lands.

---

## 10. Official-source governance contract (for M1B-3C, design only)

Every `tax_rate_bands` row and every approved `tax_rate_versions` row
must carry, at minimum:

- `jurisdiction` — ISO-2 country code.
- `band_code` — stable, internal, ALL-CAPS identifier.
- `treatment` — one of the enumerated treatments.
- `official_source_ref` — URL or document id of the primary authority:
  - **NL**: Belastingdienst (`belastingdienst.nl`) statutes / VAT guide.
  - **BE**: SPF Finances / FOD Financiën (`finance.belgium.be`).
  - **DE**, **FR**, etc. — respective national tax authority.
  - Secondary corroboration: European Commission TEDB
    (`ec.europa.eu/taxation_customs/tedb`). Never the primary source.
- `legal_reference` — statute article or Royal Decree number.
- `verified_at` — timestamp of last human verification.
- `verified_by` — reviewer's user id (must be a platform admin).
- `effective_from` / `effective_to` — on the rate version, not the
  band, since bands outlive rate changes.

**Forbidden sources.** VAT calculator sites, blogs, accounting-software
docs, wiki articles, cached third-party PDFs without a legal citation,
LLM output. Any load ceremony that cannot produce a primary
authority URL fails closed.

**Load ceremony (M1B-3C, not now).** Two-human review: proposer (any
admin) records the band and rate version as `draft`/`proposed`; a
distinct admin reviewer transitions to `approved` and stamps
`approved_by/at`. The same two-actor requirement applies to
supersession.

---

## 11. Test plan (for M1B-2D, design only)

Inside a rolled-back SECURITY DEFINER runner, on scratch fixtures:

1. Country with a single reduced band accepts one approved reduced rate.
2. Country with two reduced bands accepts one approved rate per band.
3. Two approved rate versions on the same band with overlapping
   date ranges rejected by exclusion (`23P01`).
4. Two approved rate versions on the same band with adjacent
   non-overlapping ranges accepted.
5. Two approved rate versions on different bands on the same date
   accepted (regression scenario for BE 6% + 12%).
6. Approved rate version whose band's country ≠ the row's declared
   country rejected by trigger.
7. Product classification pointing to a band from another country
   rejected by trigger.
8. Product classification exclusion still prevents two overlapping
   approved rows for `(product, country)`.
9. Pricing guard: active price where classification.band =
   rate.band accepted.
10. Pricing guard: active price where classification.band ≠
    rate.band rejected (`check_violation`).
11. Pricing guard: active price where rate.band.country ≠
    price.destination rejected.
12. Pricing guard: unchanged behaviour on draft price (no tax check).
13. Retiring a band (`status='retired'`) does not orphan existing
    approved rate versions but rejects new ones referencing it (design
    choice — flagged for Owner confirmation in M1B-2D authorisation).
14. Ambiguity test: a legacy `reduced` classification pattern is no
    longer representable — the migration must have converted the
    schema so `tax_category_id` no longer exists on classifications.
15. Post-migration row counts on `tax_rate_versions` and
    `catalog_product_tax_classifications` remain 0.
16. Post-migration `merchant_store_offer_prices` row count remains 0.
17. RLS on `tax_rate_bands`: admin read allowed, authenticated/anon
    denied.
18. GRANTs on `tax_rate_bands`: no PUBLIC/anon/authenticated grants.
19. `msop_guard_tax_integrity` still SECURITY DEFINER with
    `search_path=''` and no dynamic SQL.
20. Rollback of the M1B-2D transaction on injected failure leaves
    every existing table structurally unchanged.

No real VAT rate is loaded during M1B-2D. All test fixtures are scratch
values inside a rolled-back subtransaction.

---

## 12. Impact on other subsystems

- **Bol Live**: untouched (rows with `live_authorized_at` remain 0).
- **Inventory / reservations / ledgers**: untouched.
- **Orders / place_order**: untouched (P5-HF-001 intact).
- **`products` / `catalog_*`**: only
  `catalog_product_tax_classifications` changes column shape; all
  operational rows remain 0.
- **Publication (`borvat_direct_listing_publications`)**: untouched;
  still fail-closed.
- **Storefront**: untouched; no route added.
- **Stripe**: untouched.

---

## 13. Residual risks (recorded now, actioned in M1B-2D)

- **R-TB1** — Existing `tax_categories` seed rows will be reused as the
  treatment vocabulary; if renamed to `tax_treatments`, migrations that
  join `tax_categories` by name must be audited (today: none in the
  operational path).
- **R-TB2** — `tax_rate_bands.status = 'retired'` semantics need Owner
  confirmation on M1B-2D (soft retire vs hard block on new rate
  versions).
- **R-TB3** — Denormalised `country_code` on `tax_rate_versions` can
  drift from the band's country if the band's country is ever mutated;
  band `country_code` should be immutable via trigger (design note for
  M1B-2D).
- **R-TB4** — Two-actor approval for bands and rate versions is not
  yet a schema constraint; it belongs to the load ceremony (M1B-3C).
- **R-TB5** — `outside_scope` and `reverse_charge` treatments have no
  numeric rate; rate versions for these bands need a nullable rate or
  a distinct branch in the pricing guard (flag for M1B-2D design
  detail — this precheck does not commit either shape).
- **R-5, R-D7, R-D8, R-P1..R-P4, R-T1..R-T6, R-PR1..R-PR7** — unchanged
  and unblocked by this correction.

---

## 14. Confirmation of non-execution

- No migration was submitted for approval during this step.
- No row was inserted, updated, or deleted in any tax or pricing table.
- No RPC, trigger, index, or grant was modified.
- No storefront route, checkout path, Bol Live flag, or Stripe path was
  touched.
- The temporary `_msop_verify_m1b3b` verification function is not
  reintroduced.

Row counts verified post-precheck: `tax_rate_versions`,
`catalog_product_tax_classifications`, `company_tax_profiles`, and
`merchant_store_offer_prices` remain at 0.

---

## 15. Proposed Decision Log entry

**BOR-DEC-050 — TAX TREATMENT SEPARATED FROM JURISDICTION RATE BANDS**

- Type: Architecture (proposal).
- Ruling (proposed): Adopt Option A. Split the current
  `tax_categories` role into (a) a stable global *treatment*
  vocabulary and (b) a new `public.tax_rate_bands` table keyed by
  `(country_code, band_code)` carrying the treatment and an official
  source contract. Retarget `tax_rate_versions` and
  `catalog_product_tax_classifications` from `tax_category_id` to
  `tax_rate_band_id`. Rebuild both exclusion constraints on
  band-scoped keys and rewrite `msop_guard_tax_integrity` to compare
  bands. Multi-reduced-band jurisdictions (BE 6% & 12%) become
  representable; per-product classification becomes unambiguous.
- Scope: schema correction only. No numeric VAT data is loaded.
- Blocking prerequisites: none.
- Follow-up: authorise M1B-2D to execute the correction.
- Supersedes: nothing.
- Impacts: BOR-DEC-046 (tax foundation) is extended, not superseded —
  the exclusion mechanism moves from `(country, category)` to
  `(band)`.

---

## 16. Verdict

**TAX RATE-BAND ARCHITECTURE CONFLICT — SAFE RATE-BAND CORRECTION
DESIGN IDENTIFIED.**

Precheck complete. Awaiting Owner authorisation for **M1B-2D —
Jurisdiction Tax Rate Band Schema Correction** before any further
work on tax data loading, seller pricing workflow, publication,
storefront, checkout re-enable, Bol Live, or Stripe Live.
