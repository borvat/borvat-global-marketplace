# PHASE 5 — M1C-1A: GLOBAL MARKET, SHIPPING ORIGIN, ROUTE AND MANUAL QUOTE ARCHITECTURE PRECHECK

**Date:** 2026-07-26
**Stage type:** Analysis and design only — no migration, no object creation, no data, no UI, no workflow
**Verdict:** **SAFE SHIPPING AND GLOBAL MARKET ARCHITECTURE IDENTIFIED**
**Change delta:** zero (see §21)

---

## 1. Binding business rules adopted by this design

| # | Rule | Design consequence |
|---|---|---|
| BR-1 | A missing **local market** never implies a missing **delivery** capability | Market rows and delivery rows are separate objects with separate flags; no code path may derive one from the other |
| BR-2 | IP is a **hint only** | Market resolution order: (1) explicit customer selection, (2) selected/saved delivery address country, (3) saved market preference, (4) IP-derived country, (5) `GLOBAL` fallback |
| BR-3 | The final **delivery address** is authoritative | It alone determines destination, tax eligibility, shipping eligibility and final price validation |
| BR-4 | Shipping is computed **origin → destination**, never market → destination | Rates are keyed on `fulfillment_origin_country` (+ optional zone), not on the browsing market |
| BR-5 | No flat platform-wide shipping price | NL→SE and DE→SE are distinct rate rows and may differ per merchant |
| BR-6 | No automatic rate ≠ not deliverable | Absence of a rate opens an in-platform manual quote, unless delivery is explicitly disabled |
| BR-7 | Customer never pays before the total (product + VAT + shipping) is known and accepted | Payment authorisation happens only on a fully priced, accepted state |
| BR-8 | Customer↔seller contact stays inside Borvat | Masked relay; no real e-mail exchange, no external payment links |

Example resolved by the model: *Sweden has no local market.* A customer browsing `GLOBAL` or `NL` may still buy for delivery to SE when either an automatic NL→SE / DE→SE route exists or a manual quote is possible, and when destination tax readiness and a destination-valid price exist.

---

## 2. Market model — market vs delivery

### 2.1 Distinct concepts

| Concept | Meaning | Authority |
|---|---|---|
| `market_country` | Presentation context: locale, currency, catalogue visibility, default tax presentation | Platform |
| `delivery_country` | Where the parcel physically goes | Customer address |
| `fulfillment_origin_country` | Where the parcel physically departs from | Merchant origin |
| `merchant_store` | Commercial actor and tenant boundary | Merchant |
| `currency` | Presentation + settlement currency of the market | Platform (per market) |
| `locale` | Language/format of the market | Platform (per market) |

`GLOBAL` is a first-class market with no `market_country`, an assigned reference currency and no assumption of local delivery.

### 2.2 Is a market an entity or a configuration?

**Recommendation: an entity (platform-global row), not a scattered configuration.** A market carries operational flags, currency, locale, tax-readiness state and an audit trail; encoding this as constants or env config would violate the no-hardcoding rule and make a seventh tenant/market impossible without code.

### 2.3 Relationships

```text
market (platform-global)
  ├── country_enablement        : is this market browsable / locally enabled
  ├── seller_market_enablement  : may THIS merchant_store trade in this market
  ├── listing_visibility        : is this listing browsable in this market
  ├── price_availability        : does a destination-valid price exist
  └── delivery_availability     : origin→destination route OR quote capability
```

The five relations are evaluated independently and combined only by the public evaluator (§13). No relation may be inferred from another.

Cases covered: local market; global market; delivery country without a local market; customer choosing a market other than the IP country; browsing NL while shipping to SE; a product visible in a market but not deliverable from a given seller; a product hidden locally but reachable through `GLOBAL`.

---

## 3. Fulfillment origins

**Concept:** `merchant_fulfillment_origins` — a merchant-scoped, addressable dispatch point.

| Question | Recommendation |
|---|---|
| Owner scope | **Company-owned row, store-linkable.** `company_id` is the tenancy anchor (matching `merchant_stores`/`warehouses`); a store may reference origins of its own company only |
| Relation to existing `warehouses` | An origin **references** an existing `warehouses` row when the origin is a warehouse (no parallel truth for stock locations); store and 3PL origins carry their own address reference |
| Origin kinds | `warehouse`, `store`, `third_party_fulfillment`, (future) `dropship_supplier` |
| Address data | `country_code`, `postal_code`, `region_code`, optional `address_ref`; `country_code` + `postal_code` are the routing keys |
| Preventing foreign origins | DB-level: `company_id` must equal the listing/store company; enforced by a trigger guard + RLS, never by UI |
| Selection for listing/SKU | Explicit `origin_id` on the shipping profile/listing; if absent, the store's `is_default = true` origin |
| Default origin | Exactly one active default per store, enforced by a partial unique index |
| Immutability on orders | Origin is resolved at checkout and **snapshotted** into the future order/fulfilment group; the snapshot is immutable after confirmation; changing the merchant origin row never rewrites history |
| Active/inactive | `is_active`; deactivation blocks new selection, never mutates existing snapshots |

No schema is created in this stage.

---

## 4. Automatic shipping routes (rate model)

Two layers, deliberately separated:

* **Rate card** — the contract envelope: owner (merchant vs platform), carrier, service, currency, validity window, status (`draft|active|superseded|archived`), optional origin scope.
* **Rate rule** — one priced row inside a card: origin country (+ optional origin zone), destination country (+ optional destination zone), weight range, volumetric/dimension bounds, parcel-count bounds, price, free-shipping condition, free-above threshold, handling class eligibility.

Keys per rule: `origin_country`, `origin_zone?`, `destination_country`, `destination_zone?`, `weight_from`, `weight_to`, `parcels_from/to`, `price_cents`, `currency`, `free_above_cents?`, `is_free`.

Ranges must be non-overlapping within a card (exclusion constraint pattern, same technique as the tax platform windows). Validity windows must not overlap for the same key set within a card.

**Rate selection precedence (first match wins, all evaluated against the same origin→destination pair):**

1. Seller-specific route for the exact origin (incl. warehouse-specific scope)
2. Seller-specific route for the origin country
3. Platform-negotiated contract route the seller is enrolled in
4. Destination-zone fallback rule
5. **Manual quote fallback** (§6)

Ties are broken by the narrowest scope, then the lowest price, then the earliest `created_at`. A resolution trace (which card/rule matched) must be persisted with any future quote/order for dispute handling.

NL→SE = €15 and DE→SE = €12 are two independent rules; no global constant exists anywhere in the model.

---

## 5. Large, heavy and multi-parcel goods

**Yes — a listing/SKU needs its own shipping profile.** `1 SKU ≠ 1 parcel` is explicitly rejected.

Shipping profile fields: `weight_grams`, `length/width/height_mm`, derived `volumetric_weight_grams` (carrier divisor stored on the rate card), `handling_class` (`parcel|bulky|pallet|freight|pickup_only`), `dangerous_goods` flag + class, `oversized` flag, `parcel_count` or a parcel-decomposition rule, `non_combinable` flag (cannot share a parcel/shipment with other items), `pickup_only` flag, `requires_freight_quote` flag.

Chargeable weight = `max(actual, volumetric)` per parcel, per rate card divisor. Any item flagged `requires_freight_quote`, `pallet`, `oversized` beyond card bounds, or `dangerous_goods` **bypasses automatic rating and goes straight to a manual quote**. `pickup_only` items are never delivery-rated.

---

## 6. Manual shipping quote workflow

Trigger: no automatic rate resolved (§4 step 5), or the profile forces a quote (§5), or the seller opts a destination into quote-only.
`Delivery unavailable` is shown **only** when the seller or the platform explicitly disables the destination, or the item is `pickup_only`.

```text
1. Customer selects items + delivery address
2. System resolves rates → no automatic price for fulfillment group G
3. System creates shipping_quote_request (scoped to G, snapshot of items, destination, weights)
4. Quantities held under a SEPARATE quote-reservation policy (short, renewable, distinct from checkout reservations)
5. Seller sees the request WITHOUT the customer's real e-mail (masked identity, §8)
6. Seller submits a binding quote version: amount, currency, carrier, service,
   estimated delivery window, tracking availability, expiry, notes
7. Customer accepts or rejects
8. On acceptance the total is recomputed: product price + VAT + shipping (+ shipping VAT allocation) = final total
9. Customer sees the complete total BEFORE any payment step
10. Payment authorisation happens only after acceptance of a non-expired quote version
```

Prohibited by design: paying for goods before shipping is known; any external/off-platform transfer request; a non-binding free-text shipping price; changing an accepted amount without a **new quote version** re-accepted by the customer.

---

## 7. Quote state machine

```text
requested ──► seller_reviewing ──► quoted ──► accepted ──► (checkout hand-off)
    │               │                │  │
    │               │                │  └► rejected            (final)
    │               │                └───► expired             (final)
    │               ├──────────────► withdrawn (seller)        (final)
    ├──────────────────────────────► cancelled (customer)      (final)
    └── any active state ──────────► superseded (new version)  (final for that version)
```

| Transition | Actor |
|---|---|
| `requested → seller_reviewing` | seller (or system on first seller view) |
| `seller_reviewing → quoted` | seller only |
| `quoted → accepted / rejected` | customer only |
| `* → withdrawn` | seller, only while not `accepted` |
| `* → cancelled` | customer, only while not `accepted` |
| `* → expired` | system (scheduled), never a human |
| `quoted → superseded` | system, when the seller issues a new version |

Final states: `accepted` (consumed by checkout), `rejected`, `expired`, `withdrawn`, `cancelled`, `superseded`.

Rules: the amount on a quote **version** is immutable once sent; any change creates a new version and invalidates customer acceptance of the previous one; `customer_accepted_at` and `seller_response_deadline` are stored explicitly; expiry releases the quote reservation; rejection/withdrawal/cancellation releases it immediately. If stock or the underlying product price changes while waiting, the quote is **not** silently repriced — acceptance triggers a mandatory revalidation of stock, price version and tax version, and a failed revalidation forces `superseded` (new version) rather than a hidden price change.

---

## 8. Masked communication relay

Requirements: seller never sees the customer's real e-mail; customer never sees the seller's personal e-mail; every message is bound to a quote or order; a temporary relay address per thread; best-effort blocking of phone numbers, e-mail addresses and external payment links; full audit of every message; moderation hooks; explicit attachment policy (allowed MIME types, size cap, malware scan, no executables); a defined retention period; the relay closes a fixed period after the order/quote closes.

| Option | Pros | Cons |
|---|---|---|
| **A — internal messaging only** | Full control, simplest privacy story | Poor reachability; sellers miss time-critical quotes |
| **B — masked e-mail relay only** | Familiar to sellers | Hard to moderate, weaker audit, address leakage risk |
| **C — internal messaging as the record + e-mail notifications/relay** | Single auditable source of truth, good reachability, moderation before delivery | More moving parts |

**Preference: OPTION C.** The internal thread is the system of record; notifications carry a link, not content-critical PII; inbound relay replies are ingested into the thread and moderated. Not implemented in this stage.

---

## 9. Multi-seller cart

**Recommendation (explicit, not implicit):**

* The cart is split into **fulfillment groups**, one per `(merchant_store, fulfillment_origin, handling class bucket)`.
* Each group carries its **own** shipping cost, carrier, service and delivery window; free shipping is evaluated per group, never across sellers.
* Checkout does **not** block ready groups while another group waits for a manual quote. Groups with an automatic rate (or an accepted quote) are payable; quote-pending groups stay in a pending state and become payable after acceptance.
* Order shape: **one parent checkout → one parent order → per-merchant/per-group sub-orders.** Money, shipping, tax snapshots and fulfilment state live on the sub-order.
* Strict isolation: a seller sees only its own sub-order, group, quote thread and shipping data — never another seller's presence, items, prices or carrier.

---

## 10. Market visibility vs delivery — independent flags

Proposed independent flags (no flag may be derived from another):
`market_browsing_enabled`, `local_market_enabled`, `delivery_enabled`, `automatic_rate_available`, `manual_quote_enabled`, `tax_checkout_ready`, `seller_eligible`, `currency_supported`.

| Situation | Outcome |
|---|---|
| Local market + automatic route | Direct purchase (future) |
| Global market + automatic route | Direct purchase (future) |
| Global market + manual quote only | Shipping quote request |
| Delivery explicitly disabled | Not deliverable — the only case that shows "delivery unavailable" |
| Tax not ready for destination | Browsing allowed; checkout **fail-closed** |
| Seller not eligible for destination | No purchase from that seller; other sellers unaffected |

---

## 11. Tax interaction (no tax schema change)

* Destination country drives the applicable jurisdiction — never the browsing market, never the origin.
* The seller's VAT/OSS profile (`company_tax_profiles`) decides which regime applies and whether destination VAT or origin VAT is due.
* Product tax classification (`catalog_product_tax_classifications`) is resolved per destination country, per the classification window.
* A cart with mixed VAT rates makes **shipping VAT allocation ambiguous**. This design records it as an unresolved, separately authorised topic: allocation (proportional to net goods value vs highest-rate vs dominant-rate) must be decided in its own stage before any checkout maths exists.
* Manual quotes are stored **VAT-exclusive plus an explicit VAT treatment field**; the customer-facing total is computed by the platform, not typed by the seller.
* **The carrier's invoice VAT is not the customer's shipping VAT.** They are separate records and must never be equated.
* Every future order snapshots the tax version, classification, VAT treatment and the shipping VAT allocation actually used.
* `zero_rated` / `exempt` remain barred from B2C baseline (R-T17), including on shipping charges.

---

## 12. Pricing interaction with `merchant_store_offer_prices`

| Question | Answer |
|---|---|
| Does `GLOBAL` use a destination-specific price? | Yes — the final price is always the destination country's price row |
| What is shown before a destination is chosen? | A **"from" / reference price** with an explicit label, never a binding price |
| NL price exists, SE price missing? | The NL price is **never** promoted to the SE final price. The item is browsable (reference price) and either quote-requestable or not purchasable until an SE price version exists |
| Base/global product price usable? | Only as a **presentation fallback** for browsing; it is never a commercial price |
| Is `GLOBAL` an independent price scope? | No — presentation fallback only |
| Can a shipping quote change the product price? | Never. Product price changes only through an approved price version |

---

## 13. Publication interaction — the public evaluator

A published listing is **not** globally published. Publication must be scoped by: market visibility scope, delivery scope, seller eligibility, price availability, shipping availability or quote capability, and tax readiness.

Proposed evaluator, returning five independent booleans:

| Capability | Requires |
|---|---|
| `browsable` | market browsing enabled + listing visible in market + seller enabled in market |
| `price_visible` | destination-valid price **or** an explicitly labelled reference price |
| `deliverable` | delivery enabled for destination + seller eligible + automatic rate resolvable |
| `quote_requestable` | delivery enabled + seller eligible + manual quote enabled + no automatic rate |
| `purchasable` | `price_visible` (binding) + (`deliverable` or accepted quote) + `tax_checkout_ready` + stock |

Publishing in NL grants NL scope only; every additional market/destination is an explicit scope row.

---

## 14. Tenancy and RLS design (proposed, not implemented)

| Object | Tenant owner | Seller | Customer | Admin | Service worker |
|---|---|---|---|---|---|
| Fulfillment origins | merchant company | read/write own | none | read (permission-specific) | read |
| Shipping profiles | merchant company (per SKU/listing) | read/write own | none (derived data only) | read | read |
| Rate cards / rules — merchant | merchant company | read/write own | none | read | read |
| Rate cards / rules — platform contracts | platform-global | read only when enrolled | none | read/write (permission-specific) | read |
| Quote requests | merchant company + customer | read own; respond | read own | read | read/limited write (expiry) |
| Quotes / versions | merchant company | create; immutable after send | read own; accept/reject | read | read |
| Quote messages | thread-scoped | own thread, masked | own thread, masked | read (moderation permission) | write (system messages) |
| Fulfillment groups | derived from parent checkout | own group only | own checkout only | read | read/write |

Rules: cross-merchant isolation is absolute — no policy may expose another merchant's rows through a shared parent checkout. **A general "platform admin" role is not an authorisation substitute**: each read/write above requires a specific permission (e.g. `shipping.rates.read`, `quotes.moderate`), following the M1A #2D-1A role governance. All new objects must comply with BOR-DEC-057: explicit grants, deny-by-default ACLs, and — per R-T20 — a post-commit owner/default-ACL/privilege-matrix verification in every migration that creates objects.

---

## 15. Audit and R-5 constraint

R-5 (audit rows written inside a `RAISE EXCEPTION` path roll back) is **still open**. Therefore:

* Draft-only permitted before R-5 closure: creating origins, shipping profiles, draft rate cards/rules. These are merchant-local configuration with no customer money effect.
* **Blocked until R-5 closes:** rate card activation, quote send, quote acceptance, quote expiry automation, any state transition with a financial or contractual effect — because a denied/failed transition would lose its audit row.
* Accepted / rejected / expired quotes must be recorded as **state rows plus append-only audit events**, not as an overwrite of a single status column.
* A seller amount change is recorded as a new quote **version** with the previous version audited as `superseded` (amount never edited in place).
* Customer acceptance stores actor, timestamp, version id, the exact total shown, and the price/tax versions in force.
* Audit architecture itself is not implemented in this stage.

---

## 16. Abuse and marketplace controls

| Risk | Control |
|---|---|
| Excessive shipping price | Per-destination sanity bands, ratio-to-goods-value alerts, admin review flag, customer-visible comparison where a platform rate exists |
| Deal pulled off-platform | Content filtering in the relay, link/e-mail/phone blocking, audit, seller strikes, order-value-based penalties |
| Quote sent after stock ran out | Mandatory stock revalidation at quote send **and** at acceptance; auto-`superseded` on failure |
| Quote spam by customers | Rate limits per customer/day, per merchant/day, open-request cap, reputation gating |
| Relay spam | Rate limits, moderation hooks, attachment policy, auto-mute thresholds |
| Currency mismatch | Quote currency must equal the fulfillment group's settlement currency; no implicit conversion |
| Quote manipulation | Immutable versions, server-computed totals, expiry, signed snapshot of inputs |
| Shipping used to dodge commission | Commission computed on goods + shipping margin, ratio monitoring, capped shipping-to-goods ratio |
| Delivery-time disputes | Estimated window stored on the accepted version; carrier/tracking recorded; dispute workflow references the version |
| Extra payment demanded post-order | Structurally impossible: no amount outside an accepted version; relay filters payment links |

---

## 17. Proposed object inventory (names not adopted; no creation)

| Object | Purpose | Owner | Key columns | Status field | Immutability | Audit | RLS | Retention |
|---|---|---|---|---|---|---|---|---|
| `merchant_fulfillment_origins` | Dispatch points | merchant company | company_id, store_id?, warehouse_id?, kind, country_code, postal_code, is_default, is_active | active/inactive | mutable; snapshotted on orders | yes | merchant-scoped | permanent |
| `catalog_sku_shipping_profiles` | Physical shipping attributes | merchant company (per SKU) | sku_id, weight, dims, handling_class, flags, parcel rules | draft/active | versioned on change | yes | merchant-scoped | permanent |
| `shipping_rate_cards` | Contract envelope | merchant **or** platform | owner_scope, company_id?, carrier, service, currency, validity window | draft/active/superseded/archived | immutable once active (new version instead) | yes | merchant-scoped / platform-global | permanent |
| `shipping_rate_rules` | Priced rows | inherits card | card_id, origin/destination country+zone, weight/parcel ranges, price, free rules | inherits card | immutable once card active | yes | inherits card | permanent |
| `shipping_zones` *(evaluate need)* | Reusable postal groupings | platform + merchant override | scope, country, postal patterns | active/draft | mutable while draft | yes | mixed | permanent |
| `shipping_quote_requests` | Customer ask | merchant + customer | group snapshot, destination, items, deadline | state machine §7 | snapshot immutable | yes | dual-scoped | policy-based (e.g. 24 months) |
| `shipping_quotes` | Current quote head | merchant | request_id, current_version_id, state | state machine | head mutable, versions not | yes | dual-scoped | as request |
| `shipping_quote_versions` | Binding priced offer | merchant | amount, currency, carrier, service, window, expiry, notes | sent/accepted/rejected/expired/superseded | **immutable after send** | yes | dual-scoped | as request |
| `shipping_quote_messages` | Masked thread | thread | thread_id, sender_role, body, attachments, moderation state | ok/held/blocked | append-only | yes | thread-scoped | defined retention, then purge |
| `checkout_fulfillment_groups` | Per-origin split | derived | checkout_id, store_id, origin_id, shipping source, amounts | pending/priced/quote_pending/ready | snapshot at confirmation | yes | customer + owning merchant | as order |
| `market_definitions` / `market_country_enablement` | Market entity + flags | platform-global | market_code, country_code?, currency, locale, flags | active/disabled | mutable, audited | yes | platform-global read | permanent |
| `merchant_market_enablement` | Seller ↔ market | merchant | company_id/store_id, market_code, flags | active/disabled | mutable | yes | merchant-scoped | permanent |
| `merchant_destination_eligibility` | Seller ↔ destination country | merchant | store_id, country_code, delivery_enabled, quote_enabled | active/disabled | mutable | yes | merchant-scoped | permanent |

**Duplication review:** `warehouses` already exists and is **reused** (origins reference it; no parallel location truth). `inventory_reservation_*` already exists and is **reused** with a distinct quote-reservation policy rather than a new reservation stack. `merchant_stores`, `company_members`, `user_roles`, `outbox_events` and the audit tables are reused as-is. A dedicated `shipping_zones` object is only justified if postal-level routing is needed at M1C-1C; otherwise country-level keys suffice and it is deferred.

---

## 18. Proposed migration decomposition (none started)

| Stage | Scope |
|---|---|
| **M1C-1B** | Fulfillment origin + SKU shipping profile foundation (schema, RLS, grants, guards; draft-only) |
| **M1C-1C** | Automatic route / rate-card foundation (cards, rules, non-overlap constraints, resolver function; no active rates) |
| **M1C-1D** | Manual shipping quote foundation (request/quote/version state machine, reservation policy; no send/accept until R-5) |
| **M1C-1E** | Masked communication foundation (thread, relay identity, moderation hooks) |
| **M1C-1F** | Read-only seller/admin shipping UI |

Every stage must carry a BOR-DEC-057/R-T20 compliance block: object owner check, owner default-ACL check, post-commit privilege matrix, and an assertion that `sandbox_exec` and the application roles received no automatic privileges.

---

## 19. Future test plan (minimum 30 assertions)

1. Seller cannot use another company's origin (DB-enforced)
2. NL→SE and DE→SE resolve to independent rates
3. No local market for SE does not block delivery to SE
4. IP does not determine the checkout country
5. Customer-selected country overrides IP
6. Saved delivery address overrides saved market preference
7. Automatic rating picks the correct origin for the listing
8. Weight boundaries do not overlap within a card
9. Rate validity windows do not overlap for the same key set
10. Volumetric weight beats actual weight when larger
11. Multi-parcel items are rated per parcel, not per SKU
12. Oversized/pallet/dangerous items bypass automatic rating
13. `pickup_only` items are never delivery-rated
14. Manual quote starts only when no automatic rate exists or the seller forces it
15. "Delivery unavailable" appears only on explicit disable or `pickup_only`
16. Seller never sees the customer's real e-mail
17. Customer never sees the seller's personal e-mail
18. Quote amount immutable after send
19. Amount change creates a new version and voids prior acceptance
20. Expired quote cannot be accepted
21. Rejected quote cannot reach payment
22. Only an accepted, non-expired quote reaches checkout
23. Stock revalidation runs before payment
24. Tax revalidation runs before payment
25. Multi-seller isolation: no seller sees another seller's group/thread/prices
26. Shipping groups price independently; free shipping never crosses sellers
27. `zero_rated`/`exempt` never enter the B2C baseline, including shipping
28. NL price is never used as the final SE price
29. No external payment links survive relay moderation
30. No direct table DML for application roles on any new object
31. New object ACLs are deny-by-default (BOR-DEC-057)
32. R-T20 post-commit ACL check passes in every object-creating migration
33. P5-HF-001 intact (`place_order` revoked)
34. Bol Live off, Stripe Live off

---

## 20. Risks

| Id | Risk | Status |
|---|---|---|
| R-S1 | Shipping VAT allocation across mixed-rate carts undefined | **Blocker for checkout maths** — separate stage required |
| R-S2 | Quote reservation policy may deadlock against checkout reservations | Design constraint: separate policy, shorter TTL, explicit release |
| R-S3 | Rate resolution ambiguity when several scopes match | Mitigated by the fixed precedence + persisted resolution trace |
| R-S4 | Relay leakage of PII through attachments or free text | Mitigated by moderation hooks + attachment policy; needs implementation stage |
| R-S5 | Seller shipping-price abuse | Sanity bands + monitoring; needs thresholds defined at M1C-1C |
| R-5 | Denied-write audit rows roll back | **Open** — blocks all financial/contractual quote transitions (§15) |
| R-T20 | Platform-owner default ACLs need continuous verification | **Open, non-blocking** — mandatory check in every object-creating migration |
| R-T13 / R-T15 / R-T17 | Tax legal metadata, approval/activation, ZERO/EXEMPT treatment | Open — block checkout, not this design |

---

## 21. Zero-change confirmation

* Migrations executed: **0**
* Tables / functions / triggers / policies / grants created or altered: **0**
* Rows inserted / updated / deleted: **0**
* Application code changed: **0 files**
* Deliverable: this document only
* `place_order` remains revoked (P5-HF-001 intact); Bol Live off; Stripe Live off; tax data unchanged (9 draft bands, 5 draft rate versions)

---

## 22. Proposed decisions (for Owner adoption)

**BOR-DEC-058 — LOCAL MARKET AVAILABILITY IS SEPARATE FROM DELIVERY ELIGIBILITY**
A market and a delivery destination are independent objects with independent flags. The absence of a local market never implies the absence of delivery; the presence of a market never implies delivery. IP only pre-selects a market; the delivery address alone determines destination, tax eligibility, shipping eligibility and final price validation.

**BOR-DEC-059 — SHIPPING IS CALCULATED PER FULFILLMENT ORIGIN AND DESTINATION**
Every shipping price derives from an explicit `fulfillment_origin → destination` pair with merchant scope. No platform-wide flat rate exists. Origin is snapshotted immutably onto a confirmed order.

**BOR-DEC-060 — MISSING AUTOMATIC SHIPPING RATE FALLS BACK TO AN IN-PLATFORM QUOTE**
Absence of an automatic rate produces a binding, versioned in-platform quote, never an "unavailable" message, unless the destination is explicitly disabled or the item is pickup-only. Payment occurs only after the customer accepts a non-expired quote version showing the full product + VAT + shipping total.

**BOR-DEC-061 — CUSTOMER AND SELLER COMMUNICATION REMAINS MASKED INSIDE BORVAT**
Option C: internal messaging as the system of record plus masked notification/relay. Real e-mail addresses are never exchanged; external payment links are blocked; every message is audited, moderatable and retention-bound.

**BOR-DEC-062 — MULTI-SELLER CHECKOUT USES INDEPENDENT FULFILLMENT GROUPS**
A cart splits into fulfillment groups per (merchant store, origin, handling class). Each group prices its own shipping; a parent checkout produces a parent order with per-merchant sub-orders; ready groups are payable without waiting for pending quotes; no seller sees another seller's data.

---

**Final verdict: SAFE SHIPPING AND GLOBAL MARKET ARCHITECTURE IDENTIFIED.**
Halted. M1C-1B and any schema implementation require separate Owner authorization. Shipping foundation, seller pricing, tax approval/activation, product classifications, publication transitions, public storefront, checkout reactivation, Bol Live and Stripe Live remain blocked.
