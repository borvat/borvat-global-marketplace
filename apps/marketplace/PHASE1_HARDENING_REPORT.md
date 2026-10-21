# Phase 1 — Final Hardening Verification Report

Baseline: `ARCHITECTURE_PROPOSAL.md` §21 (Revision 3.1). Phase 1 scope only.
This report supersedes the previous Phase 1 verification report.

---

## Migration inventory (exact filenames on disk)

| # | Filename | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20260723194859_c42c8642-3f61-477a-bf8a-8b06581de0a4.sql` | Phase 1 baseline schema — companies, members, roles, permissions, helpers, triggers, transfer RPC, RLS, seller backfill |
| 2 | `supabase/migrations/20260723195605_b9bc6b44-01b1-43b7-bcfb-252d2e695154.sql` | `companies` SELECT policy: owners see own row (unblocks `insert().select()`) |
| 3 | `supabase/migrations/20260723200056_4379bc04-b394-4081-b083-198ee22c7120.sql` | `PUBLIC`/`anon` EXECUTE revocation on every `SECURITY DEFINER` function |
| 4 | `supabase/migrations/20260723201307_cac97cc5-42fc-46aa-a4b6-247da16af185.sql` (applied) | **This turn.** Column-priv ownership control; `search_path=''` for all `SECURITY DEFINER`; helper enumeration guard (`auth.role()` + `auth.uid()`) |

---

## 1. EXECUTED AND PASSED

### Tenancy + hardening suite — `bunx tsx scripts/phase1-tenancy-tests.ts`

**40 / 40 executed tests passed.**

| ID | Assertion | Result |
|---|---|---|
| T01 | Owner can create their own company | ✅ |
| T02 | Owner auto-added as active member (bootstrap trigger) | ✅ |
| T03 | Owner auto-granted `owner` role | ✅ |
| T04 | Cannot create a company owned by another user (RLS INSERT) | ✅ |
| T05 | Outsider cannot see another company (RLS SELECT) | ✅ |
| T06 | Member can read their own company | ✅ |
| T07 | Outsider cannot list members of another company | ✅ |
| T08 | Manager (no `members.manage`) cannot invite | ✅ |
| T09 | Viewer cannot invite | ✅ |
| T10 | Owner can invite | ✅ |
| T11 | Owner membership cannot be deleted | ✅ |
| T12 | Owner membership cannot be suspended/removed | ✅ |
| T13 | `owner` role cannot be revoked from current owner | ✅ |
| T14 | Direct `owner_user_id` UPDATE by owner is blocked | ✅ |
| T15 | Transfer to non-member rejected | ✅ |
| T16 | Non-owner cannot transfer | ✅ |
| T17 | Owner transfers ownership to active member | ✅ |
| T18 | `owner_user_id` updated to new owner | ✅ |
| T19 | `owner` role moved from old to new owner | ✅ |
| T20 | Previous owner loses transfer capability | ✅ |
| T21 | Previous owner remains an active member | ✅ |
| T22 | `permissions` catalog readable to anon | ✅ |
| T23 | Owner role includes `ownership.transfer` | ✅ |
| T24 | Admin role excludes `ownership.transfer` | ✅ |
| T25 | Helper reports `members.manage` for new owner | ✅ |
| T26 | Helper returns false for non-manager members | ✅ |
| T27 | Concurrent transfers serialize (exactly one succeeds) | ✅ wins=1 fails=1 |
| T28 | Seed counts: 5 roles, 19 permissions | ✅ |
| T29 | Non-owner cannot spoof `app.allow_owner_change` (RLS + column priv) | ✅ `permission denied for table companies` |
| T30 | Suspended member cannot access company data | ✅ |
| T31 | Removed member cannot access company data | ✅ |
| T32 | Invited-only member has no active-member access | ✅ |
| T33 | Transfer audit row written in the same transaction | ✅ |
| **T35** | **Current owner cannot spoof `app.allow_owner_change`** — column-level UPDATE privilege on `owner_user_id` blocks the write even with the GUC forced to `yes` | ✅ `permission denied for table companies` |
| **T36** | `is_company_member(_user_id ≠ auth.uid())` blocked from authenticated | ✅ `access denied` (SQLSTATE 42501) |
| **T37** | `is_company_owner(_user_id ≠ auth.uid())` blocked | ✅ |
| **T38** | `company_member_has_permission(_user_id ≠ auth.uid(), …)` blocked | ✅ |
| **T39** | `has_role(_user_id ≠ auth.uid(), …)` blocked | ✅ |
| **T40** | Helpers still return correct answers when `_user_id = auth.uid()` (regression) | ✅ |
| **T41** | `service_role` bypasses the enumeration guard (admin scripts unaffected) | ✅ |

### Regression suites
- `bunx tsx scripts/security-tests.ts` — **17 / 17 passed** (Bol credential isolation, audit-log append-only, role escalation blocks, agent_memory guards).
- `bunx tsx scripts/redaction-tests.ts` — **10 / 10 passed** (recursive secret redaction before truncation in MCP context summarizer).

### Column-privilege audit (`companies`)
```
    attname    | authenticated UPDATE | service_role UPDATE
---------------+----------------------+---------------------
 id            | f                    | t
 name          | t                    | t
 slug          | t                    | t
 owner_user_id | f                    | t          ← primary control
 created_at    | f                    | t
 updated_at    | f                    | t
```

### SECURITY DEFINER search_path audit (all 11 functions)
```
                 proname                 |      proconfig
-----------------------------------------+-------------------
 _companies_after_insert_bootstrap_owner | search_path=""
 _companies_before_update_owner_guard    | search_path=""
 _company_member_roles_guard_owner_role  | search_path=""
 _company_members_guard_owner_membership | search_path=""
 company_member_has_permission           | search_path=""
 decide_product_suggestion               | search_path=""
 handle_new_user                         | search_path=""
 has_role                                | search_path=""
 is_company_member                       | search_path=""
 is_company_owner                        | search_path=""
 transfer_company_ownership              | search_path=""
```

### Function-by-function EXECUTE grant audit

| Function | anon | authenticated | service_role | Notes |
|---|---|---|---|---|
| `_companies_after_insert_bootstrap_owner` | — | — | — | Trigger only. All user grants revoked. |
| `_companies_before_update_owner_guard` | — | — | — | Trigger only. |
| `_company_member_roles_guard_owner_role` | — | — | — | Trigger only. |
| `_company_members_guard_owner_membership` | — | — | — | Trigger only. |
| `handle_new_user` | — | — | — | Trigger only (auth.users). |
| `has_role(uuid, app_role)` | ✗ | ✓ | ✓ | Guarded: `_user_id = auth.uid()` for authenticated. |
| `is_company_member(uuid, uuid)` | ✗ | ✓ | ✓ | Guarded. Used by RLS policies. |
| `is_company_owner(uuid, uuid)` | ✗ | ✓ | ✓ | Guarded. Used by RLS policies. |
| `company_member_has_permission(uuid, uuid, text)` | ✗ | ✓ | ✓ | Guarded. Used by RLS policies. |
| `transfer_company_ownership(uuid, uuid)` | ✗ | ✓ | ✓ | RPC. Rechecks `_actor = current_owner`. |
| `decide_product_suggestion(uuid, boolean, text)` | ✗ | ✓ | ✓ | RPC. Rechecks `s.seller_id = auth.uid()`. |

Schemas in `search_path`: none (empty). Cross-schema privilege check: `CREATE` on `public` and `pg_catalog` denied to both `authenticated` and `anon` — verified in the current database. Every reference inside every `SECURITY DEFINER` body is schema-qualified (`public.*` / `auth.*`).

---

## 2. STRUCTURALLY VERIFIED (not executed)

### T34 — audit-write failure rolls back the entire transfer

**Not executed** in this environment. The sandbox database role (`sandbox_exec`) has no `CREATE ON SCHEMA public`, so the temporary `BEFORE INSERT` trigger required to force an `agent_audit_log` write failure cannot be installed. Structural verification against the deployed function source:

- `INSERT INTO public.agent_audit_log …` is present: **true**
- The `INSERT` precedes the final `RETURN jsonb_build_object(…)`: **true**
- The `PL/pgSQL` block has no `EXCEPTION WHEN` handler: **true**

Because there is no exception handler and PostgreSQL statements execute inside the RPC's implicit transaction, any failure of the audit `INSERT` propagates out and aborts the earlier `UPDATE public.companies …`, role `INSERT`, and role `DELETE`.

**Required action before final production sign-off:** re-run this test from a role with `CREATE ON SCHEMA public` (superuser / migration role) using the trigger-injection script embedded as comments in `scripts/phase1-tenancy-tests.ts` around T34.

---

## 3. NOT VERIFIED

### Clean-database migration replay
No fresh disposable database is available inside this sandbox to execute the full migration replay. The four Phase 1 migrations are file-named in strictly increasing timestamp order:
```
20260723194859_c42c8642-3f61-477a-bf8a-8b06581de0a4.sql
20260723195605_b9bc6b44-01b1-43b7-bcfb-252d2e695154.sql
20260723200056_4379bc04-b394-4081-b083-198ee22c7120.sql
20260723201307_cac97cc5-42fc-46aa-a4b6-247da16af185.sql
```
**Required action before final production sign-off:** run the following against a freshly provisioned Postgres/Supabase project and archive the output:
```bash
supabase db reset               # or: psql -v ON_ERROR_STOP=1 -f each migration in filename order
bunx tsx scripts/phase1-tenancy-tests.ts
bunx tsx scripts/security-tests.ts
bunx tsx scripts/redaction-tests.ts
psql -f scripts/phase1-backfill-preflight.sql
```
Expected post-replay invariants:
- Tables present: `companies`, `company_members`, `system_company_roles`, `permissions`, `role_permissions`, `company_member_roles`.
- Rows: `system_company_roles = 5`, `permissions = 19`, `role_permissions` = full owner set + subsets for admin/manager/operator/viewer.
- Triggers on `companies`, `company_members`, `company_member_roles` as listed in Migration 1 + Migration 4.
- Policies on all six tables as listed in Migration 1 + Migration 2.
- 40/40 tenancy tests, 17/17 security tests, 10/10 redaction tests pass.

### Backfill on real production seller population
The test database contains **zero** rows with `user_roles.role = 'seller'`, so the backfill DO block was a no-op. Production backfill remains **unverified against real seller data**.

---

## 4. PRODUCTION DEPLOYMENT GATES

Before the Phase 1 migrations are applied to production:

1. **Run `scripts/phase1-backfill-preflight.sql`** against production (read-only). Capture:
   - `sellers_needing_company` count → expected new companies.
   - `will_become_owner` list → expected owner rows.
   - Slug-collision preview → auto-suffixed slugs.
   - `sellers_already_with_company` → skipped-by-idempotence count.
   - `orphan_seller_roles` → data-integrity flag; must be `0` or triaged before deploy.
2. **Run T34 fault injection** from a role with `CREATE ON SCHEMA public` on either a staging clone or the freshly-replayed database (see §3).
3. **Execute clean-database migration replay** (§3). Archive the full output.
4. **Apply migrations** to production in a maintenance window.
5. **Run the post-deploy reconciliation query** in `scripts/phase1-backfill-preflight.sql` §6:
   ```sql
   SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'seller'
      AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_user_id = ur.user_id);
   ```
   Expected: **0 rows.**
6. **Rollback / remediation.** The backfill DO block is idempotent; re-running the migration is safe. To remove a specific backfilled company (if a slug or display name needs correction), see §7 in the preflight script for the guarded `DELETE`.

---

## 5. Ownership-change trust-boundary strategy (documented)

Primary control (authoritative): **column-level UPDATE privilege**.
```sql
REVOKE UPDATE ON public.companies FROM authenticated;
GRANT  UPDATE (name, slug) ON public.companies TO authenticated;
```
`owner_user_id` is *not* in the granted column list. PostgREST + the RLS UPDATE policy therefore never even reach the trigger for a direct `UPDATE … SET owner_user_id = …` from an authenticated session — the write is rejected at privilege check with `permission denied for table companies` (verified by T14, T29, T35).

Secondary control (defense in depth): the `_companies_before_update_owner_guard` trigger. It still raises `ownership can only be changed via transfer_company_ownership()` if `owner_user_id` is being changed and `app.allow_owner_change ≠ 'yes'`. The GUC is **not** the authorization gate; it is a belt-and-suspenders check that fires only from privileged paths (postgres/service_role, or the definer-owned RPC). Even if the GUC were spoofed by any means, the column privilege remains the hard stop.

Ownership can therefore only change via `public.transfer_company_ownership(...)`, which:
- is `SECURITY DEFINER` owned by the migration role (has UPDATE on `owner_user_id`);
- requires `_actor = current_owner` under `SELECT … FOR UPDATE` (serializes concurrent transfers, verified by T27);
- writes the audit row in the same transaction with no `EXCEPTION` handler (T33 + T34 structural).

Helper enumeration is prevented at function-body level: every 2-argument helper (`has_role`, `is_company_member`, `is_company_owner`, `company_member_has_permission`) raises `access denied` (SQLSTATE 42501) when `auth.role() = 'authenticated'` and `_user_id ≠ auth.uid()`. `service_role` bypasses this guard (verified by T41), and RLS policies — which always pass `auth.uid()` — remain functional (verified by T25, T26, T40 and every RLS-dependent test T05–T32).

---

## 6. Final summary

- Executed & passed: **40 tenancy + 17 security + 10 redaction = 67 tests.**
- Structurally verified (not executed): **1** — T34 audit rollback.
- Not verified: **2** — clean-database replay; production seller backfill.
- Production deployment gates: **6** listed above.

Phase 1 hardening is complete pending the three items above.
No Phase 2 schema or functionality was introduced.
