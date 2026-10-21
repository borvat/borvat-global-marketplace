# PHASE 5 — M1C-1E-D

## VERSIONED MANUAL SHIPPING QUOTE OFFER FOUNDATION

**Scope:** schema foundation only, owner-only. No acceptance, payment, orders, inventory
reservation, price locking, RPC, UI, messaging, carrier APIs, labels or ETA resolver calls.

**Verdict: M1C-1E-D PASS WITH RESIDUAL RISKS**

---

## 1. Migrations applied

| Order | Migration | Nature |
| --- | --- | --- |
| 1 | `m1b0i_acl_drift_cycle11_normalization` | REVOKE-only (pre-DDL gate was RED) |
| 2 | `m1c1ed_versioned_manual_shipping_quote_offer_foundation` | business DDL + ACL normalization |
| 3 | `m1c1ed_verification_harness` (aborted by design) | rollback-only, zero residue |

## 2. Objects created

- `public.manual_shipping_quote_offers`
- `public.manual_shipping_quote_offer_conditions`
- `msqr_offer_binding_uk` on `manual_shipping_quote_requests` (enables the composite offer FK)
- Guards (4, owner-only, `search_path=""`, no dynamic SQL): `m1c1ed_guard_publication_integrity`,
  `m1c1ed_guard_offer_write`, `m1c1ed_guard_offer_publication`, `m1c1ed_guard_condition_write`

No acceptance, event, message, checkout or payment object was created. Zero views, zero RPC,
zero sequences, no JSONB, no PII columns.

## 3. Offer lifecycle

```text
draft ──▶ offered ──▶ superseded
             ├──▶ withdrawn
             └──▶ expired
```

`accepted` is deliberately absent from the status vocabulary in this milestone. Every insert
must be `draft`. `superseded / withdrawn / expired` are terminal and historically frozen.

## 4. Binding and tenancy

Offers bind to their request by composite FK over
`(request_id, buyer_principal_id, company_id, merchant_store_id, currency_code)`, so
cross-company, cross-store, cross-buyer and cross-currency offers are declaratively impossible.
Supersession uses the same composite shape plus a strictly higher version number.

## 5. Versioning

`version_number > 0`, unique per request. A partial unique index
(`msqo_single_offered_version_uk`) allows at most one `offered` version per request. Superseded
rows are never mutated.

## 6. Publication integrity

Publication is refused unless: request is `requested` or `under_review`; destination version is
active and its parent is not retired; exact origin is active and tenant-aligned; every item's
shipping profile is active and origin-eligible; a customer shipping charge is present; ETA
min/max are present with `max >= min`; `offered_at` present; `expires_at > offered_at`; carrier
and service codes are either both absent or both present and vocabulary-valid.
`pickup_only`, `dangerous_goods` and `handling_class = 'cold_chain'` **fail closed**.

## 7. Commercial and ETA semantics

Only `customer_shipping_charge_minor` exists — no carrier cost, VAT, product amount, margin or
total. Currency mirrors the request. ETA is expressed as calendar days after acceptance and is
human-authored; `internal_shipping.resolve_final_eta` is never called from the offer scope.

## 8. Conditions

Coded vocabulary (`curbside_delivery`, `lift_gate_excluded`, `appointment_required`,
`ground_floor_only`, `other`, …), unique per offer by number and code, free text allowed only
for `other` and bounded to 500 characters. Conditions are editable only while the offer is
`draft`, and frozen afterwards.

## 9. Immutability

After publication: price, ETA, carrier/service, source, responsible party, binding and
versioning columns are frozen; deletes are rejected; only the legal status transitions above are
allowed.

## 10. RLS / ACL matrix

| Object | RLS | FORCE | Policies | PUBLIC | anon | authenticated | service_role | sandbox_exec | owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `manual_shipping_quote_offers` | ✅ | ✅ | 0 | — | — | — | — | — | full |
| `manual_shipping_quote_offer_conditions` | ✅ | ✅ | 0 | — | — | — | — | — | full |
| `m1c1ed_guard_*` (4) | n/a | n/a | n/a | — | — | — | — | — | EXECUTE, `proacl` non-NULL |

Runtime deny proof: reading `manual_shipping_quote_offers` as the gate role returns
`permission denied for table manual_shipping_quote_offers`.

## 11. Verification

Rollback-only harness executed as database owner (fixtures synthetic, transaction aborted by
design): **124 assertions, 124 PASS, 0 FAIL.**

The first harness run reported 101 PASS / 22 FAIL. Root cause was a **harness defect, not a
schema defect**: the drift test retired a delivery destination version and then attempted to
re-activate it, which M1C-1E-B immutability correctly refuses, leaving the shared fixture
retired and cascading into every later publication assertion. Additionally two assertions used
wrong expectations (`search_path=` instead of `search_path=""`, and an inventory reservation
baseline of 0 instead of the 62 pre-existing rows). The corrected harness uses dedicated
destination fixtures for non-restorable drift tests and passes fully. An isolated diagnostic
confirmed publication succeeds on a clean fixture before the correction was made.

Coverage: structural inventory, RLS/force/policies/grants, guard hardening, tenancy and binding
rejection, field contracts, request-state compatibility, publication completeness, drift
revalidation (origin, profile, eligibility, pickup-only, dangerous goods, cold chain, destination
version, parent destination), valid parcel/multi-parcel/pallet/freight publication, versioning
and supersession, immutability and transition matrix, condition contracts, and non-effects.

## 12. Zero-row / zero-delta evidence

| Metric | Value |
| --- | --- |
| Offers / offer conditions | 0 / 0 (created empty, all fixtures rolled back) |
| Quote requests / items / packages | 0 / 0 / 0 |
| Orders / order items / cart items | 0 / 0 / 0 |
| Product prices / publications | 0 / 0 |
| Inventory reservation headers | 62 (unchanged) |
| Tax categories / bands / versions | 4 / 9 / 5 (unchanged) |
| Channel connections / live-authorized | 71 / **0** (unchanged) |
| Test users / profiles remaining | 0 |

## 13. R-T21 gate evidence

- Pre-DDL gate: **FAIL** (drift cycle 11) → `M1B-0I` REVOKE-only → **PASS**.
- Gate updated: the two new tables added to the protected inventory and runtime deny loop; guard
  family pattern widened to `m1c1e%_guard_%` (12 guards); the forbidden-object probe narrowed to
  acceptance/event/message/checkout/payment now that offers are authorized objects.
- Post-DDL gate: **PASS**.

## 14. Risk status

| Risk | Status |
| --- | --- |
| R-S3 | Partially mitigated — request and offer snapshots exist; capture workflow, acceptance and checkout still absent |
| R-S4 | Partially mitigated for manual quote scope |
| R-S5 | Open |
| R-5 | Enforced — no application write workflow exists |
| R-T21 | Recurrent — cycle 11 normalized REVOKE-only; gate green |
| R-C2 | Blocker for channel execution — unchanged |

## 15. Decisions

**BOR-DEC-118** to **BOR-DEC-123** appended to the decision log.

**FINAL VERDICT: M1C-1E-D PASS WITH RESIDUAL RISKS.**
Acceptance, checkout, payment, inventory reservation and carrier execution remain unauthorized.
