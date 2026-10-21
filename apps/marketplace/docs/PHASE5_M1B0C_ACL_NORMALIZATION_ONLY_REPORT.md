# PHASE 5 — M1B-0C : ACL NORMALIZATION ONLY

**Authorization:** Owner, M1B-0C (normalization-only, zero business schema)
**Executed:** 2026-07-26
**Verdict:** **M1B-0C PASS**
**Drift cycle remediated:** R-T21 (cycle 4)

---

## 1. ACL state BEFORE correction (gate run, exit 1)

```
== M1B-0B POST-DEPLOYMENT ACL GATE ==
checked_at: 2026-07-26 15:31:32.615891+00
FAIL: place_order not executable by any application/sandbox role (expected 0, got 1)
PASS: place_order carries no PUBLIC EXECUTE (0)
PASS: place_order body is fail-closed (neutralised) (0)
  - place_order(uuid,integer,jsonb)  acl={postgres=X/postgres,sandbox_exec=X/postgres}
FAIL: protected tax/pricing/publication/shipping tables owner-only (expected 0, got 46)
FAIL: gate role is denied read on protected tables (runtime deny proof) (expected 0, got 9)
FAIL: M1C-1D-B guard functions locked (expected 0, got 4)
FAIL: M1C-1D-C guard functions locked (expected 0, got 4)
FAIL: gate role is denied read on the assignment table (expected 0, got 1)
FAIL: M1C-1D-D guard functions locked (expected 0, got 9)
FAIL: gate role is denied read on transit/calendar tables (expected 0, got 6)
ACL GATE: FAIL
```

### 1.1 Affected objects (enumerated pre-fix)

| Class | Object(s) | Drifted grantee | Privileges |
|---|---|---|---|
| Routine | `public.place_order(uuid,integer,jsonb)` | `sandbox_exec` | EXECUTE |
| Tables (23) | tax_categories, tax_rate_bands, tax_rate_versions, catalog_product_tax_classifications, company_tax_profiles, merchant_store_offer_prices, borvat_direct_listing_publications, merchant_fulfillment_origins, merchant_store_sku_shipping_profiles, merchant_store_sku_shipping_packages, merchant_store_sku_fulfillment_origins, shipping_rate_cards, shipping_rate_lanes, shipping_rate_rules, delivery_promise_profiles, delivery_promise_weekly_schedules, merchant_store_sku_delivery_promise_assignments, shipping_transit_time_profiles, shipping_transit_time_weekday_rules, shipping_transit_delivery_weekdays, shipping_calendar_profiles, shipping_calendar_blackout_dates, shipping_transit_time_profile_calendars | `sandbox_exec` | SELECT, INSERT (46 privilege rows) |
| Guard routines (17) | `m1c1db_guard_*` (4), `m1c1dc_guard_*` (4), `m1c1dd_guard_*` (9) | `sandbox_exec` | EXECUTE |

Root cause is unchanged from earlier cycles: platform-level default privileges re-grant
`sandbox_exec` on newly created `public` objects after each migration (R-T21). No application
code, RPC, or tenant path was involved.

---

## 2. REVOKE statements applied (zero GRANT statements in the migration)

Executed dynamically inside a single fail-loud `DO` block. Materialised statements:

**2.1 place_order — every overload**
```sql
REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb) FROM service_role;
REVOKE ALL ON FUNCTION public.place_order(uuid,integer,jsonb) FROM sandbox_exec;
```

**2.2 Protected tables — for each of the 23 tables listed in §1.1**
```sql
REVOKE ALL ON TABLE public.<table> FROM PUBLIC;
REVOKE ALL ON TABLE public.<table> FROM anon;
REVOKE ALL ON TABLE public.<table> FROM authenticated;
REVOKE ALL ON TABLE public.<table> FROM service_role;
REVOKE ALL ON TABLE public.<table> FROM sandbox_exec;
```
(115 REVOKE statements; loop aborts unless exactly 23 tables are matched.)

**2.3 Guard / trigger routines — every routine returning `trigger` plus `m1c1c_/m1c1db_/m1c1dc_/m1c1dd_guard_*`**
```sql
REVOKE ALL ON FUNCTION public.<guard>(...) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.<guard>(...) FROM anon;
REVOKE ALL ON FUNCTION public.<guard>(...) FROM authenticated;
REVOKE ALL ON FUNCTION public.<guard>(...) FROM service_role;
REVOKE ALL ON FUNCTION public.<guard>(...) FROM sandbox_exec;
```

**Grant statements issued: 0.** No `ALTER DEFAULT PRIVILEGES`, no policy, no schema DDL.

---

## 3. `place_order` state after normalization

| Check | Result |
|---|---|
| Signatures found | 1 — `place_order(uuid,integer,jsonb)` |
| Final ACL | `{postgres=X/postgres}` |
| PUBLIC EXECUTE | none |
| anon / authenticated / service_role / sandbox_exec EXECUTE | none |
| Body fail-closed (`permanently disabled`) | YES — asserted in-migration, unchanged (no redefinition) |

The migration aborts with an exception if any signature is missing, if the body is not
fail-closed, or if EXECUTE survives for any application/sandbox role.

---

## 4. Gate cycle 1 (immediately post-commit)

`exit = 0` — **ACL GATE: PASS**, 29/29 assertions PASS.

```
PASS: place_order not executable by any application/sandbox role (0)
PASS: place_order carries no PUBLIC EXECUTE (0)
PASS: place_order body is fail-closed (neutralised) (0)
  - place_order(uuid,integer,jsonb)  acl={postgres=X/postgres}
PASS: no public routine executable by anon (0)
PASS: trigger/guard routines not executable by application roles (0)
PASS: no routine executable by app roles outside the approved allowlist (0)
PASS: protected tax/pricing/publication/shipping tables owner-only (0)
PASS: gate role is denied read on protected tables (runtime deny proof) (0)
PASS: M1C-1C / M1C-1D-B / M1C-1D-C / M1C-1D-D guard functions locked (0/0/0/0)
PASS: guard inventories complete (4 / 4 / 9)
PASS: RLS enabled+forced and zero policies on promise, assignment, transit/calendar tables
PASS: no sequences in rate-card / promise / assignment / transit scopes (R-T22)
PASS: no manual-quote/default/listing/ETA-booking objects exist (0)
PASS: no temporary verification routine left in public (0)
ACL GATE: PASS
```

## 5. Gate cycle 2 (independent, later re-run)

`exit = 0` — **ACL GATE: PASS**, 29/29 assertions PASS. No re-drift observed between cycles.

## 6. Failure-path evidence

`ACL_GATE_SIMULATE_FAILURE=1` run:
```
FAIL: SIMULATED violation (failure-path proof) (expected 0, got 1)
ACL GATE: FAIL — deployment must not be considered successful.
exit = 1
```
The gate still fails loudly and returns exit 1; it did not become permissive.

---

## 7. Zero-row / zero-object delta

| Metric | Before | After | Delta |
|---|---|---|---|
| `public` relations (`pg_class`) | 359 | 359 | 0 |
| `public` routines (`pg_proc`) | 140 | 140 | 0 |
| Tax `categories/bands/versions` | 4 / 9 / 5 | 4 / 9 / 5 (asserted in-migration) | 0 |
| Fulfillment origins / SKU profiles / packages / SKU origins | 0/0/0/0 | 0/0/0/0 | 0 |
| Rate cards / lanes / rules | 0/0/0 | 0/0/0 | 0 |
| Promise profiles / weekly schedules | 0/0 | 0/0 | 0 |
| Promise assignments | 0 | 0 | 0 |
| Transit profiles / weekday rules / delivery weekdays / calendars / blackouts / junction | 0/0/0/0/0/0 | 0/0/0/0/0/0 | 0 |
| Offer prices | 0 | 0 | 0 |
| Borvat Direct publications | 0 | 0 | 0 |

Only object added to the system: the migration record itself.

Post-commit the gate/sandbox role is correctly **denied** read on the protected tables
(`ERROR: permission denied for table tax_categories`), which is the intended end state; the
row invariants above were therefore asserted **inside** the migration transaction, fail-closed
(the migration raises and rolls back on any deviation).

---

## 8. Confirmation: no business changes

- No `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, constraint, policy, type, or sequence.
- No rate–transit junction, no ETA resolver, no manual-quote object, no RPC, no UI.
- No modification of delivery promise, transit, calendar or pricing models.
- No `INSERT` / `UPDATE` / `DELETE`.
- `p4_writes_allowed()` untouched.
- No Bol, Stripe, outbound or inbound execution triggered.

## 9. R-C2 status — REMAINS A BLOCKER

| Check | Result |
|---|---|
| `channel_connections` rows with `mode='live'` | 9 |
| of which `live_authorized_at IS NULL` | 9 |
| `p4_dispatch_decision(...)` for those rows | `deferred_not_authorized` × 9 |

No channel row was created, modified, or authorized. The migration aborts if any live
connection is found authorized.

## 10. R-T21 status

**ACTIVE, RECURRING, CONTAINED.** The drift source (platform default privileges re-granting
`sandbox_exec` on new `public` objects) is outside application control. Every migration must
therefore continue to end with an explicit REVOKE-only normalization section, and the ACL gate
must be run twice post-commit. This cycle was detected by the gate and fully remediated.

---

## FINAL VERDICT

**M1B-0C PASS** — ACL normalization complete, gate green on two independent cycles, failure
path proven, zero row delta, zero object delta, zero business change, R-C2 blocker intact.

**Next step (NOT started, requires separate Owner authorization):**
`M1C-1D-F — EXPLICIT RATE-TRANSIT BINDING FOUNDATION`.
