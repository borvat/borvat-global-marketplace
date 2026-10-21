# M1A #2D-1A — Platform Admin Role Governance Hardening

**Sprint:** Phase 5 / M1A #2D-1A
**Scope:** `public.user_roles` guard + audit + GRANT hardening only.
**Status:** APPLIED
**Migration:** `supabase/migrations/20260725214423_f150c58a-ae77-4a82-9fd1-73d7b3f69485.sql`
**SHA-256:** `00d39dc7b68caaada7bc427fb6aade3feabeff6c118f59084923a450b1bbf331`

---

## 1. `user_roles` schema (unchanged by this sprint)

| Column     | Type                     | Notes                                        |
|------------|--------------------------|----------------------------------------------|
| `id`       | uuid PK                  | `gen_random_uuid()`                          |
| `user_id`  | uuid NOT NULL            | FK → `auth.users(id)` ON DELETE CASCADE      |
| `role`     | `public.app_role`        | enum: `buyer`, `seller`, `admin`             |
| `created_at` | timestamptz NOT NULL   | `now()`                                      |
| UNIQUE     | (`user_id`, `role`)      |                                              |

**Current role population (production):** `buyer=186`, `seller=0`, `admin=0`.

**Existing RLS policies (unchanged):**
- `users can become seller` — FOR INSERT WITH CHECK `auth.uid()=user_id AND role='seller'`.
- `users read own roles` — FOR SELECT USING `auth.uid()=user_id`.

No policy permits INSERT of `admin`, and there are no UPDATE or DELETE policies at all — direct DML from `authenticated` is impossible even before this sprint. This sprint closes the remaining latent risks: sandbox tooling paths, trigger completeness, immutability, last-admin protection, and audit.

---

## 2. Guard function inventory (pre-migration)

### 2.1 `public.prevent_admin_self_grant()`  — RETIRED

- Return type: `trigger`; language plpgsql; not SECURITY DEFINER; `search_path='public'`.
- Fired on `BEFORE INSERT OR UPDATE ON public.user_roles` via `trg_prevent_admin_self_grant`.
- Logic (verbatim): raised `only admins can grant admin role` when `NEW.role='admin'` and the caller was not already admin.
- **Gaps identified:** did not cover DELETE, did not enforce `user_id` immutability, did not prevent an admin from self-granting (once one exists), did not enforce last-admin protection, and did not audit.

### 2.2 `public._company_member_roles_guard_owner_role()` — NOT WIRED (correct)

- Return type: `trigger`; SECURITY DEFINER; `search_path=''`.
- Reads `OLD.role_id` and `OLD.member_id`, then joins `system_company_roles`, `company_members`, `companies`.
- **Table it belongs to:** `public.company_member_roles` (tenant-scoped roles).
- **TG_OP assumption:** designed for DELETE (returns OLD).
- **Verdict:** must NOT be attached to `public.user_roles`. Confusing it with global platform admin would be an **architecture blocker**. This sprint verifies (T10) that it is not attached to `user_roles`.

### 2.3 `public.has_role(_user_id uuid, _role app_role)` — unchanged

- SECURITY DEFINER, STABLE, `search_path=''`.
- Blocks cross-user probing from `authenticated` (raises `42501` if `_user_id ≠ auth.uid()`), otherwise reads from `public.user_roles`. Used inside the new guard indirectly via a direct `EXISTS` query (the guard queries `user_roles` itself, not `has_role`, to avoid the anti-probing check for its own decision).

---

## 3. Migration objects (post-migration)

### 3.1 Functions

| Function | Language | Security | search_path | Owner |
|---|---|---|---|---|
| `public.guard_user_roles_mutation()` | plpgsql | INVOKER | `''` | postgres |
| `public.audit_user_roles_change()` | plpgsql | DEFINER | `''` | postgres |

`prevent_admin_self_grant()` **dropped**.

### 3.2 Triggers on `public.user_roles`

| Trigger | Timing | Events | Function |
|---|---|---|---|
| `trg_guard_user_roles` | BEFORE | INSERT, UPDATE, DELETE | `guard_user_roles_mutation()` |
| `trg_audit_user_roles` | AFTER  | INSERT, UPDATE, DELETE | `audit_user_roles_change()` |

`trg_prevent_admin_self_grant` **dropped**.

### 3.3 Guard decision matrix

| Op     | Condition                                              | Result |
|--------|--------------------------------------------------------|--------|
| INSERT | `NEW.role='admin'` AND caller is not admin              | `42501` blocked |
| INSERT | `NEW.role='admin'` AND caller IS admin AND `caller=NEW.user_id` | `42501` blocked (no self-grant) |
| INSERT | `NEW.role='admin'` AND caller IS admin AND `caller≠NEW.user_id` | allowed |
| INSERT | `NEW.role IN ('buyer','seller')`                        | trigger allows (RLS policies still apply) |
| UPDATE | `NEW.user_id ≠ OLD.user_id`                             | `42501` blocked (immutable) |
| UPDATE | role change involving `admin` AND caller not admin       | `42501` blocked |
| UPDATE | role change involving `admin` AND `caller=OLD.user_id`   | `42501` blocked |
| UPDATE | demote from `admin` AND current admin count ≤ 1          | `42501` blocked (last-admin) |
| DELETE | `OLD.role='admin'` AND caller not admin                  | `42501` blocked |
| DELETE | `OLD.role='admin'` AND `caller=OLD.user_id`              | `42501` blocked |
| DELETE | `OLD.role='admin'` AND current admin count ≤ 1           | `42501` blocked |
| DELETE | `OLD.role IN ('buyer','seller')`                         | trigger allows |

The guard reads `auth.uid()` and `public.user_roles` directly with fully-qualified names under empty `search_path`. It is **not** SECURITY DEFINER, so it evaluates in the caller's session context (correct — we want the caller's identity, not the owner's).

---

## 4. Audit design

`trg_audit_user_roles` writes one row to `public.agent_audit_log` per successful mutation:

- `tool_name = 'user_roles.mutation'`
- `status   = 'success'`
- `user_id  = auth.uid()` (may be NULL for postgres/service_role paths)
- `role_at_time = current_setting('role', true)` (session role name — `authenticated` / `sandbox_exec` / etc.)
- `input_summary = jsonb { op, target_user_id, old_role, new_role, source }`

**Not written:** email, password, tokens, JWT payload, IP, customer data. Only role names and user UUIDs — the same UUIDs already visible in `user_roles`.

Function is SECURITY DEFINER (postgres-owned) so it can insert regardless of the caller's grants on `agent_audit_log`.

### 4.1 Explicit limitations recorded

- **R-D2 — Denied global-role changes may appear only in infrastructure logs.** The audit trigger fires AFTER a successful row change; a rejected attempt raises inside the BEFORE guard, which aborts the entire transaction, so any audit INSERT rolls back with it. This is the same limitation as R-5 (BOR-DEC-039) and is accepted here for the same reason. Denied attempts should be searched in Postgres/error logs, not `agent_audit_log`. A separate autonomous-audit path is out of scope for this sprint.
- **R-D5 — Runtime audit row shape verified by trigger code only.** With zero platform admins, no path in the sandbox can produce a successful INSERT/UPDATE/DELETE against `user_roles` that reaches the audit trigger. The audit function is verified by static definition (fields, absence of PII, SECURITY DEFINER, search_path=''). First live audit row will be produced by the first legitimate mutation under M1A #2D-1B.

---

## 5. Last-admin protection

Enforced by the guard against three vectors:

1. **Self-demote of an admin** — blocked earlier by the self-modify guard (never reaches the last-admin count check).
2. **Cross-admin DELETE of the sole remaining admin** — blocked by `count(admin) ≤ 1` on DELETE.
3. **Cross-admin UPDATE that demotes the sole remaining admin** — blocked by `count(admin) ≤ 1` on UPDATE.

Currently `admin_count=0`, so the guard also correctly rejects all admin-role writes without any bootstrap back door. Verified structurally (T1); execution paths involving a live admin will be exercised in #2D-1B.

---

## 6. GRANT matrix

### Before

| Role            | user_roles                  | audit_user_roles_change | guard_user_roles_mutation |
|-----------------|-----------------------------|-------------------------|---------------------------|
| PUBLIC          | (none)                      | n/a (function did not exist) | n/a |
| anon            | (none)                      | n/a                      | n/a |
| authenticated   | (none)                      | n/a                      | n/a |
| service_role    | (none)                      | n/a                      | n/a |
| sandbox_exec    | SELECT, INSERT              | n/a                      | n/a |
| postgres        | OWNER (implicit ALL)        | n/a                      | n/a |

Legacy `prevent_admin_self_grant()` had the PostgreSQL default `EXECUTE TO PUBLIC` (irrelevant, since it can only be invoked as a trigger).

### After

| Role            | user_roles                  | audit_user_roles_change      | guard_user_roles_mutation |
|-----------------|-----------------------------|------------------------------|---------------------------|
| PUBLIC          | (none) — `REVOKE ALL`       | EXECUTE (default; see R-D6)  | EXECUTE (default; see R-D6) |
| anon            | (none) — `REVOKE ALL`       | EXECUTE (default; see R-D6)  | EXECUTE (default; see R-D6) |
| authenticated   | (none) — `REVOKE ALL`       | EXECUTE (default; see R-D6)  | EXECUTE (default; see R-D6) |
| service_role    | (none) — `REVOKE ALL`       | EXECUTE (default; see R-D6)  | EXECUTE (default; see R-D6) |
| sandbox_exec    | SELECT, INSERT (unchanged)  | EXECUTE (default; see R-D6)  | EXECUTE (default; see R-D6) |
| postgres        | OWNER                       | OWNER                        | OWNER |

**R-D6 — Default `EXECUTE` grants remain on the trigger functions.**
Two attempts to `REVOKE EXECUTE ... FROM PUBLIC` failed under `sandbox_exec` because it is not the function owner (postgres). The Supabase security linter flags these as "Public Can Execute SECURITY DEFINER Function" warnings.

Direct exploitability assessment: both functions are trigger functions taking zero arguments and returning `trigger`. When invoked as a normal SQL function outside a trigger, `TG_OP` is NULL, `NEW`/`OLD` are unassigned, and the function raises. There is no user-controllable input surface and no privilege escalation path. The residual risk is that a future refactor could expose exploitable behaviour; the correct fix is a follow-up owner-run migration `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated`. Recorded here; no migration filed under this sprint's scope.

**sandbox_exec assessment.** Retaining `SELECT` on `user_roles` is required by Lovable tooling to read the role catalogue (for example when the tool ecosystem inspects current roles). `INSERT` is retained but is effectively neutralised because (a) the guard rejects any admin INSERT under `auth.uid()=NULL`, and (b) the RLS policies do not admit a seller INSERT from a null `auth.uid()` either. Tests T2, T4, T6–T9 verify sandbox_exec cannot bypass the guard, disable it, drop it, UPDATE, or DELETE. Widening sandbox_exec is explicitly forbidden by this sprint's scope.

---

## 7. Test results (executed BEGIN / … / ROLLBACK)

Executed via `/tmp/tests_2d1a.sql` under `sandbox_exec`; all 16 executable checks **PASS**. Post-rollback state confirmed unchanged: `admins=0`, both new triggers present, GRANT matrix unchanged.

| # | Test | Result |
|---|---|---|
| T1 | Pre-condition: 0 platform admins | PASS |
| T2 | No `auth.uid` → INSERT admin blocked (`42501`) | PASS |
| T3 | Authenticated self-grant admin blocked (`42501`) | PASS |
| T4 | Authenticated cross-grant admin blocked (`42501`) | PASS |
| T5 | Invalid role value rejected by enum | PASS |
| T6 | `sandbox_exec` cannot disable the guard trigger — no bootstrap back door | PASS |
| T7 | `sandbox_exec` cannot DROP the guard function | PASS |
| T8 | `sandbox_exec` cannot DELETE from `user_roles` | PASS |
| T9 | `sandbox_exec` cannot UPDATE `user_roles` | PASS |
| T10 | Tenant guard `_company_member_roles_guard_owner_role` NOT wired to `user_roles` | PASS |
| T11 | `trg_guard_user_roles` and `trg_audit_user_roles` both present | PASS |
| T12 | Legacy `prevent_admin_self_grant` function removed | PASS |
| T13 | `anon`, `authenticated`, `service_role` have zero grants on `user_roles` | PASS |
| T14 | `sandbox_exec` retains exactly SELECT + INSERT, no UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER | PASS |
| T15 | Audit function is SECURITY DEFINER with `search_path` set | PASS |
| T16 | P5-HF-001 preserved: `place_order` has no grants to anon/authenticated/service_role | PASS |

### Tests verified by static analysis (not runtime-executable in this sprint)

Because production has zero platform admins **and** `sandbox_exec` cannot disable the guard, drop it, or otherwise plant an admin row, no code path in this session can reach a state where an admin exists — which is itself the strongest possible verification of the sprint's core property.

The following scenarios are consequently verified by inspecting `guard_user_roles_mutation()` against the decision matrix in §3.3, and will be re-run under M1A #2D-1B once a legitimate admin exists:

- S1 — Admin self-grant blocked (matrix row 2).
- S2 — Admin cross-grant of another admin allowed (matrix row 3).
- S3 — `user_id` immutable on UPDATE (matrix row 5).
- S4 — Admin cannot demote self (matrix row 7).
- S5 — Admin cannot delete self admin row (matrix row 10).
- S6 — Admin can demote/delete another admin when ≥ 2 exist (matrix rows 6, 9).
- S7 — Last-admin demotion blocked (matrix row 8).
- S8 — Last-admin deletion by any actor blocked (matrix row 11).
- S9 — Audit row written after each successful mutation (§4) with `op`, `target_user_id`, `old_role`, `new_role`, `source`, no PII.

---

## 8. Object delta

**Added:**
- `public.guard_user_roles_mutation()` (function)
- `public.audit_user_roles_change()` (function)
- `trg_guard_user_roles` (trigger on `public.user_roles`)
- `trg_audit_user_roles` (trigger on `public.user_roles`)
- `COMMENT ON TABLE public.user_roles`

**Removed:**
- `public.prevent_admin_self_grant()` (function)
- `trg_prevent_admin_self_grant` (trigger)

**GRANT changes on `public.user_roles`:**
- Explicit `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role`. `sandbox_exec` unchanged.

**No changes to:** RLS policies, other tables, other functions, tenant-role machinery, `has_role`, `agent_audit_log` schema/policies, Bol/Stripe kill-switches, `place_order`, seller UI, storefront, publication state.

---

## 9. Rollback / forward-fix

**Rollback path (owner-only, if ever required):**
```sql
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
DROP TRIGGER IF EXISTS trg_guard_user_roles ON public.user_roles;
DROP FUNCTION IF EXISTS public.audit_user_roles_change();
DROP FUNCTION IF EXISTS public.guard_user_roles_mutation();
CREATE OR REPLACE FUNCTION public.prevent_admin_self_grant() ... ;  -- restore legacy body
CREATE TRIGGER trg_prevent_admin_self_grant
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_self_grant();
-- GRANT restoration is a no-op (previous state had no additional grants).
```

**Forward-fix (preferred over rollback):**
- To close R-D6, an owner-executed migration should `REVOKE EXECUTE ON FUNCTION public.guard_user_roles_mutation(), public.audit_user_roles_change() FROM PUBLIC, anon, authenticated`.
- To close R-D2, wire a Postgres `log_min_messages`-based or extension-based autonomous audit for guard `RAISE EXCEPTION` events. Deferred outside this sprint.

---

## 10. Residual risks

| ID | Statement | Status |
|----|-----------|--------|
| R-D1 | (from #2D precheck) Missing guards on `user_roles` **CLOSED** by this sprint. | closed |
| R-D2 | Denied global-role changes may appear only in infrastructure logs, not in `agent_audit_log`, because guard rollbacks discard AFTER-trigger writes. Same class as R-5 / BOR-DEC-039. | accepted |
| R-D3 | (from #2D precheck) Bootstrap of the first platform admin remains undefined. This sprint intentionally leaves it unaddressed. | open — to be resolved by M1A #2D-1B |
| R-D4 | `sandbox_exec` retains `SELECT + INSERT` on `user_roles`. Attempts to write are neutralised by the guard, and RLS blocks non-admin roles under `auth.uid()=NULL`, but the surface exists. | accepted |
| R-D5 | Runtime audit row shape verified only by trigger definition, not by a live successful mutation, because no admin exists yet. First live audit row will be produced under M1A #2D-1B. | accepted |
| R-D6 | Default `EXECUTE` grants on the two new trigger functions remain to `PUBLIC`/`anon`/`authenticated`/`service_role`; linter flags 0028/0029 warnings. Functions are trigger-only and take zero arguments; direct call raises immediately with `TG_OP` null. Owner-run `REVOKE EXECUTE` recommended as forward-fix. | accepted |

---

## 11. Non-scope confirmations

- **No first platform admin was created.** Post-migration admin count = 0.
- **No admin read RPC was created.** Nothing was added to fulfil the #2D precheck's read path.
- **No admin UI was created or modified.**
- **No RLS policies on merchant tables were widened.**
- **No `service_role` use in the browser was introduced.**
- **No hardcoded admin user, email, or company reference.**
- **No bootstrap RPC, one-time token, allowlist, or SQL script for the first admin.**
- **Seller UI unchanged.** No storefront/publication changes. Bol Live and Stripe Live remain off.
- **P5-HF-001** (`place_order` revoked) verified intact (T16).

---

## 12. Final verdict

**M1A #2D-1A PASS WITH ACCEPTED RESIDUAL RISKS.**

Accepted residual risks: **R-D2**, **R-D4**, **R-D5**, **R-D6**. Open item **R-D3** (first-admin bootstrap) is deferred by design to M1A #2D-1B under a separate Owner authorisation.

Next authorised step (subject to Owner approval): **M1A #2D-1B — First Platform Admin Bootstrap Design (precheck only).** No admin read RPCs and no admin UI are to be built until #2D-1B is decided and executed.

**Halt here.**
