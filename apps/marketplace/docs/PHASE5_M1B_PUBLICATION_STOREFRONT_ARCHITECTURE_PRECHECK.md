# PHASE 5 · M1B — Borvat Direct Publication & Public Storefront Architecture Precheck

**Status:** READ-ONLY ANALYSIS. No migration applied, no RPC created, no UI
implementation, no data mutated, no publication path activated, no live sale
enabled.
**Scope authority:** Owner authorisation "M1B PRECHECK — BORVAT DIRECT
PUBLICATION AND PUBLIC STOREFRONT ARCHITECTURE" (analysis and design only).
**Author:** Lovable agent.
**Related:** BOR-DEC-031..043; Phase 2 M3 (channel_listings); M1A #2B-1
(Borvat Direct draft listing write path); M1A #2D-2B (Platform Admin read UI).

---

## 0. Confirmation of non-mutation

- Zero `INSERT` / `UPDATE` / `DELETE` / `ALTER` / `CREATE` executed against
  the database in this precheck. All observations derive from `pg_catalog`,
  `information_schema`, prior precheck reports, and repository file reads.
- No file under `supabase/migrations/` added or modified.
- No RPC, worker, edge function, or outbox handler invoked.
- `place_order` remains EXECUTE-revoked (P5-HF-001). Bol live remains
  unauthorised. Stripe live remains unauthorised. No storefront route added.

---

## 1. Current schema assessment (relevant subset)

### 1.1 Publication-adjacent tables

| Table | Purpose today | Publication relevance |
|---|---|---|
| `catalog_products` | Product identity (`title`, `brand`, `description`, `category_id`, `status ∈ {draft,active,inactive,archived}`) | Truth for product name/brand/description. No pricing, no tax, no shipping, no media. |
| `catalog_skus` | SKU identity (`code`, `tracking_mode`, `status`) tied to a product | Truth for the sellable unit. No weight, no dimensions, no barcode. |
| `catalog_offers` | Company-level offer wrapping a SKU or set (`offer_type`, `quantity_per_offer`, `status`) | Provider-agnostic offer object. No price on the row. |
| `catalog_offer_components` | Composition of an offer | Needed only for bundles; irrelevant for MVP single-SKU publication. |
| `merchant_stores` | Storefront identity (M1A #1): brand, currency, locale, status | Store-side eligibility root. Terms/return/shipping policy fields are NOT yet modelled. |
| `channel_accounts` | Provider account (extended in M1A #2A with `merchant_store_id`) | Borvat Direct account is the publication surface for a store. |
| `channel_listings` | Publication of a SKU/Offer onto a channel account (status, control_state, published_quantity, published_version) | The publication row itself. **Bears no price, no tax, no shipping, no media, no compliance data.** |
| `products` (legacy) | Legacy storefront table used by demo `/`, `/product.$id`, `/search` | Distinct from `catalog_products`. **Must not be re-used as Borvat Direct publication truth**; would create duplicate source of truth. |
| `inventory_balances` / `inventory_lots` / `inventory_reservation_*` | Inventory truth (Phase 2 M3) | Available quantity is derived here, not on the listing. |

### 1.2 Missing model surfaces (not present anywhere today)

1. Price for a Borvat Direct listing (currency, gross/net, effective dates,
   tax version pin).
2. Tax category / VAT rate / rate-version snapshot on SKU or listing.
3. Shipping policy per store (free / threshold / flat / weight-zone).
4. Product media (image URLs / alt text) on `catalog_products` — legacy
   `products.image_url` is not linked.
5. Compliance data (weight, dimensions, HS code, brand-owner attestation).
6. Terms of sale / return policy / delivery-time promise on `merchant_stores`.
7. Explicit "customer visibility" and "publication" fields (see §2).

None of these gaps are blockers for a design-only precheck; they are the
foundations M1B-2..M1B-4 must lay.

---

## 2. Publication state model

### 2.1 Fields available on `channel_listings` today

- `status ∈ p2_lifecycle_status = {draft, active, inactive, archived}`.
- `control_state ∈ p2_channel_control_state = {read_only_import, shadow, active, paused}`.
- `published_quantity`, `published_version`, `last_published_at`.

### 2.2 Are these sufficient to distinguish {draft, ready, published, paused, archived}?

**No — not without semantic overloading.** Analysis:

- `status='draft'` maps cleanly to *draft*.
- `status='archived'` maps cleanly to *archived*.
- `status='active'` conflates *ready* (validated, publishable, awaiting
  publish action) with *published* (customer-visible now). Two very
  different lifecycle points.
- `status='inactive'` conflates *paused-by-seller*, *paused-by-admin*, and
  *policy-forced-unpublished* (see §10). Root cause is not recoverable from
  the row.
- `control_state` was designed for **external channel** dispatch semantics
  (Bol read-only import, shadow sync, active sync, paused sync). Reusing it
  for a **customer-visibility** signal on Borvat Direct would (a) overload
  the enum with two orthogonal meanings and (b) risk cross-provider
  reasoning bugs later. **Do not repurpose `control_state`.**

### 2.3 Recommended additive shape (design only)

Introduce a small, additive publication-visibility layer, orthogonal to
`status`:

- `publication_status text CHECK ∈ {unpublished, ready, published, force_hidden}`
  — Borvat Direct-only column; NULL for all non-Borvat-Direct rows.
- `published_at timestamptz` — set on transition to `published`.
- `unpublished_at timestamptz` — set on transition away from `published`.
- `unpublish_reason text` — e.g. `seller_paused`, `stock_zero`,
  `store_suspended`, `price_expired`, `admin_pause`, `compliance_hold`.
- `customer_visible_at timestamptz` (optional; can be derived on read).

Alternatively, model publication as an **append-only publication event
ledger** (`channel_listing_publication_events`) with a materialised view
projecting the current visibility. This preserves the append-only ledger
discipline used elsewhere (inventory, outbox).

**Decision deferred** — both are viable; the ledger form is stronger for
audit (closes part of R-D7 for publication actions) but requires one more
migration than the additive-columns form.

**No table modification is being applied in this precheck.**

### 2.4 `control_state` verdict for Borvat Direct

Keep at `'paused'` (fail-closed) for all Borvat Direct rows until a
Borvat Direct publish RPC is separately authorised. The concept of
"external control" is meaningless for an internal channel; forcing the
value to `'paused'` prevents any future generic worker from mistaking a
Borvat Direct row for an active external sync target.

---

## 3. Eligibility gates (design)

A single fail-closed gate function (call it `borvat_direct_publication_eligibility(listing_id)`)
must return `{eligible boolean, blocking_reasons text[]}`. Minimum
predicates, all AND-composed, all evaluated server-side:

### 3.1 Store predicates
- `merchant_stores.status = 'active'`.
- `merchant_stores.currency IS NOT NULL` and in an allowlist (`EUR` for
  MVP).
- `merchant_stores.locale IS NOT NULL` and in allowlist (`nl-NL`, `nl-BE`).
- Store not suspended or closed (requires `suspended_at`, `closed_at`
  columns — additive, M1B-1).
- Terms of sale document reference present (additive column).
- Return policy document reference present (additive column).
- Store is bound to at least one Borvat Direct account.

### 3.2 Account predicates
- `channel_accounts.provider = 'borvat_direct'`.
- `channel_accounts.merchant_store_id = <listing store>`.
- `channel_accounts.external_account_id IS NULL` (invariant for internal
  channel).
- `channel_accounts.status ∈ {active, draft}` and account not marked
  `paused_hard`.
- No pending Bol/OAuth credentials attached (defensive; not expected).

### 3.3 Product / SKU predicates
- `catalog_products.status = 'active'`.
- `catalog_skus.status = 'active'`.
- `catalog_products.title` non-empty, length ≤ 250.
- Media: ≥1 image URL on an allowlisted host (requires additive
  `catalog_product_media` table or `product_media` link — M1B-1 or M1B-5).
- Brand present when category requires it (compliance rules TBD per
  category).
- Weight and dimensions present when a shipping profile requires them.
- Tax category present (see §6).
- `catalog_products.company_id = merchant_stores.company_id` (already
  enforced by validate-refs trigger).

### 3.4 Listing predicates
- `channel_listings.status = 'draft'` at the moment of publish call.
- `channel_listings.sku_id IS NOT NULL` AND `offer_id IS NULL` (single-SKU
  MVP; XOR trigger already enforces exactly one).
- No other Borvat Direct listing on the same `(merchant_store_id, sku_id)`
  is currently `publication_status='published'` (uniqueness of
  customer-visible listing per store×SKU — additive partial unique index
  in M1B-1).
- Deterministic `external_listing_id` matches the M1A #2B-1 format
  (`borvat_direct:sku:<catalog_sku_id>`).

### 3.5 Price / Tax / Shipping predicates
See §4, §6, §7. These belong to the same gate function but require
foundations laid in M1B-2..M1B-4.

**All predicates must evaluate to true. Any single false predicate blocks
publication.** No override path is authorised in this precheck.

---

## 4. Pricing — source-of-truth options (analysis only)

### 4.1 Options

**A. Add `price_cents` + `currency` on `channel_listings`.**
- Pros: minimal migration; one row per publication.
- Cons: mixes channel projection with commercial truth; forbids one SKU
  having a different price on two future channels; no history; no
  effective dates; no tax-version pin.
- Verdict: rejected as *only* pricing surface.

**B. Add `price_cents` on `catalog_offers`.**
- Pros: aligns with existing "offer" concept; provider-agnostic.
- Cons: no per-store price differentiation; no history; no effective
  dates.
- Verdict: acceptable only if per-store pricing is explicitly out of
  scope for MVP.

**C. New `merchant_store_offer_prices` table (recommended).**
- Shape: `(merchant_store_id, sku_id, price_cents_gross, currency,
  tax_rate_version_id, effective_from, effective_to NULL, created_by,
  created_at)`, append-only.
- Pros: per-store price, historical audit, EU VAT-inclusive by design,
  compatible with future promotion pricing, easy rollback via
  `effective_to`, natural key for reconciliation.
- Cons: one additional table + one materialised current-price view; more
  RPCs.

**Recommendation:** **Option C**, adopted in M1B-2. B may serve as a
transitional carrier if C is delayed, but B should not become permanent.

### 4.2 Business-rule constraints (all mandatory before customer visibility)

- Displayed price = **gross, VAT-inclusive** (EU B2C rule; Borvat Master
  Blueprint core rule).
- Currency stored as ISO-4217; MVP allowlist `EUR`.
- Tax version pin (`tax_rate_version_id`) required so the displayed price
  is reproducible if the rate table changes.
- Effective dates: `effective_from ≤ now() < COALESCE(effective_to, ∞)`.
- Minimum-margin / floor-price rule: **not modelled in MVP**; recorded as
  future concern R-M1B-P1.
- Legacy `products.price_cents` in the demo storefront is **not**
  authoritative and must not be aliased into the Borvat Direct pricing
  path.

**No pricing table created in this precheck.**

---

## 5. Inventory — availability model

### 5.1 Sources of truth today (Phase 2 M3)

- `inventory_lots` — physical on-hand per warehouse location.
- `inventory_balances` — projection of lot totals per SKU / location.
- `inventory_reservation_headers` / `_lines` / `_allocations` — reserved
  quantity by open orders / carts.
- `inventory_transaction_entries` — append-only ledger.
- `channel_listings.channel_cap` — NULL = unlimited (Phase 2 M3 rule,
  preserved).
- `channel_listings.published_quantity` — snapshot of what was pushed to
  the channel; **not** used for internal availability decisions.

### 5.2 Definitions (canonical for M1B)

- **physical stock** = Σ `inventory_lots.quantity` for the SKU.
- **reserved** = Σ open, non-expired reservation allocations for the SKU.
- **available stock** = physical − reserved − safety_stock (safety_stock
  optional, per-SKU).
- **sellable** = MIN(available_stock, channel_cap when non-NULL).
- **published_quantity** = last quantity we asserted to the channel;
  diagnostic only for Borvat Direct.

### 5.3 Answers to mandated questions

- `published_quantity` for Borvat Direct is **snapshot only**; customer
  availability derives from `sellable`.
- **Draft listing without stock**: technically allowed to *exist*, but the
  publication gate must fail if `sellable ≤ 0` (unless backorder is
  explicitly enabled).
- **Backorder**: **NOT allowed** in MVP; recorded as future flag on
  `merchant_stores.backorder_policy`.
- **Double-subtraction prevention**: continues to rely on Phase 2 M3
  advisory locks in `place_order` (currently EXECUTE-revoked). Any new
  Borvat Direct purchase RPC must reuse the same reservation path; must
  not invent a parallel decrement.
- `channel_cap IS NULL ⇒ unlimited` remains the rule for Borvat Direct.

**No inventory schema change in this precheck.**

---

## 6. Tax requirements (minimum viable model)

Required before any customer-visible price:

- `tax_category_id` on `catalog_products` (allowlist: `standard`,
  `reduced`, `zero`, `exempt`) — additive, M1B-3.
- `tax_rate_versions(id, country, category, rate_bps, effective_from,
  effective_to NULL)` — append-only reference table.
- Store-level seller VAT identity: `merchant_stores.vat_number`,
  `merchant_stores.vat_country` — additive.
- Line-level immutable snapshot on future order line: `tax_rate_bps`,
  `tax_rate_version_id`, `tax_amount_cents_gross`, `tax_amount_cents_net`
  — belongs to M1B-8 order model, out of scope here.
- Cross-border NL↔BE: MVP treats intra-EU B2C as destination-country VAT
  under OSS (One-Stop-Shop). No OSS filing pipeline is being built; only
  the data model that would support it later.

**No tax migration in this precheck.**

---

## 7. Shipping requirements

Before customer visibility a store must have a **valid shipping policy**.
Minimum model (design only):

- `merchant_store_shipping_policies(id, merchant_store_id, kind, params
  jsonb, country_allowlist text[], effective_from, effective_to NULL)`.
- `kind ∈ {free, free_above_threshold, flat, weight_zone}`.
- `params` schema validated per `kind` (Zod on the RPC side).
- `country_allowlist` MVP: `['NL','BE']`.
- Fulfilment origin: MVP is **seller-fulfilled only** (no Borvat
  fulfilment centre yet); recorded as `fulfilment='seller'` on the
  policy row.
- Delivery estimate: display range (e.g. 2–4 werkdagen); derived from
  policy `params` at read time.
- Returns terms: link to store return-policy document (Store-level, not
  policy-level).

**Publication gate rule:** listing cannot become `published` if no
shipping policy row covers the buyer country the storefront targets.

**No shipping schema created in this precheck.**

---

## 8. Public Storefront read model — alternatives

### A. Direct read from canonical tables via public-safe RPC/view
- SoT: canonical tables (`catalog_*`, `merchant_stores`,
  `channel_listings`, price/tax/shipping tables).
- Staleness: none (read-through).
- RLS: public read implemented via `SECURITY DEFINER` RPCs granted to
  `anon` + `authenticated`, with strict allowlist and hard filters:
  `publication_status='published'` AND store active AND SKU active.
- Performance: acceptable at MVP scale; requires appropriate composite
  indexes.
- SEO/SSR: works — TanStack Start loader calls the RPC.
- Cache invalidation: none needed (always fresh); can add HTTP cache
  headers.
- Rollback: trivial (drop RPCs).
- Duplicate truth risk: **none**.

### B. Dedicated denormalised public projection (`public_storefront_listings`)
- SoT: still canonical; projection is a materialised copy.
- Staleness: refresh cadence (seconds–minutes) → risk of stale price /
  stale stock displayed at checkout.
- RLS: simplest — table is public-readable by design.
- Performance: best (single-table scan).
- SEO/SSR: excellent.
- Cache invalidation: requires triggers on 6+ upstream tables or a
  scheduled refresh job.
- Rollback: drop the table.
- Duplicate truth risk: **yes, controlled** — must never be treated as
  authoritative for price at add-to-cart / checkout.

### C. Search-index projection (e.g. `pg_trgm` / `tsvector` + facets)
- SoT: canonical.
- Staleness: as B.
- Purpose: search/browse only, not detail pages.
- Recommended **in addition to** A once traffic grows.

**Recommendation for M1B-5:** start with **A**, add **C** later for
search, defer **B** unless read pressure demands it. Never resolve
price/stock from B or C at add-to-cart.

---

## 9. Customer visibility formula

A listing is customer-visible IFF **all** of the following hold at read
time:

1. Explicit `channel_listings.publication_status = 'published'` (§2.3).
2. Latest publication-eligibility gate result is `eligible = true` (§3).
3. `merchant_stores.status = 'active'` and store not suspended/closed.
4. `channel_listings.status ∈ {active}` (post-publish) — never `draft`.
5. `catalog_skus.status = 'active'` and `catalog_products.status = 'active'`.
6. A valid price row (§4) exists and is in-effect.
7. A valid tax model (§6) resolves for the buyer country.
8. A valid shipping policy (§7) covers the buyer country.
9. `sellable > 0` OR backorder explicitly enabled (MVP: forbidden ⇒
   requires `sellable > 0`).

`status='active'` alone is **insufficient** and must never be the sole
predicate. Visibility is a **composite, fail-closed** condition,
evaluated server-side inside the public read RPC (Option A).

---

## 10. Unpublish behaviour

Triggering events and required responses:

| Event | Storefront behaviour | Purchase button | URL | Status code |
|---|---|---|---|---|
| Stock = 0 (no backorder) | Show detail, mark "Uitverkocht" | Disabled | Keep | 200 |
| Store suspended | Hide from listings; detail hidden | N/A | Preserve | 410 Gone |
| Price expired / missing | Hide from listings; detail hidden | N/A | Preserve | 410 Gone |
| Tax version missing | Hide (safety) | N/A | Preserve | 410 Gone |
| Product archived | Hide | N/A | Preserve | 410 Gone |
| SKU inactive | Hide | N/A | Preserve | 410 Gone |
| Shipping policy unavailable for buyer country | Show detail, mark "Niet leverbaar in uw land" | Disabled | Keep | 200 |
| Compliance issue | Hide immediately | N/A | Preserve | 410 Gone |
| Admin emergency pause | Hide immediately | N/A | Preserve | 410 Gone |

Distinctions the read layer must make:

- **Hide from storefront lists** vs. **disable purchase on detail page**.
- **Preserve URL for SEO** vs. **return 410 Gone**.
- Rule: transient states (stock=0, country-shipping) → 200 + disabled.
  Terminal / policy states → 410. Never 404 for a URL that once existed.

All unpublish transitions must write to the publication event ledger (or
the `unpublished_at` + `unpublish_reason` columns) so support and audit
can explain why a listing disappeared.

---

## 11. Permissions model (future — reserve names now)

Reserve, do not grant, the following distinct permissions:

| Permission | Holder | Purpose |
|---|---|---|
| `listings.read` | seller members, admin | Read own store's listings. |
| `listings.manage` | seller members (elevated) | Create/edit draft; already partially used in M1A #2B-1. |
| `listings.publish` | seller members (elevated) | Trigger publication gate + publish RPC. **Separate from `manage`.** |
| `pricing.manage` | seller members (elevated) | Author price rows. |
| `inventory.publish` | seller members (elevated) | Push a channel-side quantity snapshot. |
| `storefront.manage` | seller admin | Store settings, policies, terms. |

Rules:

- Do **not** merge `listings.publish` and `listings.manage`.
- Platform Admin **does not implicitly hold `listings.publish`**. Any
  admin-side publish action requires a distinct `admin.publish_on_behalf`
  permission with per-action audit and an explicit reason field. Not
  authorised in this phase.

---

## 12. R-5 / R-D7 / R-D8 impact on publication

- **R-5** — Denied write attempts on Borvat Direct draft listings roll
  back audit rows because the guarding RPC uses `RAISE EXCEPTION`.
  **Impact on publication:** medium. Any publish RPC will inherit the
  same pattern unless we split audit writes into an autonomous path.
  **Must be closed** before `listings.publish` becomes exercisable in
  production, so seller/admin denials leave a trace.
- **R-D7** — Platform Admin reads are not application-audited.
  **Impact on publication:** low for read paths, **high** if any
  admin-initiated publish or unpublish action is ever added. **Must be
  closed** before `admin.publish_on_behalf` is introduced. Not blocking
  M1B-1..M1B-5.
- **R-D8** — Live role-revocation flight not yet executed.
  **Impact on publication:** high. Before the Public Storefront serves
  even one real customer, we must confirm that revoking a seller's
  `listings.publish` permission instantly stops their ability to publish.
  **Must be closed** before Checkout (M1B-8) and before Public Storefront
  serves live buyers.

None of R-5 / R-D7 / R-D8 is resolved here.

---

## 13. Commercial risks and mitigations

| Risk | Mitigation (must exist before publish is exercised) |
|---|---|
| Publish with wrong price | §4 Option C + tax-version pin + confirmation step in publish RPC + display of gross price in the confirmation UI. |
| Sell non-existent stock | Fail-closed publication gate (§3), `sellable > 0` predicate (§5), Phase 2 reservation path reused by any future Borvat Direct purchase RPC. |
| Non-compliant product visible | Compliance predicate in gate (§3.3); category-driven required-field rules; admin emergency pause (§10). |
| Seller sees another company's product | Existing tenancy triggers + M1A #2A store↔account guard + RLS on `catalog_*`, `channel_listings`. |
| Duplicate customer-visible listing per store/SKU | Partial unique index in M1B-1 (see §3.4). |
| Wrong VAT | §6 tax_rate_versions + line-level snapshot on orders (M1B-8). |
| Uncomputed shipping | §7 shipping policy predicate; storefront disables "Kopen" if no policy resolves. |
| Store suspension does not hide product | §9 read predicate + §10 410 response. |
| Public cache serves stale data | Prefer Option A (§8); if B/C are added, mark them non-authoritative for price/stock; re-verify at cart / checkout. |

---

## 14. Recommended phased plan

Each phase is independently authorisable, fail-closed, and additive-only.
**None is being executed here.**

- **M1B-1 — Publication eligibility model**
  Additive columns / event ledger on `channel_listings`; gate function
  skeleton returning `blocking_reasons` only; partial unique index for
  one-published-per-store-SKU; store fields for `suspended_at`,
  `closed_at`, terms/return references; product media join. No publish
  action yet.

- **M1B-2 — Pricing foundation**
  `merchant_store_offer_prices` (Option C) + immutable-history rules +
  RPCs for authoring / reading current price. No storefront yet.

- **M1B-3 — Tax foundation**
  `tax_rate_versions` reference table + `tax_category_id` on
  `catalog_products` + `vat_number` / `vat_country` on
  `merchant_stores`. No order-line snapshot yet.

- **M1B-4 — Shipping policy foundation**
  `merchant_store_shipping_policies` + validation RPCs +
  buyer-country → policy resolver (read-only).

- **M1B-5 — Public read projection**
  Alternative A: `SECURITY DEFINER` public-safe RPCs for list + detail;
  strict allowlist; hard filters on §9 predicates; keyset pagination.
  Anonymous read scoped to fully eligible listings only. No SEO
  rendering yet.

- **M1B-6 — Seller publication workflow**
  `borvat_direct_publish_listing(listing_id)` + `..._unpublish_listing`
  RPCs; both call the §3 gate; both write to the publication event
  ledger; both require `listings.publish`; both require R-5 closure.

- **M1B-7 — Public storefront read-only**
  TanStack routes rendering M1B-5 RPC data; SEO metadata per §9; correct
  HTTP status codes per §10; no cart, no checkout.

- **M1B-8 — Purchase enablement precheck**
  Design-only. Reservation reuse, price/tax line snapshot, cart→order
  transition. Explicit unlock of `place_order` remains a separate,
  much later authorisation.

---

## 15. Required migrations / RPCs / UI by phase (design only)

| Phase | Migrations | RPCs | UI |
|---|---|---|---|
| M1B-1 | Additive columns / ledger on `channel_listings`; store fields; product-media join; partial unique index. | `borvat_direct_check_publication_eligibility(listing_id)` (read-only, returns reasons). | None. |
| M1B-2 | `merchant_store_offer_prices` + indexes + RLS + grants + trigger validating store↔SKU tenancy. | `set_borvat_direct_price`, `get_current_borvat_direct_price`. | Seller price editor (read-only initially). |
| M1B-3 | `tax_rate_versions`; `catalog_products.tax_category_id`; store VAT fields. | `resolve_tax_rate(country, category, at)`. | None. |
| M1B-4 | `merchant_store_shipping_policies`. | `resolve_shipping_policy(store, country)`. | Seller policy editor (read-only initially). |
| M1B-5 | None (RPC-only). | `public_list_storefront_listings`, `public_get_storefront_listing_detail`. | None. |
| M1B-6 | Publication event ledger (if not in M1B-1); optional autonomous audit path to close R-5. | `borvat_direct_publish_listing`, `borvat_direct_unpublish_listing`. | Seller publish/unpublish action (with confirmation). |
| M1B-7 | None. | None new. | Public storefront routes (`/`, `/product/:slug`, `/search`) reading M1B-5 RPCs. |
| M1B-8 | Precheck only. | None. | None. |

---

## 16. Confirmation that no changes were executed

- No SQL migration written.
- No RPC created or altered.
- No table column added.
- No RLS policy changed.
- No route, component, or client bundle modified.
- No data inserted, updated, or deleted.
- `place_order` remains EXECUTE-revoked; Bol live remains locked; Stripe
  live remains locked; Public Storefront remains absent.

---

## Final verdict

**SAFE PATH REQUIRES PRICING / TAX / SHIPPING FOUNDATIONS FIRST**

A safe Borvat Direct publication path exists in principle and cleanly
reuses the canonical `merchant_stores` / `channel_accounts` /
`channel_listings` / `catalog_*` / inventory model without introducing a
duplicate source of truth. However, three foundational surfaces —
**pricing (Option C)**, **tax rate versions**, and **shipping policies**
— do not yet exist and are hard prerequisites for §9 customer
visibility. Two publication-lifecycle mechanics also require additive
work: an explicit `publication_status` (or publication event ledger)
distinct from `status` / `control_state`, and a fail-closed
eligibility gate that composes all §3 predicates server-side.

Residual risks **R-5** (audit-rollback on denied writes) and **R-D8**
(live role-revocation flight) **must be closed before M1B-6 seller
publish** and before Public Storefront serves live buyers. **R-D7**
must be closed before any admin-initiated publish/unpublish action.

Recommended next authorised step: **M1B-1 — Publication Eligibility
Model** (additive columns / event ledger + gate function returning
`blocking_reasons` only; no publish action, no customer visibility).

**No changes applied. Awaiting Owner authorisation for M1B-1.**
