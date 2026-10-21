# PHASE 5 — M1C-1E-B — AUTHORITATIVE DELIVERY DESTINATION FOUNDATION

**Date:** 2026-07-26
**Scope:** Schema foundation only. No quotes, no cart/checkout, no orders, no payments, no labels, no carrier API, no UI, no RPC, no application DML, no data.
**Verdict:** **M1C-1E-B PASS WITH RESIDUAL RISKS**

---

## 1. Preflight (read-only, before any DDL)

| Check | Result |
|---|---|
| Buyer/customer principal model | `public.profiles(id)` PK, FK `profiles_id_fkey → auth.users(id) ON DELETE CASCADE` |
| Address tables | none (0 tables matching `%address%`) |
| Destination / quote / checkout tables | none (0) |
| `orders.shipping_address` | exists, `jsonb`, **legacy, non-authoritative**, 0 non-null rows |
| `cart_items` | `id, user_id, product_id, quantity, created_at` — no address, 0 rows |
| Country-code vocabulary | no enum; existing contract is a CHECK `~ '^[A-Z]{2}$'` (`shipping_rate_lanes.srl_origin/destination_country_ck`) — reused verbatim |
| Postal-code utilities | none existed |
| Key conventions | UUID PKs + composite tenancy FKs (`(id, company_id, merchant_store_id)` pattern) — mirrored as `(id, buyer_principal_id)` |
| ACL protected inventory | 24 tables |
| `place_order` | single overload, body `permanently disabled`, no non-owner EXECUTE |
| `internal_shipping` | owner-only, resolver locked |
| ACL gate **before** business migration | **RED** (48 table privileges + 21 guard routines re-granted to `sandbox_exec`) |

**Buyer principal path (provable, declarative):**
`auth.users(id)` → `public.profiles(id)` (buyer principal) → `customer_delivery_destinations.buyer_principal_id` (FK) → `customer_delivery_destination_versions.(customer_delivery_destination_id, buyer_principal_id)` (composite FK).
No email, phone or free-text identity participates in any key. **No architecture blocker.**

---

## 2. Migrations

| Order | Milestone | File | SHA-256 |
|---|---|---|---|
| 1 | **M1B-0F — ACL DRIFT CYCLE 8 NORMALIZATION ONLY** (REVOKE-only, mandated by §19 because the gate was red) | `supabase/migrations/20260726171748_bee85150-ef33-454f-a3bf-012e042ac78d.sql` | `e50186d2067e4eda823066f1d6a6b1f7d49d4876448358b7761c48a060aa4291` |
| 2 | **M1C-1E-B** business DDL | `supabase/migrations/20260726172003_695bb3d9-2977-4ded-ad59-94cf2219b016.sql` | `ec99004df8d0f71d1a79fd7e3ca9fa114f03d2b02fed8eb1c97bce984faa670a` |
| 3 | Verification harness | rollback-only (aborted by design, not persisted) | n/a |

M1B-0F contained zero GRANT, zero DDL, zero DML; gate turned **GREEN** before any business DDL was issued.

---

## 3. Logical destination model — `public.customer_delivery_destinations`

`id uuid PK`, `buyer_principal_id uuid NOT NULL → profiles(id) ON DELETE RESTRICT`, `status ∈ {active, inactive, retired}`, `created_at`, `updated_at`.
`UNIQUE (id, buyer_principal_id)` provides the declarative anchor for the child composite FK.
No company/merchant ownership, no contact fields, no current-address JSONB, no circular `current_version_id`. Retired destinations cannot be reactivated and cannot hold an active version.

## 4. Version model — `public.customer_delivery_destination_versions`

`id`, `customer_delivery_destination_id`, `buyer_principal_id`, `version_number`, `precision_level`, `country_code`, `postal_code`, `postal_code_normalized`, `region?`, `city`, `street_name?`, `house_number?`, `address_unit?`, `destination_type`, `floor_level?`, `elevator_access`, `lift_gate_requirement`, `delivery_appointment_requirement`, `status`, `supersedes_version_id?`, `created_at`, `updated_at`.
Composite FK `(customer_delivery_destination_id, buyer_principal_id) → customer_delivery_destinations(id, buyer_principal_id)`.

## 5. Precision-level semantics (BOR-DEC-107)

- `quote_area` — country + postal + city + destination type required; `street_name`, `house_number`, `address_unit` MUST be NULL.
- `street_address` — additionally requires non-empty `street_name` and `house_number`; `address_unit` optional.
- `street_address` does **not** imply carrier verification and does **not** authorise label creation; recipient/contact data is out of scope.

## 6. Postal contract (BOR-DEC-111)

`postal_code` = raw, trimmed only (enforced `postal_code = btrim(postal_code)`).
`postal_code_normalized = upper(regexp_replace(postal_code, '[^A-Za-z0-9]', '', 'g'))`, enforced by CHECK, non-empty. Deterministic, matching-only; no validation, no deliverability claim, no country-specific regex.
Country: `^[A-Z]{2}$`, never inferred from postal code, no country-name column, no local-market dependency (Sweden accepted).

## 7. Access-requirement vocabularies

`elevator_access ∈ {unknown, available, unavailable, not_applicable}`; `lift_gate_requirement` and `delivery_appointment_requirement ∈ {unknown, required, not_required}`. No nullable booleans. `floor_level` nullable integer, −10..200, and never implies elevator access.

## 8. Versioning, activation integrity, immutability

`version_number > 0`; `UNIQUE (destination_id, version_number)`; partial unique index `WHERE status='active'` + guard → exactly one active version per destination. `supersedes_version_id` must reference the same destination, same buyer, lower version number. Guards (`m1c1eb_guard_version_integrity`) also require parent `status='active'` for activation and reject unknown or mismatched buyers. `m1c1eb_guard_version_immutability` freezes all data columns once a version leaves `draft`; `superseded` and `retired` are terminal. No activation workflow, no customer update RPC.

## 9. Privacy classification (BOR-DEC-110)

Database comments classify **quote-safe** (country, postal, normalized postal, city, region, destination type, floor, elevator, lift-gate, appointment) and **restricted** (street name, house number, address unit). Absent by construction: email, phone, recipient name, messaging handle, GPS, delivery notes, door codes, security instructions, identity documents. No seller-readable view exists (BOR-DEC-108).

## 10. Exact-version pinning (BOR-DEC-109)

All future consumers — quote request, accepted quote, checkout group, order, shipping label — MUST reference `customer_delivery_destination_version_id`, never the parent destination. Any destination change creates a new version; invalidation/re-pricing of quotes bound to a previous version is deferred and **not** implemented here.

## 11. Legacy JSONB isolation

`orders.shipping_address` and `cart_items` were not read into, migrated from, altered or deleted. They remain legacy and non-authoritative. JSONB is forbidden in the new tables and gate-checked.

## 12. RLS / ACL matrix

| Object | RLS | FORCE | Policies | PUBLIC | anon | authenticated | service_role | sandbox_exec |
|---|---|---|---|---|---|---|---|---|
| `customer_delivery_destinations` | on | on | 0 | none | none | none | none | none |
| `customer_delivery_destination_versions` | on | on | 0 | none | none | none | none | none |
| `m1c1eb_guard_*` (3 routines) | — | — | — | none | none | none | none | none |

All guards: `SET search_path=''`, schema-qualified references, no dynamic SQL, `proacl IS NOT NULL`, explicit REVOKE for every non-owner role. Zero GRANT statements in the migration. Runtime deny proof: `permission denied for table customer_delivery_destinations` from the sandbox role.

## 13. R-T21 evidence and two-cycle gate

| Event | Result |
|---|---|
| Gate before business DDL | **FAIL** (drift cycle 8) |
| M1B-0F revoke-only normalization | applied, fail-closed post-conditions held |
| Gate after M1B-0F | **PASS** |
| Post-commit drift re-check (business migration) | no re-grant detected |
| Gate cycle 1 (post-commit) | **PASS** |
| Gate cycle 2 (independent re-run, extended with 8 new M1C-1E-B checks, 50 PASS) | **PASS** |
| Failure path (`ACL_GATE_SIMULATE_FAILURE=1`) | **exit 1** |
| `place_order` | fail-closed body, EXECUTE false for every non-owner |
| `internal_shipping` | no non-owner USAGE, resolver no non-owner EXECUTE |

The gate protected inventory now covers 26 tables and the three new guard routines.

## 14. Test traceability (rollback-only harness, 33 assertions, all passed)

Two tables only; no quote/checkout objects; RLS+FORCE; zero policies; zero application grants; UUID keys only; no new sequences; no `proacl` NULL; unknown buyer rejected; single-buyer destination; version buyer must match parent; cross-buyer version rejected; retired parent blocks active version; version 0 rejected; duplicate version rejected; cross-destination supersession rejected; non-increasing supersession rejected; second active version rejected; invalid precision level rejected; `quote_area` with street fields rejected; `street_address` without street name rejected; without house number rejected; complete `street_address` accepted; `address_unit` optional; invalid destination type/elevator/lift-gate/appointment rejected; floor −11 and 201 rejected; basement −2 accepted; lowercase country rejected; `SE` accepted without a local market; raw postal preserved; untrimmed raw postal rejected; non-deterministic normalized value rejected; empty normalized postal rejected; empty city rejected; active version immutable; draft editable; no JSONB/contact/geo columns; no view; legacy JSONB untouched. Harness aborted with `HARNESS ROLLBACK — all M1C-1E-B assertions passed (33 checks); no rows persisted`; zero fixtures survived; no temporary routine created.

## 15. Zero-row / zero-drift evidence

`customer_delivery_destinations = 0`, `customer_delivery_destination_versions = 0` (asserted fail-closed inside the committed migration; sandbox role is denied read afterwards). Object delta = 2 tables, 3 guard functions, 3 triggers, 2 indexes, 0 sequences, 0 views, 0 RPC. Quote objects = 0, promise/transit/rate/binding rows unchanged, prices = 0, publications = 0, tax = 4/9/5, live-authorized channels = 0.

## 16. Risk status

- **R-S3 — PARTIALLY MITIGATED — AUTHORITATIVE VERSIONED DESTINATION SCHEMA EXISTS.** Still open operationally: no trusted capture/update workflow, no recipient/contact model, no quote/order snapshot integration, no carrier-ready validation, no label release control.
- **R-S4 — OPEN.** `shipment_form` deliberately not added to the destination; it belongs to the shipment/quote snapshot.
- **R-S5 — OPEN.** Postal presence in the model does not make the ETA resolver postal-level; it remains country-level and was not modified.
- **R-5 — OPEN.** Sellers get no direct table access; only a restricted projection through a trusted function after R-5 closes.
- **R-T21 — ACTIVE/RECURRING**, contained by the protected inventory plus pre- and post-commit gates; cycle 8 normalized by M1B-0F.
- **R-C2 — OPEN — BLOCKER.** `channel_connections` (71 rows) untouched, live-authorized = 0, 9 live-mode rows remain unauthorized, `p4_writes_allowed()` and dispatch logic unmodified. Bol Live off, Stripe Live off, no worker executed.

## 17. Rollback / forward-fix

Rollback: drop the three triggers, the three `m1c1eb_guard_*` routines, then `customer_delivery_destination_versions` and `customer_delivery_destinations` (no dependents exist; both tables are empty). All corrections are forward-only migrations ending with an explicit ACL normalization section.

---

**Verdict: M1C-1E-B PASS WITH RESIDUAL RISKS.**
Stop. Manual quote request, messaging, checkout, payment and UI require separate owner approval.
