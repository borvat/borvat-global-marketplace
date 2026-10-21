# PHASE 5 — M1B-3C-1 — NL/BE JURISDICTION RATE-BAND DRAFT SEED REPORT

**Date:** 2026-07-26
**Authorization:** `M1B-3C-1 — NL/BE JURISDICTION RATE-BAND DRAFT SEED`
**Verdict:** **M1B-3C-1 PASS WITH RESIDUAL RISKS**

Scope executed: rate-band taxonomy rows only. **Zero** tax rate versions, **zero**
percentages, **zero** effective dates, **zero** classifications, **zero** company tax
profiles, **zero** prices.

---

## 1. Migrations

| # | File | SHA-256 | Purpose |
|---|---|---|---|
| 1 | `supabase/migrations/20260726111836_8cd62f3d-4588-4648-af5e-aae463bb50e8.sql` | `70dc998604ccaf06460bd0480ee3fafe5f847ec3a5f3abfa73c3332422c4a55b` | Seed 9 draft bands (NL 4, BE 5) + in-transaction assertions. |
| 2 | `supabase/migrations/20260726111931_6b0e6af9-0aea-46e8-806c-0f193c748358.sql` | `c9821795e7c76714094e73ddae2296a09f8f2ce6bef3c402f35815bc16448c0f` | Remediation: delete the `FR` probe row created during negative testing and **revoke all DML from `sandbox_exec`** on the tax/pricing/publication tables. |

Both migrations are single transactions with fail-closed assertions
(`bands = 9`, `tax_rate_versions = 0`).

---

## 2. Official source inventory (bands only)

| Jurisdiction | Structure evidenced | Primary source | Retrieval status |
|---|---|---|---|
| NL | standard band; **one** reduced band; zero-rated treatment; exempt treatment | Belastingdienst — *btw-tarieven* (`belastingdienst.nl`) | Retrieved (government, primary) |
| NL | reduced-band scope confirmed unchanged for goods in 2026 (service-only changes) | Rijksoverheid / wet 36.814 summary | Retrieved (government) |
| BE | standard band; **two distinct reduced annexes** (Table A, Table B); zero-rated cases; art. 44 exemptions | FOD Financiën — *btw-tarieven* (`financien.belgium.be`) | Retrieved (government, primary) |
| BE | consolidated KB nr. 20 legal text (annex-level goods classification) | `ejustice.just.fgov.be` | **NOT retrieved** → R-T11 |

Sources are documented here and in the Decision Log; `tax_rate_bands` carries no
source column by design (BOR-DEC-051 governance is documentary).

**No source was used to derive a rate or a commencement date in this round.**

---

## 3. Seeded bands and treatment mapping

Live verification (`tax_rate_bands` joined to `tax_categories`):

| Country | Band code | Treatment (category `code`) | Status |
|---|---|---|---|
| NL | `STANDARD` | `standard` | `draft` |
| NL | `REDUCED_A` | `reduced` | `draft` |
| NL | `ZERO` | `zero` (semantic: `zero_rated`) | `draft` |
| NL | `EXEMPT` | `exempt` | `draft` |
| BE | `STANDARD` | `standard` | `draft` |
| BE | `REDUCED_A` | `reduced` | `draft` |
| BE | `REDUCED_B` | `reduced` | `draft` |
| BE | `ZERO` | `zero` (semantic: `zero_rated`) | `draft` |
| BE | `EXEMPT` | `exempt` | `draft` |

Display names follow the authorized wording (e.g. `Belgium reduced band — Table A`,
`Belgium reduced band — Table B`). Descriptions state band identity only and
explicitly record "No rate or effective date established"; **no description claims
any product belongs to a band.**

Terminology rule (per BOR-DEC-050 / M1B-2D §3.1) preserved: stored **category code
`zero`**, legal **treatment `zero_rated`** — never interchanged. `zero` ≠ `exempt`
(two distinct `tax_categories` rows, two distinct bands per country).

---

## 4. Test results

| # | Test | Result |
|---|---|---|
| 1 | Exactly 9 bands created | **PASS** (9) |
| 2 | Every band mapped to correct treatment (asserted in-migration) | **PASS** |
| 3 | BE has `REDUCED_A` **and** `REDUCED_B` | **PASS** (2) |
| 4 | NL has exactly one reduced band | **PASS** (1) |
| 5 | No band code contains a digit (`band_code ~ '[0-9]'` = 0) | **PASS** |
| 6 | Duplicate `(country_code, band_code)` rejected | **PASS** — `23505` on `tax_rate_bands_country_band_unique` |
| 7 | All bands `status='draft'` | **PASS** (9/9) |
| 8 | No band `active` / `retired` | **PASS** (0) |
| 9 | `tax_rate_versions = 0` | **PASS** |
| 10 | `catalog_product_tax_classifications = 0` | **PASS** |
| 11 | `company_tax_profiles = 0` | **PASS** |
| 12 | `merchant_store_offer_prices = 0` | **PASS** |
| 13 | `ZERO` → `zero` treatment | **PASS** |
| 14 | `EXEMPT` → `exempt` treatment | **PASS** |
| 15 | zero-rated ≠ exempt (distinct categories and bands) | **PASS** |
| 16 | RLS + FORCE RLS still on (`relrowsecurity=t`, `relforcerowsecurity=t`) | **PASS** |
| 17 | Policies on `tax_rate_bands` | **PASS** (0 — fail-closed) |
| 18 | `anon` privileges on `tax_rate_bands` | **PASS** (none in ACL) |
| 19 | `authenticated` DML | **PASS** (not in ACL at all) |
| 20 | `service_role` DML | **PASS** (not in ACL) |
| 21 | `sandbox_exec` DML | **PASS after remediation** — see §5 |
| 22 | Publication fail-closed (`publication_status <> 'not_ready'` = 0) | **PASS** |
| 23 | P5-HF-001: `place_order` EXECUTE for `anon`/`authenticated` | **PASS** (`f` / `f`) |
| 24 | Bol Live (`channel_connections.live_authorized_at IS NOT NULL`) | **PASS** (0) |
| 25 | Stripe Live | **PASS** (disabled, untouched) |
| 26 | No fabricated effective date anywhere (0 rate rows, no date column written) | **PASS** |

Final ACL on `tax_rate_bands`: `postgres=arwdDxtm/postgres, sandbox_exec=r/postgres`.

---

## 5. Defect found and remediated during testing (disclosure)

Negative test 21 revealed a **pre-existing grant defect from M1B-2D**: role
`sandbox_exec` held `INSERT` (`ar`) on `tax_rate_bands`, and — because that role is
not subject to the table's forced RLS in this environment — an insert **succeeded**,
creating one unauthorized row (`FR / STANDARD`, a deliberate probe).

Remediation in migration #2, same turn:

1. `DELETE FROM public.tax_rate_bands WHERE country_code = 'FR'` → table back to the 9 authorized rows.
2. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES FROM sandbox_exec` on
   `tax_rate_bands`, `tax_rate_versions`, `catalog_product_tax_classifications`,
   `company_tax_profiles`, `tax_categories`, `merchant_store_offer_prices`,
   `borvat_direct_listing_publications`.
3. Re-test: the identical insert now fails with `permission denied for table tax_rate_bands`.

Net effect: the tax/pricing/publication surface is now read-only for
`sandbox_exec`. No other role gained or lost privileges. No new grants were added
anywhere.

---

## 6. Row counts (post-execution, verified live)

```
tax_categories                       = 4
tax_rate_bands                       = 9   (all draft)
tax_rate_versions                    = 0
catalog_product_tax_classifications  = 0
company_tax_profiles                 = 0
merchant_store_offer_prices          = 0
borvat_direct_listing_publications   = 0   (and 0 rows != not_ready)
```

No product classification and no price eligibility follows from the existence of a
band — a band is an identity only.

---

## 7. Zero rate-version confirmation

`tax_rate_versions` remains empty. No `rate_basis_points`, no `valid_from`, no
`valid_to` value was written in this milestone. No percentage (21 / 12 / 9 / 6 / 0)
exists as a row anywhere in the tax schema. No verification date, migration date,
current date, approximate date, or secondary-source date was used as a legal
effective date — none was written at all.

---

## 8. Risk status

| ID | Status after M1B-3C-1 |
|---|---|
| **R-T11** — primary Belgian consolidated legal text (KB nr. 20) not retrieved | **OPEN** — does not block band taxonomy; blocks annex-level goods classification. |
| **R-T12** — full legal goods classification per annex unavailable | **DOWNGRADED to Residual Risk** — government sources prove Table A and Table B exist; per-good classification still unproven. |
| **R-T13** — authoritative rate commencement dates not verified | **BLOCKER** for `tax_rate_versions`. Reason M1B-3C-2 exists. |
| **R-T15** — no reviewer/approver capability (depends on R-D7) | **BLOCKER** for rate activation, classification approval, and any tax approval workflow. Draft bands require no approval RPC. |
| **R-T7** | Open — no official rate data loaded. |
| **R-T8** | Open — band lifecycle (retire/supersede) has schema support, no workflow. |
| **R-T14 (new)** | `sandbox_exec` DML on tax/pricing/publication tables — **CLOSED in this turn** (§5). |
| R-5, R-D7, R-D8, R-P1..R-P4 | Unchanged. |

---

## 9. Zero-delta / object-delta evidence

- Object delta is limited to **9 seed rows + 2 migration files + this document**,
  plus the corrective `REVOKE` statements of §5.
- No table, column, constraint, index, trigger, function, type, policy, or extension
  was created, altered, or dropped.
- `msop_guard_tax_integrity` — untouched.
- Exclusion constraints (`tax_rate_versions_no_active_overlap`, `cptc_no_active_overlap`,
  active-price exclusion) — untouched.
- Publication statuses — untouched, fail-closed.
- Bol `channel_*` data, inventory, orders — untouched.
- P5-HF-001 ACL — intact.
- No UI, no route, no server function, no storefront surface was created.
- Linter total unchanged at 44 (pre-existing SECURITY DEFINER surface + 2 RLS-no-policy
  INFO entries for the deliberately policy-free tax tables).

---

## 10. Decisions to record

- **BOR-DEC-051 — OFFICIAL TAX DATA USES SOURCE-VERIFIED DRAFT-THEN-APPROVE GOVERNANCE**
- **BOR-DEC-052 — NL/BE RATE-BAND TAXONOMY SEEDED WITHOUT RATE VERSIONS**

---

## Final verdict

**M1B-3C-1 PASS WITH RESIDUAL RISKS.**

Halted. Next authorizable milestone: **M1B-3C-2 — AUTHORITATIVE EFFECTIVE-DATE
RETRIEVAL AND RATE-VERSION DATASET**. Seller pricing, shipping, publication,
storefront, and checkout remain blocked.
