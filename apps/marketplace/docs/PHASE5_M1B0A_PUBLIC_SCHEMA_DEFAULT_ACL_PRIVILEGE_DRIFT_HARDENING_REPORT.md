# PHASE 5 — M1B-0A: PUBLIC SCHEMA DEFAULT ACL AND PRIVILEGE-DRIFT HARDENING

**Date:** 2026-07-26
**Stage type:** ACL governance only (no business schema, no business objects, no data mutation)
**Verdict:** **M1B-0A PASS WITH RESIDUAL RISKS**
**R-T19 status:** **CLOSED for the migration execution path** (new residual **R-T20** recorded for the platform-owner path)

---

## 1. Migration execution identity and object ownership

| Item | Value |
|---|---|
| Sandbox probe role (`current_user` / `session_user`) | `sandbox_exec` |
| Database | `postgres` |
| Effective migration/DDL role (proved by canary ownership) | `postgres` |
| Owner of schema `public` | `pg_database_owner` |
| Owner of all 68 tables, 198 indexes, 1 view, 1 sequence in `public` | `postgres` |
| Owner of all 117 functions in `public` | `postgres` |
| Canary objects created by this stage | owned by `postgres` → confirms migrations run as `postgres` |

`postgres` is **not** superuser (`rolsuper = f`) and is not a member of `supabase_admin`; it is a member of `anon`, `authenticated`, `service_role`, `authenticator`, `sandbox_exec`, `pg_read_all_data`, `pg_monitor`, `pg_signal_backend`, `pg_create_subscription`, `supabase_privileged_role`.

## 2. Role memberships (drift-relevant)

| Member | Granted roles |
|---|---|
| `postgres` | `anon`, `authenticated`, `service_role`, `authenticator`, `sandbox_exec`, `pg_read_all_data`, `pg_monitor`, `pg_signal_backend`, `pg_create_subscription`, `supabase_privileged_role` |
| `authenticator` | `anon`, `authenticated`, `service_role` (NOINHERIT — privileges only after `SET ROLE`) |
| `anon` / `authenticated` / `service_role` / `sandbox_exec` | no onward memberships |

Inheritance finding: no application role inherits a forbidden privilege. `postgres` inherits *from* the app roles, which cannot widen app-role access. `authenticator` is `NOINHERIT`, so PostgREST access is exactly the switched-to role's ACL.

## 3. Origin investigation — root cause of privilege re-grant

Catalogs inspected: `pg_default_acl`, `pg_namespace.nspacl`, `pg_class.relacl`, `pg_proc.proacl`, `pg_roles`, `pg_auth_members`, plus `has_schema_privilege` / `has_table_privilege` / `has_sequence_privilege` / `has_function_privilege` probes.

**Primary cause (confirmed): `pg_default_acl` entries owned by `postgres` for schema `public`.** Pre-state:

| Owner | Object type | Default ACL (pre) |
|---|---|---|
| `postgres` | tables (`r`) | `postgres=arwdDxtm`, `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm`, **`sandbox_exec=ar`** |
| `postgres` | sequences (`S`) | `postgres=rwU`, `anon=rwU`, `authenticated=rwU`, `service_role=rwU`, **`sandbox_exec=rU`** |
| `postgres` | functions (`f`) | `postgres=X`, `anon=X`, `authenticated=X`, `service_role=X`, **`sandbox_exec=X`** |
| `supabase_admin` | tables / sequences / functions | full DML / `rwU` / `X` to `anon`, `authenticated`, `service_role` |

Because migrations execute as `postgres`, every `CREATE TABLE` in `public` silently acquired full DML for the three API roles and `SELECT`+`INSERT` for `sandbox_exec` — exactly the `sandbox_exec=ar` grants that re-appeared on the seven sensitive tables after M1B-3C-5 and that aborted the first M1B-3C-6 attempt.

**Ruled out as the cause:** no post-commit explicit re-grant by the platform (proved by the canary in §6); no schema-level `CREATE` for app roles; no role-membership inheritance path; no ownership mismatch (single owner `postgres`).

## 4. Schema ACL — before / after

Before and after are identical in effect, because app roles already lacked `CREATE`; the stage re-asserted it defensively.

```
public: pg_database_owner=UC/pg_database_owner, =U (PUBLIC), postgres=U,
        anon=U, authenticated=U, service_role=U, sandbox_exec=U
```

`has_schema_privilege(..., 'public', 'CREATE')` after: `anon=f`, `authenticated=f`, `service_role=f`, `sandbox_exec=f`, `PUBLIC=f`.
`USAGE` deliberately preserved for all app roles (removal would break every PostgREST read and every approved RPC).

## 5. Default ACL — after

| Owner | Object type | Default ACL (post) |
|---|---|---|
| `postgres` | tables | `postgres=arwdDxtm/postgres` only |
| `postgres` | sequences | `postgres=rwU/postgres` only |
| `postgres` | functions | `postgres=X/postgres` only |
| `supabase_admin` | tables / sequences / functions | **unchanged** (see R-T20) |

`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` was attempted inside an exception-guarded block and is not permitted for the migration role (`postgres` is not a member of `supabase_admin`). This is a platform-managed limitation, recorded as **R-T20**, and it does not affect the migration path: every operational object in `public` is created by `postgres`.

## 6. Canary design and post-commit results

Two-round design (single-transaction `BEGIN/ROLLBACK` testing is insufficient when drift can occur after commit):

* **Round 1 migration** — hardened default/schema ACLs, then created, via the real migration path and owner:
  * `public.zz_m1b0a_security_canary_table` (one `bigint` PK column, **zero rows**)
  * `public.zz_m1b0a_security_canary_seq`
  * `public.zz_m1b0a_security_canary_fn()` (non-RPC, `IMMUTABLE`, returns `'canary'`)
  Each object carries a `COMMENT` marking it a temporary security canary. Never referenced by application code.
* **Post-commit inspection (after platform processing of round 1):**
  * `zz_m1b0a_security_canary_table` → `relacl = {postgres=arwdDxtm/postgres}`
  * `zz_m1b0a_security_canary_seq` → `relacl = {postgres=rwU/postgres}`
  * `zz_m1b0a_security_canary_fn` → `proacl = {postgres=X/postgres}`
  * Probes: 0 leaks / 280 table assertions (8 tables × 5 roles × 7 privileges), 0 leaks / 15 sequence assertions, 0/5 function EXECUTE.
* **Round 2 migration** — re-asserted the same canary assertions fail-closed **after a second full platform cycle** (`RAISE EXCEPTION` on any leak; migration succeeded, so zero leaks), then dropped all three canary objects.
* **Cleanup evidence:** `pg_class` objects matching `zz_m1b0a%` = **0**; `pg_proc` matching `zz_m1b0a%` = **0**. No permanent object delta.

## 7. Existing sensitive objects (M1B-3C-5 scope) — re-verified

`relacl` after this stage, for all seven tables (`tax_categories`, `tax_rate_bands`, `tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles`, `merchant_store_offer_prices`, `borvat_direct_listing_publications`):

```
{postgres=arwdDxtm/postgres}
```

The `sandbox_exec=ar` drift grants observed during M1B-3C-6 are **gone**. Live probe as `sandbox_exec`: `ERROR: permission denied for table tax_rate_bands` (deny-by-default confirmed at runtime, not just in the catalog).

No broad revokes were executed outside the protected scope. One in-scope privilege correction was applied: `place_order(uuid, integer, jsonb)` still had `EXECUTE` for `sandbox_exec` (drift residue); it is now revoked from `PUBLIC`, `anon`, `authenticated`, `service_role`, `sandbox_exec` → all `false`. **P5-HF-001 fully intact and strengthened.**

## 8. Regression results

| Check | Result |
|---|---|
| Seller read-only surfaces (`merchant_stores`, `channel_listings`, `channel_accounts` SELECT for `authenticated`) | PASS (`t`, unchanged) |
| `merchant_stores` not readable by `anon` | PASS (`f`) |
| Admin cross-merchant RPCs (`admin_list_merchant_stores`, `admin_list_borvat_direct_accounts`, `admin_list_borvat_direct_draft_listings`) EXECUTE for `authenticated` | PASS (`t`) |
| `create_borvat_direct_draft_listing`, `has_role`, `create_borvat_direct_account` EXECUTE | PASS (`t`) |
| `user_roles` direct access for app roles | PASS (`f` — governance from M1A #2D-1A intact) |
| Cross-merchant isolation (RLS policies + definer RPC role checks untouched) | PASS — no policy, function body or RLS change in this stage |
| `place_order` EXECUTE | PASS — revoked for all non-owner roles |
| New direct table access granted | None (0 `GRANT` statements in both migrations) |
| Bol Live | Off (untouched) |
| Stripe Live | Off (untouched) |

No privilege was widened to fix a regression; no regression occurred.

## 9. Row / object delta

* Rows created / updated / deleted: **0** (both migrations contain no DML; round 1 opened with a fail-closed count assertion of `tax_categories=4`, `tax_rate_bands=9`, `tax_rate_versions=5`, classifications/profiles/prices/publications`=0` and the migration only proceeded because it held).
* Business schema change: **none**. No shipping/pricing/tax/publication object created. No status change, no classification, no price, no publication.
* Permanent object delta: **none** — the only created objects were the three canaries, both created and dropped inside this stage.
* Permanent delta limited to: `pg_default_acl` for role `postgres` in `public` (3 entries narrowed to owner-only), defensive `REVOKE CREATE ON SCHEMA public`, re-assertion revokes on the 7 sensitive tables, and the `place_order` `sandbox_exec` revoke, plus this documentation.

## 10. Test matrix (26 assertions)

| # | Assertion | Result |
|---|---|---|
| 1 | Object-creator roles identified (`postgres`; `supabase_admin` platform-only) | PASS |
| 2 | All `pg_default_acl` entries enumerated and documented | PASS |
| 3 | Schema `CREATE` unavailable to app roles | PASS |
| 4 | Future-table defaults grant nothing to forbidden roles | PASS |
| 5 | Future-sequence defaults grant nothing | PASS |
| 6 | Future-function defaults grant no `EXECUTE` | PASS |
| 7 | Existing sensitive tables remain deny-by-default | PASS |
| 8 | Existing guard/trigger functions carry no application `EXECUTE` | PASS (unchanged from M1B-3C-5) |
| 9 | Canary table: no privileges after commit | PASS |
| 10 | Canary sequence: no privileges after commit | PASS |
| 11 | Canary function: no `EXECUTE` after commit | PASS |
| 12 | `sandbox_exec` has no `SELECT` on protected tables | PASS |
| 13 | `sandbox_exec` has no `INSERT` | PASS |
| 14 | `authenticated` has no DML on protected tables | PASS |
| 15 | `anon` has no SELECT/DML on protected tables | PASS |
| 16 | `service_role` has no direct DML on protected tables | PASS |
| 17 | `PUBLIC` has no privileges on protected tables | PASS |
| 18 | Role inheritance restores no forbidden privilege | PASS |
| 19 | Canary objects dropped (0 remaining) | PASS |
| 20 | No new business object | PASS |
| 21 | No row mutation | PASS |
| 22 | Tax counts constant (4 / 9 / 5 / 0 / 0 / 0 / 0) | PASS (asserted in-migration) |
| 23 | Seller read regression | PASS |
| 24 | Admin RPC regression | PASS |
| 25 | Cross-tenant isolation | PASS |
| 26 | P5-HF-001 / `place_order` revoked; Bol & Stripe Live off | PASS |

## 11. R-T19 disposition

Closure conditions:

1. **Source identified** — `postgres` default ACLs in `public` (not a post-commit platform re-grant). ✔
2. **Hardening applied to every relevant object-creator role** — `postgres` (the migration path) hardened; `supabase_admin` not alterable by the migration role. ◐
3. **Post-commit canary proof across two platform cycles** — future tables, sequences and functions receive **no** non-owner privileges. ✔

**R-T19 CLOSED — FUTURE PUBLIC-SCHEMA OBJECTS CREATED BY THE MIGRATION PATH ARE DENY-BY-DEFAULT.**

New residual **R-T20 — PLATFORM-OWNER (`supabase_admin`) DEFAULT ACLs IN `public` STILL GRANT APP-ROLE PRIVILEGES.** Any object created in `public` by the platform owner role (not by our migrations) would still receive full DML for `anon`/`authenticated`/`service_role`. Compensating controls retained and mandatory for every future object-creating stage:

* a **mandatory final REVOKE section** in every sensitive migration (implemented in both migrations of this stage);
* a **post-migration ACL assertion** before any data load or activation;
* fail-closed `RAISE EXCEPTION` on any detected non-owner grant.

## 12. Rollback / forward-fix

* Rollback: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ...` would restore the previous permissive defaults; **not recommended** — it reinstates the drift.
* Forward-fix on regression: grant the *specific* privilege to the *specific* role on the *specific* object inside a dedicated migration with a named caller and documented justification. No `ALL TABLES IN SCHEMA public` / `ALL FUNCTIONS IN SCHEMA public` grants.
* Canary rollback: not needed — objects already dropped, zero rows ever stored.

## 13. Platform-managed limitations

1. `supabase_admin` default ACLs cannot be altered by the migration role (R-T20).
2. Schema `public` is owned by `pg_database_owner`; ownership is not changed by this stage.
3. `sandbox_exec` retains `BYPASSRLS`-style read paths only where table privileges exist — now none for protected tables.

**Final verdict: M1B-0A PASS WITH RESIDUAL RISKS.**
Blocked pending separate Owner authorization: shipping foundation, seller pricing, tax approval/activation, product classifications, company tax profiles, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live.
