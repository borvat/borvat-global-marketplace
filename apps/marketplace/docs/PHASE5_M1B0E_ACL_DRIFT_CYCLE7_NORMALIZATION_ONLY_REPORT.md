# PHASE 5 — M1B-0E: ACL DRIFT CYCLE 7 NORMALIZATION ONLY

**Scope:** REVOKE-only. No GRANT, no DDL, no DML, no function-body change, no channel/worker/dispatch activity.
**Migration:** `m1b0e_acl_drift_cycle7_normalization` (applied 2026-07-26 17:04 UTC)
**Authority:** BOR-DEC-057 (public deny-by-default), BOR-DEC-065 (post-deployment ACL gate)

---

## 1. Pre-normalization ACL evidence

Collected read-only before the migration (gate role = `sandbox_exec`, `now() = 2026-07-26 17:02:50Z`).

### 1.1 `public.place_order`

| Signature | proacl (pre) | prosrc md5 | Fail-closed body |
|---|---|---|---|
| `place_order(uuid,integer,jsonb)` | `{postgres=X/postgres,sandbox_exec=X/postgres}` | `39111220174f1c968cee1ba32794bd28` | **true** (`permanently disabled`) |

Exactly **one** overload exists. `sandbox_exec=X` is drift re-granted by the platform outside the deployment path (R-T21, cycle 7). The body was **not** modified in this window and remains fail-closed.

### 1.2 Protected tables

`48` privilege grants present across the 24 protected tax / pricing / publication / shipping / delivery-promise / transit / calendar tables — all held by `sandbox_exec` (`SELECT`, `INSERT`). `anon`, `authenticated`, `service_role` held none.

Full protected inventory (24 relations):
`tax_categories`, `tax_rate_bands`, `tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles`, `merchant_store_offer_prices`, `borvat_direct_listing_publications`, `merchant_fulfillment_origins`, `merchant_store_sku_shipping_profiles`, `merchant_store_sku_shipping_packages`, `merchant_store_sku_fulfillment_origins`, `shipping_rate_cards`, `shipping_rate_lanes`, `shipping_rate_rules`, `delivery_promise_profiles`, `delivery_promise_weekly_schedules`, `merchant_store_sku_delivery_promise_assignments`, `shipping_transit_time_profiles`, `shipping_transit_time_weekday_rules`, `shipping_transit_delivery_weekdays`, `shipping_calendar_profiles`, `shipping_calendar_blackout_dates`, `shipping_transit_time_profile_calendars`, `shipping_rate_lane_transit_profile_bindings`.

### 1.3 Drifted guard / p4 routines (42 objects, all `sandbox_exec=X`)

M1C bodies: `m1c1b_guard_origin_not_retired`, `m1c1c_guard_card_lifecycle`, `m1c1c_guard_lane_integrity`, `m1c1c_guard_lane_immutability`, `m1c1c_guard_rule_immutability`, `m1c1c_guard_origin_rate_dependency`, `m1c1db_guard_*` (4), `m1c1dc_guard_*` (4), `m1c1dd_guard_*` (9), `m1c1df_guard_*` (4).

Other protected guards: `msop_guard_tax_integrity`, `msop_guard_active_immutable`, `msop_guard_store_sku_ownership`, `_outbox_events_update_guard`, `_outbox_events_delete_guard`, `_borvat_direct_publication_provider_guard`, `_companies_before_update_owner_guard`, `_company_member_roles_guard_owner_role`, `_company_members_guard_owner_membership`, `guard_user_roles_mutation`, `p2_tx_header_guard`, `p4_inbox_immutable`, `p4_events_immutable`.

`p4_*` non-trigger routines: `p4_writes_allowed(uuid)` and `p4_dispatch_decision(uuid)` carried `{postgres=X, service_role=X, sandbox_exec=X}` — the `service_role` grant is the **approved allowlist** entry (`approved-routines.json`), `sandbox_exec=X` is drift.

### 1.4 Private internal ETA area (pre)

| Object | State (pre) |
|---|---|
| schema `internal_shipping` | `USAGE=false`, `CREATE=false` for anon / authenticated / service_role / sandbox_exec |
| `internal_shipping.resolve_final_eta(uuid,uuid,timestamptz)` | `acl={postgres=X/postgres}` |

The internal schema did **not** drift in cycle 7; it was still re-asserted defensively by the migration (idempotent REVOKE).

---

## 2. Drifted objects inventory (cycle 7 summary)

| Class | Drifted objects | Drifted role |
|---|---|---|
| `place_order` overloads | 1 | `sandbox_exec` |
| Protected tables | 24 (48 privileges) | `sandbox_exec` |
| Guard / trigger routines | 40 | `sandbox_exec` |
| `p4_*` non-trigger routines | 2 | `sandbox_exec` |
| `internal_shipping` schema / resolver | 0 | — |

---

## 3. REVOKE statements executed

All statements were emitted from a single `DO` block, dynamically over the live catalog (idempotent, REVOKE-only):

1. **Protected tables** — for each of the 24 relations:
   `REVOKE ALL ON TABLE public.<t> FROM PUBLIC;`
   `REVOKE ALL ON TABLE public.<t> FROM anon | authenticated | service_role | sandbox_exec;`
2. **`place_order`, every overload** —
   `REVOKE ALL ON FUNCTION public.place_order(...) FROM PUBLIC | anon | authenticated | service_role | sandbox_exec;`
3. **Every trigger-returning routine and every `*guard*` routine in `public`** —
   `REVOKE ALL ON FUNCTION <sig> FROM PUBLIC | anon | authenticated | service_role | sandbox_exec;`
4. **Every non-trigger routine in `public`** —
   `REVOKE ALL ON FUNCTION <sig> FROM PUBLIC;` and `FROM anon;` and `FROM sandbox_exec;`
   (`authenticated` / `service_role` untouched so the approved allowlist — including `p4_writes_allowed` and `p4_dispatch_decision` for `service_role` — stays exactly as approved; no GRANT was issued.)
5. **Private internal ETA area** —
   `REVOKE ALL ON SCHEMA internal_shipping FROM PUBLIC | anon | authenticated | service_role | sandbox_exec;`
   `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal_shipping FROM PUBLIC | anon | authenticated | service_role | sandbox_exec;`

A second `DO` block asserted the post-conditions fail-closed (would have aborted the whole migration): place_order not executable, place_order body still fail-closed, protected tables owner-only, internal resolver locked, no guard routine with `proacl IS NULL`. All passed — migration committed.

**Zero `GRANT` statements. Zero business objects touched. Zero rows touched.**

---

## 4. `place_order` post-commit evidence

```
place_order(uuid,integer,jsonb)  acl={postgres=X/postgres}
```

* EXECUTE for `PUBLIC`, `anon`, `authenticated`, `service_role`, `sandbox_exec` = **false**
* prosrc md5 unchanged: `39111220174f1c968cee1ba32794bd28`
* Body still contains the `permanently disabled` fail-closed raise → **no body repair needed, none performed**.

---

## 5. Internal-schema evidence (post)

* `internal_shipping` owned by the database owner; `USAGE`/`CREATE` = false for all app and sandbox roles.
* `internal_shipping.resolve_final_eta` — `proacl` not null, no EXECUTE for any app/sandbox role.
* `internal_shipping` holds 0 tables, 0 sequences, 0 views.
* Runtime deny proof: gate-role invocation of the resolver **failed** as required.

---

## 6. Gate cycle 1

`scripts/phase5-acl-gate/check-critical-acl.sh` — `checked_at 2026-07-26 17:04:43Z`
**41 checks, 41 PASS, 0 FAIL → exit 0 → ACL GATE: PASS.**

Includes: place_order triple invariant, no anon-executable routine, trigger/guard routines non-executable, allowlist deny-by-default, protected tables owner-only, runtime deny proofs (protected tables, assignment table, transit/calendar tables, rate-transit binding table, internal resolver), M1C-1C/1D-B/1D-C/1D-D/1D-F guard inventories and locks, RLS enabled+forced with zero policies on all foundation tables, R-T22 zero-sequence checks, no manual-quote/default/listing/ETA-booking objects.

## 7. Gate cycle 2 (independent re-run)

Re-executed as a separate process after cycle 1: **41 PASS, 0 FAIL, exit 0 → PASS.** No re-drift observed between the two cycles.

## 8. Failure-path proof

`ACL_GATE_SIMULATE_FAILURE=1 ./check-critical-acl.sh` → `ACL GATE: FAIL`, **exit 1**. The gate demonstrably fails closed.

---

## 9. Zero-delta evidence

| Metric | Post-commit |
|---|---|
| `public` tables | 85 (unchanged) |
| `public` routines | 144 (unchanged) |
| `public` policies | 122 (unchanged) |
| New sequences | 0 |
| New RPCs | 0 |
| Rows written | 0 (no DML in the migration) |
| Object delta | 0, except the migration-history entry |

---

## 10. R-T21 status

**R-T21 remains STRUCTURALLY ACTIVE.** Cycle 7 is the seventh recorded platform re-grant of `sandbox_exec` privileges outside the deployment path. Cycle 7 is now **normalized**, but the underlying platform behaviour is not eliminated: any future platform-side operation may re-grant again. The mandatory control stays: **run the ACL gate after every migration/deployment; a red gate blocks all business migrations.**

## 11. R-C2 status

**R-C2 remains the absolute channel blocker.**

* `channel_connections`: 71 rows, `live_authorized_at IS NOT NULL` count = **0** → **live-authorized channels = 0**.
* No `channel_connections` row was read for mutation, and none was modified.
* `p4_writes_allowed()` untouched; dispatch decision path unchanged (`deferred_not_authorized`).
* Bol Live: **off**. Stripe Live: **off**. No worker, sync or dispatch was executed.

---

## 12. Final verdict

# M1B-0E PASS

* Cycle 7 drift fully normalized (REVOKE-only).
* Gate cycle 1 PASS, gate cycle 2 PASS, failure-path exit 1.
* Zero row delta, zero object delta, zero new sequences/policies/RPCs.
* `place_order` fail-closed and owner-only; internal ETA resolver private.
* **CRITICAL ACL DRIFT NOT ACTIVE** at the time of this report.

**STOP.** `M1C-1E-B — AUTHORITATIVE DELIVERY DESTINATION FOUNDATION` is **not** started and requires separate Owner approval.
