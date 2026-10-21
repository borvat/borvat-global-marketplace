# PHASE 5 — M1B-2A Tax Foundation Architecture Precheck

**Scope:** Analysis and design only. No migrations. No tax tables. No catalog edits. No VAT rates entered. No pricing / shipping / publication / storefront / checkout work.

**Verdict:** `SAFE TAX FOUNDATION DESIGN IDENTIFIED`

---

## 1. Current Schema Assessment

Structured probe across `information_schema.columns` for `tax`, `vat`, `country`, `currency`, `price`, `gross`, `net`:

| Table | Tax/VAT/Country/Currency/Price fields found |
|---|---|
| `companies` | none. Only `id, name, slug, owner_user_id, created_at, updated_at`. No VAT identity, no country, no legal entity fields. |
| `merchant_stores` | `country_code`, `default_currency`. No tax fields. No VAT number. No OSS flag. |
| `catalog_products` | none. No tax category. |
| `catalog_skus` | none. |
| `catalog_offers` | none. |
| `channel_listings` | none. No price, no tax. |
| `borvat_direct_listing_publications` | none (state-only, per M1B-1). |
| `products` (legacy demo) | `price_cents`, `original_price_cents`. No tax. Legacy — will not become Borvat Direct pricing SoT. |
| `order_items` (legacy demo) | `price_cents`. No tax breakdown. No snapshot. |
| `orders` (legacy demo) | `total_cents`, `shipping_address (jsonb)`. No tax breakdown, no destination country column, no legal seller snapshot. |
| `channel_imported_offers` | `price_cents`, `currency`. Bol-side data, out of scope. |
| `channel_orders` | `currency`. Bol-side, out of scope. |
| `channel_order_lines` | `unit_price_cents`. Bol-side, out of scope. |

### Findings

- **No existing Tax model.** There is no `tax_categories`, no `tax_rate_versions`, no product tax classification, no order tax snapshot. Nothing to reuse; nothing to migrate.
- **No columns named `tax` or `vat` exist anywhere in `public`.** Zero risk of accidentally repurposing a legacy field with a different meaning.
- **VAT identity is not stored today.** `companies` has no VAT number, no VAT country, no legal entity, no OSS status. `merchant_stores` has only operational country/currency, not tax identity.
- **No duplicate-source-of-truth risk today**, because Borvat Direct has zero pricing and zero tax data yet. This is the ideal moment to introduce the model cleanly.
- **Legacy `products.price_cents` and `order_items.price_cents` MUST NOT be extended with tax fields.** They belong to the pre-Borvat-Direct demo path and were not designed for versioned VAT. Any new tax model attaches to the new Borvat Direct pricing table introduced later in M1B-3, not to the legacy demo tables.
- **`channel_*` (Bol) tables must remain untouched.** Bol supplies its own VAT handling; Borvat's tax model applies only to Borvat Direct listings.

**Conclusion:** No existing tax model can be reused. A new, isolated foundation must be introduced. No conflicts to resolve.

---

## 2. Initial Scope

MVP jurisdictions: **Netherlands (NL), Belgium (BE)**. Sales model: **B2C**. Currency: **EUR** (store `default_currency` today). Displayed price is **gross (VAT-inclusive)**. Destination-country determination is deferred but the schema must be destination-aware from day one.

Schema is designed to admit additional EU countries later without migration — country codes are ISO-3166-1 alpha-2 free-form (validated against an allowlist), not enum. Non-EU / global tax regimes (US sales tax, GST, reverse-charge B2B, marketplace-facilitator regimes) are **out of scope** for M1B-2B and explicitly deferred.

---

## 3. Tax Category Model — Options

### Option A — Global product tax category, per-country rate
Product carries a single tax category (`standard_goods`, `reduced_goods`, `zero_rated`, `exempt`). Rate is looked up as `(country, category) → rate_version`.
- **Pro:** Simplest, minimal per-product classification data, aligns with how EU VAT categories are structured (each MS publishes rates by category).
- **Con:** The **same physical product can fall in different categories in different countries** (e.g. books are reduced-rate in NL but zero-rated in some MS; sanitary products, e-books, food supplements vary). Forces the seller to pick one global category that may be wrong in half the destinations.

### Option B — Country-specific product tax classification
Classification is `(product, country, tax_category, valid_from, valid_to)`.
- **Pro:** Legally correct. Handles cross-border category divergence cleanly. Auditable.
- **Con:** More rows per product; sellers must classify per country they sell into; needs a fallback ("no classification for this destination → not sellable there").

### Option C — Tax classification inline on the price row
Each price row references a `tax_rate_version` directly, no product classification entity.
- **Pro:** Fewest tables.
- **Con:** **Rejected outright.** Splits the same product's tax treatment across arbitrary prices with no governance; two prices for the same SKU could carry different tax categories with no rule preventing it. Loses the ability to answer "what is this product's tax classification?" independent of pricing. Conflates commercial and legal data.

### Recommendation — Option B

Adopt **Option B (country-specific product tax classification)**. Fallback rule: **no classification for the destination country → product is not eligible for publication in that country and not sellable there** (fail-closed). This is the only option that stays legally defensible when Borvat expands beyond NL/BE, and it is materially cheaper than retrofitting Option A→B later once real orders and invoices exist.

To keep the M1B-2B migration small, the initial classification surface can be minimal: a single classification per product covering the MVP countries where NL and BE happen to agree on category, with per-country overrides added only when they diverge. The schema supports full per-country rows from day one; population is incremental.

---

## 4. Proposed Entities (design only — DO NOT CREATE)

### 4.1 `tax_categories`
Canonical list of VAT treatment categories.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | e.g. `standard_goods`, `reduced_goods`, `zero_rated`, `exempt`, `reverse_charge`, `outside_scope` |
| `display_name` | text | |
| `treatment` | text | enum-like: `taxable_standard`, `taxable_reduced`, `zero_rated`, `exempt`, `reverse_charge`, `outside_scope` |
| `description` | text | |
| `active` | boolean default true | |
| `created_at`, `updated_at` | timestamptz | |

Seeded by migration with a **fixed set**; sellers cannot create categories. RLS: SELECT to `authenticated`, no writes.

### 4.2 `tax_rate_versions`
Effective-dated official rates per country + category.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `country_code` | text | ISO-3166-1 alpha-2, validated against an allowlist |
| `tax_category_id` | uuid FK → `tax_categories.id` ON DELETE RESTRICT | |
| `rate_basis_points` | integer | e.g. 2100 = 21.00%. See §5. |
| `valid_from` | timestamptz | inclusive |
| `valid_to` | timestamptz | exclusive, NULL = open-ended |
| `status` | text | `draft`, `active`, `superseded` |
| `legal_source_reference` | text | e.g. "Belastingdienst — Tarieven per 2026-01-01, art. …" |
| `verified_at` | timestamptz | when the human reviewer confirmed the source |
| `verified_by` | uuid | Platform Admin user id |
| `created_by` | uuid | |
| `created_at`, `updated_at` | timestamptz | |
| `version` | bigint default 1 | monotonic per `(country, category)` |

Uniqueness / exclusion (design intent; implementation deferred):
- No two `active` rows for the same `(country_code, tax_category_id)` may overlap in time. Enforced by a `tstzrange` exclusion constraint or by triggers (§6).
- `valid_to > valid_from` when both are non-null.

### 4.3 `catalog_product_tax_classifications`
Per-product, per-country classification (Option B).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK → `catalog_products.id` ON DELETE CASCADE | |
| `country_code` | text | |
| `tax_category_id` | uuid FK → `tax_categories.id` ON DELETE RESTRICT | |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | nullable |
| `status` | text | `draft`, `active`, `superseded` |
| `classification_source` | text | `seller_proposed`, `admin_confirmed`, `admin_reclassified` |
| `proposed_by` | uuid | Seller/company member |
| `reviewed_at` | timestamptz | |
| `reviewed_by` | uuid | Platform Admin |
| `created_at`, `updated_at` | timestamptz | |

Rule: only `admin_confirmed` (or `admin_reclassified`) rows are eligible for publication. Seller may only create `seller_proposed` drafts.

### 4.4 Seller VAT identity — `company_tax_profiles`
Attached to **`companies`**, not to `merchant_stores`. VAT identity is a **legal-entity** attribute; a company may operate several stores under one VAT registration.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid FK → `companies.id` ON DELETE CASCADE, UNIQUE | |
| `legal_name` | text | |
| `vat_country_code` | text | primary VAT registration country |
| `vat_number` | text | encrypted-at-rest column or restricted-access; never returned by public RPCs |
| `vat_registration_status` | text | `unregistered`, `pending`, `active`, `suspended` |
| `oss_participation` | text | `none`, `oss_union`, `oss_import` |
| `oss_country_code` | text | if participating |
| `valid_from`, `valid_to` | timestamptz | |
| `verified_at`, `verified_by` | | Platform Admin |
| `created_at`, `updated_at` | timestamptz | |

No document copies. No scans. No secrets. `vat_number` is PII-adjacent — never exposed to `anon`, never included in public storefront RPC response allowlists.

### 4.5 Not created
- No `merchant_store_tax_profiles` (avoids conflict with company-level identity).
- No prices table (M1B-3).
- No shipping tax table (M1B-4).
- No order tax snapshot table yet (M1B-…; see §11).

---

## 5. Rate Representation

- **Storage:** `integer basis points` (2100 = 21%). Reasons: exact, no floating-point drift, arithmetic on `int` is cheap and deterministic, easy to convert to display.
- **Range:** `0..10000` inclusive, CHECK-constrained.
- **NULL is not allowed** and never means 0%. `zero_rated` and `exempt` are distinct **categories**, not distinct rates.
- **Category semantics (initial set):**
  - `standard_goods` — taxable at MS standard rate.
  - `reduced_goods` — taxable at MS reduced rate.
  - `zero_rated` — taxable at 0%, input VAT still deductible (differs legally from exempt).
  - `exempt` — no VAT, no input deduction.
  - `reverse_charge` — deferred; B2B only, not needed for B2C MVP; category reserved to prevent future collision.
  - `outside_scope` — deferred; reserved.
- B2C MVP needs only `standard_goods`, `reduced_goods`, `zero_rated`, `exempt`. `reverse_charge` and `outside_scope` are pre-declared as categories so they cannot be re-invented under a different name later, but no rates will be entered for them in M1B-2B.

---

## 6. Effective Dating

Design invariants (enforced via CHECK + exclusion constraints + triggers when M1B-2B implements):

1. `valid_to IS NULL OR valid_to > valid_from`.
2. **No two `active` rows** for the same `(country_code, tax_category_id)` may overlap on `[valid_from, valid_to)`. Same rule for `catalog_product_tax_classifications` keyed by `(product_id, country_code)`.
3. **Draft rows are mutable.** Only Platform Admin with `tax.rates.approve` may transition `draft → active`.
4. **Active rows are immutable** except for setting `valid_to` when superseded (this becomes the "close" side of the transition).
5. Superseding is done by creating a new row `(country, category, new_rate, valid_from = old.valid_to)`, atomically in one transaction with `status='active'` and the previous row moved to `superseded`.
6. Rate versions that have been **referenced by any published price or any order snapshot become immutable in all fields except `valid_to` closure**. A trigger later will refuse mutation.
7. Silent historical edits are forbidden: no `UPDATE` may change `rate_basis_points`, `valid_from`, `tax_category_id`, or `country_code` of a non-draft row.

No trigger or constraint is created now.

---

## 7. Gross-Inclusive Pricing Contract (design only)

The future `merchant_store_offer_prices` table (M1B-3) will follow this contract:

- Row stores `gross_amount_cents` (integer, minor units), `currency`, and a **pinned** `tax_rate_version_id`.
- `net_amount_cents` and `tax_amount_cents` are **derived**, not stored (single source of truth = gross + rate). Derivation formula, half-away-from-zero rounding:
  - `net = round(gross * 10000 / (10000 + rate_bp))`
  - `tax = gross - net`
- Currency stored explicitly on the price row; MVP `EUR` only, but no schema hard-code.
- **Store price does not silently reprice when a new VAT rate version activates.** Repricing is an explicit seller action that creates a new price row referencing the new `tax_rate_version_id`. Old price row's `valid_to` is closed.
- **Destination-country divergence:** if buyer's destination country differs from the store's country, the storefront **re-evaluates** using the buyer-destination product classification and rate. If any of these is missing/expired, purchase is disabled for that destination and the storefront explains the country restriction; a 404/410 is not returned (product exists, just not sellable there).
- **When to block purchase:**
  - No active product classification for destination → block.
  - No active rate version for destination + category → block.
  - Currency mismatch that cannot be resolved deterministically at MVP (multi-currency deferred) → block.
- **Product page** initially renders the store-country gross price for browsing; the checkout re-computes against the resolved destination and refuses to proceed if the destination-adjusted price cannot be produced. This prevents accidental sale at the wrong tax rate.
- **Answers to the explicit questions:**
  - Pricing row stores gross **plus** pinned `tax_rate_version_id` (both). Not gross alone.
  - Net is **not stored**; derived on read.
  - Destination change triggers a fresh derivation using destination classification + rate version; if any missing → purchase blocked.

No pricing table is created in this precheck.

---

## 8. Merchant VAT Identity

Attached to `companies` via `company_tax_profiles` (§4.4). Fields as listed.

- **Not stored in Tax tables:** document scans, tax certificates, secrets.
- **Not exposed publicly:** `vat_number`, `vat_registration_status` — never in public RPC allowlists.
- **Publication gating:** Borvat Direct publication requires `vat_registration_status ∈ {active}` **only when** at least one destination country's rate treatment requires seller VAT registration. For pure zero-rated / exempt-only catalogues this could be relaxed later; for MVP (`standard_goods` in NL/BE) VAT registration IS required to publish.
- **Checkout gating:** additionally the profile must be verified (`verified_at IS NOT NULL`).
- Separating publication vs. checkout gating lets a seller stage listings while their VAT verification is pending, but nothing becomes purchasable until identity is verified.

---

## 9. Source Governance

Every `tax_rate_versions` row must, at approval time, carry:
- `legal_source_reference` (non-empty).
- `verified_at`, `verified_by`.
- `country_code` matching the jurisdiction.
- `valid_from` set with legal intent (usually the government-published effective date).

**No rate is ever entered from memory or from commercial websites.** The M1B-2B implementation must fail approval if any of these fields is missing.

Future capability matrix (permissions in §10):
- **Seller / company member:** proposes product classifications; may not create or approve rates.
- **Platform Admin (tax reviewer role, sub-role of admin):** creates draft rates, approves rates, ends rates, confirms/reclassifies product classifications.
- **Platform Admin (general):** does NOT automatically inherit approval; approval is gated by an additional dedicated permission so a general admin cannot accidentally certify a rate.

---

## 10. Future Permissions (do not create now)

- `tax.classifications.read` — sellers see their own proposals + platform-confirmed classifications for their products.
- `tax.classifications.manage` — sellers propose classifications.
- `tax.classifications.approve` — Platform Admin only; confirms/reclassifies.
- `tax.rates.read` — authenticated read; rates are non-secret.
- `tax.rates.manage` — Platform Admin creates draft rates.
- `tax.rates.approve` — Platform Admin only; activates and supersedes rates.
- `company.tax_profile.read` — company members of the same tenant + Platform Admin.
- `company.tax_profile.manage` — company owner/admin only; VAT number changes require re-verification.

Platform Admin **does not** get `publish-on-behalf` from this permission set. R-D7 remains open and must be closed before any admin-side publish action.

---

## 11. Future Order Snapshot (design only)

When checkout is later re-enabled, each order line must capture an **immutable snapshot**:

- `destination_country_code`
- `tax_category_id`
- `tax_rate_version_id`
- `rate_basis_points`
- `gross_unit_amount_cents`
- `net_unit_amount_cents`
- `tax_unit_amount_cents`
- `currency`
- `rounding_result` (e.g. algorithm identifier + residual cents)
- `legal_seller_company_id` + `legal_seller_vat_number_hash` (hash, not the raw number)
- `legal_seller_vat_country_code`

Invoices and refunds must read from this snapshot, **never** from the current `tax_rate_versions` at read time. Refunds after a rate change must use the original snapshot rate.

No order-schema change is made now.

---

## 12. Edge Cases (must be handled by M1B-2B implementation and later stages)

| # | Case | Publication effect | Purchase effect |
|---|---|---|---|
| 1 | Product without classification for a destination | Not publishable for that destination | Blocked |
| 2 | Destination has no active rate for the category | Not publishable | Blocked |
| 3 | Rate expired between page view and checkout | — | Blocked; user shown re-priced value or refusal |
| 4 | New rate starts at midnight while cart is open | — | Recompute at checkout; if gross changes, require re-confirm |
| 5 | Store currency ≠ destination currency (post-MVP) | Not publishable in that destination | Blocked |
| 6 | Destination country changes during checkout | — | Recompute; re-verify; may block |
| 7 | Bundle mixes categories | Not publishable until per-line categorisation supported | Blocked |
| 8 | Voucher / discount allocation | — | Allocate discount pro-rata across lines using each line's own rate; snapshot per line |
| 9 | Shipping VAT | Shipping fee inherits category per jurisdiction rule (deferred to M1B-4) | Blocked if unresolved |
| 10 | Refund after rate change | — | Use order snapshot rate, not current |
| 11 | Price row created under an older rate version | Requires seller repricing before publication if rate superseded | Blocked at checkout |
| 12 | Product reclassified standard↔reduced | Existing prices marked stale; publication requires repricing under new classification | Blocked until seller re-prices |
| 13 | Reverse-charge / outside-scope categories | Not eligible for B2C publication in MVP | Blocked in MVP |
| 14 | Seller VAT registration lapses | Halts new publication; existing published listings paused | Purchase blocked |

Distinction: cases 1, 2, 5, 7, 11, 12, 13, 14 block **both** publication and purchase. Cases 3, 4, 6, 8, 9, 10 block **purchase only** or require recomputation.

---

## 13. Test Plan (for M1B-2B implementation, not run now)

Structural / policy:
1. No overlapping `active` rate versions per `(country, category)`.
2. Invalid country code rejected.
3. `rate_basis_points` out of `[0, 10000]` rejected.
4. `zero_rated` category cannot be created with `treatment='exempt'` (categories distinct).
5. Active row cannot be updated except `valid_to` closure by supersession.
6. Superseded row remains readable, immutable.
7. Product classification isolated per country — inserting NL row does not affect BE evaluation.
8. Seller cannot INSERT/UPDATE rows in `tax_rate_versions` (RLS + grants).
9. General admin without `tax.rates.approve` cannot activate a draft rate.
10. Product without any active classification cannot transition its publication to `ready`.
11. Price row without pinned `tax_rate_version_id` is rejected (M1B-3 test).
12. Expired rate causes checkout to block (checkout-stage test, deferred).
13. Destination-country change forces re-derivation (deferred).
14. Order snapshot immutable when rate changes later (deferred).
15. No customer PII stored in tax tables.
16. No `anon` grants on any tax table.
17. Bol `channel_*` rows untouched by tax migration (0 mutation).
18. Inventory tables untouched.
19. `borvat_direct_listing_publications` transitions untouched — all rows remain `not_ready`.
20. No checkout activation.
21. `vat_number` never returned by any RPC exposed to `anon`.
22. Non-tenant company cannot read another company's `company_tax_profiles` row.
23. Platform Admin READ access respects R-D7 (no audit-write on read is expected at this stage; consistent with M1A #2D-2A).

---

## 14. Impact on Current Risks

- **R-P1 — Pricing/Tax/Shipping incomplete:** M1B-2B closes the Tax leg. Pricing (M1B-3) and Shipping (M1B-4) remain open. **R-P1 stays open** until all three legs land.
- **R-P2 — No publication transition audit:** Not addressed here. Tax data is separate from publication state.
- **R-P3 — No seller publish workflow:** Not addressed here.
- **R-P4 — No public visibility evaluator:** Not addressed here.
- **R-5 — Audit rollback on RPC exception:** Still blocks any Seller publish RPC. Tax RPCs will inherit the same limitation; document, do not fix in Tax scope.
- **R-D7 — Admin actions not application-audited:** Blocks `tax.rates.approve` and `tax.classifications.approve` from being wired up as Platform-Admin write RPCs until closed. M1B-2B may create the **tables and READ paths**, but write/approve RPCs are gated on R-D7 closure.
- **R-D8 — Live role-revocation flight not executed:** Blocks live storefront; does not block Tax schema itself.

None of these are addressed in this precheck; only their downstream gating is recorded.

---

## 15. Required (Future) Migrations, RLS, RPCs

For M1B-2B (design summary, DO NOT execute):

- **Migration content:**
  - Create `public.tax_categories`, `public.tax_rate_versions`, `public.catalog_product_tax_classifications`, `public.company_tax_profiles`.
  - GRANT block per public-schema rules (SELECT to `authenticated` on categories + rate versions; classification SELECT scoped by RLS to same company + platform admin; tax profile SELECT scoped to same company + platform admin; no `anon` grants anywhere).
  - `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all four.
  - Policies: read-only for `authenticated`, tenant-scoped for classifications and profiles; no client write policies (all mutations via SECURITY DEFINER RPCs).
  - Seed `tax_categories` with the fixed six codes.
  - Effective-dating exclusion + validation triggers.
- **RPCs (READ-only initially, pending R-D7 for approval writes):**
  - `list_tax_categories()` — public authenticated read.
  - `list_active_tax_rates(country_code text)` — public authenticated read.
  - `seller_list_product_tax_classifications(product_id uuid)` — tenant-scoped.
  - `seller_propose_product_tax_classification(...)` — draft only; audit via `agent_audit_log`.
  - `company_get_tax_profile(company_id uuid)` — tenant-scoped; `vat_number` masked to last 2 chars for non-owner members.
  - Admin approve/manage RPCs deferred until R-D7 closed.

Zero side-effects on: `channel_*`, inventory, publications, orders, checkout, `products` legacy table.

---

## 16. Confirmation — No Changes Made

- No migration submitted.
- No table created.
- No column altered.
- No rate inserted.
- No RPC created.
- No RLS policy touched.
- No UI added.
- All existing invariants preserved: `place_order` remains locked (P5-HF-001), Bol Live disabled, Stripe Live disabled, all publications rows remain `not_ready` (currently zero rows).

---

## 17. Decision Log Entry

**BOR-DEC-045 — TAX FOUNDATION PRECEDES MERCHANT STORE PRICING**

Rationale: Borvat store prices are gross/VAT-inclusive and must pin an official `tax_rate_version_id`. Creating pricing tables before the tax foundation would either (a) force a fake or nullable `tax_rate_version_id` FK, breaking source-of-truth integrity, or (b) require a later disruptive migration to backfill tax pinning on live price rows. Executing Tax first eliminates both risks.

Consequence: the M1B roadmap sequence is amended to **M1B-2A (this precheck) → M1B-2B (Tax implementation) → M1B-3 (Merchant Store Pricing) → M1B-4 (Shipping)**. No Owner-visible feature is delayed by this reordering because none of Pricing/Shipping/Publish/Storefront have started.

---

## Final Verdict

**SAFE TAX FOUNDATION DESIGN IDENTIFIED**

Halted. No Tax implementation, Pricing, Shipping, Publication workflow, or Public Storefront work will begin without a separate Owner authorization.
