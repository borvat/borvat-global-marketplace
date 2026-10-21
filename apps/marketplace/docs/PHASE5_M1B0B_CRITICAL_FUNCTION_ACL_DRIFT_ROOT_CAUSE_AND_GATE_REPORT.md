# PHASE 5 — M1B-0B: CRITICAL FUNCTION ACL DRIFT ROOT CAUSE AND POST-DEPLOYMENT GATE

**Date:** 2026-07-26
**Stage type:** Security investigation + ACL hardening only (no business schema, no business object, no data mutation)
**Verdict:** **M1B-0B PASS WITH RESIDUAL RISKS**
**R-T20 status:** **CLOSED — CRITICAL FUNCTION ACL DRIFT IS PREVENTED BY ROOT-CAUSE FIX AND POST-DEPLOYMENT GATE** (new residual **R-T21** for the sandbox-role blanket grant)

Migrations (additive, ACL-only):

| Migration | SHA-256 |
|---|---|
| `20260726132802_4bc73294-f528-4586-9565-9460f08a0a04.sql` (cycle 1: revoke + neutralise + normalisation) | `db634bbdf14e6c18cc792bbc324f0f0b49f4f246cf6498ac99fde0d5f957c6dc` |
| `20260726133107_55e4783f-93ee-48da-9eca-6aefda113ce2.sql` (cycle 2: canary + normalisation + fail-closed assertions) | `6f24a04119bf7f0460c07aeb39c50e7d153c3efde1f6ef5ff5abcea96350063e` |

---

## 1. Timeline of ACL state for `public.place_order`

| Point in time | `proacl` | anon / authenticated / service_role EXECUTE | sandbox_exec EXECUTE |
|---|---|---|---|
| After P5-HF-001 (2026-07-24) | `{postgres=X/postgres}` | f / f / f | f |
| After M1B-0A round 2 (2026-07-26, revoke applied) | `{postgres=X/postgres}` | f / f / f | f |
| After M1C-1B commit (post-commit revoke applied) | `{postgres=X/postgres}` | f / f / f | f |
| **M1B-0B investigation start (before any change this stage)** | **`{postgres=X/postgres,sandbox_exec=X/postgres}`** | f / f / f | **t** |
| Inside M1B-0B cycle-1 migration, after revoke, before commit | `{postgres=X/postgres}` | f / f / f | f |
| Immediately after cycle-1 commit (13:28:28Z) | `{postgres=X/postgres}` | f / f / f | f |
| After Lovable migration processing + new exec sessions (13:29:32Z, 13:30:07Z) | `{postgres=X/postgres}` | f / f / f | f |
| After cycle-2 canary migration + processing (13:31:22Z) | `{postgres=X/postgres}` | f / f / f | f |

Function identity throughout: `owner = postgres`, `prosecdef = t`, single signature, body hash `63348a94…` before neutralisation.

**Conclusion on timing:** the re-grant on `place_order` was **never** to an application role. In every observation `PUBLIC`, `anon`, `authenticated` and `service_role` were `false`; the only re-appearing grantee was the sandbox tooling role `sandbox_exec`, and it appeared **between** deployments (out of band, not inside our migration transaction and not immediately at commit).

## 2. Root cause

Two distinct mechanisms, both proved this stage; neither is the "post-commit platform re-grant of a single object" originally suspected.

### Root cause A — blanket sandbox provisioning grant (external, out of band)

Measured at investigation start:

* **118 / 118** functions in `public` had `sandbox_exec=X/postgres` — *every* function, old and new, including trigger-only guards and `place_order`.
* **74** relations in `public` had `sandbox_exec=ar` (SELECT+INSERT) or, for sequences, `sandbox_exec=rU`.
* The pattern is uniform, grantor is `postgres`, and it matches exactly the documented capability of the Lovable exec database access ("select/insert only").

That is the signature of an out-of-band, platform-issued blanket
`GRANT SELECT, INSERT ON ALL TABLES … / GRANT EXECUTE ON ALL FUNCTIONS … / GRANT SELECT, USAGE ON ALL SEQUENCES … IN SCHEMA public TO sandbox_exec`,
re-issued when sandbox database access is (re-)provisioned. It touches **existing** objects, which is precisely why narrowing `pg_default_acl` in M1B-0A (a *future-object* control) did not prevent it, and why an old, sensitive object such as `place_order` acquired a new grant.

Ruled out with evidence: `pg_default_acl` (already owner-only for `postgres`), event triggers (only `pgrst_ddl_watch`, `pgrst_drop_watch`, `set_graphql_placeholder`, `grant_pg_cron_access`, `grant_pg_net_access`, `grant_pg_graphql_access` — none touch `public` ACLs for `sandbox_exec`), role inheritance (`authenticator` is NOINHERIT; `anon`/`authenticated`/`service_role`/`sandbox_exec` have no onward memberships), repository SQL (`rg` over `supabase/migrations`, `scripts`, `src` finds no `GRANT EXECUTE … sandbox_exec`, no `ALL FUNCTIONS IN SCHEMA`, no `ALTER DEFAULT PRIVILEGES` outside M1B-0A), test harnesses (none grant), and `CREATE OR REPLACE` (it preserves the existing ACL and cannot add a grantee).

### Root cause B — PostgreSQL built-in default: a routine with a NULL ACL is EXECUTE-able by PUBLIC

Proved by a live canary inside the cycle-2 migration: a freshly created function
`public.zz_m1b0b_acl_canary()` was, at creation, executable by **3 / 3** application roles
(`anon`, `authenticated`, `service_role`) — reported by the in-migration
`RAISE NOTICE 'M1B-0B ROOT CAUSE B …'` and asserted as exactly 3 before revoking.

Reason: removing `pg_default_acl` entries (M1B-0A) leaves `proacl = NULL`, and a NULL
ACL means *the PostgreSQL default*, which for functions is **`EXECUTE TO PUBLIC`**.
M1B-0A's canary compared `proacl` against an explicit owner-only string and therefore
did not detect this; for functions its "deny-by-default" conclusion was **wrong**.
This is the in-our-control root cause for every future routine and it is closed here by
an explicit `REVOKE … FROM PUBLIC` in the mandatory normalisation section plus a gate
assertion.

## 3. Drift scope test (which objects were affected)

| Scope tested | Result |
|---|---|
| `place_order` only | No — drift is schema-wide |
| All old functions | Yes — 118/118 had `sandbox_exec=X` |
| Only replaced functions | No — untouched functions were affected too |
| Only SECURITY DEFINER functions | No — invoker and trigger functions equally affected |
| Only functions with historical grants | No — functions with owner-only ACL were affected |
| Every function in `public` | **Yes** (root cause A) |
| Newly created routines (canary, non-RPC) | **Yes**, via PUBLIC default (root cause B) |
| Guard/trigger functions | Yes — 32 trigger-returning functions were executable by app roles |
| Approved admin read RPC | Unchanged (`authenticated` EXECUTE preserved) |

**Additional exposure discovered and closed:** four non-trigger `SECURITY DEFINER`
routines carried `EXECUTE TO PUBLIC`, i.e. were callable by **anonymous** PostgREST
clients: `pack_reservation_allocation(…)`, `reverse_pack_allocation(…)`,
`ship_reservation_allocation(…)`, `set_channel_published_quantity(…)`. Plus 32
trigger/guard functions with PUBLIC/anon/authenticated EXECUTE. All revoked in cycle 1.

## 4. Function signature inventory — `place_order`

Exactly one signature exists; no overloads (verified in `pg_proc`, not by name matching):

```
place_order(uuid, integer, jsonb)   owner=postgres  secdef=t  acl={postgres=X/postgres}
```

PUBLIC / anon / authenticated / service_role / sandbox_exec EXECUTE = **false** after this stage.

## 5. Fix applied

1. **Revoked** every non-owner privilege on all `place_order` overloads (`PUBLIC`, `anon`, `authenticated`, `service_role`, `sandbox_exec`).
2. **Neutralised the body** — `place_order` now raises `42501 place_order is permanently disabled (P5-HF-001 / M1B-0B)` and performs no read, no write, no stock decrement. This makes P5-HF-001 **independent of ACL drift**: even a future re-grant cannot create an order. The original body (hash `63348a94…`) remains recoverable from migration `20260724012242_…sql`; the function is still present for inspection, and `COMMENT ON FUNCTION` records the deprecation.
3. **Revoked** all app-role and sandbox EXECUTE on **all trigger-returning functions** in `public` (32 objects).
4. **Revoked** `PUBLIC` and `anon` EXECUTE on **every** routine in `public` — deny-by-default for anonymous callers, closing the four anon-callable inventory/channel routines.
5. **Re-revoked** all privileges for `anon`, `authenticated`, `service_role`, `sandbox_exec` on the 11 protected tax / pricing / publication / shipping tables.
6. **Fail-closed assertions** inside both migrations: they abort on any remaining `place_order` grant, any trigger-function grant, any anon-executable routine, any protected-table privilege, tax counts ≠ 4/9/5, shipping foundation rows ≠ 0, or a canary object left behind.

No `GRANT` statement was issued in either migration.

## 6. Post-deployment gate design (compensating control)

`scripts/phase5-acl-gate/check-critical-acl.sh` — read-only, no DB object created, no
app-facing RPC, exit `0` PASS / `1` ACL VIOLATION / `70` harness failure. It asserts:

1. `place_order`, **every overload**: no EXECUTE for `anon`, `authenticated`, `service_role`, `sandbox_exec`; no PUBLIC EXECUTE in `aclexplode(proacl)`; body still fail-closed.
2. No routine in `public` is executable by `anon`.
3. No trigger/guard routine is executable by any application role.
4. **Allowlist**: every non-trigger routine executable by `authenticated`/`service_role` must appear in `scripts/phase5-acl-gate/approved-routines.json` (75 approved signatures, generated from the reviewed post-hardening state). Anything else is reported as `UNAPPROVED` and fails the gate.
5. The 11 protected tables are owner-only for all four roles across all seven table privileges.
6. Runtime deny proof: the gate role must be *unable* to read the protected tables.

**Binding rule:** a migration is not successful until this gate exits 0, and every
sensitive migration must end with the ACL normalisation section shown in cycle 2.
Remediation is forward-fix only — never a re-grant.

## 7. Allowlist

`scripts/phase5-acl-gate/approved-routines.json` — 75 signatures with their approved
roles. Trigger/guard routines are absent by construction. `place_order` is absent.
No `GRANT … ON ALL FUNCTIONS IN SCHEMA public` is permitted; any new routine must be
added to the allowlist in the same authorised stage that grants it.

## 8. Failure-path test (real, not theoretical)

* `ACL_GATE_SIMULATE_FAILURE=1 ./scripts/phase5-acl-gate/check-critical-acl.sh` →
  `FAIL: SIMULATED violation (failure-path proof) (expected 0, got 1)` → `ACL GATE: FAIL`, **exit 1**.
* Real-world failure evidence: run against the **pre-fix** database the same gate logic
  reported 4 anon-executable routines and 32 app-executable trigger functions, i.e. the
  gate genuinely detects prohibited grants; after the cycle-1 revoke migration it
  reports **PASS, exit 0**.

## 9. Two-cycle post-commit evidence

| Check | Cycle 1 (13:28:28Z / 13:29:32Z / 13:30:07Z) | Cycle 2 (13:31:22Z, after canary migration) |
|---|---|---|
| `place_order` acl | `{postgres=X/postgres}` | `{postgres=X/postgres}` |
| anon-executable routines | 0 | 0 |
| trigger functions executable by app roles | 0 | 0 |
| unapproved app-executable routines | 0 | 0 |
| protected-table privileges (4 roles × 7 privs × 11 tables) | 0 | 0 |
| gate role denied read on protected tables | 0 violations | 0 violations |
| canary objects remaining (`zz_m1b0b%`) | — | 0 |
| Gate exit code | 0 | 0 |

## 10. Regression results

| Check | Result |
|---|---|
| `admin_list_merchant_stores` / `admin_list_borvat_direct_accounts` / `admin_list_borvat_direct_draft_listings` EXECUTE for `authenticated` | PASS (`t`) |
| `create_borvat_direct_account`, `create_borvat_direct_draft_listing`, `has_role` EXECUTE | PASS (`t`) |
| Same RPCs for `anon` | PASS (`f`) |
| Seller read path (`merchant_stores`, `channel_listings`, `channel_accounts` SELECT for `authenticated`) | PASS (`t`) |
| `merchant_stores` readable by `anon` | PASS (`f`) |
| `user_roles` direct access for app roles | PASS (`f`) |
| Cross-tenant isolation (RLS policies, definer role checks) | PASS — no policy or function body changed except `place_order` |
| Table privilege drift on protected tables | 0 |
| Sequence privileges | 1 sequence exists in `public` (`channel_api_audit_id_seq`); it retains its historical Phase-4 `anon`/`authenticated`/`service_role` `rwU` grants — unchanged by this stage, recorded as **R-T22** (see §13) |
| Tax reference counts | 4 / 9 / 5 (asserted fail-closed in both migrations) |
| Shipping foundation rows | 0 / 0 / 0 / 0 (asserted fail-closed) |
| Bol Live | Off |
| Stripe Live | Off |

## 11. Row / object delta

* Rows created / updated / deleted: **0**.
* Business schema change: **none** — no shipping route, rate, quote, tax, pricing, publication, storefront or checkout object.
* Permanent object delta: **none** — the only object created (`zz_m1b0b_acl_canary()`) was dropped in the same migration; 0 objects matching `zz_m1b0b%` remain.
* Function definition change: `public.place_order(uuid, integer, jsonb)` body replaced by a fail-closed `RAISE EXCEPTION` (deliberate security neutralisation).
* New repository artefacts: `scripts/phase5-acl-gate/check-critical-acl.sh`, `scripts/phase5-acl-gate/approved-routines.json`, this report.

## 12. Test matrix (28 required assertions)

| # | Assertion | Result |
|---|---|---|
| 1 | Source of re-grant identified | PASS (A: blanket sandbox provisioning; B: NULL ACL = PUBLIC EXECUTE) |
| 2 | Timing of re-grant identified | PASS (out of band, between deployments; never inside our transaction) |
| 3 | `place_order` signature inventory complete | PASS (1 signature, no overloads) |
| 4 | All overload privileges false | PASS |
| 5 | No-op / normalisation-only migration does not re-grant | PASS (cycle 2) |
| 6 | Canary migration does not re-grant to app roles after revoke | PASS |
| 7 | Test harness does not re-grant | PASS (gate is read-only; no GRANT in repo) |
| 8 | Harness deletion does not re-grant | PASS (no DB object created by the harness) |
| 9 | Post-commit delayed check | PASS (three delayed observations, two cycles) |
| 10 | PUBLIC EXECUTE false | PASS |
| 11 | anon EXECUTE false | PASS |
| 12 | authenticated EXECUTE false | PASS |
| 13 | service_role EXECUTE false | PASS |
| 14 | sandbox_exec EXECUTE false | PASS |
| 15 | Trigger functions non-executable by app roles | PASS (32 revoked) |
| 16 | Guard functions non-executable | PASS |
| 17 | Approved admin RPC still works | PASS |
| 18 | Seller read path still works | PASS |
| 19 | Cross-tenant isolation intact | PASS |
| 20 | No table privilege drift | PASS |
| 21 | No sequence privilege drift introduced | PASS (state unchanged; pre-existing grants on the single sequence recorded as R-T22) |
| 22 | No row mutations | PASS (0) |
| 23 | No business schema changes | PASS |
| 24 | Tax counts remain 4/9/5 | PASS |
| 25 | Shipping foundation rows 0/0/0/0 | PASS |
| 26 | Bol Live off / Stripe Live off | PASS |
| 27 | Gate fails deliberately on a prohibited grant | PASS (simulated + real pre-fix violations) |
| 28 | Gate passes after revoke; all canary/helper objects removed | PASS |

## 13. R-T20 disposition

Closure conditions:

1. **Root cause identified** — ✔ (A + B, with catalog and canary evidence).
2. **Re-grant stopped or governed by a proven mandatory gate** — ✔ for application roles: root cause B is removed by explicit revokes, and the mandatory normalisation section + post-deployment gate govern root cause A. The `place_order` risk is additionally removed at the code level by body neutralisation.
3. **Two independent post-commit cycles without re-grant** — ✔.
4. **Failure path actually tested** — ✔ (exit 1 simulated and real).

**R-T20 CLOSED — CRITICAL FUNCTION ACL DRIFT IS PREVENTED BY ROOT-CAUSE FIX AND POST-DEPLOYMENT GATE.**

New residual **R-T21 — SANDBOX TOOLING ROLE RECEIVES BLANKET `SELECT`/`INSERT`/`EXECUTE` IN `public` OUT OF BAND.** The platform re-issues blanket grants to `sandbox_exec` on existing objects; this cannot be disabled from inside the database by the migration role. Currently 75 non-protected routines still carry `sandbox_exec=X`. Exposure is limited: `sandbox_exec` is a tooling role, is **not** a PostgREST switch target (`authenticator` may only become `anon`/`authenticated`/`service_role`), and the protected tables plus `place_order` and all guard functions are explicitly revoked and gated after every deployment. Compensating controls (mandatory normalisation section + gate) are permanent.

Additional residual **R-T22 — HISTORICAL SEQUENCE GRANTS.** The only sequence in `public`, `channel_api_audit_id_seq`, still carries `anon=rwU`, `authenticated=rwU`, `service_role=rwU` from Phase 4. It was left untouched because revoking it is outside this stage's authorised scope and could regress the channel audit write path; it must be reviewed in a dedicated ACL stage before the storefront/checkout reactivation.

## 14. Rollback / forward-fix

* No rollback by re-granting. Restoring `EXECUTE` on `place_order` to any role, or restoring its original body, remains forbidden (BOR-DEC-021, reaffirmed here).
* Reverting the anon/trigger revokes is not permitted; if a legitimate caller is discovered, grant the *specific* privilege to the *specific* role on the *specific* object in a dedicated migration, add it to the allowlist, and document the caller and authorization contract.
* Canary rollback: not needed (already dropped, zero rows).

**Final verdict: M1B-0B PASS WITH RESIDUAL RISKS.**
Blocked pending separate Owner authorization: M1C-1C automatic rate cards, M1C-1D delivery promise profiles, M1C-1E manual quotes, M1C-1F masked communication, M1C-1G shipping UI, tax approval/activation, seller pricing, publication transitions, public storefront, checkout reactivation, Bol Live, Stripe Live.
