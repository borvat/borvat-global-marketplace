# M0-E1 — Structural diff between scratch replay and live schema

**Status:** PARTIAL. A full structural diff requires the clean-room replay
described in `docs/phase5-m0/replay-log.txt`, which could not be executed
in the current sandbox. This file records the deltas that **were** observed
via targeted live `pg_catalog` inspection during the P5-HF-001 investigation;
they must be reconciled again once a full replay is possible.

## Classification key

- `EXPECTED` — matches a known Phase 1 – 4 migration outcome.
- `UNDOCUMENTED` — present live, absent in the migrations under
  `supabase/migrations/`. Blocker until owner review.
- `DANGEROUS` — an object whose grants, policies, or definition widen the
  trust boundary beyond what the migrations state.

## Observed deltas

| Object | Kind | Live state | Migration text | Class | Notes |
|---|---|---|---|---|---|
| `public.place_order(uuid, integer, jsonb)` grant to `anon` | function ACL | `anon` had `EXECUTE` (before P5-HF-001) | migration only granted to `authenticated`, `service_role` (after an initial `REVOKE ... FROM PUBLIC`) | UNDOCUMENTED (before hotfix) → EXPECTED (after P5-HF-001 which revokes all runtime roles) | Recorded in `docs/PHASE5_P5_HF_001_REPORT.md § 2`. |
| `public.place_order(...)` grant to `sandbox_exec` | function ACL | `sandbox_exec=X/postgres` in `proacl` | not mentioned in any migration | UNDOCUMENTED (before hotfix) → EXPECTED (after P5-HF-001 which revokes it defensively) | `sandbox_exec` is a project-managed role introduced by the platform, not by application migrations. |
| `public.place_order(...)` overloads | function definition | exactly one signature | one `CREATE OR REPLACE FUNCTION` line in one migration | EXPECTED | Confirms no hidden overload. |
| `pg_depend` referencing `place_order` | dependencies | zero rows | not defined by application migrations | EXPECTED | No wrappers, views, or dependent objects. |
| Triggers with `tgfoid = place_order.oid` | triggers | zero rows | none | EXPECTED | No trigger routes writes through the vulnerable RPC. |
| All other 60+ public tables and their policies | tables/policies | not compared exhaustively | 36 migrations | UNKNOWN | Requires full replay + apgdiff. Currently outstanding — see `replay-log.txt`. |

## Verdict on partial evidence

No `DANGEROUS` delta was observed against `public.place_order` **after**
P5-HF-001 runs. Two `UNDOCUMENTED` deltas were observed before the hotfix
(`anon` and `sandbox_exec` grants); the hotfix converts both to `EXPECTED`
by revoking them.

For every object other than `public.place_order`, the classification is
**UNKNOWN pending the clean-room replay**. That gap is the reason the
overall Baseline Verification verdict cannot be `BASELINE PASS` in this
envelope.
