# PHASE 5 — M1C-1C

## AUTOMATIC ORIGIN-TO-DESTINATION SHIPPING RATE-CARD FOUNDATION

Stage type: **schema foundation only**
Verdict: **M1C-1C PASS WITH RESIDUAL RISKS**
Decisions recorded: **BOR-DEC-066, BOR-DEC-067, BOR-DEC-068, BOR-DEC-069**

---

## 1. Read-only preflight

| Check | Finding |
| --- | --- |
| M1C-1B tables | All four present and empty: `merchant_fulfillment_origins`, `merchant_store_sku_shipping_profiles`, `merchant_store_sku_shipping_packages`, `merchant_store_sku_fulfillment_origins` |
| Carrier / shipping-service objects | **None exist.** Only `order_items.tracking_carrier` (free text, buyer-facing tracking) and Bol channel shipment tables. No carrier master model was created; `carrier_code` / `service_code` are constrained code fields |
| Currency model | No currency table. `merchant_stores.default_currency`, `merchant_store_offer_prices.currency_code` use `^[A-Z]{3}$` regex. Same convention reused |
| Country model | No country table. `^[A-Z]{2}$` regex convention reused (`merchant_fulfillment_origins.country_code`, `tax_rate_bands.country_code`) |
| `handling_class` in use | `merchant_store_sku_shipping_profiles`: `standard, fragile, bulky, cold_chain, high_value` **plus** booleans `oversized`, `dangerous_goods`, `pickup_only`. Different axis from the rate-side classes → mapping documented, no competing vocabulary created (§10) |
| Extensions | `btree_gist` already installed (M1B-2B) — reused for the overlap exclusion |
| Sequences | Only `channel_api_audit_id_seq` (historical, R-T22). No sequence in shipping scope |
| ACL gate state at preflight | **FAIL** — drift mechanism A had re-granted `sandbox_exec=X` on `place_order` and `SELECT/INSERT` on protected tax/shipping tables. Normalised inside this migration |

No parallel carrier model, no parallel currency/country model, no parallel handling-class vocabulary was created.

---

## 2. Migrations

| # | File | SHA-256 |
| --- | --- | --- |
| 1 (schema) | `supabase/migrations/20260726135031_079b314e-4bf1-4e75-a591-87fb9a91809d.sql` | `d69edf42ec977bd97ce35cfe9c3601b0eff543a0f71c6dffdb9f16dc42b9cfd1` |
| 2 (verification harness, fixtures rolled back) | `supabase/migrations/20260726135308_14788f4e-1eb7-4901-a847-46b3522e8032.sql` | `bf4c0d25212657d6e8190469062ae53af9a571e2a800590ab351a5f106898536` |

---

## 3. Object definitions

### 3.1 `public.shipping_rate_cards`
`id (uuid pk) · scope_type · company_id · merchant_store_id · carrier_code · service_code · currency_code · customer_charge_tax_basis · volumetric_divisor · status · supersedes_card_id · valid_from · valid_to · created_at · updated_at`

- `scope_type ∈ {platform, merchant_store}`
- `status ∈ {draft, active, inactive, superseded, retired}` — default `draft`
- `carrier_code` / `service_code`: `^[A-Z0-9][A-Z0-9_]{1,31}$`
- `currency_code`: `^[A-Z]{3}$`
- `volumetric_divisor > 0` or NULL (carrier/service property — volumetric weight is **never** stored on the SKU)
- `UNIQUE (id, company_id, merchant_store_id)` — tenancy anchor for lanes
- FK `(merchant_store_id, company_id) → merchant_stores(id, company_id)` — store must belong to the same company
- FK `supersedes_card_id → shipping_rate_cards(id)`, self-supersession forbidden

### 3.2 `public.shipping_rate_lanes`
`id · shipping_rate_card_id · card_company_id · card_merchant_store_id · origin_scope_type · fulfillment_origin_id · origin_country_code · destination_country_code · status · created_at`

- `origin_scope_type ∈ {exact_origin, origin_country}`
- Composite FK to the card tenancy key and composite FK `(fulfillment_origin_id, card_company_id, card_merchant_store_id) → merchant_fulfillment_origins(id, company_id, merchant_store_id)`
- Unique route per card: `(card, origin_scope_type, coalesce(origin_id), origin_country, destination_country)`
- Destination is always an explicit ISO country. **No** NL assumption, **no** NL/BE/DE restriction, **no** local-market requirement.

### 3.3 `public.shipping_rate_rules`
`id · shipping_rate_lane_id · handling_class · billable_weight_from_grams · billable_weight_to_grams · parcel_count_from · parcel_count_to · max_length_mm · max_width_mm · max_height_mm · customer_charge_amount_minor · free_above_merchandise_amount_minor · created_at`
plus generated stored `billable_weight_range int8range` and `parcel_count_range int4range`.

Currency is inherited from the parent card and never restated.

---

## 4. Scope / tenancy model

| Scope | company_id | merchant_store_id | Enforcement |
| --- | --- | --- | --- |
| `platform` | must be NULL | must be NULL | `src_scope_tenancy_ck` |
| `merchant_store` | NOT NULL | NOT NULL, same company | `src_scope_tenancy_ck` + composite FK |

No polymorphic owner ids without FKs. Lanes carry the denormalised tenancy pair solely to make the composite FKs enforceable; a trigger rejects any mismatch with the parent card.

---

## 5. Lane model

`exact_origin` requires an origin that (a) exists, (b) belongs to the card's company **and** store for merchant-scope cards, (c) has the same `country_code` as the lane, and (d) is not `retired`.
`origin_country` requires `fulfillment_origin_id IS NULL` and is the general platform / origin-country form.

---

## 6. Rate-rule model and tax-basis semantics (BOR-DEC-067)

`customer_charge_amount_minor` is a **pre-tax commercial customer shipping charge** in the card currency, minor units. Column comments bind this in the database. It is explicitly **not**:
carrier invoice cost · input VAT paid to the carrier · platform margin · a VAT-inclusive checkout-displayable price.

Reason: shipping VAT can depend on the product mix and rates inside the fulfilment group and may require independent allocation. Carrier/label purchase cost requires a separate future model and must never be merged into this value.

`customer_charge_amount_minor = 0` means **free shipping for the customer**, never zero carrier cost.

---

## 7. Free-shipping semantics

`free_above_merchandise_amount_minor > 0` when present. Meaning (documented, not computed in M1C-1C): merchandise-value threshold in the same currency, evaluated **per fulfilment group** after destination-valid product prices are resolved — never across a multi-merchant parent cart.

---

## 8. Overlap constraints

```sql
EXCLUDE USING gist (
  shipping_rate_lane_id WITH =,
  handling_class        WITH =,
  billable_weight_range WITH &&,
  parcel_count_range    WITH &&
)
```
Declarative, `btree_gist`-backed. Dimensional caps are deliberately **outside** the exclusion key, so two rules differing only by `max_*_mm` are rejected as ambiguous. No resolver picks an arbitrary row.

---

## 9. Immutability and versioning (BOR-DEC-069)

- Active card: `scope`, tenancy, carrier, service, currency, tax basis, volumetric divisor and `valid_from` are frozen (`m1c1c_guard_card_lifecycle`).
- Lanes and rules are insert/update/delete-frozen whenever the parent card is not `draft` (`m1c1c_guard_lane_immutability`, `m1c1c_guard_rule_immutability`).
- Change path = new card + `supersedes_card_id`. No workflow, no RPC created.

---

## 10. Handling classes — mapping, not a new vocabulary

Rate-side allowlist: `standard | oversized | pallet | pickup_only | dangerous_goods`.

| Profile signal (M1C-1B) | Rate class |
| --- | --- |
| `pickup_only = true` | `pickup_only` — **no automatic parcel rate**; rows are rejected by `srr_no_pickup_only_ck` |
| `dangerous_goods = true` | `dangerous_goods` — representable, but a rule alone never makes it auto-shippable; future carrier-capability eligibility is required |
| `oversized = true` / `bulky` | `oversized`, or `pallet` where the merchant declares pallet handling |
| `standard / fragile / cold_chain / high_value` | `standard` (handling attributes stay on the profile) |

---

## 11. Origin integrity (R-S1 / R-S2)

- **R-S1 partially closed:** a card cannot reach `active` while any of its exact-origin lanes points at a non-`active` origin.
- **R-S2 hardened:** `m1c1c_guard_origin_rate_dependency` blocks an origin from leaving `active` while an active dependent rate card exists — the card must be deactivated first. A junction/lane row alone is still never proof of operational eligibility; the future resolver must re-check live origin state.
- **R-S3** (interim address minimum) unchanged — still open.

---

## 12. RLS / ACL matrix

| Table | RLS | FORCE | Policies | anon | authenticated | service_role | sandbox_exec | PUBLIC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shipping_rate_cards` | enabled | yes | 0 | – | – | – | – | – |
| `shipping_rate_lanes` | enabled | yes | 0 | – | – | – | – | – |
| `shipping_rate_rules` | enabled | yes | 0 | – | – | – | – | – |

All five `m1c1c_guard_*` functions: owner `postgres`, `SECURITY DEFINER`, `search_path = ''`, schema-qualified, no dynamic SQL, `proacl = {postgres=X/postgres}` (never NULL), zero application EXECUTE. No application-facing RPC was created.

Mandatory ACL normalisation section revoked, in the same migration: all privileges on the three new tables and the five guard functions from `PUBLIC`/`anon`/`authenticated`/`service_role`/`sandbox_exec`, plus re-normalisation of the eleven previously protected tax/pricing/publication/shipping tables and `place_order` (drift mechanism A had re-fired before this stage).

---

## 13. ACL gate update

`scripts/phase5-acl-gate/check-critical-acl.sh` extended:
1. three new tables added to the protected-table inventory (§5 of the gate);
2. three new tables added to the runtime deny proof (§6);
3. new check 6b — `m1c1c_guard_*` functions must have no app EXECUTE and never `proacl = NULL`;
4. new check 6c — R-T22: zero sequences in the `shipping_rate%` scope.

### Two-cycle post-commit evidence

| Cycle | Time (UTC) | Result |
| --- | --- | --- |
| 1 | 2026-07-26 13:54:01 | **PASS**, exit 0 — 11/11 assertions |
| 2 | 2026-07-26 ~13:55 (after delay) | **PASS**, exit 0 — 11/11 assertions |
| Failure path | same session | `ACL_GATE_SIMULATE_FAILURE=1` → exit **1** (gate still fails loudly) |

`place_order` inventory after commit: `place_order(uuid,integer,jsonb) acl={postgres=X/postgres}`, body still fail-closed.

---

## 14. Test traceability matrix

Harness: migration #2, fail-loud, all fixtures deleted before the zero-delta assertions; any failed assertion aborts the whole migration.

| ID | Assertion | Result |
| --- | --- | --- |
| T01 | Platform scope rejects company/store ids | PASS |
| T02 | Merchant scope requires company **and** store | PASS |
| T03 | Cross-company rate card rejected | PASS |
| T04 | Invalid currency code rejected | PASS |
| T05 | Valid platform + two merchant cards accepted | PASS |
| T06 | Exact origin from another store rejected | PASS |
| T07 | Origin-country mismatch rejected | PASS |
| T08 | Lane tenancy denormalisation mismatch rejected | PASS |
| T09 | Invalid destination country code rejected | PASS |
| T10 | `origin_country` lane with an origin id rejected | PASS |
| T11 | SE destination accepted with no local SE market | PASS |
| T12 | Negative shipping charge rejected | PASS |
| T13 | Free threshold `0` rejected | PASS |
| T14 | Non-increasing weight range rejected | PASS |
| T15 | `parcel_count_from = 0` rejected | PASS |
| T16 | `pickup_only` automatic parcel rate rejected | PASS |
| T17 | Valid tiers incl. free shipping (charge 0) accepted | PASS |
| T18 | Overlapping weight/parcel rules in same lane+class rejected | PASS |
| T19 | Rules differing only by dimension caps rejected as ambiguous | PASS |
| T20 | Different handling classes may share a range | PASS |
| T21 | Same range in a different lane accepted | PASS |
| T22 | Non-overlapping parcel-count ranges accepted | PASS |
| T23 | Activation blocked while exact origin is not active (R-S1) | PASS |
| T24 | Activation succeeds on an active origin | PASS |
| T25 | Active card currency immutable | PASS |
| T26 | Active card lanes immutable | PASS |
| T27 | Active card rules immutable | PASS |
| T28 | No new lane on an active card | PASS |
| T29 | Origin cannot leave active while an active card depends on it (R-S2) | PASS |
| T30 | Supersession requires a new card | PASS |
| T31 | Retired origin cannot back a new lane | PASS |
| ZD-1..11 | Zero-row / invariant deltas (below) | PASS |
| G-1..11 | ACL gate assertions, two cycles + failure path | PASS |
| S-1 | `sandbox_exec` has no SELECT/DML on the new tables (runtime deny proof) | PASS |
| S-2 | No new function has `proacl = NULL` | PASS |
| S-3 | UUID primary keys, no new sequences | PASS |
| R-1 | Admin RPCs (`admin_list_merchant_stores`, `admin_list_borvat_direct_draft_listings`) still executable by `authenticated` | PASS |
| R-2 | Seller paths (`create_merchant_store`, `has_role`) unchanged | PASS |
| R-3 | Allowlist unchanged — no routine outside the 75 approved signatures | PASS |
| R-4 | `place_order` fail-closed body + no non-owner EXECUTE | PASS |

Not applicable by construction this round: no resolver, no quote, no message, no delivery-promise object, no product price, no publication, no cart/checkout/order, no email, no carrier API, no label.

---

## 15. Zero-row evidence

| Table | Expected | Actual |
| --- | --- | --- |
| `shipping_rate_cards` | 0 | 0 |
| `shipping_rate_lanes` | 0 | 0 |
| `shipping_rate_rules` | 0 | 0 |
| `merchant_fulfillment_origins` | 0 | 0 |
| `merchant_store_sku_shipping_profiles` | 0 | 0 |
| `merchant_store_sku_shipping_packages` | 0 | 0 |
| `merchant_store_sku_fulfillment_origins` | 0 | 0 |
| `merchant_stores` | 0 | 0 |
| `merchant_store_offer_prices` | 0 | 0 |
| `borvat_direct_listing_publications` | 0 | 0 |
| `tax_categories / tax_rate_bands / tax_rate_versions` | 4 / 9 / 5 | 4 / 9 / 5 |

Final row delta: **zero**.

---

## 16. Object delta

Added: 3 tables, 3 primary keys, 1 unique route index, 2 secondary indexes, 1 gist exclusion constraint, 5 guard functions, 5 triggers (4 on new tables, 1 on `merchant_fulfillment_origins`).
Removed: none. Modified: none of the locked Phase 1–4 migrations. Sequences added: **0**.

---

## 17. Risk status

| Risk | Status |
| --- | --- |
| R-S1 | **PARTIALLY CLOSED** — activation now requires an active exact origin |
| R-S2 | **HARDENED** — origin deactivation/retirement blocked by active dependent card; future resolver must still re-check live state |
| R-S3 | **OPEN** — interim address minimum unchanged |
| R-T20 | **CLOSED** (M1B-0B) — reconfirmed twice this stage |
| R-T21 | **OPEN, scoped** — M1C-1C objects are now in the protected-table/function inventory and the gate; the rest of the schema remains exposed to sandbox blanket grants |
| R-T22 | **OPEN, historical only** — M1C-1C uses UUID keys and introduced no sequence; gate assertion added |
| Observation | 9 pre-existing `channel_connections` rows carry `mode = 'live'` (Phase 4 fixtures, unchanged by this stage; 6 kill switches have writes disabled). No Bol traffic originates from M1C-1C. Flagged for the owner, not introduced here |

---

## 18. Rollback / forward-fix

Rollback: `DROP TRIGGER m1c1c_origin_rate_dependency_trg ON public.merchant_fulfillment_origins;` then `DROP TABLE public.shipping_rate_rules, public.shipping_rate_lanes, public.shipping_rate_cards CASCADE;` then drop the five `m1c1c_guard_*` functions and revert the gate script. Safe at any time while row counts are zero — no other object depends on these tables.

Forward-fix policy unchanged (BOR-DEC-065): ACL remediation only via a new migration ending in an explicit ACL normalisation section; the gate must exit 0 afterwards.

---

## 19. Final verdict

**M1C-1C PASS WITH RESIDUAL RISKS.**
Halting. M1C-1D (Delivery Promise Profiles), M1C-1E (Manual Quotes), the shipping resolver and any UI require separate owner authorization.

---

## Appendix A — Requirement→Test traceability matrix (documentation only, added in M1C-1D-A)

Added retrospectively at Owner request. **No migration, schema, ACL or data change accompanies this
appendix.** The M1C-1C harness (`20260726135308_…sql`) contains **31 functional assertions (T01–T31)**
and **11 zero-delta assertions (ZD-01–ZD-11)** = 42 executed assertions. A single assertion may cover
several authorized requirements; the 50 authorization points map as follows.

| # | Authorized requirement | Covered by |
| --- | --- | --- |
| 1 | Rate card table exists with platform/merchant scope | T01, T02 |
| 2 | Platform card has NULL tenancy | T01 |
| 3 | Merchant card has both company + store NOT NULL | T02 |
| 4 | Store must belong to the card's company | T03 |
| 5 | Cross-company card rejected | T03 |
| 6 | Currency is a valid ISO code | T04 |
| 7 | Carrier/service codes constrained | T04, T05 |
| 8 | Lane binds exactly one origin to one destination | T05, T06 |
| 9 | Exact-origin lane must use an origin of the same company | T06 |
| 10 | Exact-origin lane must use an origin of the same store | T06 |
| 11 | Lane origin country must match the origin's country | T07 |
| 12 | Denormalized tenancy columns must agree with the card | T08 |
| 13 | Destination is ISO 3166-1 alpha-2 | T09 |
| 14 | Invalid destination rejected | T09 |
| 15 | `origin_country` lane must not carry an origin id | T10 |
| 16 | `exact_origin` lane must carry an origin id | T10 |
| 17 | Destination without a local Borvat market is allowed (SE) | T11 |
| 18 | No NL-origin assumption | T11, T21 |
| 19 | No NL/BE/DE destination restriction | T11 |
| 20 | Customer charge is non-negative | T12 |
| 21 | Charge 0 means free-for-customer, not zero cost | T12, T17 |
| 22 | Free threshold strictly positive when present | T13 |
| 23 | Free threshold is per fulfilment group (semantics bound in comments) | T17 + column comment |
| 24 | Weight range must be ascending and non-empty | T14 |
| 25 | Parcel range must be ascending | T15 |
| 26 | Parcel count starts at 1 | T15 |
| 27 | `pickup_only` rate rules rejected outright | T16 |
| 28 | Dangerous goods never auto-enabled by a rate row | T16 (prohibition idiom) + handling-class CHECK |
| 29 | Valid weight tiers accepted | T17 |
| 30 | Valid parcel tiers accepted | T17, T22 |
| 31 | Free-shipping threshold storable | T17 |
| 32 | Overlapping weight ranges rejected | T18 |
| 33 | Overlap detection uses gist exclusion, not app logic | T18, T19 |
| 34 | Rules differing only by dimension caps rejected as ambiguous | T19 |
| 35 | Different handling classes may share a range | T20 |
| 36 | Same range in a different lane accepted | T21 |
| 37 | Non-overlapping parcel counts accepted | T22 |
| 38 | Activation blocked when the exact origin is not active | T23 |
| 39 | Activation succeeds on an active origin | T24 |
| 40 | Active card is immutable | T25 |
| 41 | Active card's lanes are immutable | T26 |
| 42 | Active card's rules are immutable | T27 |
| 43 | No new lane may be added to an active card | T28 |
| 44 | Origin retirement blocked while an active card depends on it | T29 |
| 45 | Commercial change only via new card + supersession | T30 |
| 46 | Self-supersession forbidden | T30 |
| 47 | Retired origin cannot back a new lane | T31 |
| 48 | Zero persistent rows for the new tables | ZD-01, ZD-02, ZD-03 |
| 49 | Pre-existing foundations unchanged (origins, stores, profiles, prices, publications) | ZD-04 … ZD-08 |
| 50 | Tax baseline unchanged (4/9/5) | ZD-09, ZD-10, ZD-11 |

**Handling-class mapping (Owner note 2).** `oversized`, `dangerous_goods` and `pickup_only` map
fail-closed from the M1C-1B boolean flags; `standard` maps from the non-flagged classes. **`pallet` has
no source signal** and `bulky` must never be promoted to `pallet` — recorded as
**R-S4 — PALLET FULFILMENT CLASS NOT YET AUTHORITATIVELY REPRESENTED**. Full mapping table: §2 of
`docs/PHASE5_M1C1DA_DELIVERY_PROMISE_PROFILE_FINAL_ETA_COMPOSITION_PRECHECK.md`.
