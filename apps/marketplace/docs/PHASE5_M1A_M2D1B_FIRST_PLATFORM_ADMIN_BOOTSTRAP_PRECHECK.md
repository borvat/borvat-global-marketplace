# M1A #2D-1B — First Platform Admin Bootstrap Design (Precheck)

**Sprint:** Phase 5 / M1A #2D-1A → #2D-1B
**Scope:** Design & analysis only. No migration, no RPC, no admin creation, no admin UI.
**Predecessor:** BOR-DEC-041 (M1A #2D-1A accepted & closed with residual risks R-D2, R-D4, R-D5, R-D6; R-D3 deferred to this precheck).
**Current state:** `admin_count = 0`; guard + audit triggers active on `public.user_roles`; DML revoked from `anon`/`authenticated`/`service_role`; `sandbox_exec` retains `SELECT + INSERT`.

---

## 1. Bootstrap paradox analysis

The paradox: the guard `guard_user_roles_mutation()` demands that the caller already be an admin before any INSERT of `role='admin'` is accepted, but no admin exists. Consequently:

- No application user (authenticated) can create the first admin. RLS `INSERT` policy on `user_roles` only allows `role='seller'` for `auth.uid()=user_id`, so an admin INSERT is refused by RLS before the trigger is even reached.
- `anon`, `authenticated`, `service_role` have zero grants on `user_roles`; they cannot INSERT at all.
- `sandbox_exec` (Lovable tooling) can attempt INSERT but has `auth.uid()=NULL` in that session, so the guard raises `42501` ("only platform admins can grant admin role"). Verified by test T2 in M1A #2D-1A.
- Only the table owner `postgres` (invoked through an owner-run migration) can execute an INSERT that (a) has grants, (b) is not filtered by RLS (owner bypasses RLS by default), and (c) still fires the BEFORE trigger. Because the trigger checks `auth.uid()`, which is NULL under a migration session, the guard would still refuse — unless the migration explicitly *takes responsibility* for the bootstrap path (see §3, Option B).

Therefore only a controlled owner-executed migration can break the paradox, and it must do so in a way that is one-time, self-invalidating, and audited.

---

## 2. Current guard behaviour (verbatim contract)

From `guard_user_roles_mutation()`:

- Reads `_caller := auth.uid()` and `_caller_is_admin` via `EXISTS` on `public.user_roles`.
- On INSERT of `role='admin'`: raises 42501 unless `_caller_is_admin`, then raises 42501 if `_caller = NEW.user_id` (no self-grant even by an existing admin).
- On UPDATE: `user_id` immutable; role changes involving admin require caller admin + not self; last-admin demotion blocked.
- On DELETE: admin row deletion requires caller admin + not self + not last admin.

**Consequence for bootstrap:** any path that inserts `role='admin'` *while the trigger evaluates the caller's identity via `auth.uid()`* will always be rejected when zero admins exist. The bootstrap therefore MUST either (a) run as the table owner AND temporarily disable the guard for a single owner-controlled statement, or (b) provide a controlled trigger-side exception whose activation is one-shot and cannot recur.

Both approaches are only reachable from `postgres` (owner) inside a migration.

---

## 3. Options (A / B / C)

### Option A — One-time bootstrap request table

Additive table `public.platform_admin_bootstrap_requests` with columns (`id`, `target_user_id`, `state ∈ {pending,approved,consumed,expired}`, `owner_decision_ref`, `requested_at`, `consumed_at`). A trusted SECURITY DEFINER function `consume_bootstrap_request(request_id)` runs only when:

- `(SELECT count(*) FROM user_roles WHERE role='admin') = 0`
- request state = `approved`
- `target_user_id` exists in `auth.users`
- guard is bypassed via a session-local flag the function itself sets and clears inside its own transaction (e.g. `SET LOCAL borvat.bootstrap_ok = 'yes'`), and the guard function is extended to accept that flag *only when caller is postgres and admin_count = 0*.

**Reachability inside Lovable:** the request row would need to be created by *some actor*. The only actors available in Lovable are the app (authenticated) and `sandbox_exec` — neither of which we want to trust. If Lovable tooling (`sandbox_exec`) writes the request row, then the human-side approval step is a `state='approved'` UPDATE, but again `sandbox_exec` is the only writer available. Splitting "request" and "approval" between two roles that are actually the same session gives no real separation of duties.

**Verdict:** heavier surface (a new table, a new RPC, a guard mode-switch), and inside Lovable the two-role separation collapses to a single trust boundary. **Rejected.**

### Option B — Migration-bound first-admin assignment (RECOMMENDED)

A single, owner-executed migration whose body:

1. `ASSERT (SELECT count(*) FROM public.user_roles WHERE role='admin') = 0` — else `RAISE EXCEPTION` and abort. (One-time property.)
2. `ASSERT` exactly one row in `auth.users` matches the Owner-approved target UUID passed as a migration-scope constant — else abort.
3. `ALTER TABLE public.user_roles DISABLE TRIGGER trg_guard_user_roles;` — scoped to this single transaction.
4. `INSERT INTO public.user_roles(user_id, role) VALUES (:target, 'admin');` — audit AFTER trigger still fires and records the mutation with `source='bootstrap_migration'`, `owner_decision_ref` embedded via `SET LOCAL borvat.bootstrap_source`.
5. `ALTER TABLE public.user_roles ENABLE TRIGGER trg_guard_user_roles;` — restored in the same transaction. If step 5 fails, step 4 rolls back with the whole transaction, so the guard is never left disabled.
6. `INSERT` a permanent marker row into `agent_audit_log` (or a dedicated `platform_admin_bootstrap_log`) recording target UUID, owner decision reference, migration hash, timestamp.
7. Optional but recommended: `REVOKE INSERT ON public.user_roles FROM sandbox_exec` in the *same* migration to close R-D4 immediately after bootstrap (see §7).

**Reachability inside Lovable:** the migration is authored by the agent and submitted through the standard migration approval flow. The Owner reviews the migration text — including the literal target UUID and the plain-English description — and approves or rejects it via the migration tool. No Owner shell access needed; the Owner decides by approving the migration.

**One-time closure:** step 1 guarantees the migration is a no-op-with-failure the second time it is (accidentally) re-run. There is no permanent bootstrap function, no permanent bootstrap table, no permanent RPC. The only artefact is the resulting admin row and the audit trail.

**Hardcoded UUID concern:** the target UUID appears in the migration text. That is the *desired* property here — it means the Owner is approving a specific user, in writing, in the change history, with a signed decision reference in the description. This is not a secret and is not hardcoded into runtime code; it is a one-time data-migration input.

**Rollback:** if the wrong user is granted, an *authorized* second admin can later be created only by another owner-approved migration of the same shape; then a normal in-app admin-to-admin DELETE removes the wrong one. Until a second admin exists, the last-admin invariant deliberately protects even the mis-granted admin from removal — this is the correct behaviour; recovery is a follow-up migration, not a hidden shortcut.

**Verdict:** minimal surface, no permanent bootstrap machinery, verifiable by static inspection of the migration diff. **Recommended.**

### Option C — Temporary bootstrap RPC (two-migration pattern)

Migration 1 creates a SECURITY DEFINER RPC `bootstrap_first_platform_admin(target uuid, decision_ref text)`; migration 2 drops it. Between the two migrations the RPC exists on the database. Even if `EXECUTE` is granted only to `postgres`, the presence of a live "grant-first-admin" function is an attractive-nuisance target: any bug in guard bypass, any grant misconfiguration, or any accidental re-run of migration 1 without migration 2 leaves a live back door. Migration 2 failing (network glitch, review interruption) leaves an open Attack window until the next intervention.

**Verdict:** strictly weaker than Option B — same authorization model, larger surface, more failure modes. **Rejected.**

---

## 4. Final recommendation

**Option B — Migration-bound first-admin assignment.**

Rationale:

- **Least surface inside Lovable.** No new table, no new RPC, no new permanent grant. The only permanent artefact is the resulting `user_roles` row and its audit trail.
- **Executable by the agent, decided by the Owner.** The Owner does not need to run SQL or shell commands; they approve the migration text (with the target UUID and business decision reference) through the existing migration approval flow.
- **Business decision only.** The first admin is chosen by the Owner. The agent MUST NOT pre-select a target.
- **Re-use prevented.** Step 1 (`admin_count = 0` assert) makes the migration idempotent-by-failure once succeeded.
- **Audit written.** The AFTER audit trigger fires during the INSERT (guard is disabled, audit is not); a supplementary explicit log row records the migration hash and owner decision reference.
- **Last-admin invariant preserved.** After bootstrap, `admin_count = 1`; the existing guard blocks deletion or demotion of that sole admin. Recovery requires either a second admin (granted by the first, cross-grant, per guard matrix row 3) or a follow-up owner-approved migration of the same shape.
- **Later revocation.** Once a second admin exists, either admin can DELETE the other via the guard's normal admin-to-admin DELETE path.
- **No Company Admin / Seller can reach it.** They cannot author or execute migrations; they have no grants on `user_roles`; the guard blocks their INSERT.

---

## 5. First-admin identity — Owner inputs required (NOT chosen by agent)

The Owner must provide, at #2D-1C authorization time:

| Field | Purpose |
|---|---|
| Full name | Human accountability |
| Email | Contact / recovery |
| `auth.users.id` UUID | Migration target (verified to exist before migration is filed) |
| Reason for grant | Recorded in decision log & migration description |
| Decision date | Recorded |
| Personal or dedicated admin account | See recommendation below |
| MFA state | Must be enabled before grant |

**Agent's initial recommendation (subject to Owner override):**

- Dedicated administration account, not a daily seller account.
- MFA enforced.
- Not shared between multiple humans.
- Not used to place buyer orders or manage a seller store.

The agent does **not** create this account and does **not** grant the role in this precheck.

---

## 6. Audit design (Option B)

Successful bootstrap will produce two audit rows:

**Row 1 — automatic (via existing `trg_audit_user_roles`):**
- `tool_name = 'user_roles.mutation'`
- `status = 'success'`
- `user_id = NULL` (migration session has no `auth.uid()`)
- `role_at_time = 'postgres'` (or whatever `current_setting('role', true)` returns under the migration)
- `input_summary = { op:'INSERT', target_user_id, old_role:null, new_role:'admin', source: current_setting('borvat.bootstrap_source', true) }`

**Row 2 — explicit bootstrap marker (written by the migration itself):**
- `tool_name = 'user_roles.bootstrap'`
- `status = 'success'`
- `input_summary = { target_user_id, owner_decision_ref, migration_sha256, timestamp, method:'migration-bound' }`

**Never written:** password, MFA secret, tokens, raw JWT. Email is not written when target UUID is present (UUID is sufficient and stable; email is decision-log data, not audit data).

**R-D2 limitation applies:** rejected attempts (e.g. re-run after admin exists) raise inside the transaction and the audit INSERT rolls back with them. Rejected bootstrap attempts appear only in Postgres/error logs. This is the same class of limitation as accepted in BOR-DEC-039 and BOR-DEC-041, and is deemed acceptable because the migration flow itself is human-approved and the only path.

---

## 7. `sandbox_exec` assessment (R-D4)

**Q1 — Can `sandbox_exec` INSERT create the first admin despite the current guard?**
No. `sandbox_exec` sessions have `auth.uid() = NULL`, so `_caller_is_admin = false`, so the INSERT-admin branch of `guard_user_roles_mutation()` raises `42501` before the row is written. Verified by test T2 in M1A #2D-1A. Confirmed today by direct inspection of guard source.

**Q2 — Does the guard distinguish a trusted bootstrap from a direct `sandbox_exec` INSERT?**
No — and that is intentional. The guard treats them identically (both rejected). Trust is instead conferred by *disabling the trigger* for a single owner-approved transaction inside the bootstrap migration (Option B), which only `postgres` can do. `sandbox_exec` cannot `ALTER TABLE ... DISABLE TRIGGER` (verified T6 in M1A #2D-1A).

**Q3 — Can `sandbox_exec` modify or delete an admin after creation?**
No. `sandbox_exec` has `SELECT + INSERT` only — no UPDATE, no DELETE (T9, T8 in M1A #2D-1A). Even if it were granted, the guard would still evaluate `auth.uid() = NULL` as non-admin and reject.

**Q4 — Should INSERT be revoked from `sandbox_exec` before or after bootstrap?**
Recommended: **inside the same bootstrap migration, after the INSERT and after the trigger is re-enabled.** Two reasons:
- Before bootstrap the INSERT is already neutralised by the guard, so revoking earlier gains nothing operationally.
- After bootstrap, INSERT on `user_roles` has no legitimate Lovable-tooling use; keeping it is only a hygiene liability. Revoking closes R-D4.

**Q5 — Does Lovable tooling actually need INSERT on `user_roles`?**
No production runtime path requires `sandbox_exec` INSERT on `user_roles`. The seller role is granted by the app under `authenticated` via the RLS INSERT policy, not by tooling. Tests can be re-authored under `BEGIN … ROLLBACK` or by re-granting INSERT for the duration of a specific test migration and revoking after — neither requires a permanent grant.

**Q6 — Forward-fix plan for R-D4.**
Fold the `REVOKE INSERT ON public.user_roles FROM sandbox_exec` into the M1A #2D-1C bootstrap migration. Do not file a separate hardening migration — coupling revocation to the moment the first admin appears is easier to reason about and easier to audit.

**Verdict on Q1:** since `sandbox_exec` cannot bootstrap an admin, this precheck is **NOT** a `BOOTSTRAP SECURITY BLOCKER`.

---

## 8. R-D6 assessment (Default EXECUTE on trigger functions)

**Ownership.** Both `guard_user_roles_mutation()` and `audit_user_roles_change()` are owned by `postgres`. Default privileges give `PUBLIC` (and thus `anon`, `authenticated`, `service_role`, `sandbox_exec`) `EXECUTE`.

**Direct callability.** In Postgres, a `RETURNS trigger` function *is* callable as a normal SQL function; Postgres does not syntactically forbid `SELECT public.guard_user_roles_mutation()`. However, the function body references `TG_OP`, `NEW`, `OLD`. When called outside a trigger context, `TG_OP` is NULL, and the function falls through all `IF TG_OP = ...` branches to `RETURN NULL`. It performs no writes, no reads with user-controllable input, and no side effects. The audit function is similar: no `TG_OP` branch matches, no INSERT is executed, and it returns NULL.

**Exploit potential.** None identified. No user-controllable input surface (zero arguments), no writes on the null-TG_OP path, no information disclosure (the SELECTs it performs are inside branches that are skipped). Classified as **hygiene issue**, not an exploit path.

**Owner-level migration required to close.** A future owner-run migration:
```sql
REVOKE EXECUTE ON FUNCTION
  public.guard_user_roles_mutation(),
  public.audit_user_roles_change()
FROM PUBLIC, anon, authenticated, service_role;
```
This can only run as function owner (`postgres`), which the migration tool provides.

**Sequencing.** R-D6 is a hygiene fix and does **not** need to close before First Admin bootstrap. It can be folded into the same #2D-1C migration for economy, or deferred. Recommendation: fold it in — same file, same review, same audit; the migration is already an owner-level statement.

---

## 9. Last-admin lifecycle (future design, not implemented here)

| Event | Required path |
|---|---|
| Create 2nd admin | Existing admin cross-grants via an in-app admin-only RPC (out of scope this sprint). Guard already permits admin cross-grant (matrix row 3). |
| Remove an admin | Admin-to-admin DELETE via in-app RPC. Guard blocks last-admin deletion, self-deletion, and non-admin deletion. |
| Demote an admin | Admin-to-admin UPDATE via in-app RPC. Guard blocks last-admin demotion, self-demotion, non-admin demotion. |
| Lost access to admin account | Recovery is a *new* owner-approved bootstrap-style migration when `admin_count = 0` again. If `admin_count ≥ 1`, the surviving admin promotes a replacement, then removes the lost account. |
| Staff departure | Surviving admin demotes/removes the departing admin before offboarding completes. HR runbook. |
| Emergency recovery | Same shape as bootstrap: owner-approved migration; only viable when `admin_count = 0`. If `admin_count ≥ 1`, escalate through the surviving admin. |
| Prevent deletion of last admin | Already enforced by the guard. |
| Rotation to a new admin account | 1) surviving admin grants new; 2) surviving admin removes old. Two RPC calls, both audited. |

**Not created in this sprint:** admin cross-grant RPC, admin removal RPC, admin demotion RPC, admin read RPC, admin UI.

---

## 10. Proposed test plan (to be executed under M1A #2D-1C, not now)

| # | Test |
|---|---|
| B1 | Bootstrap succeeds only when `admin_count = 0` |
| B2 | Bootstrap re-run fails (assert step aborts) |
| B3 | Target user must exist in `auth.users`; missing target aborts |
| B4 | Target user cannot self-bootstrap (they cannot author or execute migrations) |
| B5 | Company Admin cannot bootstrap (no migration access, no grants) |
| B6 | Seller cannot bootstrap (no migration access, no grants) |
| B7 | `anon` and `authenticated` cannot invoke any bootstrap path (no path exists) |
| B8 | Guard is disabled and re-enabled inside the same transaction; failure to re-enable rolls back the INSERT |
| B9 | Bootstrap migration writes both audit rows (automatic + explicit marker) |
| B10 | Last-admin protection intact post-bootstrap (delete of sole admin blocked) |
| B11 | No `company_member_roles` or tenant role rows are altered by the migration |
| B12 | No admin read RPC and no admin UI are introduced |
| B13 | `sandbox_exec` cannot bootstrap or subsequently escalate the admin |
| B14 | Bootstrap failure leaves no partial admin row (transactional) |
| B15 | Post-bootstrap: `REVOKE INSERT ON public.user_roles FROM sandbox_exec` verified |
| B16 | Post-bootstrap: `REVOKE EXECUTE` on trigger functions (if folded in) verified |
| B17 | Migration description surfaces target UUID and Owner decision reference in plain English for review |

---

## 11. Owner inputs required later (for M1A #2D-1C)

1. Full name of first Platform Admin.
2. Contact email.
3. `auth.users.id` UUID of an *existing* account (agent will verify presence before filing the migration).
4. Written reason for grant (goes into migration description and decision log).
5. Confirmation that MFA is enabled on that account.
6. Confirmation that this is a dedicated administration account (not a daily seller account).
7. Explicit decision reference (e.g. `BOR-DEC-042`) for the audit marker.
8. Whether to fold R-D4 (`sandbox_exec` INSERT revoke) into the bootstrap migration — recommended: yes.
9. Whether to fold R-D6 (trigger function EXECUTE revoke) into the bootstrap migration — recommended: yes.

---

## 12. Confirmation of non-execution

- **No admin was created.** `admin_count` remains 0 (verified during this precheck).
- **No migration filed.** No `supabase--migration` call made.
- **No bootstrap RPC created.**
- **No admin read RPC created.**
- **No admin UI created.**
- **No `sandbox_exec` grants changed.**
- **No trigger function grants changed.**
- **No hardcoded email or UUID committed anywhere.**
- **P5-HF-001, M1A #1, #2A, #2B-1, #2C-1, #2D-1A all unchanged.**

---

## 13. Final verdict

**SAFE FIRST-ADMIN BOOTSTRAP DESIGN IDENTIFIED.**

Recommended path: **Option B — Migration-bound first-admin assignment**, with R-D4 and R-D6 forward-fixes folded into the same migration.

Not a `BOOTSTRAP SECURITY BLOCKER`: `sandbox_exec` cannot currently create an admin (guard rejects `auth.uid()=NULL` caller), and no application role has DML on `user_roles`.

Halt. Awaiting Owner authorisation of **M1A #2D-1C — First Platform Admin Bootstrap Execution**, along with the Owner inputs listed in §11.
