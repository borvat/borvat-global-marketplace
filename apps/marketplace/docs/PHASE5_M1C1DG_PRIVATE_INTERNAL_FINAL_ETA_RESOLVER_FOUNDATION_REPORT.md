# PHASE 5 — M1C-1D-G

## PRIVATE INTERNAL FINAL ETA RESOLVER FOUNDATION

**Status:** PASS WITH RESIDUAL RISKS
**Scope:** Private, internal, read-only resolver only (no public/application RPC, no UI, no checkout,
no orders, no manual quotes, no carrier API, no channel execution)
**Date:** 2026-07-26

---

## 1. Objective

M1C-1D-E proved the ETA contract is safe only when rate-lane → transit-profile selection is explicit;
M1C-1D-F supplied that explicit binding. M1C-1D-G implements the composition itself as a **private
internal function** that computes a delivery-date range from already-approved configuration, and
nothing else. It has no callers, no exposure and no write path.

---

## 2. Objects created

### 2.1 Schema

`internal_shipping` — owner `postgres`, `USAGE` and `CREATE` revoked from `PUBLIC`, `anon`,
`authenticated`, `service_role`, `sandbox_exec`. It contains **no tables, sequences, views or
materialized views**.

### 2.2 Function

`internal_shipping.resolve_final_eta(p_delivery_promise_assignment_id uuid,
p_shipping_rate_lane_id uuid, p_order_received_at timestamptz)`

- `LANGUAGE plpgsql`, **STABLE**, `SECURITY INVOKER`, `SET search_path = ''`, fully schema-qualified,
  no dynamic SQL, owner `postgres`, `proacl` non-NULL, zero EXECUTE for any application/sandbox role.
- Inputs are identifiers and one absolute `timestamptz` only. Company, store, origin, carrier,
  service, timezone and route are **derived**, never supplied.
- Returns one row: `resolution_status`, `reason_code`, `earliest_delivery_date`,
  `latest_delivery_date`, `accepted_order_local_date`, `shipment_ready_date`, `carrier_handover_date`,
  `promise_timezone`, the promise/assignment/lane/binding/transit ids, the three calendar version ids,
  `destination_granularity` and `configuration_version_evidence`.
- Failure is never a bare NULL: a status plus a reason code is always returned.

### 2.3 Algorithm (in order)

1. Input contract (no NULL references).
2. Assignment → shipping profile → origin → eligibility, each re-read and required `active`, with
   tenancy equality on every hop.
3. Special handling, fail-closed: pickup-only, dangerous goods, cold chain, oversized, and any
   package beyond the parcel envelope (> 31.5 kg or > 1750 mm) as the pallet proxy (R-S4).
   `bulky` alone is never treated as a pallet.
4. Promise profile: active, scope matches fulfillment mode, IANA timezone validated against
   `pg_catalog.pg_timezone_names`, exactly 7 weekly rows, cut-off mandatory when orders are accepted.
5. Rate lane and card: active, operational for the order instant, tenant-matched, origin-consistent.
6. Binding: exactly one active binding per lane; zero active → `rate_transit_binding_inactive` or
   `rate_transit_binding_missing`; more than one → `ambiguous_configuration`.
7. Transit profile: active, carrier/service/destination/origin/tenant equality, 7 weekday rules and
   7 delivery weekdays, at least one enabled delivery weekday.
8. Calendars, strictly isolated per stage: origin handover, carrier transit, destination delivery.
9. Multi-parcel service coherence: more than one package with more than one eligible active service
   on the same route fails closed.
10. Cut-off → acceptance date, handling → shipment ready, handover, transit min/max, delivery
    alignment, with a fixed 400-day horizon the caller cannot widen.

---

## 3. Decisions recorded

- **BOR-DEC-095** — The final ETA resolver is private and internal, read-only, with a fixed horizon.
- **BOR-DEC-096** — Inputs are identifiers plus one absolute instant; everything else is derived.
- **BOR-DEC-097** — Each calendar affects only its own stage; stages never bleed into each other.
- **BOR-DEC-098** — Every resolution revalidates current state; activation-time state is never trusted.
- **BOR-DEC-099** — Special handling and ambiguity always fail closed and never produce a guessed date.

---

## 4. Verification

A throwaway harness ran inside a deliberately aborted transaction (zero persistence, zero DML delta).

- **55 / 55 assertions passed.**
- Coverage: Monday before/after cut-off, Friday after cut-off, weekend orders, Saturday handover,
  handling days, origin/carrier/destination closure isolation, NL→NL, NL→BE, NL→SE, DE→SE,
  DST entry, DST exit including the repeated local hour, missing/inactive/ambiguous bindings,
  inactive card, lane, assignment, shipping profile, origin, eligibility, promise profile, transit
  profile and calendar, incomplete weekly/weekday/delivery sets, carrier/service/destination/origin
  mismatches, cross-tenant transit profile and cross-tenant rate card, pickup-only, dangerous goods,
  cold chain, oversized, pallet proxy, bulky-is-not-pallet, multi-parcel single vs mixed service,
  destination unavailable, handover and delivery horizon exhaustion, null-input contract, and a
  read-only proof that no audit, outbox or channel row changed.
- One specification correction: two intended negative fixtures — `calendar_role_mismatch` and
  `earliest_after_latest` — are **unreachable at runtime**. The first is prevented declaratively by
  the composite calendar-role foreign key, the second is arithmetically impossible because the max
  arrival is never earlier than the min arrival. Both checks are retained as defence-in-depth and
  were confirmed by static inspection instead.
- One harness defect found and fixed during execution: closure fixtures used reason values outside
  `scbd_reason_ck`.

Post-rollback invariants re-asserted: zero leftover shipping/promise rows, tax reference counts
unchanged (4/9/5), zero price and publication rows, order placement still fail-closed, no channel
connection live-authorized, resolver unreachable by non-owner roles.

---

## 5. Security / ACL

Drift cycle 6 (R-T21) reappeared immediately after the harness migration: 48 table privileges on
protected tables, EXECUTE on `place_order`, and 21 guard routines re-granted to `sandbox_exec`.

**M1B-0D — ACL DRIFT CYCLE 6 NORMALIZATION ONLY** was applied: revoke-only, zero GRANT, zero schema
change, zero business-data change, covering the 24 protected tables, every `place_order` overload,
all trigger/guard routines, and the `internal_shipping` schema and function. In-transaction
assertions confirmed fail-closed state before commit.

`check-critical-acl.sh` was extended with the M1C-1D-G inventory: schema USAGE/CREATE denial, schema
ownership, function lock (no app/sandbox EXECUTE, non-NULL `proacl`), resolver inventory, absence of
any relation inside the internal schema, and a runtime execution-deny proof.

| Gate run | Result |
| --- | --- |
| Cycle 1 (post-commit) | **PASS** — 41 checks, 0 failures |
| Cycle 2 (independent re-run) | **PASS** — 41 checks, 0 failures |
| Failure path (`ACL_GATE_SIMULATE_FAILURE=1`) | **exit 1**, as designed |

---

## 6. Risks

| ID | Status | Note |
| --- | --- | --- |
| **R-T21** | ACTIVE / RECURRING | Drift cycle 6 observed and remediated. Every migration must end with the gate. |
| **R-T22** | CONTAINED | No sequences introduced; internal schema holds no relations. |
| **R-S2** | CLOSED (operationally) | The resolver revalidates all current state on every call. |
| **R-S4** | OPEN | Pallets remain unrepresented; treated fail-closed via the parcel-envelope proxy. |
| **R-S5** | OPEN | Destination granularity is country-level; remote postcodes and islands may be optimistic. Output carries `destination_granularity=country`. |
| **R-C2** | **BLOCKER — UNCHANGED** | 9 live channel connections remain unauthorized. No channel object was read for execution or written. |

---

## 7. Not done (explicitly out of scope)

Public or application-facing RPC, seller/admin UI, checkout, orders, manual shipping quotes,
carrier API calls, labels, publication, customer date selection, postal-zone granularity, and any
operational data.

**Verdict: M1C-1D-G PASS WITH RESIDUAL RISKS.**
