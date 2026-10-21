# PHASE 5 — M1C-1E-A — MANUAL SHIPPING QUOTE WORKFLOW PRECHECK

Status: READ-ONLY ANALYSIS AND DESIGN. No migration, no table, no function, no data, no RPC, no UI, no channel action was performed.

Date: 2026-07-26
Scope authorized: M1C-1E-A only.

---

## 0. FINAL VERDICT (stated first)

**SAFE MANUAL SHIPPING QUOTE ARCHITECTURE IDENTIFIED**
**DELIVERY DESTINATION FOUNDATION REQUIRED FIRST**
→ therefore the implementable subset is: **PARTIAL MANUAL QUOTE ARCHITECTURE READY**

No architecture conflict was found. The precheck is complete. Implementation of
M1C-1E-B cannot begin until (a) an authoritative delivery destination model exists,
and (b) a separate Owner authorization is issued.

`ARCHITECTURE DEPENDENCY — AUTHORITATIVE DELIVERY DESTINATION MODEL REQUIRED`

---

## 1. CURRENT DEPENDENCY INVENTORY (verified read-only)

| Capability | Object found | Reusable for manual quotes? |
|---|---|---|
| Merchant tenancy | `companies`, `company_members`, `merchant_stores` | Yes — tenant anchor |
| Fulfillment origin | `merchant_fulfillment_origins` (company_id, merchant_store_id, warehouse_id, origin_type, country_code, postal_code, status) | Yes — exact origin reference |
| SKU shipping profile | `merchant_store_sku_shipping_profiles` (version, handling_class, oversized, dangerous_goods, pickup_only, can_combine_with_other_items, status) | Yes — eligibility + fail-closed flags |
| Package/multi-parcel | `merchant_store_sku_shipping_packages` (package_number, quantity_per_package, weight_grams, length/width/height_mm, stackable, requires_original_packaging) | Yes — parcel geometry source |
| SKU→origin binding | `merchant_store_sku_fulfillment_origins` (priority, is_default, status) | Yes — candidate origin set |
| Commercial price | `merchant_store_offer_prices` (currency_code, gross_amount_minor, tax_rate_version_id, versioned, valid_from/to) | Yes — currency + minor-unit + versioning precedent |
| Automatic rates | `shipping_rate_cards / lanes / rules` | Only as "no automatic rate" detection |
| Automatic ETA | `internal_shipping.resolve_final_eta` (private, read-only) | Internal estimate ONLY — never contractual for manual quotes |
| Lane↔transit binding | `shipping_rate_lane_transit_profile_bindings` | Detection of missing binding → manual path |
| Cart | `cart_items` (id, user_id, product_id, quantity, created_at) | **Insufficient** — legacy, product-based, no merchant grouping, no destination, no currency |
| Order | `orders` (user_id, total_cents, status, `shipping_address jsonb`) + `order_items` | **Insufficient** — unstructured JSONB address, legacy demo path, `place_order` fail-closed |
| Address model | **none** — 0 tables matching `%address%` | Missing → hard dependency |
| Checkout group model | **none** — 0 tables matching `%checkout%` | Missing → minimal future dependency |
| Quote model | **none** — 0 tables matching `%quote%` | Confirms greenfield |

Conclusion: package, origin, profile and pricing semantics are fully reusable and
**must not be duplicated**. Cart/checkout-group and destination are missing.

---

## 2. FULFILLMENT-GROUP MODEL

Adopted contract:

```text
customer checkout (parent, not yet modelled)
  └── merchant fulfillment group   (1 merchant_store, 1 destination, 1 currency)
        └── manual_shipping_quote_request  (0..1 active)
              └── manual_shipping_quote_offer (versioned, 0..n, 1 active)
                    └── acceptance (0..1, terminal)
```

Every request MUST bind to exactly one: merchant store, destination, currency,
SKU+quantity set, and (at offer time) exactly one fulfillment origin.

Multi-seller example resolves as three independent groups:
merchant A `automatic_resolved`, merchant B `manual_quote_pending`, merchant C `pickup`.
A single offer covering multiple merchants is FORBIDDEN absent an explicit
platform-freight contract (not in scope).

Because no checkout/fulfillment-group entity exists, and per instruction not to
create one: the minimal future dependency is a `checkout_fulfillment_groups`
(or equivalent) row keyed by (checkout_id, merchant_store_id, destination_id,
currency_code). Until it exists, the quote request may carry those four keys
directly as a **structured** column set — an unstructured JSON cart snapshot is
rejected. Item and package snapshots are normalized child rows, not JSON.

---

## 3. REQUEST LIFECYCLE

States (request-level only, never mixed with offer status):

`draft → requested → under_review → quoted → accepted | declined | expired | cancelled`

| Transition | Owner | Blocked by |
|---|---|---|
| draft → requested | customer | R-5 |
| requested → under_review | merchant (or platform) | R-5 |
| under_review → quoted | merchant / platform (offer publication) | R-5 |
| quoted → accepted | customer only (references exact offer version) | R-5 |
| quoted → declined | customer | R-5 |
| any → cancelled | customer (before acceptance) or platform (abuse/compliance) | R-5 |
| quoted → expired | system/time, derived or scheduled | R-5 |
| accepted → * | none. terminal | — |

Platform may cancel/redact for abuse but may NOT accept on behalf of a customer
and may NOT price on behalf of a merchant unless `quote_source='platform'`.
All workflow transitions are BLOCKED until R-5 closes.

---

## 4. QUOTE OFFER VERSIONING

`manual_shipping_quote_offers` (proposed, not created) — conceptual columns:
request_id, version (monotonic per request), currency_code,
customer_shipping_charge_minor, tax_basis (`exclusive_of_vat` semantic label),
eta_model, eta_min/eta_max, eta_basis, expires_at, carrier_name, service_name,
fulfillment_origin_id, status, supersedes_offer_id, quote_source,
created_by_actor_type, created_by_actor_id, created_at, updated_at.

Rules:
- Exactly one offer per request in status `offered` at any instant (partial unique index).
- Accepted offer is immutable (guard trigger, no UPDATE of commercial fields).
- A revision creates a new version with `supersedes_offer_id`; it never mutates history.
- Expired or superseded offers cannot be accepted.
- Acceptance must name `(request_id, offer_id, version)`; mismatch fails closed.
- Accepted price + ETA are frozen into an acceptance snapshot (see §12).

---

## 5. PRICE SEMANTICS (aligned with BOR-DEC-067)

`customer_shipping_charge_minor` represents the **customer-facing commercial
shipping charge for the group, before final cart VAT treatment**, in minor units
of one currency. It explicitly does NOT represent carrier invoice cost, input
VAT, platform margin, gross checkout total, or product price.

Deferred to checkout pricing (not to the offer):
- VAT on shipping derived from the group's tax rate versions.
- Mixed-rate groups: shipping VAT apportioned pro-rata by net product value per
  tax band (allocation rule to be ratified in checkout pricing milestone).
- The final customer total is displayed only after shipping charge + VAT + product
  totals are all known.

No payment may be authorized or captured before that total is displayed and the
offer is accepted.

---

## 6. ETA SEMANTICS

The automatic resolver output is an **internal estimate only** and is never
promoted to a contractual date for a manual quote.

Three distinct concepts must remain separate: `internal_estimate`,
`seller_provided_estimate`, `contractual_accepted_eta`.

Recommended first contract: **duration after acceptance**
(`min_delivery_days_after_acceptance`, `max_delivery_days_after_acceptance`),
because the acceptance moment is unknown at quoting time and a fixed date range
silently decays while the offer waits. Absolute date ranges are supported as a
second `eta_model` for freight bookings with a fixed slot. `eta_basis` records
business days vs calendar days and the reference timezone. Delivery-promise
assignments are never auto-copied into a manual offer.

---

## 7. DESTINATION DATA AND R-S3

No address model exists (verified: zero `%address%` tables; `orders.shipping_address`
is unstructured JSONB and belongs to the legacy demo path).

Minimum pricing-time destination attributes: country, postal code, city, region,
`residential_or_business`, `lift_gate_required`, `floor_number`,
`elevator_available`, `appointment_required`.

Street address, name, email and phone are NOT required to price and MUST NOT be
disclosed to the merchant before acceptance. Full address is released only after
acceptance, at fulfillment time, under an explicit disclosure stage.

Therefore:

`ARCHITECTURE DEPENDENCY — AUTHORITATIVE DELIVERY DESTINATION MODEL REQUIRED`

A separate milestone **Customer Address and Delivery Destination Foundation**
must precede M1C-1E-B, or M1C-1E-B must be limited to a destination reference
column that stays unpopulated until that foundation lands.

---

## 8. MASKED COMMUNICATION

All quote dialogue stays inside Borvat, scoped to one quote request.
Permitted intents: access/entrance clarification, dimension photo request,
delivery constraints, price revision notice, accept/decline notice.

Policy: participants are (customer, merchant, platform); visibility is
request-scoped; attachments limited to images/PDF with size caps and no EXIF
GPS retention; automatic redaction of emails, phone numbers and external
messaging handles; every message and redaction audited; retention aligned to
order retention; platform admin read access is audited; rate limits and abuse
reporting required. No messaging objects are proposed for M1C-1E-B — they land
in **M1C-1F**, with only a nullable linkage key reserved.

---

## 9. PACKAGE AND FREIGHT INPUTS (R-S4)

Snapshot (do not duplicate live data — copy by reference plus a frozen snapshot
at request creation, because profiles are versioned and may change):
weight, dimensions, package_number, quantity_per_package, stackable,
requires_original_packaging, oversized, dangerous_goods, pickup_only,
handling_class, origin.

R-S4 decision: an explicit classification is REQUIRED before manual quotes:

```text
shipment_form = parcel | multi_parcel | pallet | freight
```

It belongs on the shipping profile (capability), with the quote request storing
the resolved snapshot value. `bulky` is forbidden as a synonym for pallet. If
`shipment_form` cannot be resolved, the quote request fails closed.
`pickup_only = true` never produces a shipping quote.
`dangerous_goods` and cold chain fail closed at foundation stage.

---

## 10. QUOTE SOURCES

Two constrained sources: `merchant` and `platform`.
Each offer records `quote_source`, `responsible_party`, optional carrier/service,
`platform_guaranteed boolean`, `seller_remains_responsible boolean`.
Actor identity is modelled as `created_by_actor_type` (enum-like, CHECK-constrained)
plus a typed FK per allowed type — no unconstrained polymorphic actor id.

---

## 11. ORIGIN SELECTION

A request MAY start with a candidate origin set (derived from
`merchant_store_sku_fulfillment_origins`) or none. An offer MUST fix exactly one
`fulfillment_origin_id`. Revalidation at acceptance: origin active, origin owned
by the same store/company, all SKUs belong to that store, shipping profiles
active, `shipment_form` unchanged. Inventory feasibility is checked in a later
milestone. No inventory is reserved at this stage.

---

## 12. ACCEPTANCE CONTRACT

Acceptance is a future single atomic transaction that must verify: offer is
`offered` and not expired, request not already accepted, currency and charge
match the presented values, origin valid, SKU/quantity set unchanged, version is
the intended and latest one; then freeze a snapshot (charge, currency, eta model
and bounds, origin, carrier/service, conditions, offer version) and hand off to
checkout pricing. No order and no payment are created automatically.

Prevented by design: double acceptance (unique constraint on request),
accept-after-expiry, accepting a superseded version, seller price change after
acceptance (immutability guard), revision/acceptance race (row lock on the
request + version equality check → fail closed).

---

## 13. EXPIRY AND REVISION

Every offer carries a mandatory `expires_at`. Expiry is evaluated at read and at
acceptance (no reliance on a background job for correctness). Any change to SKU
set, quantity, destination, origin, package dimensions, or shipping conditions
invalidates outstanding offers and forces a new revision. Superseded and expired
offers remain visible as history. An accepted offer may be cancelled before
payment only through an explicit, audited cancellation path (design deferred).

---

## 14. INVENTORY AND PRICE DRIFT

No inventory reservation in the first design. Risks: stock-out while awaiting a
quote, product price change, origin deactivation, listing paused by seller.
Revalidation points: request creation, offer publication, acceptance, checkout
confirmation. An accepted shipping quote never implies product availability;
the checkout step re-verifies availability and product price independently
(price and ETA independence, BOR-DEC-089).

---

## 15. MULTI-SELLER CHECKOUT

Confirmed: parent checkout + independent merchant fulfillment groups, each in one
of `automatic_resolved | manual_quote_pending | manual_quote_accepted | pickup |
unavailable`. Payment for the cart is blocked while any group is unresolved.
Partial checkout is explicitly out of scope and NOT implemented.

---

## 16. SECURITY AND R-5 CLASSIFICATION

Owner-only foundation (may be created later, before R-5 closes):
tables, constraints, guard triggers, indexes, private read-only status functions.

Application workflows (BLOCKED until R-5 closes and the authorization/audit model
is complete): seller quote-create RPC, customer acceptance RPC, admin
approval-on-behalf, any persistent workflow transition, any UI.

Every future object: RLS enabled + FORCE RLS, deny-by-default, no direct DML
grants to `anon`/`authenticated`/`sandbox_exec`, trusted RPC access only, audit
of accepted and rejected events, and inclusion in the ACL deployment gate.

---

## 17. R-C2 AND CHANNEL ISOLATION (read-only verification)

- Manual quotes are entirely internal; no Bol or channel object is involved.
- `channel_connections`: **9 live-mode connections** present and unauthorized.
- `p4_writes_allowed` exists with ACL `{postgres=X, service_role=X, sandbox_exec=X}` — unmodified by this precheck.
- No dispatch, worker, sync or channel order was triggered.
- **R-C2 remains a hard blocker for channel execution.**

---

## 18. PROPOSED OBJECT INVENTORY (proposal only — nothing created)

| Object | Purpose | Tenant owner | Key columns | Status/Version | Immutability | RLS | Audit | Needed? |
|---|---|---|---|---|---|---|---|---|
| `manual_shipping_quote_requests` | one request per merchant fulfillment group | company_id + merchant_store_id | destination ref, currency_code, shipment_form, status, requested_at | request lifecycle | frozen after acceptance | owner-only + customer-own | all transitions | Yes |
| `manual_shipping_quote_request_items` | SKU/quantity snapshot | inherited | request_id, catalog_sku_id, quantity, price_version_ref | — | immutable | inherit | create only | Yes |
| `manual_shipping_quote_request_packages` | parcel geometry snapshot | inherited | request_id, package_number, weight_grams, dims, stackable | — | immutable | inherit | create only | Yes |
| `manual_shipping_quote_offers` | versioned commercial offer | inherited | version, charge_minor, currency, eta model/bounds, expires_at, origin_id, quote_source, supersedes_offer_id, status | versioned | immutable once accepted/superseded | owner-only | publish/supersede/expire | Yes |
| `manual_shipping_quote_offer_conditions` | structured conditions (lift-gate, appointment, access) | inherited | offer_id, condition_code, value | — | immutable | inherit | create only | Yes — avoids free-text price terms |
| `manual_shipping_quote_acceptances` | terminal acceptance snapshot | inherited | request_id (unique), offer_id, version, frozen commercial+ETA snapshot, accepted_at | terminal | fully immutable | customer-own read | mandatory | Yes |
| `manual_shipping_quote_events` | append-only lifecycle log | inherited | request_id, event_type, actor_type, payload | append-only | immutable | admin/owner read | is the audit | Yes |
| masked-message linkage | nullable FK reserved for M1C-1F | — | — | — | — | — | — | Deferred (no object now) |

Deduplication note: a separate "offer status history" table is rejected —
`manual_shipping_quote_events` covers it. A separate "quote destination" table is
rejected — it belongs to the delivery destination foundation.

---

## 19. MIGRATION DECOMPOSITION (future, unauthorized)

- **M1C-1E-B** — request + item/package snapshot foundation (requires destination model).
- **M1C-1E-C** — versioned offer foundation.
- **M1C-1E-D** — acceptance and expiry contract foundation.
- **M1C-1E-E** — private read-only quote resolution/status functions.
- **M1C-1F** — masked messaging foundation.

None started.

---

## 20. FUTURE TEST PLAN (minimum set)

Tenancy: request never crosses tenant; one request = one merchant store;
SKU from another store rejected; multi-seller cart splits into independent groups.
Origin: exact origin required before an acceptable offer; inactive origin blocks offer.
Invalidations: quantity change, destination change, package change invalidate prior offers.
Money: currency mismatch rejected; negative or zero-with-no-free-flag charge rejected;
shipping charge separate from carrier cost; VAT never computed inside the offer.
Versioning: monotonic versions; duplicate active offer rejected; superseded offer
not acceptable; expired offer not acceptable; double acceptance rejected;
acceptance/revision race fails closed; accepted offer immutable.
ETA: range stored explicitly; automatic ETA never contractual.
Handling: pallet explicit or fail-closed; dangerous goods fail-closed; cold chain
fail-closed; pickup-only produces no quote; multi-parcel supported.
Privacy: customer name/email/phone/full address masked; seller contact not exposed.
Guards: missing address model blocks safely; no payment before final acceptance;
no order before final total; no channel execution.
Platform: RLS/ACL deny-by-default; no `proacl = NULL`; ACL gate includes all new
objects; `place_order` remains fail-closed; zero persistent fixtures in foundation tests.

---

## 21. RISK STATUS

| Risk | Status after this precheck |
|---|---|
| R-5 (seller/customer write + activation workflows) | OPEN — blocks every manual-quote workflow RPC |
| R-S3 (no authoritative address/destination model) | OPEN — now a hard prerequisite for M1C-1E-B |
| R-S4 (pallet not represented) | OPEN — `shipment_form` classification specified as the remedy |
| R-S5 (remote/island ETA accuracy) | OPEN — a primary business driver for manual quotes |
| R-T21 (ACL drift, `sandbox_exec` re-grant) | RECURRING — observed again this cycle: `place_order` proacl is `{postgres=X/postgres,sandbox_exec=X/postgres}` and `p4_*` routines carry `sandbox_exec=X`. Normalization + ACL gate required at next authorized migration window. No revoke performed here (read-only scope). |
| R-C2 (channel execution) | BLOCKER — 9 live-mode connections remain unauthorized |

---

## 22. PROPOSED DECISIONS (for Owner ratification)

- **BOR-DEC-100** — Manual shipping quotes are scoped per merchant fulfillment group; never per cart, never across merchants.
- **BOR-DEC-101** — Product payment is not collected before the shipping price and delivery terms are known and accepted.
- **BOR-DEC-102** — Manual shipping quote offers are versioned, expiring, single-active, and immutable after acceptance.
- **BOR-DEC-103** — Manual shipping communication remains masked inside Borvat; contact details are never exchanged.
- **BOR-DEC-104** — Accepted manual quotes store an exact commercial and delivery snapshot (charge, currency, origin, ETA model and bounds, conditions, offer version).
- **BOR-DEC-105** — Destination changes or package/quantity/origin changes invalidate prior shipping quotes and force a new revision.

---

## 23. ZERO-CHANGE EVIDENCE

- Tools used: read-only SQL queries and documentation write only.
- Migrations executed this milestone: **0**.
- Tables created/altered: **0**. Functions created/altered: **0**. Rows inserted/updated/deleted: **0**.
- `%quote%`, `%address%`, `%checkout%` tables in `public`: **0** (confirms nothing was created).
- `p4_writes_allowed` and `channel_connections` untouched; 9 live connections unchanged and unauthorized.
- No message sent, no order, no payment, no carrier or channel call, no UI file changed.
- Only artifact produced: this document.

**STOP.** M1C-1E-B, messaging, checkout and payment require separate Owner authorization.
