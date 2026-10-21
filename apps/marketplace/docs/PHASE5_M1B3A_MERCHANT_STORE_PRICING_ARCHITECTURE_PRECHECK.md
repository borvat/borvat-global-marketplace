# PHASE 5 — M1B-3A: MERCHANT STORE PRICING FOUNDATION — ARCHITECTURE PRECHECK

**Status:** ANALYSIS AND DESIGN ONLY — NO MIGRATION, NO SCHEMA, NO DATA.
**Date:** 2026-07-26
**Governance:** BORVAT_MASTER_BLUEPRINT_V1.md, BORVAT_CURRENT_STATE_V1.md, BORVAT_DECISION_LOG_V1.md
**Predecessors:** M1B-1 (publication state), M1B-2A/2B (tax foundation).
**Successor gate:** M1B-3B implementation is BLOCKED until Owner authorises it separately.

---

## 0. Executive verdict

**SAFE PRICING FOUNDATION DESIGN IDENTIFIED — PRICING MODEL REQUIRES DESTINATION-COUNTRY DECISION.**

- Recommended relationship: **Option B** — price row keyed by `merchant_store_id + catalog_sku_id`, independent of channel_listing lifecycle.
- Recommended destination model: **Model 1** — one **Country-specific gross price** per (store, sku, destination_country, currency), with a pinned `tax_rate_version_id`.
- Money: `gross_amount_minor BIGINT` + `currency_code CHAR(3)` (ISO 4217). No floats. No NULL-as-free.
- Alpha scope: destinations `NL`, `BE`; currency `EUR`.
- Price lifecycle: `draft → active → superseded | withdrawn`. Immutable once active; changes via new version.
- Overlap protection: exclusion constraint (btree_gist already installed in `extensions`) on `(merchant_store_id, catalog_sku_id, destination_country, currency_code)` with `daterange(valid_from, valid_to, '[)')` **only for `status='active'`**.
- Legacy `products.price_cents` / `order_items.price_cents` / Bol / auction / wholesale price paths REMAIN UNCHANGED and are NOT sources of truth for Borvat Direct.
- No implementation, no seed VAT rates, no seller/admin UI, no checkout wiring in this step.

---

## 1. Current pricing schema assessment (read-only inspection)

### 1.1 Fields discovered in the live schema

| Field | Table | Purpose (as used today) | Classification for Borvat Direct |
|---|---|---|---|
| `price_cents` | `public.products` | Legacy MVP retail price used by storefront cards, cart, `place_order`, seller dashboard. | **LEGACY / PRE-TENANCY.** Not tenant-scoped by store. Do **NOT** reuse as SoT. |
| `original_price_cents` | `public.products` | Optional "compare-at" strikethrough. | **LEGACY MARKETING FIELD.** Not part of foundation. |
| `price_cents` | `public.order_items` | Historical snapshot at time of order (P5-HF-001 froze `place_order`). | **HISTORICAL SNAPSHOT.** Immutable, keep untouched. |
| `bundle_price_cents` (if any on `catalog_offers`) | `public.catalog_offers` | Catalog offer composite pricing (Phase 2). | **CATALOG-LEVEL / COMPOSITE.** Not per-store retail. Out of scope. |
| Bol offer price fields | `public.channel_imported_offers`, `public.channel_listings` metadata | Prices imported from / dispatched to Bol; per-channel. | **CHANNEL-SPECIFIC (BOL).** Not portable to Borvat Direct. |
| `cost_*` / acquisition cost (if any on catalog) | catalog tables | Seller cost, margin analytics. | **COST DOMAIN — NEVER in public price table.** |
| Auction bid/hammer amounts (planned) | future | Auction pricing model differs by design. | **OUT OF SCOPE.** |
| Wholesale prices (planned) | future | B2B tier. | **OUT OF SCOPE.** |
| Minimum / floor prices | none today | — | **OUT OF SCOPE for M1B-3.** |
| Discounts / promotions | none today | — | **OUT OF SCOPE for M1B-3.** |
| Checkout total calculation | `place_order` (frozen), cart UI | Uses `products.price_cents * qty`. | **LEGACY / FROZEN.** Not to be reused. |
| Stripe amount creation | not enabled | — | **NOT ACTIVE.** |

### 1.2 Duplicate-source-of-truth risks

- `products.price_cents` is globally unique per product row (no store/country/currency dimension). Using it for Borvat Direct would defeat multi-store pricing and break VAT versioning.
- `channel_imported_offers` price columns are Bol truths, not Borvat Direct truths.
- `catalog_offers` describes composition, not retail listing price per store.

**Conclusion:** No existing field is a valid retail SoT for Borvat Direct. A new dedicated table is required.

### 1.3 Legacy isolation invariants (must hold)

- No backfill from `products.price_cents` or `order_items.price_cents`.
- No mutation of Bol, auction, wholesale, catalog, or inventory-valuation prices.
- No change to existing checkout / cart / `place_order` (P5-HF-001 intact).
- No change to storefront legacy cards' price rendering; they continue to read `products.price_cents` **until** a later phase migrates the public storefront to the new SoT.

---

## 2. Required scope of the new pricing foundation

The foundation MUST support:

1. Different price per merchant store for the same SKU.
2. Same SKU in more than one store with independent prices.
3. Displayed price includes VAT (gross).
4. Explicit currency (ISO 4217).
5. Effective dates and full version history.
6. Destination country dimension.
7. Pinned `tax_rate_version_id` per active price row.
8. Historical prices are immutable — never silently mutated.
9. No overlapping active prices for the same (store, sku, destination, currency).

---

## 3. Core relationship — Options A / B / C

### Option A — Price linked to `channel_listing_id`

- **Pros:** Automatic channel isolation; store ownership derivable via listing → account → store; simple publication eligibility join.
- **Cons:** Prices die with listings; re-creating a listing loses price history; risk of orphaned prices on archived listings; couples commercial truth to listing lifecycle (a Bol-side lifecycle concept even if borvat_direct's own).

### Option B — Price linked to `merchant_store_id + catalog_sku_id` (**RECOMMENDED**)

- **Pros:** Price survives listing recreation; store catalog manageable independent of publication; one clear SoT for "the store's price of this SKU"; publication join is `(store,sku) → listing → publication`.
- **Cons:** Prices can exist without a listing (acceptable — treated as `not_ready` for publication); requires explicit consistency check that (store, sku) matches the listing's account when publishing.

### Option C — Price linked to publication row

- **Pros:** Tight coupling to what the customer sees.
- **Cons:** **REJECTED** — binds commercial truth to publication lifecycle; withdrawing publication would either destroy the price or force a bespoke retention rule; violates separation between commercial state and visibility state established in M1B-1.

**Recommendation: Option B.** Guard trigger on publication activation enforces: publication's listing.account.merchant_store_id == price.merchant_store_id AND listing.catalog_sku_id == price.catalog_sku_id.

`company_id` MAY be denormalised into the price row **only** to enable a fast RLS predicate (`is_company_member(price.company_id, auth.uid())`) with a CHECK/trigger asserting `company_id == (select company_id from merchant_stores where id = price.merchant_store_id)`. Prefer a SECURITY DEFINER helper `_price_can_manage(price_id)` and skip the denormalisation if the helper is cheap enough.

---

## 4. Destination-country problem — Models 1 / 2 / 3

### Model 1 — Country-specific gross prices (**RECOMMENDED**)

- One price row per (store, sku, destination_country, currency).
- Row carries `destination_country`, `gross_amount_minor`, `tax_rate_version_id` pinned.
- Product page shows the price for the visitor's currently-selected/inferred country (default NL for Alpha). Country switch re-fetches; if no active row for the new country → **not for sale in that country**.

### Model 2 — One gross price across destinations

- Single gross amount; VAT resolved at checkout.
- **REJECTED** — cannot pin `tax_rate_version_id` in the price row (multiple candidate versions per country); seller margin fluctuates silently when VAT changes; violates the "displayed price is trustworthy" contract.

### Model 3 — Base net + destination VAT

- Displayed gross derived at render time.
- **REJECTED** — contradicts B2C requirement that product page shows a stable gross figure; makes rounding drift across pages likely; complicates promotions and refunds.

### Behaviour under Model 1

- **Before address known:** page shows price for the default destination (NL for Alpha), with clear country label.
- **Destination change in checkout:** re-price against the destination's active row. If missing → block purchase for that destination; suggest available destinations.
- **Gross stays fixed** once destination is chosen; net/tax derived from the pinned rate.
- **Seller margin difference across countries:** explicit and visible (feature, not bug).
- **Product page trust:** the displayed gross is exactly what will be charged for that destination.
- **Purchase blocked when:** no active price row for (store, sku, destination, currency) at `now()`; or pinned `tax_rate_version` no longer valid at `now()`; or price status ≠ active.

---

## 5. Money representation

- `gross_amount_minor BIGINT NOT NULL CHECK (gross_amount_minor > 0 AND gross_amount_minor <= 100_000_000_00)` — i.e. > 0 and ≤ €100M sanity ceiling.
- `currency_code CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$')`. Alpha allowlist enforced via CHECK `currency_code IN ('EUR')` **at row-level**; the column itself is designed to be re-openable to more currencies without schema change.
- No floats, no numeric.
- No NULL semantics for "free".
- Zero and negative prices rejected.
- Currency is part of the overlap key so future multi-currency does not require redesign.

---

## 6. Price state model

States (separate column, distinct from publication status):

- `draft` — editable; not usable for publication or purchase.
- `active` — immutable; usable if `valid_from <= now() < valid_to`.
- `superseded` — historical; replaced by a newer active version (`supersedes_price_id` chain).
- `withdrawn` — permanently removed from future use; retained for order-history reference.

Rules:

- Transition `draft → active` requires all §8 tax-pinning integrity checks to pass.
- `active` rows are append-only; any change ⇒ new draft that, on activation, supersedes the prior active row (auto-set `valid_to = now()` on the predecessor within the same transaction).
- `withdrawn` cannot be re-activated.
- Price status ≠ publication status. A listing may have an active price and still be `not_ready` for publication (missing tax, missing shipping).

---

## 7. Effective dating

Fields (design intent — not created here):

- `valid_from TIMESTAMPTZ NOT NULL`
- `valid_to   TIMESTAMPTZ NULL`  (NULL ⇒ open-ended; represented in `daterange` as unbounded upper)
- `status`
- `supersedes_price_id UUID NULL REFERENCES <self>`
- `version INT NOT NULL` (monotonic per (store, sku, destination, currency))
- `created_at`, `updated_at`

**Overlap key (for future exclusion constraint, NOT created in M1B-3A):**

```
EXCLUDE USING gist (
  merchant_store_id      WITH =,
  catalog_sku_id         WITH =,
  destination_country    WITH =,
  currency_code          WITH =,
  daterange(valid_from, valid_to, '[)') WITH &&
) WHERE (status = 'active')
```

- Uses `btree_gist` already installed in `extensions` (BOR-DEC-047).
- Draft rows do not participate (mirrors tax-foundation pattern).

---

## 8. Tax-pinning integrity

At `draft → active` transition, validate atomically:

1. `tax_rate_version_id` exists and its status = `approved`.
2. Its `country` matches `destination_country`.
3. Its effective window covers `[valid_from, valid_to)` (or at least `valid_from` if open-ended and rate is open-ended too; otherwise force explicit shortening).
4. The SKU's active `catalog_product_tax_classifications` row for `destination_country` at `valid_from` resolves to the same `tax_category_id` as the rate version.
5. `zero_rated` is treated as a distinct category — never conflated with `exempt`.

Later governance:

- If a rate is later superseded, existing active price rows remain valid until their own `valid_to`; the checkout re-verification (below) will block sales past coverage.
- **Re-verification at checkout** MUST re-check that the pinned rate version still covers `now()`. If not: block purchase, require a new price version.

Enforcement points:

- Strong check at activation.
- Re-check at publication activation (M1B-6+).
- Re-check at checkout (post-M1B-4).

---

## 9. Net / tax derivation contract

- `gross` is the source of truth.
- `tax = round_half_even( gross * rate / (1 + rate), unit=minor )` per unit.
- `net = gross - tax` per unit.
- Line: compute per unit, then multiply by quantity; then re-derive line tax from line gross to avoid unit-rounding drift (choose one policy — recommend **per-line derivation** for VAT invoices).
- Order: sum line grosses = order gross; sum line taxes = order tax; identity `net + tax == gross` MUST hold at each level after rounding.
- Rounding mode: banker's rounding (half-even), minor units.
- Derived net/tax NOT stored in the price row. Order lines (future) store a full snapshot: `gross_minor`, `net_minor`, `tax_minor`, `rate_bps`, `tax_rate_version_id`, `currency_code`.

Not implemented in this precheck.

---

## 10. Discounts and promotions boundary

- **In scope for M1B-3:** base prices only.
- **Out of scope:** `sale_price`, coupons, vouchers, promo codes, compare-at, BOGO, quantity tiers.
- A future `promotions` domain will attach adjustments as separate rows referencing a base price; the active base row is never mutated to reflect a temporary discount.
- Compare-at pricing requires legal review (EU Directive 2019/2161 / Omnibus) before design.

---

## 11. Cost and margin boundary

- Customer gross price lives in the pricing table.
- Seller acquisition cost, platform fees, shipping cost, margin floors live **elsewhere** (future `seller_costs`, `platform_fees`, `shipping_costs` domains).
- No `cost_*` column in the public pricing table.
- Minimum-margin gate is a future policy — deferred, no RPC in this phase.

---

## 12. Shipping relationship

- Shipping is separate. `gross_amount_minor` in a price row is the product gross only.
- Shipping profile (free / free-above-threshold / flat / zone / weight) will be modelled in M1B-4.
- VAT on shipping is deferred to M1B-4 / checkout design.
- No `shipping_*` column in the base price row.

---

## 13. RLS and permissions model (design only)

Logical permissions:

- `pricing.read` — seller reads own company's prices; platform admin reads all (via SECURITY DEFINER RPC only, following M1A #2D-2A pattern).
- `pricing.manage` — seller creates/edits drafts within own company.
- `pricing.activate` — seller activates drafts. **BLOCKED by R-5** (denied-write audit rollback) — no seller activation RPC in M1B-3B; activation RPC deferred to a phase after R-5 architecture is fixed.
- `pricing.withdraw` — seller withdraws own active prices.

Cross-tenant rules:

- Platform admin does **not** override or approve prices on behalf of a seller (R-D7).
- Platform admin reads only, via dedicated SECURITY DEFINER RPCs.
- `service_role` for backfills/edge only.
- `anon`, `sandbox_exec`: no access.

Grants (design intent for M1B-3B):

- `GRANT SELECT ON public.merchant_store_prices TO authenticated` — narrowed by RLS to seller's own company.
- No INSERT/UPDATE/DELETE to `authenticated` on the raw table; all writes via SECURITY DEFINER RPCs (`create_price_draft`, `update_price_draft`, `withdraw_price` — later phases).
- `GRANT ALL ... TO service_role`.
- `anon`, `sandbox_exec`: none.

---

## 14. Publication eligibility impact

Future eligibility predicates the publication engine will require:

1. Price row exists for (store, sku, destination, currency).
2. `status = active`.
3. `valid_from <= now() < valid_to`.
4. Currency in supported set.
5. Destination in supported set.
6. Gross > 0 and within sanity range.
7. Pinned `tax_rate_version_id` still effective at `now()`.
8. SKU's `catalog_product_tax_classifications` row for destination still active and matches the pinned category.
9. Store owns the listing; listing's SKU matches price's SKU.
10. No overlapping active price rows.

Price existence alone does NOT flip publication to `ready`. Shipping and approved tax data are still required. Publication rows stay `not_ready`.

---

## 15. Legacy isolation (reaffirmed)

- `products.price_cents`: untouched.
- `order_items.price_cents`: untouched (historical snapshots).
- Bol prices: untouched.
- Auction prices: untouched.
- Wholesale prices: untouched.
- Inventory valuation: untouched.
- Existing checkout / cart / `place_order`: untouched (P5-HF-001 remains).
- Storefront card rendering: unchanged; the new SoT is not consumed until a later phase.

---

## 16. Edge cases

| Case | Handling |
|---|---|
| Price = 0 | Rejected (CHECK gross > 0). |
| Negative price | Rejected. |
| Extremely high price | Rejected (CHECK ≤ ceiling). |
| Currency mismatch (row currency ≠ store/tax expectation) | Rejected at activation. |
| Expired price | Not eligible for publication or checkout. |
| Future-dated price | Present in table; not eligible until `valid_from`. |
| Two concurrent active prices | Prevented by exclusion constraint. |
| Destination changed NL → BE at checkout | Look up BE row; if none → block, offer to change destination. |
| Tax rate superseded | Existing active price valid until its `valid_to`; checkout re-verification enforces. |
| Product classification changed | New price version required for new category; old price stays for history. |
| SKU archived | New prices blocked; existing orders unaffected. |
| Store suspended | Writes blocked; reads for history allowed. |
| Listing withdrawn | Publication becomes `withdrawn` (410); price row untouched. |
| Price withdrawn after prior order | Refund reads `order_items` snapshot, not the price row. |
| Refund after price version expired | Uses order snapshot; no lookup into current price. |
| Same SKU in two stores | Two independent price rows; both allowed. |
| Same store/SKU in multiple borvat_direct listings | Prevented at listing level (M1A #2B-1A uniqueness); price still keyed by (store, sku). |
| Bundle pricing | Out of scope — belongs to `catalog_offers` composition, not base price. |
| Quantity tiers | Out of scope. |
| Free product | Out of scope (would require legal review). |
| Rounding at 21% or future rates | Enforced by per-line derivation policy; no rate data introduced here. |

---

## 17. Phased roadmap

1. **M1B-3A** — Pricing architecture precheck (this document).
2. **M1B-3B** — Pricing schema and read-only baseline: create table, CHECKs, RLS, exclusion constraint, updated_at trigger, seller-scoped SELECT policy, no RPCs, no data.
3. **M1B-3C** — Official Tax data loading and governance precheck (rate versions authored by platform admin, approval workflow design; still no live rates).
4. **M1B-3D** — Seller price draft workflow (draft CRUD RPCs; still no activation).
5. **M1B-3E** — Price activation workflow — **BLOCKED until R-5 (denied-write audit rollback) is architecturally resolved**.
6. **M1B-4** — Shipping foundation.
7. **M1B-5+** — Publication activation, storefront exposure, checkout re-enable.

No step beyond M1B-3A is authorised now.

---

## 18. Required migrations / RPCs (design intent for later phases)

For M1B-3B (NOT executed in this precheck):

- 1 CREATE TABLE `public.merchant_store_prices` — columns per §4–§7 + `id`, `company_id` (denormalised guard-checked), `created_at`, `updated_at`.
- CHECK constraints per §5, §6.
- FK to `merchant_stores`, `catalog_skus`, `tax_rate_versions` (with `ON DELETE RESTRICT`).
- Exclusion constraint per §7.
- Grants per §13.
- RLS ENABLE + FORCE; SELECT policy `is_company_member(company_id, auth.uid())`.
- `trg_merchant_store_prices_updated_at`.
- No RPCs. No data. No seller UI. No admin UI.

For M1B-3D (later):

- `public.create_merchant_store_price_draft(...)` SECURITY DEFINER.
- `public.update_merchant_store_price_draft(...)` SECURITY DEFINER.
- `public.withdraw_merchant_store_price(...)` SECURITY DEFINER.
- All owner-or-manager gated, idempotency-key safe, no mass-assignment.

---

## 19. Test plan (for M1B-3B, later)

Behavioural (inside SAVEPOINT rollback, SECURITY DEFINER test function then dropped):

1. Table exists with expected columns and CHECKs.
2. RLS enabled + FORCE.
3. `anon`: 0 privileges.
4. `sandbox_exec`: 0 privileges on the new table.
5. `authenticated`: SELECT only.
6. Seller in company A cannot SELECT price of company B.
7. Draft row insert allowed by service_role; active insert with valid pin succeeds.
8. Overlap with an existing active row rejected with SQLSTATE `23P01`.
9. Overlap with a draft row: allowed (draft not in constraint).
10. Different destination_country: accepted.
11. Different currency_code: accepted (design-open even if Alpha CHECK narrows currency).
12. Gross = 0 rejected; negative rejected; > ceiling rejected.
13. Bad ISO country rejected; bad currency rejected.
14. `tax_rate_version_id` pointing to non-approved rate rejected at activation.
15. Country of price ≠ country of pinned rate rejected.
16. `valid_from >= valid_to` rejected.
17. `supersedes_price_id` FK integrity.
18. `updated_at` trigger fires.
19. `products.price_cents` unchanged after all tests (legacy isolation invariant).
20. No `channel_listings`, `borvat_direct_listing_publications`, `channel_accounts`, `merchant_stores` row modified.
21. Bol Live still 0 rows with `live_authorized_at`; Stripe Live disabled.

---

## 20. Residual risks

- **R-P1 — Country widening pressure.** Alpha is NL/BE. Adding new destinations requires per-country price rows; sellers must be warned in later UI phases.
- **R-P2 — Currency widening pressure.** Alpha is EUR. Widening requires ISO 4217 allowlist update and rounding review per currency.
- **R-P3 — Legacy storefront still reads `products.price_cents`.** Until the storefront cutover, there are two visible price surfaces (legacy vs. new). Mitigation: keep the new SoT hidden from public storefront until M1B-5+.
- **R-P4 — Seller activation RPC blocked by R-5.** Denied-write audit rollback semantics must be fixed before any seller-facing activation RPC is written.
- **R-P5 — Cross-tenant admin write pressure.** R-D7 forbids admin price override; likely to be requested for support cases. Design position: refuse; instead, provide a support-log RPC that opens a ticket, no direct write.
- **R-P6 — Checkout re-verification not yet in scope.** Until re-verification exists, the pinned-rate contract cannot be honoured at purchase time; therefore checkout stays offline (P5-HF-001 intact).
- **R-P7 — Rounding policy re-derivation at line level.** Per-line vs per-unit rounding choice will lock behaviour for VAT invoices; must be signed off at M1B-3B.
- **R-P8 — Two-session concurrent activation race.** Exclusion constraint enforces it at PostgreSQL level; a live two-session test has not been executed and is deferred (mirrors the tax-foundation R-T6 correction).

---

## 21. Confirmation of no changes

- No migration executed.
- No table created.
- No row inserted.
- No RPC created.
- No RLS policy created.
- No grant changed.
- No UI added.
- P5-HF-001 intact.
- Bol Live and Stripe Live remain disabled.

---

## 22. Decision to record

**BOR-DEC-048 — STORE PRICING REQUIRES COUNTRY-AWARE GROSS PRICE VERSIONING**

- Borvat Direct retail prices are stored as country-specific gross amounts.
- Keyed by `(merchant_store_id, catalog_sku_id, destination_country, currency_code)` with effective dating and pinned `tax_rate_version_id`.
- Legacy `products.price_cents` and `order_items.price_cents` remain untouched and are not sources of truth for Borvat Direct.
- Implementation deferred to a separate authorised step (M1B-3B).

---

## 23. Final verdict

**SAFE PRICING FOUNDATION DESIGN IDENTIFIED — PRICING MODEL REQUIRES DESTINATION-COUNTRY DECISION.**

Awaiting Owner authorisation before proceeding to M1B-3B.
