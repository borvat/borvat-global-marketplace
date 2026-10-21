# PHASE 5 — M1C-1D-B
# DELIVERY PROMISE PROFILE AND WEEKLY SCHEDULE FOUNDATION — IMPLEMENTATION REPORT

**Date:** 26 July 2026
**Stage:** M1C-1D-B (Schema foundation only)
**Decisions adopted:** BOR-DEC-075, BOR-DEC-076, BOR-DEC-077
**Verdict:** **M1C-1D-B PASS WITH RESIDUAL RISKS**

---

## 1. Scope executed

Created **two tables and four owner-only guard functions**. Nothing else.

Explicitly **not** created (per authorization): profile→SKU/listing/origin assignment,
transit-time rules, ETA resolver, manual quotes, holiday/blackout calendars, seller or
admin UI, seller write RPC, activation RPC, publication, checkout, orders, carrier
integration, and any permanent operational data.

The existence of a delivery promise profile does **not** make an offer publishable or
purchasable.

---

## 2. Read-only preflight

| Check | Result |
|---|---|
| Existing delivery/promise/schedule/transit model in `public` | **none** — no parallel model exists, nothing to reuse |
| Existing timezone or weekly-schedule model | **none** |
| `merchant_stores` / `companies` | present; `merchant_stores (id, company_id)` UNIQUE exists → composite FK possible |
| M1C-1B tables (origins/profiles/packages/assignments) | present, 0/0/0/0 rows |
| M1C-1C tables (cards/lanes/rules) | present, 0/0/0 rows |
| Tax baseline | 4 / 9 / 5 |
| Prices, publications, merchant stores | 0 / 0 / 0 |
| Status vocabularies in use | free-text `text` + CHECK (no ENUMs) — same convention reused |
| ACL gate | present, protected inventory reviewed |
| `place_order` | fail-closed body, owner-only at preflight |
| `p4_writes_allowed()` | inspected read-only, **not modified** |
| Channel connections | 71 rows, 9 with `mode='live'`, **9/9 `live_authorized_at IS NULL`** |

---

## 3. Migrations applied

| # | File | SHA-256 |
|---|---|---|
| 1 | `supabase/migrations/20260726142003_e576889e-9353-41da-a6e3-f226363e43a3.sql` | `dd599edd2e478e2bffd10cb030c398de1d370b33611da2da5c0cb69a9157e681` |
| 2 | `supabase/migrations/20260726142346_d67bcd9b-293c-444d-bd9a-f2a6b1916964.sql` (verification harness + forward-fix on `place_order`) | `2c3348766c7b2c7fa9a9872b871c8355a0a0a4c8f166c5538a35b551afb45353` |
| 3 | `supabase/migrations/20260726142523_1f0e4b6d-285f-4ed7-89f0-1db03f440253.sql` (ACL normalization forward-fix) | `183bc20c56d6782971cff496f03fafa6f415df22ea2974fc08aeda4dae4a3a30` |

All additive. No locked Phase 1–4 migration was modified.

---

## 4. Object definitions

### 4.1 `public.delivery_promise_profiles`

`id` uuid PK · `scope_type` · `company_id` · `merchant_store_id` · `profile_code` ·
`version_number` · `display_name` · `timezone_name` · `handling_business_days` ·
`customer_date_selection_enabled` · `status` · `supersedes_profile_id` ·
`created_at` · `updated_at`.

Constraints: `dpp_scope_type_ck`, `dpp_scope_contract_ck`, `dpp_company_fk`,
`dpp_store_company_fk` (composite → `merchant_stores(id, company_id)`),
`dpp_profile_code_ck`, `dpp_version_ck`, `dpp_display_ck`, `dpp_timezone_shape_ck`,
`dpp_handling_days_ck`, `dpp_status_ck`, `dpp_not_self_supersede_ck`.

Indexes: `dpp_family_version_uk`, `dpp_one_active_per_family_uk` (partial,
`status='active'`), `dpp_company_ix`, `dpp_store_ix`, `dpp_supersedes_ix`.
9 indexes total across the two tables (incl. PKs and the weekday unique key).

### 4.2 `public.delivery_promise_weekly_schedules`

`id` uuid PK · `delivery_promise_profile_id` · `weekday_iso` · `accepts_orders` ·
`order_cutoff_local_time` · `handover_enabled` · `created_at` · `updated_at`.

Constraints: `dpws_weekday_ck` (1–7), `dpws_cutoff_contract_ck`,
`dpws_profile_weekday_uk (profile, weekday)`.

### 4.3 Guard functions (4) and triggers (5)

`m1c1db_guard_touch_updated_at`, `m1c1db_guard_profile_integrity`,
`m1c1db_guard_profile_immutability`, `m1c1db_guard_weekly_schedule_mutable`.
All `OWNER = postgres`, `search_path = ''`, schema-qualified, no dynamic SQL,
no application EXECUTE.

---

## 5. Scope and tenancy contract

- `scope_type = 'merchant_store'` ⇒ `company_id IS NOT NULL AND merchant_store_id IS NOT NULL`.
- `scope_type = 'platform'` ⇒ both `NULL`.
- The composite FK guarantees the store belongs to the **same company** — cross-company
  references are impossible at the storage layer, not merely at application level.
- No owner polymorphism without constraints; no store may reference a platform profile
  and vice versa (no assignment object exists at all in this stage).

---

## 6. Versioning (BOR-DEC-077)

Family = `(scope_type, company_id, merchant_store_id, profile_code)`.

- `version_number >= 1`; unique per family.
- At most **one** `active` version per family (partial unique index).
- `supersedes_profile_id` must belong to the same family and carry a **lower** version.
- Activating a version that does not numerically supersede every prior
  `active/superseded/retired` version of the family is rejected.
- No activation workflow was created; activation is owner-only and operationally unused.

---

## 7. Timezone validation (BOR-DEC-075)

`timezone_name` is mandatory and validated **against `pg_catalog.pg_timezone_names`**,
not only by regex. A shape CHECK additionally rejects non-`Area/Location` strings.
Rejected in tests: `CET`, `UTC+1`, `Europe/Atlantis`. Accepted: `Europe/Amsterdam`,
`Europe/Berlin`. Server timezone is never implied and no default is applied.

---

## 8. Weekly schedule semantics (BOR-DEC-075 / BOR-DEC-076)

- ISO weekday: 1 = Monday … 7 = Sunday; exactly one row per weekday per profile.
- `accepts_orders = true` ⇒ cut-off required; `false` ⇒ cut-off must be NULL.
- `handover_enabled` is independent of `accepts_orders`.
- Normalized rows only — no JSON schedule, no calendar dates.
- A profile cannot become `active` without **seven** consistent rows.

---

## 9. Handling-day semantics

`handling_business_days >= 0`. It counts business days after order acceptance and
before the shipment is ready for carrier handover. `0` permits same-day handling in
principle but never guarantees same-day handover, which additionally requires an order
before the local cut-off, `handover_enabled = true` that weekday, and no future
blackout (blackouts are not modelled yet). **No ETA is computed in any trigger.**
Binding COMMENTs are attached to the table and to the column.

---

## 10. Customer-selected date

Only the capability marker `customer_date_selection_enabled` exists (default `false`).
No capacity, booking slots, minimum date, maximum horizon or carrier appointment logic
was created; the flag cannot be honoured operationally until a calendar/capacity
contract is designed.

---

## 11. Activation integrity and immutability

Blocked by guard: activation without seven days, with an invalid IANA timezone, with an
inconsistent schedule, with more than one active version per family, or with a
non-superseding version number.

Once `active`, `superseded` or `retired`, the profile's scope, company/store, code,
version, timezone, handling days, customer-date capability, supersedes pointer **and
status** are immutable, and its weekly rows can no longer be inserted, updated or
deleted. Changing `active → superseded/inactive` therefore requires a future trusted
workflow, which was deliberately **not** created (R-5).

---

## 12. RLS / ACL matrix

| Object | RLS | FORCE | Policies | anon | authenticated | service_role | sandbox_exec | PUBLIC |
|---|---|---|---|---|---|---|---|---|
| `delivery_promise_profiles` | yes | yes | 0 | none | none | none | none | none |
| `delivery_promise_weekly_schedules` | yes | yes | 0 | none | none | none | none | none |
| 4 × `m1c1db_guard_*` | n/a | n/a | n/a | none | none | none | none | none (`proacl` non-NULL) |

No application RPC was created. Runtime deny proof: `SELECT` on both tables from the
sandbox role returns `permission denied`.

---

## 13. ACL gate update and two-cycle evidence

`scripts/phase5-acl-gate/check-critical-acl.sh` extended with:
both new tables in the protected inventory and in the runtime deny loop;
`m1c1db_guard_*` lock + non-NULL `proacl` check; guard inventory count = 4;
"no temporary verification routine survives a deployment"; delivery-promise sequence
check (R-T22); RLS-enabled+forced = 2; zero policies.
`approved-routines.json` unchanged — this stage adds **no** app-executable routine.

| Cycle | Result |
|---|---|
| First run after migration #1/#2 | **FAIL (exit 1)** — 28 re-granted privileges to `sandbox_exec` on protected tax/shipping tables (drift Mechanism A) |
| Forward-fix migration #3 | applied |
| Post-commit cycle 1 | **PASS (exit 0)** — 16 assertions |
| Post-commit cycle 2 | **PASS (exit 0)** |
| Simulated-failure path | **exit 1** (still functional) |

Drift was also caught **inside** the verification run: `place_order` had been re-granted
`EXECUTE` to `sandbox_exec` after migration #1; migration #2 re-asserted P5-HF-001 before
running any test. Final ACL: `place_order(uuid,integer,jsonb) = {postgres=X/postgres}`.

---

## 14. Test traceability

**54 assertions, 54 PASS, 0 FAIL**, executed by an owner-side `SECURITY DEFINER` routine
that was created, run inside a subtransaction, **force-rolled back**, and dropped in the
same migration. Post-cleanup assertions proved 0 residual objects and 0 residual rows.

| # | Assertion | Result |
|---|---|---|
| T1 | exactly the two tables created | PASS |
| T2 / T3 | RLS enabled / FORCE RLS on both | PASS |
| T4 | zero policies | PASS |
| T5 | zero privileges for anon/authenticated/service_role/sandbox_exec | PASS |
| T6 | zero PUBLIC privileges | PASS |
| T7 | no `m1c1db_*` function with `proacl` NULL | PASS |
| T8 | no application/sandbox EXECUTE on guards | PASS |
| T9 | no new sequences in scope (R-T22) | PASS |
| T10 / T11 | `place_order` body fail-closed / not executable by any non-owner | PASS |
| T12 | no assignment/transit/blackout/quote/slot/capacity table created | PASS |
| T13 | no ETA resolver / quote routine created | PASS |
| T14 | merchant scope without company+store rejected | PASS |
| T15 | platform scope with company/store rejected | PASS |
| T16 | cross-company store rejected | PASS |
| T17 | invalid `scope_type` rejected | PASS |
| T18 | invalid status rejected | PASS |
| T19 | `version_number = 0` rejected | PASS |
| T20 | negative handling days rejected | PASS |
| T21 / T22 / T23 | `CET` / `Europe/Atlantis` / `UTC+1` rejected | PASS |
| T24 / T25 | valid merchant-store and platform profiles accepted | PASS |
| T26 | duplicate version in family rejected | PASS |
| T27 | supersedes different `profile_code` family rejected | PASS |
| T28 | supersedes cross-tenant rejected | PASS |
| T29 | supersedes with non-higher version rejected | PASS |
| T30 / T31 | weekday 0 / weekday 8 rejected | PASS |
| T32 | accepts_orders without cut-off rejected | PASS |
| T33 | closed day with cut-off rejected | PASS |
| T34 | handover true while accepts_orders false accepted | PASS |
| T35 | duplicate weekday in the same profile rejected | PASS |
| T36 | same weekday in another profile accepted | PASS |
| T37 | draft profile with an incomplete schedule is allowed | PASS |
| T38 | activation without seven days rejected | PASS |
| T39 | activation with a complete seven-day schedule accepted (in rollback) | PASS |
| T40 / T41 / T42 | active profile timezone / handling days / status immutable | PASS |
| T43 / T44 / T45 | active weekly rows cannot be updated / deleted / added | PASS |
| T46 | second active version in the same family rejected | PASS |
| T47 | activating a non-superseding version rejected | PASS |
| T48 | `handling_business_days = 0` representable | PASS |
| T49 | customer-date flag creates no booking capability | PASS |
| T50 | tax counts 4/9/5 unchanged | PASS |
| T51 | shipping foundation counts 0/0/0/0/0/0/0 | PASS |
| T52 | prices 0, publications 0 | PASS |
| T53 | zero live-authorized channel connections | PASS |
| T54 | live-mode channel rows still exactly 9 | PASS |

Additional post-commit evidence: gate cycles 1 and 2 PASS, simulated failure path exit 1,
sandbox role denied read on both new tables, seller/admin read surfaces unaffected
(no route, RPC or policy was touched), tenant isolation unchanged.

---

## 15. Zero-row / zero-delta evidence

| Counter | Value |
|---|---|
| `delivery_promise_profiles` | **0** |
| `delivery_promise_weekly_schedules` | **0** |
| origins / sku profiles / packages / assignments | 0 / 0 / 0 / 0 |
| rate cards / lanes / rules | 0 / 0 / 0 |
| tax categories / bands / rate versions | 4 / 9 / 5 |
| offer prices | 0 |
| publications | 0 |
| merchant stores | 0 |
| Final row delta | **zero** |

All fixtures (2 companies, 2 stores, 5 profiles, 22 weekday rows) existed only inside the
rolled-back subtransaction.

---

## 16. Risk status

| Risk | Status after M1C-1D-B |
|---|---|
| **R-5** (denied-audit rows roll back; no trusted write path) | **OPEN** — no application role can create, modify or activate a profile; activation stays owner-only and operationally unused |
| **R-S1 / R-S2 / R-S3 / R-S4** | unchanged (R-S4 open: pallet still not representable; `bulky` must never be used as a proxy) |
| **R-T21** (sandbox blanket re-grants) | **OPEN** — reconfirmed live twice during this stage; both new tables and all four new functions are now inside the gate's protected inventory. Not closed schema-wide |
| **R-T22** (historical sequences) | unchanged — this stage uses UUID keys only; **zero** sequences created |
| **R-C1** | closed for the current state (metadata-only live rows) |
| **R-C2** (`p4_writes_allowed()` ignores `live_authorized_at`) | **OPEN — BLOCKER** before any outbound sync, inventory publishing, order ingestion, carrier dispatch or channel write. `p4_writes_allowed()` was **not modified** in this stage |

### R-C2 / channel evidence

- No outbound action was triggered; no worker, cron or API surface was invoked.
- **No `channel_*` row was modified.**
- All 9 `mode='live'` connections still carry `live_authorized_at IS NULL`.
- `p4_dispatch_decision` remains `deferred_not_authorized` for all 9 (verified read-only).
- Bol Live off. Stripe Live off.

---

## 17. Rollback / forward-fix

Rollback: `DROP TABLE public.delivery_promise_weekly_schedules;`
`DROP TABLE public.delivery_promise_profiles;` then drop the four `m1c1db_guard_*`
functions. Both tables are empty and referenced by nothing, so the drop is
side-effect free. Any ACL deviation is remediated **forward-only** by a new migration
ending in an explicit ACL normalization section (as done in migration #3), never by
re-granting.

---

## 18. Verdict

**M1C-1D-B PASS WITH RESIDUAL RISKS.**

Halting. Assignment contract (M1C-1D-C), transit-time rules, the ETA resolver, manual
quotes and any UI require separate Owner authorization.
