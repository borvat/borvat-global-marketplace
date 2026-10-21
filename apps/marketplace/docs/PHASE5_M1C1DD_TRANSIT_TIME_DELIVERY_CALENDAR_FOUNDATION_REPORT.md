# PHASE 5 — M1C-1D-D — TRANSIT-TIME AND DELIVERY-CALENDAR FOUNDATION REPORT

**Date:** 2026-07-26
**Scope:** schema foundation only. No ETA resolver, no promise↔transit linkage, no rate↔transit FK, no UI, no RPC, no manual quotes, no customer date booking, no checkout/orders, no carrier API, no labels, no publication, no persisted operational data.
**Verdict:** **M1C-1D-D PASS WITH RESIDUAL RISKS**

---

## 1. Read-only preflight

| Item | Finding |
|---|---|
| `shipping_rate_cards` / `_lanes` / `_rules` | present, 0/0/0 rows; scope contract `platform|merchant_store`, origin scope `exact_origin|origin_country`, text codes with regex CHECKs, UUID keys, no sequences |
| `merchant_fulfillment_origins` | present, 0 rows; composite key `(id, company_id, merchant_store_id)` available for declarative tenancy |
| `delivery_promise_profiles` / `_weekly_schedules` | present, 0/0 rows; carries handling days + IANA timezone (handover semantics) |
| `merchant_store_sku_delivery_promise_assignments` | present, 0 rows |
| Existing calendar / holiday model | **none exists** — no parallel model was created; a new versioned calendar foundation was required |
| Vocabularies | country `^[A-Z]{2}$`, currency `^[A-Z]{3}$`, carrier/service `^[A-Z0-9][A-Z0-9_]{1,31}$` — reused verbatim, no new vocabulary tables |
| Protected ACL inventory | 17 tables + `place_order` + `m1c1b/1c/1db/1dc` guards, owner-only |
| `place_order` | single signature, body "permanently disabled", `acl={postgres=X/postgres}` |
| `channel_connections` / `p4_dispatch_decision` | 9 `mode='live'` rows, all `live_authorized_at IS NULL`; dispatch remains `deferred_not_authorized`; untouched |

**Rate↔transit relation:** preflight did **not** prove a one-to-one mandatory relation (a card may cover many services and vice versa), therefore **no FK from rate rules to transit profiles was created**. Service mapping is deferred to a later resolver phase.

## 2. Migrations

| File | SHA-256 |
|---|---|
| `supabase/migrations/20260726150928_f60ba0f7-8276-41e9-a2a1-4f35f5718452.sql` (schema + ACL normalization) | `6acd4baba868e94e68f9210758d25bf1c240b76b8736f492dc2efbca8d3698b8` |
| `supabase/migrations/20260726151219_6c863dac-c016-4652-939b-18c0a78285b6.sql` (fail-loud rollback harness) | `75659b1449c0ed3a531d93c7c844b3e7716abbead931452978f66afac83dfd7f` |

## 3. Transit profile model

`public.shipping_transit_time_profiles` — carrier transit duration for one service on one route, independent of price and of seller handling.

- `scope_type ∈ {platform, merchant_store}`; platform rows carry no company/store, merchant rows require both (CHECK + composite FK `merchant_stores(id, company_id)`).
- `origin_scope_type ∈ {exact_origin, origin_country}`. `exact_origin` requires `fulfillment_origin_id` **and** `scope_type='merchant_store'` (origins are always tenant-owned); `origin_country` forbids the origin id.
- Tenancy of the exact origin is declarative: composite FK `(fulfillment_origin_id, company_id, merchant_store_id) → merchant_fulfillment_origins(id, company_id, merchant_store_id)`. Country parity (`origin_country_code = origin.country_code`) is enforced by guard.
- `destination_country_code` is a free ISO-3166-1 alpha-2 value and is **not** tied to a local market: `SE` is a valid destination without a Swedish local market.
- No link to markets, listings, rates or delivery-promise assignments.

## 4. Weekday transit semantics

`public.shipping_transit_time_weekday_rules` — one row per ISO handover weekday (1–7), unique per profile.

- `handover_supported = true` ⇒ `transit_min_business_days` and `transit_max_business_days` are mandatory, `min >= 0`, `max >= min`.
- `handover_supported = false` ⇒ both must be NULL (explicit representation of a non-handover day).
- No arrival date, no business-day counter and no ETA arithmetic is stored or computed in any trigger. Draft profiles may be incomplete; active profiles require all seven rows.

## 5. Delivery weekdays

`public.shipping_transit_delivery_weekdays` — one row per ISO delivery weekday (1–7), unique per profile, with an explicit `delivery_enabled` flag. Sunday delivery is never assumed; days are not derived from any local market; no capacity or appointment slots exist.

## 6. Calendar versioning

`public.shipping_calendar_profiles` — reusable versioned calendars with `calendar_type ∈ {origin_handover, carrier_transit, destination_delivery}`; one type per calendar, never a single generic type. Scope/tenancy contract identical to transit profiles. `country_code` mandatory for `origin_handover` and `destination_delivery`, optional for `carrier_transit`. Versioning: `version_number >= 1`, unique per family `(scope, tenant, calendar_code, version)`, at most one `active` version per family (partial unique index), supersession must target the same scope/tenant/code/type/country with a strictly higher version.

## 7. Blackout model

`public.shipping_calendar_blackout_dates` — one date per calendar (unique), `reason_code` restricted to the allowlist `public_holiday | warehouse_closed | carrier_closed | service_suspension | emergency`, optional free-text description. No holiday is hardcoded in any function and **no holiday rows were seeded**. Blackout rows carry no business logic; they are data consumed by a future resolver.

## 8. Calendar-role assignment

`public.shipping_transit_time_profile_calendars` — at most one calendar per role per transit profile (unique `(profile, role)`).

- Role↔type equality is **declarative**: composite FK `(shipping_calendar_profile_id, calendar_role) → shipping_calendar_profiles(id, calendar_type)`.
- A merchant-scoped calendar may only be assigned to a transit profile of the same company **and** store; platform calendars may be shared. Cross-tenant assignment is rejected.
- `origin_handover` calendar country must equal the transit origin country; `destination_delivery` calendar country must equal the destination country.
- All three roles are mandatory and must be `active` at activation — calendars are not optional because blackout semantics are contractually required.

## 9. Timezone contract

Every calendar `timezone_name` is validated against `pg_catalog.pg_timezone_names` inside a guard (`Europe/Amsterdam`, `Europe/Berlin`, `Europe/Stockholm`, …). Abbreviations (`CET`), offsets (`UTC+1`), implicit server timezone and unverified copies from the store record are all rejected. **Transit profiles deliberately carry no timezone**: all time-of-day arithmetic will originate from the delivery-promise timezone, the calendar timezones and the order timestamp.

## 10. Relationship with delivery promise (documented, not implemented)

Future resolver order: delivery promise fixes the accepted/handover date → the handover-weekday rule yields min/max transit business days → the carrier-transit calendar removes non-transit days → destination delivery weekdays restrict delivery days → the destination calendar removes blackout dates → the output is an ETA **range**. Nothing of this is implemented; no final ETA, customer delivery date or business-day counter is stored.

## 11. Relationship with shipping rates

Rate card = customer charge. Transit profile = duration. They remain separate objects with **no FK between them**; the existence of one proves nothing about the other. Service mapping is deferred.

## 12. Special handling — fail-closed

A transit profile only asserts a theoretical duration for a service. Dangerous goods, cold chain, pickup-only, pallet and oversized without carrier capability remain non-shippable; real eligibility still requires shipping profile, carrier capability, route/rate and destination eligibility. **R-S4 remains open** — pallets are not represented and `bulky` is not a pallet.

## 13. Activation integrity

Transit profile → `active` requires: valid origin per scope; active exact origin; 7 handover rows; 7 delivery rows; ≥1 supported handover day; ≥1 enabled delivery day; valid min/max ranges; all three calendar roles assigned, unique and `active`; valid version/supersession. Enforced by a **DEFERRABLE INITIALLY DEFERRED** constraint trigger so a complete profile can be built inside one transaction. Calendar → `active` requires a valid IANA timezone, a valid scope/tenant, correct versioning and no cross-tenant reference. Per R-5: owner-only, no seller activation, no admin approval, no RPC.

## 14. Immutability (BOR-DEC-085)

Once `active`, `superseded` or `retired`, transit profiles freeze scope/tenant, carrier/service, origin/destination, version and supersession pointer; calendars freeze scope/tenant, type, country, timezone and version. Weekday rules, delivery weekdays, calendar assignments and blackout dates are writable **only while the parent is `draft`**. Status transitions are linear (`draft → active|inactive|retired`, `inactive → active|retired`, `active → inactive|superseded|retired`, `superseded → retired`). Deletion is permitted only for `draft` parents. Change is possible only through a new version.

## 15. RLS / ACL matrix

| Object | RLS | FORCE | Policies | anon | authenticated | service_role | sandbox_exec |
|---|---|---|---|---|---|---|---|
| `shipping_transit_time_profiles` | yes | yes | 0 | none | none | none | none |
| `shipping_transit_time_weekday_rules` | yes | yes | 0 | none | none | none | none |
| `shipping_transit_delivery_weekdays` | yes | yes | 0 | none | none | none | none |
| `shipping_calendar_profiles` | yes | yes | 0 | none | none | none | none |
| `shipping_calendar_blackout_dates` | yes | yes | 0 | none | none | none | none |
| `shipping_transit_time_profile_calendars` | yes | yes | 0 | none | none | none | none |

Nine guard functions (`m1c1dd_guard_touch_updated_at`, `_transit_integrity`, `_transit_activation_integrity`, `_transit_immutability`, `_transit_child_immutability`, `_calendar_integrity`, `_calendar_immutability`, `_blackout_immutability`, `_calendar_assignment_integrity`): `OWNER=postgres`, `SECURITY DEFINER`, `search_path=''`, schema-qualified, no dynamic SQL, `proacl IS NOT NULL`, owner-only EXECUTE with explicit REVOKE for PUBLIC/anon/authenticated/service_role/sandbox_exec.

## 16. ACL gate evidence (two cycles + failure path)

`scripts/phase5-acl-gate/check-critical-acl.sh` extended with: the 6 new tables in the protected inventory, `m1c1dd_guard_%` lock + inventory (=9), RLS/FORCE (=6), zero policies, zero new sequences (R-T22), runtime deny proof, and a tightened forbidden-object check (manual quote / promise default / listing promise / ETA-booking).

- Post-commit cycle 1: **PASS**, exit 0.
- Post-commit cycle 2: **PASS**, exit 0.
- Failure path (`ACL_GATE_SIMULATE_FAILURE=1`): **FAIL**, exit 1 — proven.
- `place_order`: body fail-closed, `acl={postgres=X/postgres}`, not executable by anon/authenticated/service_role/sandbox_exec.
- Mechanism A (R-T21) did **not** recur in this deployment; the mandatory normalization section ran regardless.

## 17. Test traceability

The fail-loud harness ran inside a rolled-back subtransaction (fixtures: 2 companies, 2 stores, 2 active origins) and any failed assertion aborts the deployment. Covered and passed:

scope/tenancy (platform-with-tenant rejected, merchant-without-tenant rejected, platform exact-origin rejected), cross-tenant origin rejected, exact-origin country mismatch rejected, Sweden destination accepted, invalid carrier code rejected, invalid country code rejected, duplicate version rejected, cross-family supersession rejected, non-increasing supersession rejected, handover weekday out of range rejected, duplicate handover weekday rejected, supported handover without min/max rejected, unsupported handover with min/max rejected, max<min rejected, delivery weekday out of range rejected, duplicate delivery weekday rejected, activation without 7 delivery rows rejected, activation without calendars rejected, activation with non-active calendars rejected, invalid IANA timezone rejected, invalid calendar type rejected, duplicate calendar version rejected, duplicate blackout date rejected, invalid reason code rejected, calendar role/type mismatch rejected, cross-tenant calendar assignment rejected, destination calendar country mismatch rejected, duplicate role assignment rejected, valid activation accepted, active transit immutable, active weekday rules immutable, active delivery weekdays immutable, active calendar immutable, blackout insert on active calendar rejected, second active version rejected, RLS forced (6), zero policies, zero application grants, zero new sequences, guard ACL locked, guard inventory = 9, R-C2 unchanged, `place_order` not executable.

Not present by construction (verified by object inventory / gate): ETA resolver, rate↔transit runtime linkage, quotes, UI, RPC, customer date booking. Dangerous goods / cold chain / pallet remain fail-closed. No temporary verification routine survives (`%_tmp_tests` = 0).

## 18. Zero-row evidence

All fixtures were rolled back inside the harness subtransaction; the migration commits **schema only**. Final delta: `shipping_transit_time_profiles` 0, `shipping_transit_time_weekday_rules` 0, `shipping_transit_delivery_weekdays` 0, `shipping_calendar_profiles` 0, `shipping_calendar_blackout_dates` 0, `shipping_transit_time_profile_calendars` 0. Unchanged: delivery promise profiles/schedules 0/0, promise assignments 0, fulfillment foundation 0/0/0/0, rate cards/lanes/rules 0/0/0, tax 4/9/5, prices 0, publications 0.

## 19. Risk status

| Risk | Status |
|---|---|
| R-S2 | OPEN — runtime requirement: a future ETA resolver must re-check current origin, assignment, transit and calendar status at request time |
| R-S3 | OPEN — still blocks labels and real checkout |
| R-S4 | OPEN — pallets are not represented; `bulky` is not a pallet; transit profiles do not make special handling shippable |
| R-T21 | OPEN as a mandatory deployment constraint — every migration must end with explicit REVOKE + post-commit ACL gate; did not recur this cycle |
| R-C2 | OPEN — BLOCKER; `p4_writes_allowed()` and `channel_connections` untouched, 9 live connections remain `live_authorized_at IS NULL`, dispatch `deferred_not_authorized`, Bol live off, Stripe live off |
| R-5 | unchanged — owner-only administration, no seller/admin write path |

## 20. Rollback / forward-fix

Forward-fix only. Schema rollback would be a new migration dropping the six tables and the nine guards in dependency order (`shipping_transit_time_profile_calendars`, `shipping_calendar_blackout_dates`, `shipping_transit_delivery_weekdays`, `shipping_transit_time_weekday_rules`, `shipping_calendar_profiles`, `shipping_transit_time_profiles`), followed by the standard ACL normalization section and a two-cycle gate run. Zero rows exist, so no data migration is involved.

---

**Adopted decisions:** BOR-DEC-082, BOR-DEC-083, BOR-DEC-084, BOR-DEC-085.
**Verdict:** **M1C-1D-D PASS WITH RESIDUAL RISKS.** Halting — ETA resolver, manual shipping quotes and UI require separate owner authorization.
