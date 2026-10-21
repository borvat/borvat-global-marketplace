# PHASE 5 — M1C-1E-C

## MANUAL SHIPPING QUOTE REQUEST AND ITEM/PACKAGE SNAPSHOT FOUNDATION

**Scope:** schema foundation only. No offers, no acceptance, no payment, no order, no
reservation, no RPC, no UI, no messaging, no carrier integration, no channel execution,
no permanent operational data.

**Verdict: M1C-1E-C PASS WITH RESIDUAL RISKS**

---

## 1. Read-only preflight

| Object | Finding |
| --- | --- |
| `customer_delivery_destinations` | present, buyer-owned (`buyer_principal_id → profiles.id`), status `active/inactive/retired`, unique `(id, buyer_principal_id)` |
| `customer_delivery_destination_versions` | present, composite tenancy FK to parent, `precision_level ∈ {quote_area, street_address}`, status `draft/active/superseded/retired`, immutability guards `trg_m1c1eb_version_*` |
| Buyer principal path | `auth.users → profiles → customer_delivery_destinations → customer_delivery_destination_versions` — **provable declaratively** |
| `merchant_stores` | tenancy anchor, unique `(id, company_id)`, `default_currency ~ '^[A-Z]{3}$'` |
| `merchant_store_sku_shipping_profiles` | unique `(id, company_id, merchant_store_id)`, status `draft/active/inactive/retired` |
| `merchant_store_sku_shipping_packages` | per-profile package rows, all dimensions/weight `> 0` |
| `merchant_store_sku_fulfillment_origins` | eligibility edge profile ↔ exact origin, own status column |
| `merchant_fulfillment_origins` | unique `(id, company_id, merchant_store_id)`, status `draft/active/inactive/retired` |
| Special-handling flags | `pickup_only` (bool), `dangerous_goods` (bool), `oversized` (bool), cold chain expressed as `handling_class = 'cold_chain'`; `bulky` is a handling class, **not** a shipment form |
| Cart/order tables | inspected read-only, unchanged (`orders = 0`, `cart_items = 0`) |
| Currency convention | `^[A-Z]{3}$` (matches `merchant_stores`, `shipping_rate_cards`, `merchant_store_offer_prices`) |
| Protected ACL inventory | 26 tables + guard families + `internal_shipping` |
| `place_order` | single overload, body neutralised, `acl={postgres=X/postgres}` |
| `internal_shipping` | owner-only schema, single `resolve_final_eta`, no tables/views |
| Channel authorization | `live_authorized` channels = **0** |

**Tenancy proof (declarative, not procedural):**

```text
Buyer:   auth.users → public.profiles
                    → customer_delivery_destinations (buyer_principal_id)
                    → customer_delivery_destination_versions (id, buyer_principal_id)
                    → manual_shipping_quote_requests
                        FK (delivery_destination_version_id, buyer_principal_id)

Seller:  companies → merchant_stores (id, company_id)
                   → merchant_store_sku_shipping_profiles (id, company_id, merchant_store_id)
                   → merchant_store_sku_fulfillment_origins → merchant_fulfillment_origins
                   → manual_shipping_quote_requests
                        FK (merchant_store_id, company_id)
                        FK (fulfillment_origin_id, company_id, merchant_store_id)
                   → manual_shipping_quote_request_items
                        FK (request_id, company_id, merchant_store_id)
                        FK (shipping_profile_id, company_id, merchant_store_id)
```

Both paths are provable. No architecture blocker was raised.

---

## 2. Migrations applied

| Order | Migration | Nature |
| --- | --- | --- |
| 1 | `m1b0g_acl_drift_cycle9_normalization` | REVOKE-only (gate was RED before business DDL) |
| 2 | `m1c1ec_manual_shipping_quote_request_foundation` | business DDL + explicit ACL normalization section |
| 3 | `m1c1ec_submission_trigger_immediate` | submission guard set to `INITIALLY IMMEDIATE` |
| 4 | `m1c1ec_verification_harness` | rollback-only harness (aborted by design, zero residue) |
| 5 | `m1b0h_acl_drift_cycle10_normalization` | REVOKE-only (post-DDL drift) |

Migration bodies are stored verbatim in the managed migration history; SHA-256 is computed
by the platform over that stored artefact. No migration was edited after commit; every
correction was a forward-fix migration.

---

## 3. Objects created (exactly three tables, zero views, zero RPC)

- `public.manual_shipping_quote_requests`
- `public.manual_shipping_quote_request_items`
- `public.manual_shipping_quote_request_packages`

Plus one declarative prerequisite: `cddv_id_buyer_uk UNIQUE (id, buyer_principal_id)` on
`customer_delivery_destination_versions`, required so buyer ownership of a pinned version is
enforced by a foreign key rather than by trigger logic.

Guard routines (5, all owner-only, `search_path=''`, schema-qualified, no dynamic SQL):
`m1c1ec_guard_submission_integrity`, `m1c1ec_guard_request_write`,
`m1c1ec_guard_request_submission`, `m1c1ec_guard_item_write`, `m1c1ec_guard_package_write`.

No offers, acceptances, events, messages, checkout groups, views or RPCs were created.

---

## 4. Request lifecycle

```text
draft ──▶ requested ──▶ under_review ──▶ quoted ──▶ accepted
  │           │              │              │   └──▶ declined
  └─▶ cancelled              └─▶ cancelled  └──────▶ cancelled
              └─▶ expired    └─▶ expired    └──────▶ expired
```

- Every insert must be `draft` (enforced), with no `requested_at` / `expires_at`.
- Transitions outside the matrix are rejected.
- `accepted / declined / expired / cancelled` are terminal and historically frozen.
- No customer, seller or admin transition RPC exists; status changes are owner-only.

## 5. Request versioning

`request_family_id` (explicit UUID, no sequence) + `version_number > 0`, unique per family.
`supersedes_request_id` must reference a request in the same family, buyer, company, store and
currency, with a strictly higher new version number. Cross-buyer and cross-store supersession
are rejected. Previous versions are never mutated.

## 6. Shipment-form semantics

`parcel | multi_parcel | pallet | freight`, a contractual snapshot of **this request only**.
It is not stored on the destination, is never inferred from `bulky` or from dimensions, and
asserts no carrier eligibility. Cardinality at submission: `parcel` = exactly one row with
`package_count = 1`; `multi_parcel` = at least two physical units; `pallet` / `freight` = at
least one row.

## 7. Exact-origin contract

`fulfillment_origin_id` may be NULL in `draft` only. At `requested` the origin must exist,
be `active`, belong to the same company and merchant store (declarative composite FK), and
every item must have an active eligibility edge to that exact origin. No origin-country
fallback is used anywhere.

## 8. Item and package snapshot contracts

Items reference an exact store-SKU shipping profile version with `line_number > 0`,
`quantity > 0`, unique line number and unique profile per request. No product name,
description, price or tax column exists.

Packages carry `package_number`, `package_count`, `weight_grams`, `length_mm`, `width_mm`,
`height_mm` with positive values and sane upper bounds (2 000 000 g, 20 000 mm, 10 000 units).
`source_shipping_package_id` is optional provenance and must resolve to a shipping profile that
is present in the same request. Snapshot dimensions remain authoritative even if the source
package definition later changes. No JSONB anywhere.

## 9. Submission integrity and special handling

Submission is refused unless: buyer valid; destination version active, buyer-owned and parent
not retired; company/store aligned; currency valid; exact active origin present; ≥ 1 item;
≥ 1 package; all profiles active and same-store; all items origin-eligible; shipment-form
cardinality satisfied; `requested_at` present; `expires_at > requested_at`; version/supersession
valid. `pickup_only`, `dangerous_goods` and `handling_class = 'cold_chain'` **fail closed**.
`oversized` is accepted, since that is precisely the manual-quote use case.

## 10. Immutability

Draft requests are fully editable by the owner. After leaving draft, buyer, company, store,
destination version, origin, shipment form, currency, version, supersession and `requested_at`
are frozen, and items and packages reject insert, update and delete. Any change requires a new
request version.

## 11. Inventory, price and ETA semantics

Bound in table comments: a request does not reserve inventory, does not pin availability, does
not pin product price, carries no shipping charge and permits no payment. Product, stock,
origin and price must be re-validated at offer creation, offer acceptance and checkout
confirmation. No ETA resolver call, no outbox event, no price column.

## 12. Privacy model

No buyer email, phone, recipient name, street-address copy, delivery note, door code or
external messaging handle. The address is referenced only by pinned version ID. No
seller-readable view exists; a future merchant-facing surface must be a quote-safe projection.

## 13. RLS / ACL matrix

| Object | RLS | FORCE | Policies | PUBLIC | anon | authenticated | service_role | sandbox_exec | owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `manual_shipping_quote_requests` | ✅ | ✅ | 0 | — | — | — | — | — | full |
| `manual_shipping_quote_request_items` | ✅ | ✅ | 0 | — | — | — | — | — | full |
| `manual_shipping_quote_request_packages` | ✅ | ✅ | 0 | — | — | — | — | — | full |
| `m1c1ec_guard_*` (5) | n/a | n/a | n/a | — | — | — | — | — | EXECUTE, `proacl` non-NULL |

## 14. R-T21 evidence and two-cycle gate

- Pre-DDL gate: **FAIL** (drift cycle 9) → `M1B-0G` REVOKE-only → **PASS**.
- Post-DDL gate: **FAIL** (drift cycle 10, ACL re-granted by the deployment path) →
  `M1B-0H` REVOKE-only → **PASS**.
- Gate cycle 1: `exit=0`, 58 PASS / 0 FAIL.
- Gate cycle 2 (independent run): `exit=0`, 58 PASS / 0 FAIL.
- Failure path (`ACL_GATE_SIMULATE_FAILURE=1`): `exit=1`.
- `place_order`: `acl={postgres=X/postgres}`, body fail-closed, no PUBLIC EXECUTE.
- `internal_shipping`: owner-only schema, resolver not executable by app or sandbox roles.
- The three new tables and the `m1c1ec_guard_%` family were added to the protected inventory
  in `scripts/phase5-acl-gate/check-critical-acl.sh`.

## 15. Test traceability

Rollback-only harness (fixtures synthetic, transaction aborted by design):
**57 assertions, 57 PASS, 0 FAIL.**

Covered: exactly three tables; no offer/acceptance/event/message objects; no quote views; RLS
enabled and forced; zero policies; zero sequences; no guard with NULL `proacl`; no forbidden
columns; cross-company store rejected; other-buyer destination rejected; `quote_area` accepted;
`street_address` accepted; invalid shipment form (`bulky`) rejected; invalid currency rejected;
version 0 rejected; non-draft insert rejected; valid supersession accepted; lower-version,
cross-buyer, cross-store and duplicate-version supersession rejected; valid item accepted;
duplicate line number, zero quantity and cross-store item rejected; valid package accepted;
duplicate package number, zero count, zero weight and zero dimension rejected; foreign source
package rejected; submission without origin, with inactive origin, with cross-tenant origin,
without `requested_at`, with expiry before submission rejected; pickup-only, dangerous-goods,
cold-chain, inactive profile and origin-ineligible item all fail closed; oversized accepted;
parcel with two units rejected; valid parcel submission accepted; destination, shipment form,
items and packages immutable after submission; illegal transition rejected; legal transition
accepted; terminal state frozen; multi-parcel with one unit rejected and with two accepted;
single-row pallet and freight accepted; submission without items and without packages rejected;
non-active destination version blocks submission.

## 16. Zero-row / zero-delta evidence

| Metric | Value |
| --- | --- |
| Quote requests / items / packages | 0 / 0 / 0 (tables created empty; all fixtures rolled back) |
| Quote offers / acceptances / events / messages | objects do not exist |
| Destinations / versions | 0 / 0 |
| Rate / transit / promise / binding rows | 0 |
| Prices / publications | 0 / 0 |
| Tax categories / bands / versions | 4 / 9 / 5 |
| `orders` / `cart_items` | 0 / 0 (unchanged) |
| Test users / profiles remaining | 0 |
| Temporary verification routines remaining | 0 |

## 17. R-C2 / channel state

`channel_connections` untouched (71 rows), `live_authorized_at` untouched,
live-authorized channels = **0**, dispatch decision remains `deferred_not_authorized`.
No Bol, Stripe or worker execution occurred. `p4_writes_allowed()` untouched.

## 18. Risk status

| Risk | Status |
| --- | --- |
| R-S3 | Partially mitigated — destination model plus an authoritative, versioned request snapshot exist; operation still blocked until capture workflow, recipient/contact model and quote/order integration land |
| R-S4 | **Partially mitigated for manual quote request snapshots** (explicit `shipment_form`); still open at general product/shipping-profile classification level |
| R-S5 | Open — postal code presence does not make current ETA postal-level |
| R-5 | Enforced — no application write workflow exists |
| R-T21 | Recurrent — cycles 9 and 10 normalized REVOKE-only; gate now green twice |
| R-C2 | Blocker for channel execution — unchanged |

## 19. Rollback / forward-fix

All corrections are forward-fix migrations. Rollback of this milestone means dropping the
three tables, the five guard routines and the `cddv_id_buyer_uk` constraint; no data loss is
possible because the scope is zero-row.

## 20. Decisions

- **BOR-DEC-112** — Manual shipping quote requests are scoped to one buyer, one merchant store
  and one exact destination version.
- **BOR-DEC-113** — Submitted manual quote requests pin immutable item, package, origin and
  destination snapshots.
- **BOR-DEC-114** — Manual quote requests use explicit parcel, multi-parcel, pallet or freight
  shipment forms.
- **BOR-DEC-115** — Manual quote requests require an exact active fulfilment origin before
  submission.
- **BOR-DEC-116** — Manual quote requests do not reserve inventory or product prices.
- **BOR-DEC-117** — Pickup-only, dangerous-goods and cold-chain requests fail closed until
  explicit capability models exist.

**FINAL VERDICT: M1C-1E-C PASS WITH RESIDUAL RISKS.**
Quote offers, acceptance, messaging, checkout and payment remain unauthorized.
