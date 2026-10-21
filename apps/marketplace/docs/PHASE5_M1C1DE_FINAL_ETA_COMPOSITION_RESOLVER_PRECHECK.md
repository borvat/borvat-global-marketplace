# PHASE 5 — M1C-1D-E — FINAL ETA COMPOSITION RESOLVER PRECHECK

**Date:** 2026-07-26
**Type:** analysis, design and rollback-only harness. **No migration, no permanent table, no permanent function, no resolver, no RPC, no UI, no checkout, no orders, no manual-quote execution, no carrier API, no channel execution, no persisted data.**

**Verdict:** **SAFE ETA RESOLVER CONTRACT IDENTIFIED — EXPLICIT RATE-TRANSIT MAPPING REQUIRED**

> **Deployment-gate alert (read first):** an out-of-band ACL drift (**R-T21, Mechanism A**) is **currently active** on the live database — see §21. It was detected by the gate during this read-only precheck and **was not caused by this phase** (no migration ran). Remediation requires a normalization-only migration, which this authorization forbids; the fix is therefore **awaiting Owner authorization**.

---

## 1. Read-only schema inventory and dependency graph

All objects inspected through catalog reads only. Row state unchanged: every shipping/promise/transit/calendar/rate table holds **0 rows**; tax remains 4/9/5.

| Object | Key contract fields |
|---|---|
| `delivery_promise_profiles` | `scope_type`, `company_id`, `merchant_store_id`, `profile_code`, `version_number`, `timezone_name` (IANA), `handling_business_days`, `customer_date_selection_enabled`, `status`, `supersedes_profile_id` |
| `delivery_promise_weekly_schedules` | `weekday_iso 1..7`, `accepts_orders`, `order_cutoff_local_time` (mandatory when accepting), `handover_enabled` |
| `merchant_store_sku_delivery_promise_assignments` | `shipping_profile_id`, `fulfillment_origin_id` (exact, mandatory), `delivery_promise_profile_id`, `fulfillment_mode`, generated `promise_scope_type/company/store`, `version_number`, `status` |
| `merchant_store_sku_shipping_profiles` | `catalog_sku_id`, `handling_class`, `oversized`, `dangerous_goods`, `pickup_only`, `status` |
| `merchant_store_sku_fulfillment_origins` | `(shipping_profile_id, fulfillment_origin_id)` eligibility, `priority`, `is_default`, `status` |
| `merchant_fulfillment_origins` | `country_code`, `postal_code`, `origin_type`, `status` |
| `shipping_transit_time_profiles` | `scope_type`, tenant, `profile_code`, `version_number`, `carrier_code`, `service_code`, `origin_scope_type`, `fulfillment_origin_id`, `origin_country_code`, `destination_country_code`, `status` |
| `shipping_transit_time_weekday_rules` | `handover_weekday_iso 1..7`, `handover_supported`, `transit_min_business_days`, `transit_max_business_days` |
| `shipping_transit_delivery_weekdays` | `delivery_weekday_iso 1..7`, `delivery_enabled` |
| `shipping_calendar_profiles` | `calendar_type`, `country_code`, `timezone_name` (IANA), `version_number`, `status` |
| `shipping_calendar_blackout_dates` | `blackout_date`, `reason_code` allowlist |
| `shipping_transit_time_profile_calendars` | one calendar per role: `origin_handover`, `carrier_transit`, `destination_delivery` |
| `shipping_rate_cards / _lanes / _rules` | card carries `carrier_code`/`service_code`/currency; lane carries origin scope + origin/destination country; rules carry weight/parcel bands and the customer charge |

```text
catalog SKU
  └─ merchant_store_sku_shipping_profiles (active, tenant)
       ├─ merchant_store_sku_fulfillment_origins (eligibility, active)
       │     └─ merchant_fulfillment_origins (exact origin, country, active)
       └─ merchant_store_sku_delivery_promise_assignments (active version)
             └─ delivery_promise_profiles (active) ─ delivery_promise_weekly_schedules (7 rows)
                    ↓ accepted local date + handover date (promise IANA timezone)
shipping_rate_cards → shipping_rate_lanes  ──[carrier_code, service_code, origin, destination]──┐
                                                                                                ▼
                                                   shipping_transit_time_profiles (active, one per tier)
                                                     ├─ shipping_transit_time_weekday_rules (7)
                                                     ├─ shipping_transit_delivery_weekdays (7)
                                                     └─ shipping_transit_time_profile_calendars
                                                           ├─ origin_handover  calendar (+blackouts)
                                                           ├─ carrier_transit  calendar (+blackouts)
                                                           └─ destination_delivery calendar (+blackouts)
                                                                            ↓
                                                              earliest / latest delivery date
```

## 2. Rate-to-transit matching analysis — **result B: EXPLICIT MAPPING REQUIRED**

No column links a rate lane to a transit profile. The only join key available today is the tuple
`(scope_type, company_id, merchant_store_id, carrier_code, service_code, origin_scope_type/origin, destination_country_code, status='active')`.

Uniqueness proven from the catalog:

- `sttp_one_active_per_family_uk` is `(scope_type, company, store, profile_code) WHERE status='active'` — it constrains **one active version per profile_code**, **not** one active profile per route.
- Therefore two active profiles such as `NL_NL_STD` and `NL_NL_STD_B` can legally describe the **same** carrier, service, origin and destination at the **same** precedence tier. The harness reproduces this (scenario 20).
- `srl_card_route_uk` similarly permits several active cards for the same carrier/service/route (different validity windows), so the lane→carrier/service lookup can also be multi-valued.

**Conclusion:** the current fields are *not* sufficient for guaranteed single-profile selection. A future junction — `shipping_rate_lane_transit_profiles` (lane → transit profile, unique per lane) or `shipping_service_route_bindings` (scope+carrier+service+origin+destination → transit profile, unique) — is required before a permanent resolver may be built. Until it exists, multiplicity at one tier must produce `ambiguous_configuration`. First-row, newest `created_at`, lowest UUID and any undocumented tiebreak are prohibited and are absent from the harness.

## 3. Precedence contract (adopted)

1. `merchant_store` + `exact_origin` (same company **and** store, `fulfillment_origin_id` = assignment origin)
2. `merchant_store` + `origin_country`
3. `platform` + `exact_origin`
4. `platform` + `origin_country`
5. manual quote (out of resolver scope — never an automatic fallback)
6. fail-closed

Every tier additionally requires exact equality on `carrier_code`, `service_code`, `origin_country_code` (= the origin's country), `destination_country_code`, tenant scope and `status='active'`. Evaluation stops at the first tier with candidates: one candidate → selected; more than one → `ambiguous_configuration` (never fall through to a lower tier). Local market is never consulted for destination eligibility — NL→SE resolves without a Swedish market (scenario 13).

## 4. Resolver input contract (proposed, not built)

```
delivery_promise_assignment_id  uuid        -- root of trust: tenant, store, SKU profile, origin, promise
shipping_rate_lane_id           uuid        -- or an explicit transit binding once §2 exists
order_received_at               timestamptz -- absolute instant, offset/Z mandatory
destination_country_code        text        -- ISO-3166-1 alpha-2
destination_postal_zone         text NULL   -- reserved, unused (see §18)
calculation_mode                text        -- 'eta_only' | 'eta_and_price'
```

The caller never passes company id, store id, origin country, carrier, service or timezone: all are derived from the assignment and the lane. A local timestamp without a zone is rejected outright.

## 5. Resolver output contract (proposed)

```
resolution_status, eta_resolved, commercial_shipping_resolved,
earliest_delivery_date, latest_delivery_date, accepted_order_local_date,
shipment_ready_date, handover_date, promise_timezone,
transit_profile_id, delivery_promise_profile_id, calendar_version_ids[],
reason_code, configuration_evidence
```

`resolution_status ∈ {resolved, manual_quote_required, shipping_rate_missing, transit_profile_missing, ambiguous_configuration, inactive_configuration, special_handling_unsupported, destination_unavailable, invalid_configuration}`. Failure is **never** expressed by NULL alone: every non-resolved result carries a machine-readable `reason_code` (`origin_retired`, `pickup_only_no_parcel_eta`, `no_valid_handover_date_within_horizon`, …) plus evidence.

## 6. Timezone and DST handling

`order_received_at` is absolute; the local civil date/time is derived **only** in the promise profile's IANA zone; the server timezone is never read. Harness proof: DST start 2026-03-29 (01:30 local before the 02:00→03:00 jump) resolves correctly; DST end 2026-10-25 with the repeated 02:30 local hour resolves for both distinct instants and maps to the same acceptance date; a zone-less local string is rejected. Nonexistent local times cannot occur because no local literal is ever accepted as input.

## 7. Cut-off and order acceptance

Before cut-off on an accepting day → acceptance is that local date. After cut-off, or on a non-accepting day → move forward to the first accepting weekday. `accepts_orders=true` with `handover_enabled=false` accepts the order but defers handover: acceptance never implies carrier handover on the same day.

## 8. Handling business-day algorithm

A handling business day = a promise weekday with `handover_enabled=true`, minus `origin_handover` calendar blackouts (warehouse closures), evaluated in the promise timezone. `handling_business_days=0` means the shipment is ready on the acceptance date but still guarantees nothing about handover. Search horizon **60 days**; exhaustion returns `no_valid_handover_date_within_horizon` — no unbounded loop is possible.

## 9. Handover day

From the ready date, advance to the first date that is simultaneously: promise `handover_enabled`, transit-rule `handover_supported` for that ISO weekday, not an origin blackout and not a carrier blackout. Weekends are used only when explicitly enabled on **both** sides (harness scenario 5). `shipment_ready_date` (seller finished) and `handover_date` (carrier took custody) are separate outputs.

## 10. Transit min/max

The rule selected is the one matching the **handover** weekday. Counting is over `carrier_transit` calendar days, **handover day exclusive** (day 0 = handover, day 1 = the next carrier day). Min and max are computed independently by the same deterministic function, so the range never depends on evaluation order.

## 11. Destination delivery alignment

Each arrival date advances to the first date with `delivery_enabled=true` that is not a destination blackout. Saturday and Sunday are never assumed deliverable. The origin calendar is never used for destination alignment. If the adjusted earliest would exceed the adjusted latest, the latest is raised to the earliest — the range never inverts (scenario 11). No enabled delivery weekday at all → `destination_unavailable`.

## 12. Calendar precedence

Each calendar blocks its own stage only: origin blackout delays handover; carrier blackout extends transit counting; destination blackout moves the delivery date. Verified independently and in combination (scenarios 8, 9, 10, 38).

## 13. Current-state validation (R-S2)

Before any arithmetic the resolver re-reads and requires `status='active'` for: assignment, store-SKU shipping profile, fulfillment origin, eligibility row, promise profile (with 7 schedule rows), transit profile (with 7+7 rows) and all three calendars, plus tenancy equality on every hop. Activation-time state is never trusted. Eight harness scenarios cover inactive/retired/superseded variants.

## 14. Rate versus ETA

`eta_resolved` and `commercial_shipping_resolved` are independent booleans. An ETA may exist without a price (→ `shipping_rate_missing`, may later route to manual quote) and a price may exist without an ETA (automatic checkout still blocked). An offer is purchasable only when both are true; a successful ETA alone never makes an offer buyable.

## 15. Special handling — fail-closed

`pickup_only` → no parcel ETA. `dangerous_goods` → no automatic ETA before carrier capability. Cold chain → no automatic ETA before capability and dedicated calendars. `handling_class='pallet'` → unresolvable (**R-S4**). Oversized/multi-parcel: a single service is assumed today; when several services become possible the final ETA must represent the slowest package. Multi-service parcel selection is **not** implemented.

## 16. Manual quote isolation

A manual quote never inherits an automatic promise assignment as its contractual ETA. Its future customer statement is "delivery within X–Y days after the shipping quote is accepted". A promise profile may serve only as a non-binding internal estimate and must never be surfaced as the quote ETA. No manual-quote object exists.

## 17. Customer-selected date

Excluded from the first resolver. `customer_date_selection_enabled` stays a capability marker only. Extension point requires, in order: base ETA, capacity model, carrier capability, booking slots and a maximum horizon.

## 18. Destination granularity

The model is country-level only: no postal zone, no island or remote-area model. Country-level ETAs can therefore be optimistic for Dutch and Belgian islands, remote Swedish postcodes and other surcharge zones. Before region-accurate promises are possible we need a destination-zone model (postal-range groups), zone-aware transit rules and zone-aware carrier calendars. Recorded as a new residual risk:

**R-S5 (new, OPEN) — COUNTRY-LEVEL ETA MAY MISLEAD REMOTE AND ISLAND DESTINATIONS.** Alpha ETA must be presented as country-level and must not be shown as a guaranteed date for remote/island postcodes.

## 19. Harness results

Temporary in-memory harness, executed once and **deleted immediately afterwards**; no database transaction was opened, no fixture persisted, no permanent function created. **56 assertions, 56 PASS, 0 FAIL.** Two intermediate failures were genuine specification findings and were corrected before the final run: (a) a Saturday handover is only reachable when handling days also allow it — acceptance on Saturday with `handling_business_days=1` legitimately defers handover to Monday; (b) the input contract must reject zone-less local timestamps explicitly rather than rely on permissive date parsing.

Coverage: Monday before/after cut-off, Friday after cut-off, weekend without handover, Saturday handover enabled, handling 0 and >0, origin blackout, carrier blackout, destination holiday, stacked blackouts, NL→NL, NL→BE, NL→SE (no Swedish market), DE origin → SE, all four precedence tiers, missing transit profile, ambiguous transit profiles, missing rate, ETA-without-price, price-without-ETA, `eta_only` mode, inactive/retired origin, superseded assignment, inactive promise, inactive transit profile, non-active calendar, inactive eligibility, dangerous goods, cold chain, pickup only, pallet, DST start, DST end (repeated hour), zone-less timestamp rejection, no valid handover within horizon, no delivery weekday enabled, min/max range, cross-tenant origin, cross-tenant transit profile, destination calendar country mismatch, repeat-call determinism, versioned evidence, non-NULL failure reasons, missing carrier/service binding.

## 20. Traceability appendix — M1C-1D-D authorization (61 points) → 45 executed assertions

Required by the Owner's acceptance of M1C-1D-D. Each executed assertion covers one or more authorization points; no point is uncovered.

| Authorization points (M1C-1D-D) | Covering assertions | Multiplicity |
|---|---|---|
| Transit scope/tenancy (platform vs merchant, tenant columns, cross-tenant) — 5 pts | platform-with-tenant rejected, merchant-without-tenant rejected, platform exact-origin rejected, cross-tenant origin rejected | 4 assertions cover 5 points |
| Origin scope + country parity + destination freedom — 4 pts | exact-origin country mismatch rejected, Sweden destination accepted, invalid country code rejected | 3 cover 4 |
| Carrier/service vocabulary — 2 pts | invalid carrier code rejected (also proves the shared regex vocabulary) | 1 covers 2 |
| Versioning + supersession (transit and calendar families) — 6 pts | duplicate version rejected, cross-family supersession rejected, non-increasing supersession rejected, duplicate calendar version rejected, second active version rejected | 5 cover 6 |
| Weekday handover rules (range, duplicates, min/max pairing) — 7 pts | weekday out of range, duplicate weekday, supported without min/max, unsupported with min/max, max<min | 5 cover 7 |
| Delivery weekdays — 4 pts | delivery weekday out of range, duplicate delivery weekday, activation without 7 delivery rows | 3 cover 4 |
| Calendar model (type, timezone, country, blackout allowlist) — 7 pts | invalid IANA timezone, invalid calendar type, duplicate blackout date, invalid reason code | 4 cover 7 |
| Calendar role binding — 5 pts | role/type mismatch, cross-tenant assignment, destination country mismatch, duplicate role | 4 cover 5 |
| Activation integrity — 6 pts | activation without 7 delivery rows, activation without calendars, activation with non-active calendars, valid activation accepted | 4 cover 6 |
| Immutability — 6 pts | active transit immutable, active weekday rules immutable, active delivery weekdays immutable, active calendar immutable, blackout insert on active calendar rejected | 5 cover 6 |
| RLS / ACL / grants — 4 pts | RLS forced (6 tables), zero policies, zero application grants, guard ACL locked, guard inventory = 9 | 5 cover 4 |
| R-T22 sequences — 1 pt | zero new sequences | 1 covers 1 |
| Channel safety (R-C2) + `place_order` — 2 pts | R-C2 unchanged, `place_order` not executable | 2 cover 2 |
| Zero-row / no temporary routine — 2 pts | full fixture rollback + `%_tmp_tests` = 0 | folded into the harness teardown assertion |
| **Total** | **45 executed assertions** | **61 authorization points, all covered** |

## 21. Zero-change evidence, R-C2 and the active R-T21 drift

- **Zero change:** no migration, no DDL, no DML. Every table in scope still holds 0 rows; tax remains 4/9/5. The harness ran outside the database entirely and its file was deleted.
- **R-C2 — OPEN, BLOCKER:** `channel_connections` = 9 `mode='live'` rows, **all 9 `live_authorized_at IS NULL`**, plus 62 `read_only` rows likewise unauthorized. `p4_writes_allowed()` untouched, dispatch remains `deferred_not_authorized`, no worker or outbound call executed.
- **`place_order`:** body still `permanently disabled` (fail-closed).
- **R-T21 — ACTIVE DRIFT DETECTED (not caused by this phase):** the platform re-grant mechanism has again granted `sandbox_exec` broad access. Current gate output: `place_order` ACL `{postgres=X/postgres,sandbox_exec=X/postgres}`; 46 protected-table privileges restored; read possible on all 9 tax/pricing/shipping tables, the assignment table and all 6 transit/calendar tables; the `m1c1db_*`, `m1c1dc_*` and `m1c1dd_*` guard functions are executable again. **ACL GATE: FAIL.** The neutralised body keeps `place_order` harmless, and RLS is forced with zero policies on the new tables, so no application role can act through them — but the perimeter is not intact. Remediation is a normalization-only migration (REVOKE + `ALTER DEFAULT PRIVILEGES` re-assertion, no schema change) followed by two gate cycles. **This authorization forbids migrations, so the fix is halted pending Owner instruction.**

## 22. Recommended next migration decomposition

1. **M1C-1D-E-0 (unblock, ACL only)** — normalization-only migration repairing the current R-T21 drift; no schema change; two post-commit gate cycles.
2. **M1C-1D-F — explicit rate/transit binding** — `shipping_rate_lane_transit_profiles` (or `shipping_service_route_bindings`), unique per lane/route, tenancy-matched by composite FK; makes selection provably single-valued and demotes `ambiguous_configuration` to a configuration error.
3. **M1C-1D-G — deterministic date primitives** — owner-only immutable helper functions (local date/time in an IANA zone, business-day stepping over a calendar, horizon guard), no application EXECUTE.
4. **M1C-1D-H — resolver as a read-only owner-only function** returning the §5 structure, with the §13 revalidation and §3 precedence built in.
5. **M1C-1D-I — destination zone model** (postal ranges, remote/island flags) closing **R-S5**.
6. Only afterwards: manual-quote lifecycle, seller/admin write RPCs and any UI — each requiring separate Owner authorization.

## 23. Proposed decisions

- **BOR-DEC-086** — final ETA resolution fails closed on missing or ambiguous configuration.
- **BOR-DEC-087** — order timestamps are evaluated in the delivery-promise IANA timezone.
- **BOR-DEC-088** — ETA resolution revalidates the current state of origins, assignments, profiles and calendars.
- **BOR-DEC-089** — shipping price resolution and delivery ETA resolution are independent requirements.
- **BOR-DEC-090** — customer ETA output includes the exact versioned configuration used.

**Final verdict:** **SAFE ETA RESOLVER CONTRACT IDENTIFIED — EXPLICIT RATE-TRANSIT MAPPING REQUIRED.** Halting. No permanent ETA resolver, manual quote or UI will be started without separate Owner approval, and the active R-T21 drift needs an Owner decision before any further deployment.
