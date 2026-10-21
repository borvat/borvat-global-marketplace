# PHASE 5 — M0 — LOVABLE-NATIVE DIFF (Live vs Static Migration Model)

**Method:** Compared live `pg_catalog`/`information_schema` inventory against a
static parse of the 37 committed migrations. No clean-room replay performed.

## Summary

| Category                              | Count |
|---------------------------------------|-------|
| MATCH                                 | 60 tables, 101 functions, 114 policies, 80 triggers |
| EXPECTED DIFFERENCE                   | 2     |
| UNDOCUMENTED                          | 0     |
| DANGEROUS                             | 0     |
| NOT PROVABLE WITHOUT REPLAY           | 6 classes (see §Residual Risks) |

## Object-by-object

### Tables (61 live, 60 expected in model)

| Live object              | Class                 | Notes |
|--------------------------|-----------------------|-------|
| `channel_connections_safe` | **EXPECTED DIFFERENCE** | It is a VIEW (not a table). Created in `20260723225107` and redefined in `20260723225908`. Static-parse classifier flagged it under tables because `information_schema.tables` includes views. No drift. |

All 60 other tables present in live match a `CREATE TABLE` in a committed migration.
Zero tables in live are absent from the migration model.

### Functions (101 live, 102 expected)

| Object                       | Class | Notes |
|------------------------------|-------|-------|
| `mark_bol_order_line_shipped` | **EXPECTED DIFFERENCE** | Created in `20260723230949`, then explicitly `DROP FUNCTION IF EXISTS` in `20260723231644`. Live correctly lacks it. |

All 101 live functions correspond to a `CREATE FUNCTION` in a committed migration.

### Policies

114 live RLS policies. Every policy `(table.name)` present in live has a matching
`CREATE POLICY` in migration source. No policy exists live without a source.

### RLS state

All 61 live tables report `relrowsecurity = true`. Zero tables without RLS.

### Grants

Supabase default grants (SELECT/INSERT/UPDATE/DELETE + REFERENCES/TRIGGER/TRUNCATE/MAINTAIN)
apply to `anon`, `authenticated`, `service_role` on every `public` table — this is the
Supabase Cloud project baseline, not application-issued grants. Row-level access is
gated by RLS in every case. See §Residual Risks / RR-2.

### Critical function ACL — `place_order`

```
place_order(uuid, integer, jsonb)
  EXECUTE → postgres, sandbox_exec
```

`anon`, `authenticated`, `service_role`, `PUBLIC` — none. **P5-HF-001 verified in place.**

## NOT PROVABLE WITHOUT REPLAY — Residual Risks

These classes cannot be proven by a static+read-only audit alone:

- **RR-1 Idempotency**: no evidence any single migration replays cleanly on a fresh
  DB. Known non-idempotent statements documented in
  `docs/phase5-m0/non-idempotent-migrations.md` — untested.
- **RR-2 Default anon grants**: Supabase defaults grant `anon` all DML on every
  public table; RLS is the sole barrier. A future migration that forgets
  `ALTER TABLE … ENABLE RLS` would expose data immediately. Governance rule
  in blueprint §21 forbids this; still relies on migration author discipline.
- **RR-3 Concurrency**: OCC / advisory-lock paths in inventory reservation
  (Phase 2 Migration 4) and outbox one-in-flight (Phase 3) verified by
  test-suite runs recorded in prior closure reports, not by clean-room replay.
- **RR-4 Deadlock handling**: not exercised by this audit.
- **RR-5 Kill-switch write precedence**: verified read-only — `channel_kill_switches`
  rows exist and `check_channel_write_allowed(...)` function is present with
  `service_role`-only EXECUTE. Not exercised against a real write attempt.
- **RR-6 Double-dispatch under race**: outbox one-in-flight unique index verified
  present; race not exercised.
- **RR-7 Replay-from-zero**: not attempted (Lovable environment constraint).

## Verdict

**LOVABLE-NATIVE VERIFICATION PASS WITH RESIDUAL RISKS**

- 0 DANGEROUS
- 0 UNDOCUMENTED
- 2 EXPECTED DIFFERENCE (both benign, root-caused above)
- 6 residual-risk classes documented, not tested
