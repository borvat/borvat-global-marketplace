# PHASE 5 — M1B-3C-2

## AUTHORITATIVE EFFECTIVE-DATE RETRIEVAL AND RATE-VERSION DATASET PRECHECK

**Status:** PRECHECK ONLY — ANALYSIS AND DATASET PREPARATION
**Review date:** 2026-07-26
**Authorization:** M1B-3C-2 (owner authorization, this round)
**Preceding round:** M1B-3C-1 — ACCEPTED AND CLOSED WITH RESIDUAL RISKS (BOR-DEC-051, BOR-DEC-052)

---

## 0. EXECUTION GUARANTEE — NO CHANGE WAS MADE

This round performed **read-only** database inspection and **external legal research only**.

| Prohibited action | Performed? | Evidence |
|---|---|---|
| Migration | NO | No migration tool invoked this round |
| INSERT / UPDATE / DELETE | NO | Only `SELECT` statements executed |
| Tax rate versions created | NO | `tax_rate_versions = 0` (verified post-round) |
| Band status changed | NO | All 9 bands remain `draft` |
| Product classifications | NO | `catalog_product_tax_classifications = 0` |
| Company tax profiles | NO | `company_tax_profiles = 0` |
| Prices | NO | `merchant_store_offer_prices = 0` |
| Approval RPC / UI | NO | No SQL objects, routes, or components created |
| Shipping / Publication / Storefront / Checkout | NO | Untouched |

### Verified state at review time (read-only)

```
tax_categories                        = 4
tax_rate_bands                        = 9   (all status = 'draft')
tax_rate_versions                     = 0
catalog_product_tax_classifications   = 0
company_tax_profiles                  = 0
merchant_store_offer_prices           = 0
borvat_direct_listing_publications    = 0   (publication remains fail-closed)
```

**P5-HF-001 remains intact** — no checkout/order write path was touched.

### Band identity reference (read-only, for a future authorized seed)

| country_code | band_code | tax_rate_band_id | status |
|---|---|---|---|
| NL | STANDARD | `16fda054-78d2-4667-a8c6-7f99a288a238` | draft |
| NL | REDUCED_A | `864faa2a-cc7f-4a49-b258-01c6a661e543` | draft |
| NL | ZERO | `a2ac7f11-4d0a-4622-be69-2b8d4d56a16b` | draft |
| NL | EXEMPT | `1016235b-dd31-4a6e-927a-3f80e181f7ee` | draft |
| BE | STANDARD | `54491a0d-13da-4bd2-8aad-a54b5f21ced0` | draft |
| BE | REDUCED_A | `c0fe4197-393b-4bfe-825b-7610bb429fed` | draft |
| BE | REDUCED_B | `815e0f23-ae37-4fc1-b097-fb2006f7f790` | draft |
| BE | ZERO | `f519086b-232d-4884-b397-ee4d40fd43e3` | draft |
| BE | EXEMPT | `077c0026-1d69-490f-8e2c-21f67613c90a` | draft |

---

## 1. SOURCE HIERARCHY APPLIED

Per the authorization, sources were ranked:

1. **PRIMARY** — nationally published legal text (Wet OB 1968 / KB nr. 20 consolidated text).
2. **PRIMARY (gazette)** — Staatsblad (NL) / Belgisch Staatsblad–Moniteur belge (BE), incl. Justel bibliographic records.
3. **OFFICIAL ADMINISTRATIVE** — Belastingdienst (NL), FPS Finance / belgium.be (BE), Eerste Kamer.
4. **CORROBORATION ONLY** — European Commission / TEDB.
5. **NAVIGATION ONLY (never evidence)** — commercial/advisory/mirror sites, used exclusively to locate a decree, act, or article number, then required re-verification against 1–3.

Every claim below carries an explicit tier label. **No commercial source is used as final evidence anywhere in this document.**

---

## 2. OFFICIAL-SOURCE SEARCH LOG

### 2.1 Netherlands

| # | Target | Outcome |
|---|---|---|
| 1 | `wetten.overheid.nl/BWBR0002629/2026-01-01` (Wet OB 1968 consolidated) | **FAILED — request timeout** |
| 2 | `wetten.overheid.nl/jci1.3:c:BWBR0002629&artikel=9&g=2026-01-01` | **FAILED — timeout** |
| 3 | `zoek.officielebekendmakingen.nl/stb-2018-504.pdf` (Belastingplan 2019) | **FAILED — connection reset** |
| 4 | `zoek.officielebekendmakingen.nl/stb-2024-434.html` (Belastingplan 2025) | **SUCCESS — metadata/header only, operative text not rendered** |
| 5 | `zoek.officielebekendmakingen.nl/stb-2025-339.html` (retention act cultuur/media/sport) | **FAILED — timeout** |
| 6 | `eerstekamer.nl/wetsvoorstel/36814_wet_behoud_verlaagd_btw` | **SUCCESS** |
| 7 | `belastingdienst.nl/.../btw-logies` | **SUCCESS** |
| 8 | `belastingdienst.nl/.../hoe-hoog-is-de-btw` | **FAILED — 404 (slug changed)** |
| 9 | EC TEDB rate-search endpoint | **FAILED — endpoint not resolvable as a static document** |
| 10 | Stb. 2012-321 / Stb. 2012-364 (19%→21%) | **IDENTIFIED via search index; full text NOT retrieved** |

### 2.2 Belgium

| # | Target | Outcome |
|---|---|---|
| 1 | `https://www.ejustice.just.fgov.be/cgi_loi/...` (HTTPS) | **FAILED — ERR_EMPTY_RESPONSE** |
| 2 | `https://www.ejustice.just.fgov.be/eli/besluit/1970/07/20/1970072001/justel` | **FAILED — ERR_EMPTY_RESPONSE** |
| 3 | `http://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&numac_search=1970072012` (plain HTTP) | **SUCCESS — Justel record for AR/KB n° 20 incl. amendment history through 2026-02-14** |
| 4 | Same endpoint for `numac_search=1995003695` (AR 01.12.1995, 21%) | **FAILED — ERR_EMPTY_RESPONSE (intermittent)** |
| 5 | `https://www.belgium.be/fr/impots/tva/taux` | **SUCCESS — official federal portal, confirms 21/12/6/0 currently applicable** |
| 6 | `finances.belgium.be` / Fisconetplus consolidated KB nr. 20 | **FAILED — human-verification (CAPTCHA) wall** |
| 7 | `fin.belgium.be` — demolition/reconstruction regime from 2025-07-01 | **SUCCESS** |
| 8 | `fin.belgium.be` — VAT rate change, fossil-fuel heating installations | **SUCCESS** |
| 9 | Circulaire 2025/C/46 (coal) primary text on Fisconetplus | **NOT RETRIEVED** — only a third-party reproduction was reachable → treated as navigation-only |
| 10 | EC TEDB / EC "VAT rates applied in the Member States" | **NOT RETRIEVED as an authoritative document this round** |
| 11 | `etaamb.openjustice.be` mirrors | **REACHABLE but rejected as evidence** — self-declared non-official |
| 12 | `vatupdate.com` PDF of FPS "unofficial coordination" of KB nr. 20 | **REACHABLE but rejected as evidence** — commercial mirror, navigation-only |

**R-T11 finding confirmed and unchanged:** `ejustice.just.fgov.be` remains functionally unreliable. A single legacy plain-HTTP endpoint succeeded once and then failed on a comparable request minutes later. This is **not** a stable retrieval path and must not be relied upon to certify a dataset.

---

## 3. NETHERLANDS EVIDENCE PACKETS

### NL / STANDARD — 21%

| Field | Value |
|---|---|
| rate_basis_points | 2100 |
| Legal instrument | Wet op de omzetbelasting 1968 (BWBR0002629) |
| Article / table | Art. 9, lid 1 — residual/general rate; no table (default rate) |
| Current-value commencement | **1 October 2012** (19% → 21%), enacted through the 2012 budget-agreement legislation; candidate instruments Stb. 2012, 321 (act) and Stb. 2012, 364 (implementing besluit) |
| Commencement evidence tier | **UNVERIFIED** — neither Staatsblad text nor the consolidated article was rendered; identification rests on search-index metadata only |
| valid_to | Open |
| Current validity | wetten.overheid.nl index shows BWBR0002629 "Geldend van 01-01-2026 t/m heden" (snippet, not a rendered page) |
| Official source | `wetten.overheid.nl/BWBR0002629` (fetch failed); `zoek.officielebekendmakingen.nl/stb-2012-364.pdf` (not fetched) |
| Retrieval date | 2026-07-26 |
| Primary-source status | **UNVERIFIED (commencement)** / weak OFFICIAL ADMINISTRATIVE (current value) |
| Confidence | Medium on rate value; Low on legally certified commencement |
| Unresolved | Which of Stb. 2012-321 vs 2012-364 is the operative instrument; exact enacting provision text |

### NL / REDUCED_A — 9%

| Field | Value |
|---|---|
| rate_basis_points | 900 |
| Legal instrument | Wet OB 1968 |
| Article / table | Art. 9, lid 2, sub a + **Tabel I** (enumerated goods and services) |
| Current-value commencement | **1 January 2019** (6% → 9%), Belastingplan 2019 — Wet van 19 december 2018, **Stb. 2018, 504** |
| Commencement evidence tier | **UNVERIFIED at text level** — Stb. 2018-504 PDF fetch failed (connection reset); instrument title captured from the official publication index only |
| valid_to | Open for the general Tabel I basket |
| Amendment in force | **Logies (short-stay accommodation) moved 9% → 21% effective 2026-01-01** — confirmed on Belastingdienst (OFFICIAL ADMINISTRATIVE, fetched 2026-07-26). The planned 2026 increase for **cultuur, media en sport was cancelled** by Wet behoud verlaagd btw-tarief op cultuur, media en sport (Kamerstuk 36.814; Stb. 2025, 339 identified but not rendered) — confirmed on the Eerste Kamer wetsvoorstel page (OFFICIAL, fetched 2026-07-26) |
| Impact on Borvat goods | The 2026 changes located are **services-only** (logies; and the cancelled cultuur/media/sport measure). **No evidence found** that household goods, small electricals, or home appliances were affected. This is an **unverified absence**, not a certified negative: the consolidated 2026 Tabel I goods list could not be rendered |
| Official source | `eerstekamer.nl/wetsvoorstel/36814_wet_behoud_verlaagd_btw` (OK); `belastingdienst.nl/.../btw-logies` (OK); `wetten.overheid.nl/BWBR0002629` Tabel I (failed) |
| Retrieval date | 2026-07-26 |
| Primary-source status | OFFICIAL ADMINISTRATIVE for the 2026 scope changes; **UNVERIFIED** for the 2019 commencement text and for Tabel I's operative wording |
| Confidence | High that 9% is the current single reduced rate; Medium-Low on certified commencement |
| Unresolved | Stb. 2018-504 operative article; full 2026 consolidated Tabel I; Stb. 2025-339 enacted text |

### NL / ZERO — 0%

| Field | Value |
|---|---|
| rate_basis_points | 0 |
| Legal instrument | Wet OB 1968 |
| Article / table | Art. 9, lid 2, sub b + **Tabel II** (intra-Community supplies, exports, international transport, etc.) |
| Current-value commencement | **UNVERIFIED** — the 0% mechanism dates to the original law (in force 1969) but Tabel II has been amended repeatedly (notably for the 1993 Single Market regime). No single certified commencement date for the currently-in-force wording was obtained |
| valid_to | Open |
| Current validity | Inferred from the BWBR0002629 index line "Geldend van 01-01-2026 t/m heden"; **not** a direct read of Tabel II |
| Official source | `wetten.overheid.nl/BWBR0002629` → Tabel II (fetch failed) |
| Retrieval date | 2026-07-26 |
| Primary-source status | **UNVERIFIED** |
| Confidence | Low-Medium |
| Unresolved | Direct Tabel II text; scope applicable to Borvat (Tabel II is predominantly cross-border/export treatment, **not** a domestic-consumer zero rate) |

> **Material scope observation (NL/ZERO):** Dutch Tabel II is essentially an **export / intra-Community / international-transport** zero-rating regime, not a domestic consumer-goods zero rate. Modelling it as a plain domestic "band rate" risks mis-taxing domestic B2C sales. This is an architectural question, not merely an evidence gap — see §8.

---

## 4. BELGIUM EVIDENCE PACKETS

### BE / STANDARD — 21%

| Field | Value |
|---|---|
| rate_basis_points | 2100 |
| Legal instrument | Arrêté royal n° 20 / Koninklijk besluit nr. 20 of 20 July 1970, issued under **art. 37 Code de la TVA / WBTW** (law of 3 July 1969), confirmed by the law of 27 May 1971 |
| Article / table | **Art. 1, first paragraph** — residual rate for everything not listed in Table A, B or C |
| Current-value commencement | **1 January 1996** (20.5% → 21%) via AR of 1 December 1995, published Moniteur belge 16 December 1995 (numac 1995003695) |
| Commencement evidence tier | **UNVERIFIED at text level** — Justel bibliographic header ("Entrée en vigueur : 1 janvier 1996") observed only via search index; the live fetch of that record failed |
| valid_to | Open |
| Current validity | `belgium.be/fr/impots/tva/taux` — "Le taux normal de la TVA est de 21 %" (OFFICIAL ADMINISTRATIVE, fetched 2026-07-26). Justel amendment table for numac 1970072012 shows amendments to 2026-02-14 with Art. 1's 21% intact |
| Official source | `http://www.ejustice.just.fgov.be/cgi_loi/article.pl?language=fr&numac_search=1970072012` (fetched OK); `.../1995003695` (failed) |
| Retrieval date | 2026-07-26 |
| Primary-source status | PRIMARY for the existence/structure of Art. 1; **UNVERIFIED** for the 1996 commencement instrument text |
| Confidence | High that 21% is in force; Medium on the commencement date |
| Unresolved | Full text of AR 01.12.1995 |

### BE / REDUCED_A — 6% (Table A)

| Field | Value |
|---|---|
| rate_basis_points | 600 |
| Legal instrument | KB nr. 20 (art. 37 WBTW) |
| Article / table | **Art. 1, al. 2, a)** — 6% for goods and services enumerated in **Table A** of the annex |
| Table A vs Table B (legal distinction) | Both are reduced-rate derogations created by the **same article** of the same decree; they differ **only** by which annexed table enumerates the item. Table A = 6% list (foodstuffs, water, medicines, books, passenger transport, social housing works, demolition-reconstruction rubrique XXXVII, etc.); Table B = 12% list. Movement between tables (or out to the standard rate) happens by amending Royal Decree or programme law |
| Current-value commencement | **NOT A SINGLE DATE.** The 6% band exists since the decree of 20 July 1970, but Table A's *content* has been amended continuously — Justel lists amendments through **2026-02-14** |
| Commencement evidence tier | **UNVERIFIED** — the operative Art. 1(a) wording quoted in research came from a commercial mirror of an FPS "unofficial coordination" and is therefore navigation-only |
| valid_to | Open |
| Current validity | `belgium.be/fr/impots/tva/taux` (OFFICIAL ADMINISTRATIVE, 2026-07-26) |
| Retrieval date | 2026-07-26 |
| Primary-source status | PRIMARY for existence of Art. 1 / Table A structure; **UNVERIFIED** for wording and for any single commencement date |
| Confidence | High on rate value; Low on a citable `valid_from` |
| Unresolved | Latest official consolidated Table A version identifier (Fisconetplus blocked by CAPTCHA) |

### BE / REDUCED_B — 12% (Table B)

| Field | Value |
|---|---|
| rate_basis_points | 1200 |
| Legal instrument | KB nr. 20 (art. 37 WBTW) |
| Article / table | **Art. 1, al. 2, b)** — 12% for goods and services in **Table B** (catering/restaurant services, social housing supply, margarine, certain agricultural/horticultural products) |
| Current-value commencement | **NOT A SINGLE DATE** — same continuous-amendment problem as Table A |
| Amendment in force | **Coal and coal derivatives removed from the 12% band to 21%** — attributed to arts. 52 and part of 53 of the programme law of 18 July 2025 and SPF Finances Circulaire 2025/C/46 (published 28 July 2025). **Only a third-party reproduction of that circular was reachable**, so both the effective date and the article numbers are **UNVERIFIED** |
| valid_to | Open |
| Current validity | `belgium.be/fr/impots/tva/taux` (OFFICIAL ADMINISTRATIVE, 2026-07-26) |
| Retrieval date | 2026-07-26 |
| Primary-source status | PRIMARY for structure; **UNVERIFIED** for wording, commencement, and current scope after the 2025 coal change |
| Confidence | High on rate value; Low on `valid_from`; Medium-Low on current scope |
| Unresolved | Primary text of the programme law of 18.07.2025 and Circulaire 2025/C/46 |

### BE / ZERO — 0% (Table C)

| Field | Value |
|---|---|
| rate_basis_points | 0 |
| Legal instrument | KB nr. 20 (art. 37 WBTW) |
| Article / table | Reported as **Art. 1, al. 2, c)** + **Table C** of the annex, said to have been inserted with effect from **1 April 2019** (AR 13.04.2019, MB 26.04.2019). Scope reported as daily/weekly press publications and certain recovered materials |
| Current-value commencement | **UNVERIFIED and internally ambiguous.** Belgium applied 0% treatment to daily/weekly press long before 2019; the 2019 instrument may be a **restructuring/codification into an explicit Table C** rather than an introduction of the 0% treatment itself. The two readings imply different legally correct `valid_from` values |
| Commencement evidence tier | **SECONDARY-ONLY → rejected.** The Table C / 2019 detail originates from a commercial mirror; not confirmed at Justel or Fisconetplus |
| valid_to | Open |
| Current validity | `belgium.be/fr/impots/tva/taux` — "0 % : par exemple certaines publications périodiques" (OFFICIAL ADMINISTRATIVE, 2026-07-26) |
| Retrieval date | 2026-07-26 |
| Primary-source status | **UNVERIFIED** for the legal architecture; OFFICIAL ADMINISTRATIVE only for the bare fact that a 0% band currently exists |
| Confidence | Low |
| Unresolved | Full Table C enumeration; whether the correct `valid_from` is 1970-era or 2019 |

### BE / EXEMPT and NL / EXEMPT

**No rate version is proposed for either**, per authorization §8. Exemption is a distinct treatment (no output VAT, no input-VAT deduction), not a 0% rate. Modelling it as a 0% rate version would silently produce arithmetically correct but legally wrong invoices and input-VAT positions. Both EXEMPT bands remain `draft`, unpriced, and fail-closed.

---

## 5. LEGAL COMMENCEMENT ANALYSIS

Three distinct commencement problems emerged, and they are **not** all the same problem:

**Problem 1 — Retrieval failure (NL/STANDARD, NL/REDUCED_A, BE/STANDARD).**
A specific, dateable amending instrument exists and was identified by number, but the operative text could not be rendered. This is solvable purely by regaining access to `wetten.overheid.nl` / `officielebekendmakingen.nl` / Justel. It does **not** require any design change.

**Problem 2 — No single commencement date exists (BE/REDUCED_A, BE/REDUCED_B).**
Belgian Tables A and B are continuously amended lists. The *numeric rate* (6%, 12%) has been stable for decades, but "the current rate band" has no single legally meaningful start date, because what the band *covers* changed as recently as 2026-02-14. Any single `valid_from` would be a fabrication.
**Consequence:** for Belgium, `valid_from` on a rate version must be understood as *"the date from which this numeric rate applied to items in this table"*, and the item-scope question must be pushed entirely into the (later, separately authorized) product-classification layer. Attempting to encode table-scope changes in the rate-version timeline is a modelling error.

**Problem 3 — Ambiguous legal identity (BE/ZERO, NL/ZERO).**
For BE/ZERO, two defensible commencement dates exist depending on whether Table C created or merely restated the treatment. For NL/ZERO, the treatment is a cross-border regime rather than a domestic band. Both need a legal-scope determination before any date is meaningful.

---

## 6. CONTRACT A / CONTRACT B ASSESSMENT

**Recommendation: adopt Contract A — Legal commencement — as the definition of `valid_from`. Do not adopt Contract B in this round.**

Rationale:

- Contract A is achievable for **NL/STANDARD, NL/REDUCED_A and BE/STANDARD** as soon as retrieval succeeds — the instruments are identified, only the text is missing. Falling back to Contract B for rows that are merely *temporarily unfetchable* would permanently degrade the data model to solve a transient network problem.
- Contract B cannot rescue **BE/REDUCED_A** or **BE/REDUCED_B** either, because their problem is Problem 2 (no single legal date exists), which is a modelling question, not a date-evidence question.
- Contract B carries obligations the platform is not ready to meet: a field rename or binding documentation, a backdating prohibition enforced in schema, and an explicit rule that historical orders are never recomputed. None of that has been designed or authorized.

**Confirmed prohibition honoured:** the retrieval/verification date (2026-07-26) is **not** proposed as any `valid_from` value anywhere in this document. No row in §7 carries a verification-date-derived commencement.

If retrieval remains impossible after a dedicated retry round, the correct next step is a **separate architectural precheck for Contract B**, not an in-line downgrade.

---

## 7. EVIDENCE MATRIX — PROPOSED RATE VERSIONS

Seven rate versions are in scope (EXEMPT excluded by design).

| # | country | band | rate_bp | proposed valid_from | valid_to | legal instrument | article/table | official source | current-validity source | retrieval | primary-source status | confidence | unresolved | ready_for_seed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | NL | STANDARD | 2100 | *candidate* 2012-10-01 | open | Wet OB 1968 as amended 2012 (Stb. 2012-321 / 2012-364) | art. 9(1) | wetten.overheid.nl BWBR0002629 (fetch failed) | wetten index "Geldend van 01-01-2026" | 2026-07-26 | UNVERIFIED | Medium | operative instrument + text | **false** |
| 2 | NL | REDUCED_A | 900 | *candidate* 2019-01-01 | open | Belastingplan 2019, Stb. 2018-504 | art. 9(2)(a) + Tabel I | officielebekendmakingen stb-2018-504 (fetch failed) | belastingdienst.nl (OK); eerstekamer.nl 36.814 (OK) | 2026-07-26 | UNVERIFIED (text) / OFFICIAL ADMIN (current) | Medium | Stb. text; 2026 Tabel I goods scope | **false** |
| 3 | NL | ZERO | 0 | *none defensible* | open | Wet OB 1968 | art. 9(2)(b) + Tabel II | wetten.overheid.nl (fetch failed) | index inference only | 2026-07-26 | UNVERIFIED | Low | Tabel II text; domestic applicability | **false** |
| 4 | BE | STANDARD | 2100 | *candidate* 1996-01-01 | open | KB nr. 20, as amended by AR 01.12.1995 (MB 16.12.1995) | art. 1 al. 1 | Justel numac 1970072012 (OK); 1995003695 (failed) | belgium.be/fr/impots/tva/taux (OK) | 2026-07-26 | PRIMARY (structure) / UNVERIFIED (date) | Medium-High | AR 01.12.1995 text | **false** |
| 5 | BE | REDUCED_A | 600 | *no single date exists* | open | KB nr. 20 | art. 1 al. 2 a) + Table A | Justel numac 1970072012 (OK) | belgium.be (OK) | 2026-07-26 | PRIMARY (structure) / UNVERIFIED (wording) | Medium | consolidated Table A version id | **false** |
| 6 | BE | REDUCED_B | 1200 | *no single date exists* | open | KB nr. 20 | art. 1 al. 2 b) + Table B | Justel numac 1970072012 (OK) | belgium.be (OK) | 2026-07-26 | PRIMARY (structure) / UNVERIFIED (wording) | Medium | 2025 coal change; programme law 18.07.2025 | **false** |
| 7 | BE | ZERO | 0 | *ambiguous (1970-era vs 2019-04-01)* | open | KB nr. 20 | art. 1 al. 2 c) + Table C (reported) | not retrieved at official tier | belgium.be (OK) | 2026-07-26 | SECONDARY-ONLY → rejected | Low | Table C identity + enumeration | **false** |

**`ready_for_seed = true` count: 0 of 7.**

### 7.1 Per-row classification (§10)

| Row | Classification |
|---|---|
| NL / STANDARD | **BLOCKED — COMMENCEMENT DATE UNVERIFIED** |
| NL / REDUCED_A | **BLOCKED — COMMENCEMENT DATE UNVERIFIED** |
| NL / ZERO | **BLOCKED — LEGAL BAND SCOPE UNVERIFIED** |
| BE / STANDARD | **BLOCKED — COMMENCEMENT DATE UNVERIFIED** |
| BE / REDUCED_A | **BLOCKED — COMMENCEMENT DATE UNVERIFIED** |
| BE / REDUCED_B | **BLOCKED — COMMENCEMENT DATE UNVERIFIED** |
| BE / ZERO | **BLOCKED — SOURCE CONFLICT** (Table-C identity vs pre-existing press zero-rating; only secondary evidence available) |

No row reaches READY. The "not all-or-nothing" principle was applied honestly — rows were assessed independently and each failed on its own evidence, not by association.

### 7.2 Proposed draft rows — WITHHELD

Because no row is `ready_for_seed`, **no draft rate-version row set is proposed for loading in this document**. Publishing candidate `valid_from` values as a ready-to-apply dataset would invite exactly the shortcut this authorization forbids. The candidate values in §7 are research findings, explicitly labelled *candidate*, and are not a seed payload.

---

## 8. PRODUCT CLASSIFICATION — EXPLICIT NON-ACTION

No product was classified, and no automatic classification rule was created or proposed.

**Explicit warning for the record:** Borvat's household and small-electrical assortment does **not** automatically fall into the STANDARD band on the basis of a product name. A correct classification requires, per item:

1. Product type and objective characteristics.
2. Composition/configuration (e.g. an integrated component within immovable work can attract a different treatment from the same item sold loose — the Belgian 2025 heating-installation change is a live example).
3. Intended and actual use.
4. The destination country's legal enumeration (Tabel I for NL; Tables A/B/C for BE).
5. Independent review; name-matching, keyword rules, and channel category mapping are all inadmissible as a classification basis.

Additionally, both jurisdictions' reduced/zero lists changed within the last 18 months. Classification is therefore **versioned**, and must be pinned to a rate version, never inferred at read time.

---

## 9. ZERO AND EXEMPT TREATMENT

**Zero.** A rate version with `rate_basis_points = 0` is permissible in principle, but only once an official source establishes the *scope* of the zero-rated treatment. Neither jurisdiction reached that bar:

- **NL/ZERO** — Tabel II is an export / intra-Community / international-transport regime. It is very likely **not applicable at all** to Borvat Direct domestic B2C sales. Creating an NL zero rate version now would create a domestically selectable 0% band that has no lawful domestic use case.
- **BE/ZERO** — scope (press publications, certain recovered materials) is confirmed only at summary level and has no bearing on Borvat's assortment.

**Recommendation:** defer both ZERO rate versions. They are not on the critical path to first publication, and shipping them early adds a mis-taxation surface with zero commercial benefit.

**Exempt.** No rate version, in either country, at any rate. EXEMPT remains a distinct treatment, fail-closed, and — if it ever enters Borvat's scope — requires its own design for purchasing, invoicing wording, and input-VAT deduction restriction.

---

## 10. GOVERNANCE DESIGN FOR R-T15 (DESIGN ONLY — NOTHING CREATED)

The following lifecycle is **proposed**, not implemented. No approver, permission, role, RPC, trigger, or UI was created this round.

| Stage | Description | Gate |
|---|---|---|
| **S1 — Dataset prepared** | Evidence matrix complete; every row `ready_for_seed = true` with primary or official-administrative evidence | Precheck document |
| **S2 — Independent review** | A reviewer distinct from the dataset preparer verifies each row against its cited official source, re-fetching every URL | Written reviewer sign-off recorded in the report |
| **S3 — Owner decision** | Owner authorizes the specific row set, by country + band + rate + `valid_from` | Explicit owner authorization message |
| **S4 — Migration-bound initial seed** | Rows inserted **as `draft` only**, in a single migration, with literal values — no RPC, no dynamic SQL, no UI write path | Migration review |
| **S5 — Validation** | Post-seed read-only test suite (§11) | All tests pass |
| **S6 — Activation** | `draft → approved` transition, in a **separate later phase** | **Blocked** until R-D7 is closed and a dedicated tax-approval permission + audit path exists |

**Binding governance constraints:**

- **The general Platform Admin role is explicitly insufficient to approve tax rates.** Tax approval must be a distinct, separately granted capability with its own audit trail. Reusing `admin` would silently widen the existing single platform admin's authority into fiscal correctness — outside the authority granted in M1A #2D-1C.
- Activation must be independently auditable and must survive the R-D7 audit-rollback issue (audit rows written inside a transaction that later raises are lost). Until R-D7 is closed, an approval action cannot prove it happened.
- No backdating of `valid_from` past an already-priced or already-sold period, once pricing exists.
- Seeds are `draft` only; the migration must not set `approved_by` or `approved_at`.

---

## 11. PROPOSED FUTURE TEST PLAN (NOT EXECUTED)

To be run **after** an authorized seed, all read-only:

**Correctness**
1. Each seeded `rate_basis_points` equals the value in its cited official source.
2. Each `valid_from` equals the legal commencement date in the cited instrument.
3. `country_code` on the version matches `country_code` on the referenced `tax_rate_band`.
4. No rate version exists for any EXEMPT band, in either country.
5. Zero-rate rows, if any, are attached to a ZERO band and never to an EXEMPT band.
6. No overlapping validity interval within a single band (asserted by the existing `btree_gist` exclusion constraint; test must prove the constraint actually rejects an overlap).
7. Every `notes`/source reference resolves to an official-tier URL; no commercial domain appears.
8. Every row cites a named legal instrument and article/table.

**Containment**
9. `status = 'draft'` for 100% of seeded rows; `approved_by` and `approved_at` are NULL.
10. `catalog_product_tax_classifications` count unchanged (0).
11. `merchant_store_offer_prices` count unchanged (0).
12. No shipping data written.
13. `borvat_direct_listing_publications` unchanged; no publication status transition.
14. Anonymous and authenticated roles cannot read or write tax rate versions beyond declared policy; `sandbox_exec` retains **no DML** (R-T14 regression test).
15. No customer-facing surface renders any tax rate.
16. P5-HF-001 intact — `place_order` remains revoked and checkout remains blocked.

---

## 12. RISK REGISTER STATUS

| Risk | Prior status | Status after M1B-3C-2 | Note |
|---|---|---|---|
| **R-T11** — BE primary legal source (`ejustice.just.fgov.be`) unreliable | Residual Risk | **Residual Risk — reconfirmed, and now materially blocking** | One legacy plain-HTTP endpoint succeeded once, then failed on a comparable request. Not a stable path |
| **R-T12** — BE official mirror/administrative sources incomplete | Residual Risk | **Residual Risk — worsened for BE/ZERO** | Fisconetplus is behind a human-verification wall; the only reachable consolidated KB nr. 20 text is a commercial mirror and was rejected |
| **R-T13** — Legal commencement dates unverified | Blocker | **Blocker — REMAINS OPEN, now itemised** | Split into three distinct problems (§5): retrieval failure, no-single-date-exists, and ambiguous legal identity. Only the first is fixable by retrying retrieval |
| **R-T15** — No approval/activation capability | Blocker | **Blocker — REMAINS OPEN; design proposed in §10** | Nothing created. Explicitly recorded that the general Platform Admin role is insufficient |
| **R-T14** — `sandbox_exec` DML on tax/pricing/publication | Closed (M1B-3C-1) | **Remains closed** | No DML re-granted; no writes attempted |
| **R-D7** — Audit rollback on admin read RPCs | Open | Unchanged | Gates S6 activation (§10) |
| **R-T16** *(new)* — BE reduced bands have no single legal commencement date | — | **NEW — Open** | Tables A/B are continuously amended; a single `valid_from` for the band would be a fabrication. Requires a modelling decision, not more research |
| **R-T17** *(new)* — NL/ZERO (Tabel II) is a cross-border regime, not a domestic band | — | **NEW — Open** | Seeding it as a domestic band would expose an unlawful domestic 0% option |
| **R-T18** *(new)* — NL 2026 Tabel I goods scope unconfirmed | — | **NEW — Open** | 2026 changes located are services-only, but the consolidated goods list could not be rendered; the negative is uncertified |

---

## 13. PROPOSED DECISION ENTRY (NOT YET WRITTEN TO THE LOG)

> **BOR-DEC-053 — AUTHORITATIVE EFFECTIVE-DATE EVIDENCE INSUFFICIENT FOR RATE-VERSION SEED**
> M1B-3C-2 completed as a research and dataset-preparation round with no database change.
> Seven candidate rate versions (NL: STANDARD, REDUCED_A, ZERO; BE: STANDARD, REDUCED_A, REDUCED_B, ZERO) were assessed independently. **Zero rows reached `ready_for_seed`.**
> **Contract A (legal commencement)** is adopted as the definition of `valid_from`. Contract B is **not** adopted and may only be considered after a separate architectural precheck.
> The verification date was **not** used as a `valid_from` value anywhere.
> No rate version may be created for any EXEMPT band. Both ZERO bands are deferred as commercially unnecessary and legally unscoped.
> Approval of tax rates requires a capability distinct from the general Platform Admin role.
> R-T13 and R-T15 remain Blockers. R-T11 and R-T12 remain Residual Risks. R-T16, R-T17 and R-T18 are newly recorded.

*(This entry is proposed only. The append-only decision log was not modified.)*

---

## 14. FINAL VERDICT

> ## EFFECTIVE-DATE EVIDENCE INCOMPLETE

**Basis:**
- 0 of 7 candidate rate versions reached `ready_for_seed = true`.
- The rate *values* (NL 21/9/0; BE 21/12/6/0) are corroborated at OFFICIAL ADMINISTRATIVE tier and are not in dispute.
- The *legal commencement dates* — the actual object of this round — could not be certified for any row.
- Two rows additionally fail on legal-scope grounds (NL/ZERO) and source conflict (BE/ZERO), which further research alone will not resolve.

**Recommended next authorization (owner decision required — not started):**
A narrow **M1B-3C-2R retrieval retry** targeting only the three rows blocked purely by fetch failure (NL/STANDARD, NL/REDUCED_A, BE/STANDARD), plus an owner ruling on the BE reduced-band `valid_from` modelling question (R-T16). The two ZERO rows should be dropped from the near-term critical path entirely.

**Halted.** No rate seed, seller pricing workflow, shipping, publication, or storefront work has begun, and none will begin without separate owner authorization.
