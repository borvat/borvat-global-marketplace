# PHASE 5 — M1C-1D-F

## EXPLICIT RATE-LANE TO TRANSIT-PROFILE BINDING FOUNDATION

**Status:** PASS WITH RESIDUAL RISKS
**Scope:** Schema foundation only (no resolver, no ETA computation, no RPC, no UI, no checkout, no carrier API, no manual quotes)
**Date:** 2026-07-26

---

## 1. Objective

M1C-1D-E proved that transit-profile selection is ambiguous: `sttp_one_active_per_family_uk`
constrains one active version per profile **code**, not per shipping route. Multiple active
transit profiles can therefore match a single rate lane, so no deterministic resolver contract
can be built on the current schema.

M1C-1D-F removes that ambiguity declaratively by binding a **shipping rate lane** to exactly
one **transit-time profile version**, explicitly, in a versioned junction table.

---

## 2. Objects created

### 2.1 Table

`public.shipping_rate_lane_transit_profile_bindings`

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `shipping_rate_lane_id` | Rate lane side of the binding |
| `shipping_transit_time_profile_id` | Transit profile **version** bound to that lane |
| `version_number` | Strict version counter within the lane family |
| `status` | `draft` / `active` / `inactive` |
| `supersedes_binding_id` | Explicit lineage to the previous version |
| `created_at`, `updated_at` | Audit timestamps |

Tenancy and route attributes are carried as generated/denormalized columns so compatibility and
ownership are provable declaratively, without any runtime lookup by application code.

**One active binding per lane** is enforced by a partial unique index on
`(shipping_rate_lane_id) WHERE status = 'active'`.

### 2.2 Guard routines

| Function | Enforces |
| --- | --- |
| `m1c1df_guard_touch_updated_at` | Audit timestamp maintenance |
| `m1c1df_guard_binding_compatibility` | Carrier, service, destination country, origin scope, exact origin and tenant must match on both sides |
| `m1c1df_guard_binding_activation` | Activation integrity: lane active, parent rate card active, transit profile active with a complete 7-row weekday rule set, no cross-tenant pairing |
| `m1c1df_guard_binding_immutability` | Active and inactive versions are frozen; changes require a new version |

---

## 3. Decisions recorded

- **BOR-DEC-091** — Rate-lane → transit-profile selection is **explicit**, never inferred.
  Deterministic matching is rejected as unsafe (M1C-1D-E, Result B).
- **BOR-DEC-092** — Exactly one active binding per lane; a lane with no active binding yields
  **no ETA**, never a guessed one (fail-closed).
- **BOR-DEC-093** — Compatibility (carrier, service, destination, origin scope, exact origin,
  tenant) is a hard database invariant, not an application convention.
- **BOR-DEC-094** — Bindings are immutable once activated; corrections happen through a new
  version with explicit `supersedes_binding_id` lineage.

---

## 4. Verification

Executed as a single throwaway harness inside an aborted transaction (zero persistence).

- **53 assertions passed** on schema shape, compatibility matrix, activation integrity,
  versioning, one-active-per-lane, immutability, tenant isolation and forbidden-object checks.
- Four assertions initially failed: three were **R-T21 privilege drift** (the platform had
  re-granted access to `sandbox_exec` after the schema migration) and one was a
  **mis-specified channel check** that read a non-existent column and then the wrong column.

Both causes were resolved and re-verified directly against the live catalog after the
normalization migration:

| Check | Result |
| --- | --- |
| Application/sandbox grants on the binding table | `0` |
| `m1c1df_guard_*` routines executable by app/sandbox roles, or with NULL ACL | `0` |
| `place_order` executable by any application/sandbox role | `0` |
| Live channel connections with a live authorization timestamp | `0` |
| Rows in the binding table | permission denied (runtime deny proof) |

### 4.1 Upstream finding (specification correction)

The planned "inactive exact origin" activation test is **unreachable**: M1C-1C already prevents
an origin from leaving `active` while an active rate card depends on it, and prevents activating
a card whose origin is inactive. The binding-level origin check is therefore retained as
defence-in-depth, and the test was re-framed to assert the upstream guard fires.

---

## 5. Security / ACL

- RLS **enabled and forced**, **zero policies**, **zero grants** on the new table.
- All guard routines revoked from `PUBLIC`, `anon`, `authenticated`, `service_role`, `sandbox_exec`.
- Forward-only, **revoke-only** normalization migration applied (no grants, no schema change,
  no data change) to clear drift cycle 5.
- `check-critical-acl.sh` extended with the M1C-1D-F inventory (protected table, 4 guard
  functions, RLS forced, zero policies, R-T22 sequence check, runtime deny proof).
- **ACL gate cycle 1: PASS. ACL gate cycle 2 (independent re-run): PASS.**

---

## 6. Risks

| ID | Status | Note |
| --- | --- | --- |
| **R-T21** | ACTIVE / RECURRING | Platform re-grants privileges to `sandbox_exec` after migrations. Cycle 5 observed and remediated. Every future migration must end with the gate. |
| **R-T22** | CONTAINED | No sequences introduced in the binding scope. |
| **R-S4** | OPEN | Pallet representation still unresolved. |
| **R-S5** | OPEN | Country-level destination granularity may misrepresent remote postcodes and islands. |
| **R-C2** | **BLOCKER — UNCHANGED** | 9 live channel connections remain unauthorized (`live_authorized_at IS NULL`). No channel authorization, dispatch or carrier call was introduced. |

---

## 7. Not done (explicitly out of scope)

Permanent ETA resolver, delivery-date computation, manual shipping quotes, activation RPCs, UI,
checkout integration, carrier API calls, labels, publication, operational data.
