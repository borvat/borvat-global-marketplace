# PHASE 5 — M1B-3C — OFFICIAL NL/BE TAX DATA LOADING GOVERNANCE PRECHECK

**Stage type:** Research / analysis / dataset preparation only
**Executed:** 2026-07-26
**Authorisation:** Owner message — "M1B-3C — OFFICIAL NL/BE TAX DATA LOADING GOVERNANCE PRECHECK"
**Change executed:** **NONE.** No migration, no INSERT, no RPC, no UI, no publication
transition. Database state is byte-identical to the post-M1B-2D baseline.

---

## 0. Confirmation of non-execution

| Forbidden action | Performed? |
|---|---|
| Migration | **No** |
| INSERT into `tax_rate_bands` | **No** (0 rows) |
| INSERT into `tax_rate_versions` | **No** (0 rows) |
| INSERT into `catalog_product_tax_classifications` | **No** (0 rows) |
| INSERT into `company_tax_profiles` | **No** (0 rows) |
| INSERT into `merchant_store_offer_prices` | **No** (0 rows) |
| Approval RPC | **No** |
| Seller / Admin tax UI | **No** |
| Shipping tables | **No** |
| Publication transition | **No** — publications remain fail-closed |
| Public storefront / checkout | **No** — `place_order` remains revoked (P5-HF-001 intact) |

Only two documentation files were touched in this round: the M1B-2D report
(R-T9 terminology correction) and the decision log. Plus this precheck.

---

## 1. Terminology baseline (post R-T9)

| Layer | Value space | Meaning |
|---|---|---|
| `tax_categories.code` | `standard`, `reduced`, `zero`, `exempt` | **Global treatment taxonomy** — stored identifiers |
| Treatment semantic | standard-rated, reduced-rated, **zero_rated**, exempt | Legal/accounting meaning |
| `tax_rate_bands.band_code` | `STANDARD`, `REDUCED_A`, … | **Jurisdiction-specific legal band identity** |

Category code `zero` ≠ the string `zero_rated`. Throughout this dataset the
stored code is `zero`; the words "zero-rated" describe the treatment.

Band code format constraint (live): `^[A-Z][A-Z0-9_]{1,47}$`, unique per
`(country_code, band_code)` — therefore no country prefix is required inside
the code.

---

## 2. Source hierarchy applied

1. **National tax authority (primary):** Belastingdienst (NL);
   FPS Finance / FOD Financiën — financien.belgium.be / fin.belgium.be (BE).
2. **National legislation / official gazette (primary):** wetten.overheid.nl,
   Staatsblad, Eerste/Tweede Kamer official publications (NL);
   ejustice.just.fgov.be (Justel — BTW-Wetboek, KB nr. 20) and Belgisch
   Staatsblad (BE).
3. **European Commission / TEDB (secondary verification only).**

Excluded by policy and not used: VAT calculators, blogs, accountancy firms,
Wikipedia, e-commerce sites, unopened search snippets, unverified memory.

### 2.1 Source-access outcome

| Source | Loaded? | Consequence |
|---|---|---|
| Belastingdienst tariff/goods/exemption pages | **Yes (primary)** | NL bands + goods categories + shipping rule confirmed |
| Eerste Kamer wetsvoorstel 36.814 + kst-36814-3 | **Yes (official record)** | 2026 change status confirmed (services only) |
| wetten.overheid.nl — Wet OB 1968 Tabel I / II verbatim | **No** | NL claims rest on the authority's restatement; statute text re-verification outstanding |
| financien.belgium.be / fin.belgium.be | **Yes (primary)** | BE 21/12/6/0 structure, R00–R03 grids, ancillary-cost rule confirmed |
| ejustice.just.fgov.be — KB nr. 20 and BTW-Wetboek art. 44 | **No — `ERR_EMPTY_RESPONSE`** | KB nr. 20 table contents taken from a dated (2020) FPS/Fisconetplus coordination text mirror = **secondary**; Tabel C enumeration not verbatim-confirmed |
| EC / TEDB | Framework only | Cross-check, never a load source |

**This access gap is the reason for the final verdict in §14.**

---

## 3. Netherlands — current rate-band structure

Belastingdienst states plainly: *"In Nederland zijn er 3 btw-tarieven:
0%-tarief, 9%-tarief, 21%-tarief"* — **one** reduced band for goods, not
several.

| Proposed band | Treatment (`tax_categories.code`) | Rate | Basis points | Authority wording |
|---|---|---|---|---|
| `STANDARD` | `standard` | 21% | 2100 | "Het algemene btw-tarief van 21% geldt voor alle producten en diensten die niet zijn vrijgesteld, en die niet onder het 9%-tarief of het 0%-tarief vallen." (residual/catch-all) |
| `REDUCED_A` | `reduced` | 9% | 900 | "9% is het verlaagde btw-tarief." (Tabel I) |
| `ZERO` | `zero` | 0% | 0 | "U hanteert het 0%-tarief als u bijvoorbeeld goederen levert vanuit Nederland naar het buitenland…" (Tabel II) |
| `EXEMPT` | `exempt` | n/a | — | "…vrijgesteld van btw. Btw die u … betaalt, kunt u niet aftrekken als voorbelasting." |

Deliberately **not** modelled as a band: the optional 13% *forfaitaire
sportkantine* flat scheme — an opt-in special scheme, not a consumer-goods
tariff band.

`REDUCED_A` (not `REDUCED`) is used even though NL currently has one reduced
band, so that a future second Dutch reduced band needs no rename.

### 3.1 NL goods per band (authority language)

- **9%:** voedingsmiddelen; water; sierteeltproducten; geneesmiddelen en
  hulpmiddelen; kunst, verzamelvoorwerpen en antiek; boeken en periodieken.
- **0%:** exports from NL; goods not yet imported; goods in a VAT warehouse;
  supply/provisioning of ships and aircraft; visvangst; excise goods in an
  excise warehouse; **zonnepanelen** (NL-specific).
- **21%:** defined **only by exclusion** — the authority publishes no
  enumerated list.
- **Exempt:** predominantly sectoral/service exemptions (healthcare,
  education, financial services, insurance, investment gold, immovable
  property, postal services…).

**Explicit warning for Borvat's own assortment:** ordinary household and
electrical goods are **not named** by Belastingdienst as standard-rated; they
land at 21% only *inferentially* (absent from every 9%, 0% and exempt list).
That inference is acceptable for a **draft** classification but must be
reviewer-confirmed per product — it is not a documented general rule.

### 3.2 NL effective dates

| Rate | Effective from | Status | Note |
|---|---|---|---|
| 21% standard | **Not confirmed** from a retrieved official page | In force | The commonly cited 1 Oct 2012 date was **not** verified; **do not load a historical `valid_from` on this basis** |
| 9% reduced (goods) | In force at verification date | Enacted | No goods-side change announced |
| 0% | In force at verification date | Enacted | — |
| 9% → 21% for **logies** (accommodation) | **2026-01-01** | Enacted (Belastingplan 2025, not repealed) | **Service**, not goods — outside this dataset |
| 9% retained for cultuur/media/sport | **2026-01-01** | Enacted — *Wet behoud verlaagd btw-tarief…* (36.814), Eerste Kamer 28 Oct 2025 | **Services/admissions** — outside this dataset |

**Conclusion:** the 2026 NL changes do **not** move any goods band. Books as
physical goods remain 9%.

---

## 4. Belgium — current rate-band structure

FPS Finance: *"In België zijn er drie verschillende btw-tarieven…
standaardtarief: 21 % (R03) — tussentarief: 12 % (R02) — verlaagd tarief: 6 %
(R01). Voor sommige goederen en diensten geldt uitzonderlijk het nultarief
(R00)."*

| Proposed band | Treatment | Rate | Basis points | Legal instrument |
|---|---|---|---|---|
| `STANDARD` | `standard` | 21% | 2100 | KB nr. 20 art. 1, 1st para. (art. 37 W.BTW) — grid R03 |
| `REDUCED_A` | `reduced` | 6% | 600 | KB nr. 20 art. 1, 2nd para. a) — **Tabel A** — grid R01 |
| `REDUCED_B` | `reduced` | 12% | 1200 | KB nr. 20 art. 1, 2nd para. b) — **Tabel B** — grid R02 |
| `ZERO` | `zero` | 0% | 0 | KB nr. 20 art. 1, 2nd para. c) — **Tabel C** — grid R00 |
| `EXEMPT` | `exempt` | n/a | — | **Wetboek BTW art. 44** — *not* a KB nr. 20 table |

**This confirms the conflict that triggered M1B-2C/2D:** Belgium's 6% and 12%
are two *separate statutory annexes*, i.e. two independent legal bands sharing
the treatment `reduced`. The band model represents both concurrently;
the pre-correction model could not.

Band ordering rationale: `REDUCED_A` = the lowest reduced rate (Tabel A/6%),
`REDUCED_B` = Tabel B/12%. The codes carry **no percentage**, so a future rate
change does not invalidate the identity.

### 4.1 BE goods per band (from the KB nr. 20 coordination text — secondary)

- **Tabel A (6%):** melk en zuivelproducten; groenten, planten, wortels en
  knollen voor voedingsdoeleinden; fruit; koffie, thee, suiker, cacao,
  bakkerijproducten and "produkten voor menselijke consumptie niet hierboven
  genoemd" — **excluding** beers > 0.5% abv and other drinks > 1.2% abv.
- **Tabel B (12%):** margarine; tyres/inner tubes for agricultural machinery
  (conditional declaration); **steenkool en van steenkool vervaardigde vaste
  brandstoffen, bruinkool, cokes**; huisvesting in het kader van het sociaal
  beleid; (catering — a service).
- **Tabel C (0%):** FPS Finance's published example is *periodieke
  publicaties* (press). **The full Tabel C enumeration was not verbatim
  verified** — see §2.1.
- **21%:** residual.

### 4.2 BE effective dates

| Item | Effective from | Status |
|---|---|---|
| 21% / 12% / 6% under KB nr. 20 | Long-standing; **no dated instrument retrieved this session** | In force — `valid_from` must not be invented |
| 0% written into KB nr. 20 art. 1 c) as an express tariff | **2019-04-01** (Wet 13.04.2019, B.S. 26.04.2019 p. 40552) | Enacted — **cited via secondary source; B.S. text not opened** |
| Demolition/reconstruction 6% permanent regime | **2025-07-01** | Enacted — confirmed on fin.belgium.be (immovable works, outside Borvat's goods scope) |
| Private-builder ≤200 m² condition | **2024-01-01** | Enacted (fin.belgium.be) |
| COVID 6% masks/gel (art. 1ter) | 2020-05-04 → 2020-12-31 | **Expired** — historical only |
| Household electricity 6% (art. 1bis) | 2014-04-01 → 2015-08-31 | **Expired** — historical only |
| "Coal / heating 2026 change" | — | **UNVERIFIED — no official source found. No date asserted.** Coal currently sits in Tabel B (12%). |

---

## 5. Effective-date policy for loading

Rule adopted: **a rate with no documented effective date does not enter the
approved dataset.**

For NL 21%/9%/0% and BE 21%/12%/6% no retrievable official page states the
original entry-into-force date. Two lawful options — **Option V is
recommended**:

- **Option V — verification-date anchoring (RECOMMENDED).** Load
  `valid_from = 2026-07-26` (the date the authority page was read and shown to
  state the rate as currently in force), `valid_to = NULL`, and record
  `verified_at` + `verification_source`. This is *provably* true: it asserts
  only "in force on the verification date onward". It does **not** claim
  historical coverage, so no back-dated order can be repriced by it — which is
  correct, because Borvat has zero historical B2C orders in these bands.
- **Option L — legal-research escalation.** Commission a statutory search of
  Staatsblad / Belgisch Staatsblad for the original commencement dates before
  loading. Required only if Borvat later needs historically accurate
  retrospective VAT computation.

Fabricating a `valid_from` is prohibited under all circumstances.

---

## 6. Proposed dataset (NOT applied)

No final UUIDs. Temporary references only.

### 6.1 `tax_rate_bands` (proposed — 10 rows)

| ref | country_code | band_code | tax_category_code | display_name | description | status |
|---|---|---|---|---|---|---|
| `nl-std` | NL | `STANDARD` | `standard` | Netherlands standard rate | Residual band: everything not exempt, not 9%, not 0% | `draft` |
| `nl-red-a` | NL | `REDUCED_A` | `reduced` | Netherlands reduced rate (Tabel I) | Foodstuffs, water, medicines, books & periodicals, art, ornamental horticulture | `draft` |
| `nl-zero` | NL | `ZERO` | `zero` | Netherlands zero rate (Tabel II) | Zero-rated taxable supplies: exports, VAT warehouse, ships/aircraft, solar panels | `draft` |
| `nl-exempt` | NL | `EXEMPT` | `exempt` | Netherlands exemption | Art. 11 Wet OB exemptions — no output VAT, **no input VAT deduction** | `draft` |
| `be-std` | BE | `STANDARD` | `standard` | Belgium standard rate | KB nr. 20 art. 1 §1 — residual (grid R03) | `draft` |
| `be-red-a` | BE | `REDUCED_A` | `reduced` | Belgium reduced rate — Tabel A | KB nr. 20 Annex Tabel A (grid R01) | `draft` |
| `be-red-b` | BE | `REDUCED_B` | `reduced` | Belgium intermediate rate — Tabel B | KB nr. 20 Annex Tabel B (grid R02) | `draft` |
| `be-zero` | BE | `ZERO` | `zero` | Belgium zero rate — Tabel C | KB nr. 20 Annex Tabel C (grid R00), e.g. periodical press | `draft` |
| `be-exempt` | BE | `EXEMPT` | `exempt` | Belgium exemption (art. 44 W.BTW) | Statutory exemption, **no input VAT deduction** | `draft` |

(9 rows; a 10th is intentionally absent — no shipping band, see §8.)

### 6.2 `tax_rate_versions` (proposed — 8 rows, all `draft`)

| ref | band ref | country | rate_basis_points | valid_from | valid_to | status | legal_source_reference | verified_at | verification_source |
|---|---|---|---|---|---|---|---|---|---|
| `v-nl-std` | `nl-std` | NL | **2100** | 2026-07-26 | NULL | `draft` | Wet OB 1968 art. 9 §1; Belastingdienst "Goederen en diensten met 21% btw" | 2026-07-26 | belastingdienst.nl (primary) |
| `v-nl-red-a` | `nl-red-a` | NL | **900** | 2026-07-26 | NULL | `draft` | Wet OB 1968 Tabel I; Belastingdienst "Goederen met 9% btw" | 2026-07-26 | belastingdienst.nl (primary) |
| `v-nl-zero` | `nl-zero` | NL | **0** | 2026-07-26 | NULL | `draft` | Wet OB 1968 Tabel II; Belastingdienst "Goederen met 0% btw" | 2026-07-26 | belastingdienst.nl (primary) |
| `v-be-std` | `be-std` | BE | **2100** | 2026-07-26 | NULL | `draft` | KB nr. 20 van 20.07.1970, art. 1 lid 1 | 2026-07-26 | financien.belgium.be (primary) + KB nr. 20 coordination (secondary) |
| `v-be-red-a` | `be-red-a` | BE | **600** | 2026-07-26 | NULL | `draft` | KB nr. 20 art. 1 lid 2 a) + Bijlage Tabel A | 2026-07-26 | financien.belgium.be (primary) + KB nr. 20 coordination (secondary) |
| `v-be-red-b` | `be-red-b` | BE | **1200** | 2026-07-26 | NULL | `draft` | KB nr. 20 art. 1 lid 2 b) + Bijlage Tabel B | 2026-07-26 | financien.belgium.be (primary) + KB nr. 20 coordination (secondary) |
| `v-be-zero` | `be-zero` | BE | **0** | 2026-07-26 | NULL | `draft` | KB nr. 20 art. 1 lid 2 c) + Bijlage Tabel C; Wet 13.04.2019 (B.S. 26.04.2019) | 2026-07-26 | financien.belgium.be (primary); B.S. text **not opened** |

**No rate version is proposed for `EXEMPT` bands in either country** — see §7.

Legal notes carried with the dataset:
1. NL 21% and BE 21%/12%/6% carry **verification-date** `valid_from`, not
   historical commencement (§5).
2. NL 2026 changes affect services only; no goods version needs a `valid_to`.
3. BE `ZERO` is loadable at band level, but **product classification into BE
   `ZERO` must stay blocked** until Tabel C is verbatim-verified.
4. BE Tabel A excludes beer > 0.5% abv and other drinks > 1.2% abv.

---

## 7. Zero-rated vs exempt — model treatment

| | **Zero-rated** (`tax_categories.code = 'zero'`) | **Exempt** (`code = 'exempt'`) |
|---|---|---|
| Taxable transaction? | **Yes** — taxable at a rate of 0 | **No** — statutorily removed from charge |
| Rate | 0 basis points | Not a rate |
| Input VAT deduction | **Preserved** (NL: "btw … kunt u wel aftrekken als voorbelasting"; BE: vrijstelling *met* recht op aftrek) | **Denied** (NL: "kunt u niet aftrekken als voorbelasting"; BE art. 44: zonder recht op aftrek) |
| Customer-visible price | Gross = net | Gross = net |
| Reporting | Reportable turnover (BE grid R00) | Not on the output-rate grids |

**Modelling decision proposed (no schema change now):**

- `ZERO` bands **do** get a `tax_rate_versions` row at `rate_basis_points = 0`.
  This is correct: a zero rate is a rate.
- `EXEMPT` bands get **no** rate version. An exempt supply is not "0% VAT"; it
  is *no VAT charge at all*, with different deduction and invoicing
  consequences. Creating a 0-bp exempt version would make exempt
  indistinguishable from zero-rated in every downstream join — the exact
  conflation BOR-DEC-050 forbids.
- Consequence with the current live guard `msop_guard_tax_integrity()`: it
  requires an **approved rate version covering the price window**. With no
  exempt rate version, **an exempt product can never obtain an active price** —
  i.e. exempt is *fail-closed today*. That is the safe behaviour for M1B-3C
  (Borvat sells no exempt goods), and it is recorded as **R-T10** rather than
  patched now. A dedicated exempt-pricing path is a later, separate stage.

---

## 8. Shipping VAT boundary (documented only — no band, no category)

1. **Customer-charged delivery fees follow the tax treatment of the goods
   supplied.** NL (Belastingdienst, "Btw berekenen over goederen"): *"U
   berekent btw over het totaalbedrag … inclusief diverse kosten, zoals
   verzendkosten, bezorgkosten … en verpakkingskosten (behalve statiegeld)."*
   BE (FPS Finance, "Maatstaf van heffing"): the taxable amount includes
   *"kosten van verzekering en vervoer"*, and *"Of deze kosten al dan niet
   worden opgenomen in een afzonderlijk debetdocument … maakt niet uit"*.
2. **Mixed-rate orders require allocation** of a single shipping charge across
   order lines, because the ancillary charge inherits each line's rate. The
   allocation basis (value-weighted, weight-weighted…) is a design decision for
   M1B-4, not resolved here.
3. **The carrier's invoice to the seller is a separate input-VAT matter** and
   must never be conflated with the customer-facing shipping VAT.
4. **Carrier country is irrelevant** to the customer's shipping VAT; the
   destination/place-of-supply rules for the goods govern.

**No `SHIPPING` tax category and no shipping rate band are proposed.** This
topic transfers to **M1B-4 — SHIPPING POLICY AND SHIPPING TAX FOUNDATION**.

---

## 9. VAT identity & OSS — data required later (nothing created now)

| Datum | Purpose | Gate |
|---|---|---|
| Seller legal entity + establishment country | Determines domestic vs intra-EU B2C | **Publication** |
| VAT registration number + validation status (VIES) | Invoice validity, seller legitimacy | **Publication** |
| OSS participation flag + OSS registration member state | Whether destination VAT is remitted via OSS | **Checkout** (destination outside establishment country) |
| €10,000 intra-EU micro-business threshold status | Whether origin-country VAT may still apply | **Checkout** |
| Destination-country band coverage (a band + approved version exists for the buyer's country) | Whether a destination price can be computed at all | **Checkout** (already enforced by the pricing guard) |
| Invoice sequence, seller address, VAT breakdown per rate | Legally valid invoice | **Invoice generation** |

`company_tax_profiles` remains **empty**; no VAT numbers are recorded in this
round.

---

## 10. Proposed governance workflow (draft-then-approve)

```
Researcher  → creates band (draft) + rate version (draft)
              MUST attach legal_source_reference, verified_at,
              verification_source, and source tier (primary/secondary)
Reviewer    → an identity DISTINCT from the researcher re-opens the cited
              official source and confirms rate, dates, jurisdiction
Approver    → activates: band draft→active, version draft→approved
Active      → immutable. Rate change = NEW version; old version closed with
              valid_to, never deleted or edited
Impact      → affected classifications and active prices are re-reviewed;
              prices whose pinned version closed must be superseded
Checkout    → re-resolves the applicable version at order time; never trusts a
              cached rate
```

**Because of R-D7 (unaudited admin read/approval surface):**
- **No approval RPC is created in this stage.**
- `admin` role alone is explicitly **NOT** sufficient authority for
  `tax.rates.approve`. A distinct, separately granted capability (and a
  reviewer ≠ approver separation check) is required before any activation path
  exists.
- Approval must write an audit row that survives the transaction; the known
  audit-rollback pattern (R-5 / R-D2 / R-D7) must be resolved for the approval
  path specifically.

---

## 11. Loading strategy — one recommendation

| Option | Assessment |
|---|---|
| Migration-bound seed only | Deterministic and reviewable in Git, but freezes future rate changes into migrations — unacceptable for data that legally changes |
| Trusted admin workflow only | Flexible, but requires the approval RPC + role capability that R-D7 currently forbids, so nothing could be loaded at all |
| **Hybrid (RECOMMENDED)** | **Initial official seed via one atomic migration inserting bands + rate versions as `draft`; all future changes and every activation via the governed workflow of §10.** |

**Recommendation: HYBRID.** The seed migration must:
1. Insert the **9 bands first** (status `draft`), relying on
   `(country_code, band_code)` uniqueness to prevent duplicates.
2. Insert the **8 rate versions** as `draft`, each with
   `legal_source_reference`, `verified_at`, `verification_source`.
3. Rely on the live `btree_gist` exclusion constraint for overlap rejection —
   never a trigger substitute.
4. Insert **no** product classifications, **no** prices, **no** company tax
   profiles.
5. Activate **nothing**. Activation happens only after independent review.
6. Be idempotent-safe (fail loudly on conflict rather than silently upsert).

---

## 12. Test plan for the future loading stage

| # | Assertion |
|---|---|
| 1 | Every rate version has a non-empty `legal_source_reference` |
| 2 | Every rate version has a non-null `valid_from` and `verified_at` |
| 3 | `rate_basis_points` matches the source exactly (2100 / 900 / 1200 / 600 / 0) |
| 4 | No NL band is linked to a BE rate version, and vice versa (`trg_tax_rate_versions_band_country`) |
| 5 | BE has **two distinct reduced bands** with distinct `band_code`s and distinct rates |
| 6 | No `band_code` matches `[0-9]` in a percentage sense — assert no band code contains a digit at all in this dataset |
| 7 | Each rate version's `country_code` equals its band's `country_code` |
| 8 | Two active versions of the **same** band with overlapping windows are rejected (`23P01`) |
| 9 | Two different bands of the **same** treatment may be active simultaneously (BE 6% + 12%) |
| 10 | `zero` band has a rate version at 0 bp; `exempt` band has **no** rate version — the two are not interchangeable |
| 11 | No band whose `band_code` or `display_name` denotes shipping exists |
| 12 | `catalog_product_tax_classifications` row count = 0 |
| 13 | `company_tax_profiles` row count = 0 |
| 14 | `merchant_store_offer_prices` row count = 0 |
| 15 | No band or version reaches `active`/`approved` without a recorded reviewer distinct from the researcher |
| 16 | No grants on tax tables to `PUBLIC`, `anon`, `authenticated`, `service_role`, `sandbox_exec` |
| 17 | All `borvat_direct_listing_publications` remain `not_ready` |
| 18 | P5-HF-001 intact — `place_order` EXECUTE still revoked |
| 19 | Bol Live disabled (`live_authorized_at` count = 0); Stripe Live disabled |
| 20 | Every dataset row is re-derivable from its cited official URL by an independent reviewer |

---

## 13. Risks

| ID | Risk | Severity |
|---|---|---|
| **R-T10** | Exempt goods cannot be priced at all under the current guard (no exempt rate version by design). Fail-closed, but a real gap if Borvat ever lists exempt goods. | Low now |
| **R-T11** | BE KB nr. 20 table contents come from a **2020 secondary coordination text**; ejustice.just.fgov.be was unreachable. Rates 21/12/6/0 are corroborated by FPS Finance (primary), but table *contents* are not primary-verified. | **Medium — blocks BE classification** |
| **R-T12** | BE Tabel C (0%) enumeration not verbatim confirmed. | Medium |
| **R-T13** | No official commencement dates for NL 21%/9%/0% or BE 21%/12%/6%; verification-date anchoring proposed. No historical repricing possible. | Low (no historical orders) |
| **R-T14** | NL 21% is defined only residually; classifying Borvat's household/electrical assortment as standard is an inference, not a quoted rule. | Medium — per-product reviewer confirmation required |
| **R-T15** | No approval capability exists (R-D7); a loaded draft dataset would sit inert until the capability model is built. | Accepted |
| **R-T16** | Announced-change monitoring is manual; no process yet re-checks authority pages for rate changes. | Medium |
| R-T7 | Superseded in part by this dataset (still open — nothing loaded). | Open |
| R-T8 | Band lifecycle workflow still absent. | Open |
| R-D7, R-D8, R-5, R-P1..R-P4, R-PR1..R-PR7 | Unchanged. | Open |

---

## 14. Verdict

**OFFICIAL SOURCES INCOMPLETE.**

The **rate structure itself is settled and primary-sourced** for both
countries: NL = 21 / 9 / 0 + exempt (one reduced band); BE = 21 / 12 / 6 / 0 +
art. 44 exempt (two distinct reduced bands, confirming the M1B-2D correction
was necessary). The proposed 9-band / 8-version dataset in §6 is complete and
reviewable.

It is **not yet loadable** because:

1. **R-T11 / R-T12** — ejustice.just.fgov.be could not be rendered; the KB
   nr. 20 Tabel A/B/C contents rest on a dated secondary mirror.
2. **R-T13** — no official commencement dates; §5 Option V must be explicitly
   ratified by the Owner before any `valid_from` is written.
3. **R-T15** — no reviewer/approver capability exists, so §10 cannot yet be
   honoured end-to-end.

None of these blocks the *band skeleton*; all of them block *product
classification* and *activation*.

**Recommended next authorisation (Owner decision required):** either
(a) re-attempt primary retrieval of KB nr. 20 / BTW-Wetboek art. 44 and the NL
Tabel I/II statute text, then re-issue this precheck as READY; or
(b) authorise **M1B-3D — DRAFT-ONLY BAND & RATE SEED** limited to the 9 bands
and 8 rate versions at §5 Option V dates, all `draft`/unapproved, with
classification and activation still blocked.

**Halted. No tax data loaded. No pricing, shipping, publication, storefront or
checkout work started.**

---

## 15. Proposed decision log entry

**BOR-DEC-051 — OFFICIAL TAX DATA REQUIRES SOURCE-VERIFIED DRAFT-THEN-APPROVE
GOVERNANCE** *(proposed — awaiting Owner approval)*
