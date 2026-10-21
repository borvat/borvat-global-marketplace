# PHASE 5 — M1C-1D-C
# STORE-SKU-ORIGIN DELIVERY PROMISE ASSIGNMENT FOUNDATION

**Verdict: M1C-1D-C PASS WITH RESIDUAL RISKS**

Scope executed: schema foundation only. No transit rules, no ETA resolver, no store
default fallback, no listing/publication UI, no seller/admin write RPC, no manual
quotes, no blackout calendars, no customer date booking, no checkout/orders, no
carrier integration, no permanent operational data.

---

## 1. Read-only preflight

| Object | Finding |
| --- | --- |
| `merchant_fulfillment_origins` | status allowlist `draft/active/inactive/retired`; composite key `mfo_id_company_store_uk (id, company_id, merchant_store_id)`; triggers: `m1c1c_origin_rate_dependency_trg`, `mfo_touch` |
| `merchant_store_sku_shipping_profiles` | status allowlist `draft/active/inactive/retired`; `handling_class ∈ standard/fragile/bulky/cold_chain/high_value`; flags `oversized`, `dangerous_goods`, `pickup_only`; composite key `mssp_id_company_store_uk` |
| `merchant_store_sku_fulfillment_origins` | eligibility table; status allowlist `draft/active/inactive/retired`; unique `msfo_profile_origin_uk (shipping_profile_id, fulfillment_origin_id)`; tenancy FKs to both parents |
| `delivery_promise_profiles` | scope contract `platform` (company/store NULL) vs `merchant_store` (both NOT NULL); status `draft/active/inactive/superseded/retired`; immutability + integrity guards |
| `delivery_promise_weekly_schedules` | 7 ISO rows, cut-off contract, mutability restricted to `draft` parents |
| Protected ACL inventory | 16 tables owner-only prior to this stage |
| `place_order` | body fail-closed ("permanently disabled"); ACL showed **`sandbox_exec=X`** at preflight → R-T21 recurrence, normalized in this stage |
| Channel execution gates | 9 `mode='live'` connections, all `live_authorized_at IS NULL`; 62 read-only |

### Tenancy path provability

```
companies
  └─ merchant_stores (id, company_id)                        [merchant_stores_id_company_uk]
       └─ merchant_store_sku_shipping_profiles (id, company_id, merchant_store_id)   [mssp_id_company_store_uk]
            └─ merchant_store_sku_fulfillment_origins (shipping_profile_id, fulfillment_origin_id) [msfo_profile_origin_uk]
                 └─ merchant_fulfillment_origins (id, company_id, merchant_store_id) [mfo_id_company_store_uk]
```

All four hops are covered by existing UNIQUE constraints, so the assignment can be
bound with composite foreign keys only. **No ARCHITECTURE BLOCKER.** RLS is not used
to prove any of these relationships.

---

## 2. Migration

| Item | Value |
| --- | --- |
| Foundation migration | `supabase/migrations/20260726145235_3f228759-0ea6-4096-add6-0fc7592c05e4.sql` |
| SHA-256 | `bd42afda47103a6272dc3b19ee44df6ebfd0b759713bf4d8944541ba44e204ab` |
| Post-commit R-T21 normalization | `supabase/migrations/20260726145444_38013293-50fc-4721-b25e-1928a7ee9fc8.sql` |
| SHA-256 | `3a3755cffd7a1bf9c2d3803b915249255d0fb9751dace8e1fa94eb510553f65b` |

Two earlier attempts of the foundation migration failed fail-loud and rolled back
completely (harness fixture-selection error, then a PL/pgSQL array typing error).
Verified afterwards that no partial object existed.

---

## 3. Assignment definition

`public.merchant_store_sku_delivery_promise_assignments`

| Column | Notes |
| --- | --- |
| `id` | uuid PK, `gen_random_uuid()`; no sequence |
| `company_id`, `merchant_store_id` | tenant, NOT NULL |
| `shipping_profile_id` | store-SKU shipping profile |
| `fulfillment_origin_id` | **mandatory** exact origin |
| `delivery_promise_profile_id` | exact promise version |
| `fulfillment_mode` | `merchant_fulfilled` \| `platform_fulfilled` |
| `version_number` | `>= 1` |
| `status` | `draft/active/inactive/superseded/retired` |
| `supersedes_assignment_id` | nullable self-reference |
| `promise_scope_type`, `promise_company_id`, `promise_store_id` | STORED generated columns used purely to make the mode↔scope↔tenant rule declarative |
| `created_at`, `updated_at` | timestamps + touch trigger |

No link to `catalog_products`, no listing assignment.

---

## 4. Tenant and eligibility path (declarative)

| Constraint | Proves |
| --- | --- |
| `mssdpa_profile_tenancy_fk (shipping_profile_id, company_id, merchant_store_id)` | same company and same store as the shipping profile |
| `mssdpa_origin_tenancy_fk (fulfillment_origin_id, company_id, merchant_store_id)` | same company and same store as the origin |
| `mssdpa_origin_eligibility_fk (shipping_profile_id, fulfillment_origin_id)` | the origin is a registered eligible origin **for this exact profile** |
| `mssdpa_promise_scope_fk (delivery_promise_profile_id, promise_scope_type)` | promise scope matches the fulfilment mode |
| `mssdpa_promise_tenancy_fk (delivery_promise_profile_id, promise_company_id, promise_store_id)` | merchant-fulfilled promises belong to the same company **and** store |

Cross-company, cross-store and non-eligible origins are rejected by the database
engine itself, not by RLS and not by application lookups.

---

## 5. Fulfilment-mode contract (BOR-DEC-079 / 080)

- `merchant_fulfilled` → promise must be `scope_type='merchant_store'` of the same
  company and store.
- `platform_fulfilled` → promise must be `scope_type='platform'` with
  `company_id IS NULL` and `merchant_store_id IS NULL`.
- `manual_quote` is **not** an allowed value: manual quotes carry their own ETA from
  the accepted quote and never inherit an automatic promise.

---

## 6. Exact-origin-only decision (BOR-DEC-078)

Every assignment requires `fulfillment_origin_id`. No store default promise, no
origin-less store-SKU fallback, no country-level fallback, no listing override and
no platform global resolver were created. Two origins of the same store may carry
different timezones and cut-offs, so an origin-less promise could yield a wrong ETA.
Priority/fallback belongs to the future resolver stage.

---

## 7. Versioning

- `mssdpa_group_version_uk (shipping_profile_id, fulfillment_origin_id, fulfillment_mode, version_number)` — no duplicate versions per group.
- `mssdpa_one_active_per_group_uk` partial unique on `status='active'` — a single active version per group.
- `m1c1dc_guard_supersedes_integrity` — supersedes must match company, store, shipping
  profile, origin and mode, and the new `version_number` must be strictly greater.
- `version_number >= 1` enforced by CHECK.
- No activation workflow, no RPC.

---

## 8. Activation integrity (`m1c1dc_guard_activation_integrity`)

An assignment may only become `active` when all of the following hold:

- shipping profile `active`, same tenant, **not** `pickup_only`, **not**
  `dangerous_goods`, **not** `handling_class='cold_chain'`;
- fulfillment origin `active`, not retired, same tenant;
- eligibility row exists, is `active` and carries the same tenant;
- delivery promise profile `active`, has exactly 7 weekly schedule rows, and its scope
  and tenant match the fulfilment mode.

Special handling is fail-closed: pickup-only, dangerous-goods and cold-chain profiles
can be represented as **draft** assignments but can never be activated until carrier
capability/eligibility architecture exists. R-S4 remains open: `bulky` is not treated
as pallet anywhere.

---

## 9. Immutability (BOR-DEC-081)

`m1c1dc_guard_immutability`:

- `superseded` and `retired` rows reject every update;
- `active` rows reject changes to tenant, shipping profile, origin, promise profile,
  fulfilment mode, version number and supersedes pointer, and may only move to
  `superseded` or `retired`.

Changing a promise means a new assignment version; changing the promise content means
a new delivery-promise version and then, if needed, a new assignment version. No order
snapshot was implemented.

---

## 10. No shipping-rate linkage

The assignment table has no reference to `shipping_rate_cards`, lanes or rules. Its
existence means only: *if this store-SKU is fulfilled from this origin, this is the
handling/handover promise.* It does not prove a rate to a destination, a transit rule,
a qualified carrier, checkout capability or a complete customer ETA.

---

## 11. RLS / ACL matrix

| Subject | anon | authenticated | service_role | sandbox_exec | postgres |
| --- | --- | --- | --- | --- | --- |
| `merchant_store_sku_delivery_promise_assignments` | none | none | none | none | owner |
| `m1c1dc_guard_*` (4 functions) | none | none | none | none | EXECUTE |

- RLS **enabled and forced**, **zero policies**, zero grants, no RPC.
- Guard functions: `OWNER = postgres`, `search_path = ''`, schema-qualified references,
  no dynamic SQL, `proacl IS NOT NULL`, explicit REVOKE for every non-owner role.

---

## 12. ACL gate evidence (two post-commit cycles + failure path)

`scripts/phase5-acl-gate/check-critical-acl.sh` extended with: the assignment table in
the protected inventory, the four `m1c1dc_guard_*` functions, RLS/force/zero-policy
checks, sequence check (R-T22), runtime deny proof, and a forbidden-object check for
transit/manual-quote/default/listing promise tables. `place_order` body/ACL and the
M1C-1B/1C/1D-B objects remain covered.

| Run | Result |
| --- | --- |
| Immediately after foundation commit | **FAIL** — Mechanism A re-granted `sandbox_exec` on `place_order`, the 16 protected tables and the M1C-1D-B/1D-C guard functions (R-T21) |
| Forward-fix normalization migration | applied (`20260726145444…`) |
| Post-commit cycle 1 | **PASS** (24/24 checks) |
| Post-commit cycle 2 | **PASS** (24/24 checks) |
| `ACL_GATE_SIMULATE_FAILURE=1` | **exit 1** — failure path proven |

`place_order` final ACL: `{postgres=X/postgres}`, body fail-closed.

---

## 13. Test traceability

All tests ran inside the migration transaction with a fail-loud harness; every fixture
was deleted before commit; no temporary routine survived (`%_tmp_tests` check PASS).
**61 assertions passed, 0 failed.**

| Group | Assertions | Result |
| --- | --- | --- |
| Positive fixtures | merchant-fulfilled valid, platform-fulfilled valid, draft with inactive origin representable | 3 PASS |
| Tenancy rejections | cross-company profile, cross-store profile, cross-company origin, cross-store origin, non-eligible origin | 5 PASS |
| Mode/scope rejections | merchant+platform promise, platform+merchant promise, promise from other store, promise from other company, invalid mode, `manual_quote` | 6 PASS |
| Versioning rejections | version < 1, duplicate version, supersedes different origin, supersedes cross-tenant, supersedes different mode, version not higher, second active in group | 7 PASS |
| Activation rejections | inactive origin, inactive shipping profile, inactive eligibility row, non-active promise, incomplete weekly schedule, pickup-only, dangerous goods, cold chain | 8 PASS |
| Immutability | active version immutable, active origin immutable, active→superseded allowed, superseded immutable, active→retired allowed, retired immutable | 6 PASS |
| Structure/ACL | single table created, RLS enabled+forced, zero policies, zero application grants, UUID-only/no sequence, guard inventory = 4, no NULL `proacl`, `place_order` EXECUTE false, `place_order` fail-closed, no transit/quote/default/listing objects | 10 PASS |
| Channel (R-C2) | 9 live connections unchanged, zero `live_authorized_at` | 2 PASS |
| Zero-row / steady state | assignments 0, promises 0/0, fulfillment foundation 0/0/0/0 (+stores 0), rate foundation 0/0/0, tax 4/9/5, prices 0, publications 0 | 15 PASS |
| Gate | post-commit cycle 1 PASS, cycle 2 PASS, failure-path PASS | 3 PASS (external) |

Where a single assertion covers several authorization points (e.g. one composite FK
proves both "cross-company rejected" and "tenancy declaratively provable"), it is
listed once above and the covered points are named in the group description.

---

## 14. Zero-row evidence (post-commit)

| Table | Rows |
| --- | --- |
| `merchant_store_sku_delivery_promise_assignments` | 0 |
| `delivery_promise_profiles` / `delivery_promise_weekly_schedules` | 0 / 0 |
| `merchant_stores` / `merchant_fulfillment_origins` / `merchant_store_sku_shipping_profiles` / `merchant_store_sku_fulfillment_origins` | 0 / 0 / 0 / 0 |
| `shipping_rate_cards` / `shipping_rate_lanes` / `shipping_rate_rules` | 0 / 0 / 0 |
| `tax_categories` / `tax_rate_bands` / `tax_rate_versions` | 4 / 9 / 5 |
| `merchant_store_offer_prices` | 0 |
| `borvat_direct_listing_publications` | 0 |

Object delta: 1 table, 6 indexes (2 unique + 4 supporting) + PK, 8 constraints,
4 guard functions, 4 triggers, 2 supporting UNIQUE constraints on
`delivery_promise_profiles`. No sequences, no views, no RPC, no policies.

---

## 15. Risk register update

| Risk | Status |
| --- | --- |
| R-5 | Open — blocks seller write/activation RPC |
| R-S1 | **Closed for assignment activation** — active-origin enforcement is proven |
| R-S2 | Open — mitigated by runtime/current-state checks |
| R-S3 | Open — blocks labels and checkout |
| R-S4 | Open — pallet representation; `bulky ≠ pallet` |
| R-T21 | Open, monitored — recurred post-commit, normalized forward-only, gate PASS twice |
| R-T22 | Open — historical sequence inventory only; none added here |
| R-C2 | Open — blocks all channel writes; 9 live connections remain unauthorized |

---

## 16. Rollback / forward-fix

No destructive change was made. Rollback of the foundation would be a forward-only
migration dropping the assignment table, its four guard functions and the two helper
UNIQUE constraints. Any ACL drift is repaired forward-only with an explicit
normalization section, never by ad-hoc grants.

Bol live: OFF. Stripe live: OFF. No outbound sync, order ingestion or publishing occurred.

---

## Decisions recorded

- **BOR-DEC-078** — Delivery promises are assigned per merchant store, SKU shipping profile and exact fulfillment origin.
- **BOR-DEC-079** — Merchant-fulfilled assignments use tenant-scoped promises; platform-fulfilled assignments use platform promises.
- **BOR-DEC-080** — Manual shipping quotes do not inherit automatic delivery promise assignments.
- **BOR-DEC-081** — Delivery promise assignments are immutable after activation.

**HALT.** Transit-time rules, ETA resolver, manual quotes and UI require separate owner authorization.
