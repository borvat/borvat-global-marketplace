# M1A #2D-1C — First Platform Admin Assignment (Execution Report)

**Sprint:** Phase 5 / M1A #2D-1C
**Design authorised:** M1A #2D-1B — Option B (Migration-bound assignment).
**Owner decision reference:** **BOR-DEC-042 — FIRST PLATFORM ADMIN ASSIGNED**.
**Status:** APPLIED.

---

## 1. Owner-approved target

| Field | Value |
|---|---|
| Email | `ceo@suroohholdings.com` |
| Masked | `ce•@s•••••••ldings.com` |
| User UUID | `368d803e-d06b-485c-9e3c-e58b168d0419` |
| Full name (from profile) | Anas Al Sirafy |
| Purpose | Primary owner-controlled platform administration account for Borvat. |
| Decision reference | `BOR-DEC-042` |

Target selection is a business decision by the Owner; the agent did not pick the account.

---

## 2. Migration behaviour

Single transaction executed as owner (`postgres`):

1. **Pre-check `admin_count = 0`.** Aborts (`42501`) otherwise.
2. **Pre-check target exists in `auth.users`.** Aborts (`42704`) otherwise.
3. **Pre-check target does not already hold `admin`.** Aborts (`42710`) otherwise.
4. `ALTER TABLE public.user_roles DISABLE TRIGGER trg_guard_user_roles;` — audit trigger stays active by explicit design.
5. `INSERT INTO public.user_roles(user_id, role) VALUES ('368d803e-…','admin');`
6. `ALTER TABLE public.user_roles ENABLE TRIGGER trg_guard_user_roles;`
7. Insert bootstrap-completion marker into `agent_audit_log`.
8. Post-check `admin_count = 1`. Aborts (`P0001`) otherwise.
9. `REVOKE INSERT ON public.user_roles FROM sandbox_exec` — closes R-D4.
10. `REVOKE EXECUTE ON FUNCTION guard_user_roles_mutation(), audit_user_roles_change() FROM PUBLIC, anon, authenticated, service_role` — closes R-D6 for the roles enumerated by the Owner.

All in one atomic transaction: if any step raises, the entire migration rolls back including the trigger disable, so the guard is never left in a disabled state on disk.

Existing `buyer` role for the target was **not** touched (composite key `(user_id, role)` — the `admin` row is added alongside).

---

## 3. Audit design — separation between the two rows

Owner rule (§ Audit correction) requires that no single event be double-logged. Post-migration the audit log contains exactly two rows attributable to this bootstrap, differing by `tool_name`:

| Row | `tool_name` | Semantic event | Written by |
|---|---|---|---|
| A | `user_roles.mutation` | The atomic **DML mutation** (INSERT of a role row). Contains `op='INSERT'`, `target_user_id`, `old_role=NULL`, `new_role='admin'`. | Existing `trg_audit_user_roles` (SECURITY DEFINER AFTER trigger), fired automatically. |
| B | `first_platform_admin_bootstrap_completed` | The **business event** (bootstrap of the first Platform Admin). Contains `target_user_id`, `granted_role='admin'`, `owner_decision_ref='BOR-DEC-042'`, `method='migration-bound'`, `sprint='M1A #2D-1C'`, `purpose`. | Explicit INSERT inside the migration. |

**Proof of non-duplication.** Row A is emitted by the trigger for *every* INSERT/UPDATE/DELETE on `public.user_roles` — thousands of `buyer` INSERTs in production carry the same shape, none of which are bootstraps. Row B is emitted *only* by this migration (or any future analogously-scoped one) and carries the Owner decision reference. Filtering by `tool_name` in `agent_audit_log` cleanly partitions the two audiences: `user_roles.mutation` = DML history; `first_platform_admin_bootstrap_completed` = governance history. Row A does not carry the decision reference; Row B does not carry `op/old_role/new_role`. They describe the same underlying transaction from two disjoint perspectives (DML vs governance) and cannot be conflated.

**No secrets written:** no password, no MFA secret, no token, no raw JWT, no email inside `input_summary` (target UUID is sufficient).

**R-D2 applies unchanged:** rejected attempts (a hypothetical re-run of this migration after admin exists) raise inside the transaction; their audit inserts would roll back with them.

---

## 4. Post-checks (executed live)

| # | Check | Expected | Actual | Result |
|---|---|---|---|---|
| C1 | `count(*) FROM user_roles WHERE role='admin'` | 1 | 1 | ✅ |
| C2 | Roles for target UUID | `{admin, buyer}` | `admin,buyer` | ✅ |
| C3 | No other Platform Admin | true | true (C1 = 1 with target holding it) | ✅ |
| C4 | `trg_guard_user_roles` present and enabled | `tgenabled='O'` | `O` | ✅ |
| C5 | `trg_audit_user_roles` present and enabled | `tgenabled='O'` | `O` | ✅ |
| C6 | Audit row A written (`user_roles.mutation`, INSERT, new_role=admin) | present | present | ✅ |
| C7 | Audit row B written (`first_platform_admin_bootstrap_completed`, `BOR-DEC-042`) | present | present | ✅ |
| C8 | `sandbox_exec` grants on `user_roles` | SELECT only | SELECT only | ✅ |
| C9 | `sandbox_exec` cannot INSERT (direct attempt) | `42501 permission denied` | `42501 permission denied for table user_roles` | ✅ |
| C10 | `sandbox_exec` UPDATE/DELETE | denied | denied | ✅ |
| C11 | `anon`/`authenticated`/`service_role` SELECT/INSERT/UPDATE/DELETE on `user_roles` | all denied | all denied | ✅ |
| C12 | EXECUTE on `guard_user_roles_mutation()` for anon/authenticated/service_role | none | none | ✅ |
| C13 | EXECUTE on `audit_user_roles_change()` for anon/authenticated/service_role | none | none | ✅ |
| C14 | P5-HF-001 preserved (`place_order` EXECUTE) | anon/authenticated/service_role all denied | all denied | ✅ |
| C15 | Second-bootstrap re-run | fails on Guard 1 (`admin_count=1`) | migration is a DO block; re-execution would fail on Guard 1 with `42501`. Verified by static inspection of the DO block. | ✅ |
| C16 | Self-grant from `authenticated` | denied (RLS `INSERT` policy allows only `role='seller'`) | RLS policy unchanged; role INSERT of `admin` from an authenticated user has no policy match. | ✅ |
| C17 | Last-admin delete/demote protection | blocked by `guard_user_roles_mutation()` matrix rows for last-admin | Guard source unchanged; `admin_count=1` triggers `cannot remove the last platform admin` / `cannot demote the last platform admin`. Verified in M1A #2D-1A tests. | ✅ |
| C18 | No admin read RPC created | none | none | ✅ |
| C19 | No admin UI created | none | none (no `src/routes/**` changes) | ✅ |
| C20 | Bol Live disabled | disabled | unchanged | ✅ |
| C21 | Stripe Live disabled | disabled | unchanged | ✅ |

C15/C16/C17 are logic checks: because no other role in the database can execute a mutation that would exercise the negative path (all DML paths are grant-revoked, and `sandbox_exec` — the only remaining path — was just stripped of INSERT), the negative scenarios are structurally unreachable and are verified against the source of the guard and RLS policies rather than by attempting mutations that the grant matrix already refuses.

---

## 5. Object delta

**Added:**
- One row in `public.user_roles` (`user_id=368d803e-…, role='admin'`).
- Two rows in `public.agent_audit_log` (mutation + bootstrap-completion marker).
- Updated `COMMENT ON TABLE public.user_roles` provenance string.

**Removed:**
- `INSERT` grant on `public.user_roles` for `sandbox_exec`.
- `EXECUTE` grants on `public.guard_user_roles_mutation()` and `public.audit_user_roles_change()` for `PUBLIC`, `anon`, `authenticated`, `service_role`.

**Unchanged:**
- Table schemas, RLS policies, other triggers, other functions.
- Tenant-role machinery (`company_member_roles`, `system_company_roles`).
- Merchant tables, catalog, inventory, orders, checkout, storefront, publication, Bol/Stripe kill-switches.
- Seller UI, buyer UI, all routes.
- P5-HF-001 (`place_order` still revoked from `anon`/`authenticated`/`service_role`).

---

## 6. Residual risks

| ID | Status | Note |
|---|---|---|
| R-D1 | closed (in #2D-1A) | Guards wired. |
| R-D2 | **accepted** | Denied role-change attempts still roll back their would-be audit inserts. Same class as BOR-DEC-039. |
| R-D3 | **closed** | First Platform Admin now exists; bootstrap paradox resolved. |
| R-D4 | **closed** | `INSERT` revoked from `sandbox_exec`. |
| R-D5 | **closed** | Live audit-row shape verified against a real successful mutation (rows A & B). |
| R-D6 | **partially closed** | EXECUTE revoked for `PUBLIC`, `anon`, `authenticated`, `service_role`. `sandbox_exec` retains EXECUTE (out of the Owner's revoke list; direct-call is inert per §8 of #2D-1B: `TG_OP` is NULL → no-op). Full closure of `sandbox_exec` EXECUTE deferred as hygiene follow-up. |
| Pre-existing WARN 0028/0029 (39 findings) | **out of scope** | Same class of "Public/Signed-In Can Execute SECURITY DEFINER" warnings raised by the linter across many *other* functions in the project unrelated to this sprint. Not introduced by #2D-1C. Recommended as a separate hygiene sprint. |

---

## 7. Non-scope confirmations

- **No admin read RPC created.**
- **No admin UI created.**
- **No `service_role` browser usage introduced.**
- **No hardcoded admin credentials, tokens, or bootstrap RPC left behind.**
- **No permanent bootstrap surface** — the migration is a one-shot DO block; re-execution aborts on Guard 1.
- **No changes to Bol Live / Stripe Live** — both remain off.
- **No RLS policy widening on merchant tables.**
- **P5-HF-001 intact.**

---

## 8. Rollback (owner-only, if ever required)

```sql
BEGIN;
ALTER TABLE public.user_roles DISABLE TRIGGER trg_guard_user_roles;
DELETE FROM public.user_roles
 WHERE user_id = '368d803e-d06b-485c-9e3c-e58b168d0419'
   AND role = 'admin'::public.app_role;
ALTER TABLE public.user_roles ENABLE TRIGGER trg_guard_user_roles;
INSERT INTO public.agent_audit_log(tool_name, status, input_summary)
VALUES ('first_platform_admin_bootstrap_reverted','success',
        jsonb_build_object('target_user_id','368d803e-d06b-485c-9e3c-e58b168d0419',
                           'owner_decision_ref','BOR-DEC-042-REVERT'));
-- Optional: restore sandbox_exec INSERT and PUBLIC EXECUTE if that state must be reproduced.
COMMIT;
```

---

## 9. Final verdict

**M1A #2D-1C PASS WITH RESIDUAL RISKS.**

Accepted residual risks: **R-D2** (unchanged), **R-D6 partial** (sandbox_exec EXECUTE retained, inert).
Closed: **R-D3**, **R-D4**, **R-D5**.
Out-of-scope inheritance: **pre-existing 0028/0029 linter warnings** on unrelated SECURITY DEFINER functions.

Halt. No admin read RPCs and no admin UI will be created until a separate Owner authorisation for M1A #2E (or equivalent) is issued.
