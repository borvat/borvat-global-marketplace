# PHASE 5 — M1C-1D-A — DELIVERY PROMISE PROFILE AND FINAL ETA COMPOSITION PRECHECK

**Stage:** M1C-1D-A (design and analysis only)
**Date:** 2026-07-26
**Authorization:** Owner — "M1C-1D-A ONLY"
**Changes made by this stage:** **ZERO.** No migration, no table, no function, no data, no RPC, no UI,
no resolver, no publication, no cart/checkout, no manual quote, no carrier call, no Bol/Stripe live.
The only writes are Markdown documents under `docs/`. Database access was **read-only** (`SELECT`
plus pure function evaluation).

---

## 0. Executive verdict

**SAFE DELIVERY PROMISE ARCHITECTURE IDENTIFIED**

with two recorded findings that constrain later stages:

- **R-S4 — PALLET FULFILMENT CLASS NOT YET AUTHORITATIVELY REPRESENTED** (new, from §2).
- **R-C1 — PRE-EXISTING CHANNEL CONNECTIONS MARKED LIVE** — verified in §15 as
  **LIVE MODE METADATA ONLY — OPERATIONALLY DISABLED**, with one legacy predicate caveat that must be
  closed before any outbound feature.

No architecture conflict was found between the proposed delivery-promise model and the M1C-1B /
M1C-1C shipping foundation.

---

## 1. Bol-inspired business interpretation

On bol.com the customer never sees "handling time" or "transit time". The customer sees one sentence:
*"Besteld voor 15:00, morgen in huis"* or *"Bezorging dinsdag 4 maart"*. That single sentence is the
**output** of at least five independent inputs owned by different parties:

| Input | Owned by | Example |
| --- | --- | --- |
| Order acceptance + cut-off time | Merchant (or platform if platform-fulfilled) | orders before 15:00 CET count for today |
| Handling / pick-pack duration | Merchant | 0–2 business days |
| Handover calendar to the carrier | Merchant + origin site | Mon–Fri, no Saturday collection |
| Route transit duration | Carrier + route (origin → destination) | NL→NL 1 day, NL→SE 3–5 days |
| Delivery weekdays at destination | Carrier + destination country | no Sunday delivery in SE |

Borvat must model these five separately, exactly as Bol does internally. Squeezing them into one
"delivery days" number is the single most common cause of broken promises, because the same merchant
profile then produces the same promise for Amsterdam and for Kiruna, and a Friday 16:00 order is
treated like a Monday 09:00 order.

**Formula (target, not implemented):**

```text
order_accepted_at (origin timezone)
  → cut-off evaluation for that weekday        → effective_order_day
  → + handling business days (origin calendar)  → ready_for_handover_day
  → next permitted handover weekday, minus blackouts → handover_day
  → + transit business days (route rule, min..max) → arrival_window
  → snap to permitted delivery weekdays at destination, minus destination holidays
  → customer_eta_from .. customer_eta_to
```

---

## 2. Handling classes — mapping proof (Owner note 2)

The **profile-side vocabulary** (M1C-1B, `merchant_store_sku_shipping_profiles`) is:

```text
handling_class CHECK IN ('standard','fragile','bulky','cold_chain','high_value')
+ boolean flags: oversized, dangerous_goods, pickup_only, can_combine_with_other_items
```

The **rate-side vocabulary** (M1C-1C, `shipping_rate_rules`) is:

```text
handling_class CHECK IN ('standard','oversized','pallet','pickup_only','dangerous_goods')
+ CHECK srr_no_pickup_only_ck  → 'pickup_only' rows are rejected outright
```

Authoritative mapping (verified live against both CHECK constraints):

| Rate class | Derived from | Fail-closed? | Status |
| --- | --- | --- | --- |
| `standard` | `handling_class IN ('standard','fragile','cold_chain','high_value')` **and** `oversized = false` **and** `dangerous_goods = false` **and** `pickup_only = false` | yes | **REPRESENTABLE** |
| `oversized` | `oversized = true` (boolean flag; `bulky` alone is a packing hint, not the authority) | yes | **REPRESENTABLE** |
| `dangerous_goods` | `dangerous_goods = true` | yes — a rate row alone never makes DG shippable; carrier DG capability is still required | **REPRESENTABLE** |
| `pickup_only` | `pickup_only = true` | yes — the database rejects any `pickup_only` rate rule, so such SKUs can never obtain an automatic parcel rate or a parcel ETA | **REPRESENTABLE (as a prohibition)** |
| `pallet` | **no source signal exists** | **NO** | **NOT REPRESENTABLE** |

`bulky` **must not** be silently promoted to `pallet`: `bulky` is a single-parcel size hint, while
`pallet` is a different freight product (LTL/pallet network, tail-lift, appointment delivery, pallet
exchange). Reading `pallet` out of `bulky` would auto-enable a freight product the merchant never
declared.

> **R-S4 — PALLET FULFILMENT CLASS NOT YET AUTHORITATIVELY REPRESENTED.**
> `shipping_rate_rules.handling_class` accepts `pallet`, but no M1C-1B profile signal can produce it.
> Until an explicit, fail-closed source signal exists (a future `freight_class` / `pallet` declaration
> on the store-SKU shipping profile), **no resolver may select a `pallet` rate**, `bulky` must never be
> mapped to `pallet`, and any pallet rate rows created for testing must be treated as unreachable.
> Owner-facing impact: pallet shipping is out of scope for the first automatic-rate release.

---

## 3. Seller handling versus carrier transit

**Ruling to adopt (BOR-DEC-071):** seller handling time and carrier transit time are two different
objects, owned by two different parties, versioned on two different cycles.

- **Seller handling** (per merchant store, per origin): cut-off, handling business days, handover
  weekdays, same-day handover capability, origin timezone. Changes when the warehouse changes shifts.
- **Carrier transit** (per route + service): min/max transit business days from an origin (exact or
  country) to a destination country, permitted delivery weekdays. Changes when the carrier changes its
  network or the platform renegotiates.

Consequences: one delivery promise profile reused across 40 destinations yields 40 different ETAs; the
same SKU shipped from a German origin instead of a Dutch one yields a different ETA with the *same*
profile; and a merchant editing his cut-off must never silently alter carrier transit assumptions.

---

## 4. Profile scope

Recommended primary object: **`merchant_delivery_promise_profiles`**.

- Tenant owner: `company_id` **and** `merchant_store_id` (both NOT NULL for merchant profiles),
  with composite FKs to `merchant_stores(id, company_id)` exactly as M1C-1B/M1C-1C do.
- **Reusable**: one profile serves many offers; it is never per-product.
- **Never linked to `catalog_products`** (global catalog content is shared across tenants; a promise is
  a merchant operational fact). The operational binding level is:
  `merchant_store + store-SKU/listing + fulfillment_origin + delivery_promise_profile`.
- Platform-fulfilled profiles use the same table with `scope_type = 'platform'` and NULL tenancy
  columns — mirroring `shipping_rate_cards`, so exactly one scoping idiom exists platform-wide.
- Versioned (`version`, `supersedes_profile_id`) and immutable after activation (§11).
- Origin contract: a profile is associated with one or more `merchant_fulfillment_origins` of the same
  company **and** store; a profile may never reference a retired/inactive origin for operational use.

---

## 5. Fulfillment modes

Proposed allowlist (**not implemented in this stage**):

```text
fulfillment_mode IN ('merchant_fulfilled','platform_fulfilled','manual_quote')
```

| Mode | Who controls cut-off/handling/handover | Who controls the promise | Analogy |
| --- | --- | --- | --- |
| `merchant_fulfilled` | merchant | merchant profile | Bol "verzending door de verkoper" |
| `platform_fulfilled` | Borvat (origin, carrier/service, cut-off, handling) | **platform profile overrides any merchant profile** | Bol "Shipping via bol" / LVB |
| `manual_quote` | neither — the accepted quote is authoritative | the accepted quote's ETA, never an automatic profile | freight/oversize/long-haul |

`fulfillment_mode` is immutable after activation: switching modes is a new profile version, because it
changes who is contractually responsible for the promise.

---

## 6. Weekly cut-off and handover schedule

Normalized child table — **no JSON blob**:

**`merchant_delivery_promise_weekly_schedules`** — one row per ISO weekday (1=Mon … 7=Sun) per profile
version:

| Column | Meaning |
| --- | --- |
| `iso_weekday` (1–7, unique per profile) | the weekday |
| `accepts_orders` boolean | are orders counted for this day at all |
| `cutoff_local_time` time (NULL when not accepting) | e.g. `15:00` |
| `handover_to_carrier` boolean | is there a collection/drop-off this day |
| `handling_business_days` smallint ≥ 0 | 0 = same-day handover eligible before cut-off |
| `same_day_handover_allowed` boolean | explicit, never inferred from `handling_business_days = 0` |

Rules (design-level, to be enforced by CHECK + trigger later):
- Missing weekday rows are **not** "open by default"; 7 rows are mandatory, absence is fail-closed.
- Order after cut-off → rolls to the next weekday with `accepts_orders = true`.
- Ready-for-handover day that is not a `handover_to_carrier` day → rolls forward to the next one
  (this is what makes "Friday 16:00 → Monday handover" correct without special-casing weekends).

**Time-zone contract:** an IANA timezone (e.g. `Europe/Amsterdam`) is **mandatory** and stored on the
profile, with an optional stricter override on the fulfillment origin (the origin wins when present).
Server timezone, UTC-by-default and browser timezone are all forbidden as implicit sources. All stored
times are *local wall-clock* times interpreted in that zone, so DST is handled at evaluation time
rather than being frozen into a UTC offset.

---

## 7. Transit model

Separate platform-level object: **`shipping_transit_time_rules`**.

| Column group | Content |
| --- | --- |
| Scope | `platform` or `merchant_store` (same idiom as rate cards); optional `shipping_rate_card_id` **or** `carrier_code`/`service_code` |
| Origin | `origin_scope_type IN ('exact_origin','origin_country')` + `fulfillment_origin_id` or `origin_country_code` — identical shape to `shipping_rate_lanes` |
| Destination | `destination_country_code` (ISO 3166-1 alpha-2), optional postal-area refinement later |
| Handover | `handover_iso_weekday` (nullable = all weekdays) |
| Duration | `min_transit_business_days`, `max_transit_business_days` (`max >= min`) |
| Delivery days | permitted delivery weekdays (child table `shipping_delivery_weekdays`, or a 7-bit smallint set — see §16) |
| Validity | `valid_from` / `valid_to`, `draft \| active \| inactive \| superseded \| retired` |

Examples: NL→NL 1–1; NL→BE 1–2; NL→SE 3–5; DE→SE 2–4. The same delivery-promise profile therefore
produces four different ETAs.

Overlap control: a `btree_gist` exclusion on (scope, carrier/service, origin key, destination,
handover weekday, validity range) so two active rules can never both match — the same anti-ambiguity
discipline adopted in BOR-DEC-066.

---

## 8. Final ETA display contract

| Situation | Customer-facing contract |
| --- | --- |
| Destination unknown (browse/PDP without address) | `"Levertijd afhankelijk van bezorgland"` **or** a clearly non-binding reference range for the merchant's home country, labelled as indicative |
| Destination known | computed date or range: *"Bezorging dinsdag–woensdag"* |
| Order placed after cut-off | recomputed automatically against the **next** accepted order day and the next handover day; the UI must never keep a stale "order within 2h" countdown |
| `manual_quote` | *"3–5 werkdagen na acceptatie van de verzendofferte"* — never merged with, nor formatted like, an automatic date |
| No valid profile / no transit rule | **fail-closed**: no ETA is displayed and checkout for that fulfilment group is not permitted (§18) |

An ETA is always stored with the fulfilment group at order time (snapshot), never recomputed for
historical orders.

---

## 9. Assignment and precedence

Resolution order (fail-closed at the end):

1. Listing / store-SKU assignment bound to the **exact chosen origin**.
2. Store-SKU default profile.
3. Store default profile.
4. Platform-fulfilled profile (when `fulfillment_mode = 'platform_fulfilled'`, this **precedes** all
   merchant profiles — see BOR-DEC-073).
5. Manual quote.
6. **Fail-closed** — no ETA, no checkout.

Hard prohibitions: never a profile of another company or another store (composite FKs make it
structurally impossible); never a profile bound to an inactive/retired origin; never a "nearest
match" heuristic across tenants.

---

## 10. Platform versus merchant fulfilment

For `platform_fulfilled` offers Borvat owns origin, carrier, service, cut-off, handling and promise.
The merchant's own profile is ignored — not merged, not used as a fallback — because the promise is
Borvat's contractual statement to the customer. This mirrors "Shipping via bol": the seller's own
handling schedule becomes irrelevant once stock sits in the platform's fulfilment network.

---

## 11. Manual quote interaction

A `manual_quote` fulfilment group takes both its charge and its ETA from the **accepted quote
version**. Blind fallback to an automatic profile is forbidden: a quote is a binding commercial
statement, and the automatic profile may describe a different carrier product entirely. If the quote
expires or is superseded before checkout, the group returns to fail-closed, not to the automatic ETA.

---

## 12. Holidays and blackouts

Design (not implemented): **`shipping_calendar_blackouts`**, versioned rows with a scope discriminator:

- `merchant_closure` (company/store), `origin_closure` (warehouse/origin site),
  `carrier_holiday` (carrier/service), `destination_public_holiday` (country),
  `temporary_blackout`, `emergency_suspension`.
- Date range (`from_date`, `to_date`), optional country/carrier/origin keys, `status`, `valid_from`.
- Effect: blackout days are skipped when computing handover day and when snapping the arrival window
  to delivery weekdays. `emergency_suspension` additionally suppresses the ETA entirely (fail-closed).

**No hardcoded holiday list inside any function.** Calendars are data, versioned and auditable, so
that "Koningsdag 2027" is a row, not a deployment.

---

## 13. Customer-selected delivery date (analysis only)

Profile-level flags to consider later: `customer_date_selection_enabled`, `min_selectable_offset_days`,
`max_horizon_days`, allowed delivery weekdays (reuse §7 child table), a per-day capacity limit, and a
required carrier capability flag (the carrier service must actually support date-scheduled delivery).
Selection must be validated server-side against the *same* composition engine — a customer must not be
able to pick a date the calendar cannot produce. **No calendar booking and no capacity engine now.**

---

## 14. Multi-parcel and special handling

| Signal | Handling time | Carrier selection | ETA | Deliverability |
| --- | --- | --- | --- | --- |
| multi-parcel | may add handling; group must arrive as one promise (use the **latest** parcel ETA) | must support multi-piece | widest window | yes |
| `fragile` | may add packing time | packaging-capable service | slightly later | yes |
| `bulky` / `oversized` | usually +1 day | oversized-capable service | later, fewer delivery weekdays | yes |
| `cold_chain` | cut-off usually earlier, handover days restricted | cold-chain-capable only | narrower windows | **only** with an explicit capability |
| `high_value` | may need signature/insurance | insured service | unchanged | yes |
| `dangerous_goods` | declaration time | DG-certified only | route-restricted | **fail-closed by default** |
| `pickup_only` | n/a | none | **no parcel ETA at all** | pickup only |
| `pallet` | n/a today | n/a | n/a | **blocked by R-S4** |

Governing rule: **the existence of a shipping rate is never proof of capability.** DG and cold chain
require an explicit carrier-capability declaration; without it the group is fail-closed.

---

## 15. R-C1 — live-channel read-only verification

Read-only inspection of `public.channel_connections` (71 rows total, **9** with `mode = 'live'`),
`public.channel_kill_switches`, the dispatch gate functions and the worker code path. **No row was
modified, no sync was run, no Bol endpoint was contacted.**

| Fact | Observed |
| --- | --- |
| Live rows | 9, all `provider = 'bol'`, each a distinct company, each with a vault `secret_ref` |
| `live_sync_enabled` | `true` on all 9 |
| `live_authorized_at` | **NULL on all 9** |
| Connection kill switches | present but `writes_disabled = false` on the inspected live rows; global switch `writes_disabled = false` |
| `p4_dispatch_decision(channel_account_id)` | **`deferred_not_authorized` for all 9** (evaluated read-only) |
| `p4_writes_allowed(connection_id)` | **`true` for all 9** — legacy predicate, see caveat |
| Authorization path | `authorize_channel_live()` requires the GUC `app.p4_live_authorization_enabled = 'true'`, which is **not set**; the function is `service_role`-only |
| Scheduler | **no `pg_cron`, no `pg_net`** installed (extensions: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, btree_gist) |
| HTTP surface | **no `src/routes/api/**` exists**; no public webhook/cron route can reach the worker |
| Worker invocation | `src/lib/outbox/bol-worker.ts` is referenced only by `scripts/phase3-m2-tests.ts` and `scripts/phase4-m4-adapter-tests.ts`; it requires a service-role key and a manual run |
| Worker gate | the worker consults `p4_dispatch_decision` per event and only calls `dispatchLive` on `'live'` — which cannot currently be returned |
| Historical activity | 11 live dispatches, 9 shadow dispatches, 12 sync runs, 12 API audit rows, 222 outbox events, 35 channel orders — all Phase 3/4 test-era records, none produced this stage |

**Verdict: LIVE MODE METADATA ONLY — OPERATIONALLY DISABLED.** `mode = 'live'` alone cannot start a real
connection: it is defeated by `live_authorized_at IS NULL`, by the unset authorization GUC, by the
absence of any scheduler or HTTP trigger, and by the fact that the only dispatcher consults
`p4_dispatch_decision`.

**Caveat carried forward (part of R-C1, not a separate blocker):** `p4_writes_allowed()` — a Phase-4
predicate that does **not** check `live_authorized_at` — returns `true` for all 9 rows. It is
`service_role`-only and no current code path uses it for dispatch, but if a future feature adopts it as
its gate, it would wave those 9 connections through. **Required before any outbound feature:** either
align `p4_writes_allowed` with `p4_dispatch_decision` (add the `live_authorized_at` + GUC checks), or
normalise the 9 fixture rows back to `read_only`. Until then, R-C1 blocks outbound sync, order
ingestion, inventory publishing and any carrier/channel dispatch — it does **not** block
delivery-promise design.

---

## 16. Proposed object inventory (no implementation)

| Object | Purpose | Tenant owner | Key columns | Status/versioning | RLS | Immutability | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `merchant_delivery_promise_profiles` | reusable promise definition | company + store, or platform-scoped | `scope_type`, `company_id`, `merchant_store_id`, `fulfillment_mode`, `timezone`, `version`, `supersedes_profile_id` | draft/active/inactive/superseded/retired | enabled + forced, **0 policies, 0 grants** | frozen at activation | owner-only writes |
| `merchant_delivery_promise_weekly_schedules` | 7 weekday rows per profile version | inherits via composite FK | `iso_weekday`, `accepts_orders`, `cutoff_local_time`, `handover_to_carrier`, `handling_business_days`, `same_day_handover_allowed` | follows parent | as parent | frozen with parent | as parent |
| `merchant_delivery_promise_assignments` | binds store-SKU + origin (+ listing) → profile | company + store | `merchant_store_id`, `catalog_sku_id`, `fulfillment_origin_id`, `delivery_promise_profile_id`, `precedence_level` | active/inactive | as parent | assignment rows replaceable; the *profile version used* is snapshotted on the order | yes |
| `shipping_transit_time_rules` | route transit duration | platform or merchant store | origin scope + destination + carrier/service + min/max business days + validity | draft→retired | as parent | frozen at activation | yes |
| `shipping_calendar_blackouts` | closures & holidays | platform / company / store / origin / carrier / country | scope, keys, `from_date`, `to_date`, reason | versioned | as parent | append-preferred | yes |
| `shipping_delivery_weekdays` | permitted delivery weekdays per transit rule | inherits | `transit_rule_id`, `iso_weekday` | follows parent | as parent | with parent | — |

**De-duplication assessment.** `shipping_delivery_weekdays` is the only genuinely optional object — a
7-bit `smallint` mask on `shipping_transit_time_rules` would avoid a table at the cost of readability
and of any per-weekday metadata. Recommendation: **keep the child table** only if per-weekday metadata
(e.g. capacity, surcharge) is foreseen; otherwise use the mask. `merchant_delivery_promise_assignments`
must **not** duplicate `merchant_store_sku_fulfillment_origins` (M1C-1B): the assignment references the
existing origin-eligibility row rather than re-declaring which origins may serve the SKU. No object
here duplicates `shipping_rate_cards/lanes/rules`.

---

## 17. Migration decomposition (nothing started)

| Stage | Content |
| --- | --- |
| **M1C-1D-B** | Delivery promise profiles + weekly cut-off/handover schedule foundation (owner-only, zero rows) |
| **M1C-1D-C** | Store-SKU + origin assignment foundation with precedence, cross-tenant isolation |
| **M1C-1D-D** | Transit-time rules + delivery calendar/blackout foundation |
| **M1C-1D-E** | Read-only ETA composition contract and verification harness (no customer-facing output) |

Each stage: additive migration, mandatory ACL normalization section, ACL-gate inventory update,
fail-loud self-rolling-back harness, zero persistent rows, separate Owner authorization.

---

## 18. Interaction with M1C-1C rate cards (no change to that schema)

- A **rate card/rule** answers *"how much does the customer pay?"*.
- A **transit rule** answers *"how long is the road?"*.
- A **delivery promise profile** answers *"when does the merchant hand it over?"*.
- The future resolver combines all three per fulfilment group.

Therefore: a rate without an ETA is possible (price known, promise unknown); an ETA without a rate is
possible (promise known, price unknown). Either gap leads to **manual quote** or **fail-closed** — never
to a guessed value, and **missing ETA never permits checkout**. `shipping_rate_cards`,
`shipping_rate_lanes` and `shipping_rate_rules` are untouched in this round.

---

## 19. Interaction with product listing

At offer creation the merchant declares, as **independent** objects: fulfilment mode, eligible origin(s),
shipping profile (M1C-1B), delivery promise profile, visible markets, deliverable destinations. Catalog
content, offer price, shipping rate, delivery promise and market visibility remain five distinct
objects; none is derived from another, and none is stored on `catalog_products`.

---

## 20. R-5 and write restrictions

R-5 (denied-audit rollback) remains **open**, therefore for every M1C-1D-* stage:

- **Allowed later:** owner-only tables, CHECK/FK/exclusion constraints, guard triggers, comments.
- **Blocked until R-5 closes:** any seller write RPC, any activation RPC, any profile publish
  transition, any admin approval-on-behalf, and any status transition invoked by an application role.

Foundation objects may therefore be created as owner-only structures whose *only* mutation path is a
migration, exactly as in M1C-1B and M1C-1C.

---

## 21. Test plan for the M1C-1D-* stages (≥ 30 points)

1. Profile cannot reference another company. 2. Profile cannot reference another store.
3. Assignment cannot use an origin of another store. 4. Inactive/retired origin cannot back an
operational profile. 5. Same-day handover before cut-off. 6. After cut-off rolls to the next accepted
day. 7. Friday-evening order → Monday handover. 8. Weekend/`handover_to_carrier = false` respected.
9. Timezone explicit; server timezone never used. 10. DST boundary produces the correct local cut-off.
11. Missing weekday row is fail-closed. 12. NL→NL differs from NL→SE. 13. Same SKU from a DE origin
gives a different ETA. 14. Missing rate does not imply missing ETA. 15. Missing ETA blocks checkout.
16. `platform_fulfilled` overrides the merchant profile. 17. `manual_quote` uses the quote ETA, never
the automatic profile. 18. Expired quote → fail-closed, not automatic fallback. 19. Active profile is
immutable. 20. Supersession does not alter historical orders (snapshot proof). 21. Blackout delays
handover. 22. Destination public holiday shifts the delivery date. 23. Emergency suspension removes
the ETA. 24. Destination delivery weekdays respected. 25. Multi-parcel supported (latest-parcel ETA).
26. Dangerous goods fail-closed without a carrier capability. 27. Pickup-only never receives a parcel
ETA. 28. Pallet remains unreachable (R-S4). 29. Cross-tenant isolation across all new tables.
30. No direct table DML for `anon`/`authenticated`/`service_role`/`sandbox_exec`. 31. ACL gate includes
every new object. 32. No `proacl = NULL` on any non-RPC routine. 33. `place_order` remains fail-closed.
34. Bol Live off, Stripe Live off. 35. `channel_connections.mode='live'` gating re-verified.
36. Zero persistent rows after every foundation harness.

---

## 22. Risk status

| Risk | Status after M1C-1D-A |
| --- | --- |
| **R-5** — denied-audit rollback | **OPEN** — blocks all seller/activation write RPCs (§20) |
| **R-S1** — active-origin enforcement | Partially closed in M1C-1C; delivery-promise assignments must repeat the check |
| **R-S2** — retired-after-assignment | Hardened in M1C-1C; the same retirement guard must extend to promise assignments |
| **R-S3** — interim address minimum | **OPEN** — destination-level ETA accuracy will eventually need postal granularity |
| **R-S4** — pallet class not authoritatively represented | **NEW, OPEN** (§2) |
| **R-C1** — pre-existing live channel connections | **OPEN, verified metadata-only** (§15); blocks outbound features, not this design |
| **R-T21 / R-T22** — ACL drift / historical sequence grants | Unchanged; every future M1C-1D object must enter the gate inventory |

---

## 23. Proposed decisions

- **BOR-DEC-070** — Delivery promise profiles are reusable per merchant store and assigned to store-SKU
  origin offers.
- **BOR-DEC-071** — Seller handling time is separate from carrier transit time.
- **BOR-DEC-072** — Final customer ETA is composed from cut-off, handover, route transit and delivery
  calendars.
- **BOR-DEC-073** — Platform-fulfilled offers use platform delivery promises.
- **BOR-DEC-074** — Delivery-promise versions are immutable after activation.

---

## 24. Zero-change confirmation

- Migrations executed: **0**. Tables/functions/triggers created or altered: **0**. Rows inserted,
  updated or deleted: **0** (verified by using `SELECT`-only statements and pure function evaluation).
- `channel_connections` unchanged: 71 rows, 9 live, all `live_authorized_at IS NULL`.
- Shipping foundation unchanged: cards/lanes/rules 0/0/0; origins/profiles/packages/assignments 0/0/0/0.
- Tax baseline unchanged: 4 categories / 9 bands / 5 rate versions. Offer prices 0, publications 0.
- `place_order` still fail-closed. Bol Live off. Stripe Live off.

**FINAL VERDICT: SAFE DELIVERY PROMISE ARCHITECTURE IDENTIFIED.**
Halting. M1C-1D-B, manual quotes, the resolver and any UI require separate Owner authorization.
