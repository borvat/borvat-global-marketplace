# PHASE 5 — M0 BASELINE VERIFICATION REPORT

**Status:** RESULTS RECORDED — see § 6 for the single verdict.
**Date:** 2026-07-24
**Owner directive reference:** § 4 (Allowed now) — M0-E1 execution, baseline regression re-run, migration manifest, corrected packet + plan V2, exposure report, hotfix P5-HF-001.
**Non-scope:** R2 – R9 and M1 remain blocked pending an explicit `BASELINE ACCEPTED — R2 AUTHORIZED` decision.

---

## 1. Deliverable index

| Artefact | Path | Status |
|---|---|---|
| Baseline verification (this file) | `docs/PHASE5_M0_BASELINE_VERIFICATION_REPORT.md` | Present; verdict in § 6. |
| Hotfix report | `docs/PHASE5_P5_HF_001_REPORT.md` | APPLIED. |
| Exposure report | `docs/PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md` | Updated: rollback-by-re-grant explicitly forbidden. |
| Decision packet V2 | `docs/PHASE5_M0_OWNER_DECISION_PACKET_V2.md` | Updated: P5-OWN-007 restored, P5-OWN-013 issued. |
| Remediation plan V2 | `docs/PHASE5_M0_BASELINE_REMEDIATION_PLAN_V2.md` | Unchanged in this envelope. |
| Migration manifest | `docs/PHASE5_M0_MIGRATION_MANIFEST.json` | Repo-side hashes; live-replay hashes still pending clean-room execution. |
| Replay log | `docs/phase5-m0/replay-log.txt` | NOT EXECUTED — sandbox cannot host local Postgres. Off-sandbox procedure documented. |
| Structural diff | `docs/phase5-m0/structural-diff.md` | Partial. `place_order` drift observed and closed by P5-HF-001. Everything else UNKNOWN pending replay. |
| Non-idempotent migrations | `docs/phase5-m0/non-idempotent-migrations.md` | NOT EXECUTED. |
| Decision log | `docs/BORVAT_DECISION_LOG_V1.md` | Appended `BOR-DEC-021`, `BOR-DEC-022`. |
| Current state | `docs/BORVAT_CURRENT_STATE_V1.md` | Updated with hotfix and baseline test evidence. |

## 2. M0-E1 — Baseline Reproducibility & Drift Verification

### 2.1 Live pg_catalog inspection (executed)

Against the live target DB (managed `psql`), the following was captured
before running P5-HF-001. Results are the source of truth for § 3 of the
hotfix report and for `docs/phase5-m0/structural-diff.md`:

- one `public.place_order` signature, no overload;
- `SECURITY DEFINER`, `search_path = public`, owner `postgres`;
- ACL before hotfix: `{postgres, anon, authenticated, service_role, sandbox_exec}` all `EXECUTE`;
- ACL after hotfix: `{postgres=X/postgres}` — every runtime role denied;
- zero rows in `pg_depend` and `pg_trigger` for the function's oid.

Two live-ACL deltas were `UNDOCUMENTED` before the hotfix (`anon` and
`sandbox_exec`) and are converted to `EXPECTED` by the hotfix migration.
No `DANGEROUS` delta was observed against this function.

### 2.2 Clean-room replay (NOT EXECUTED)

The full 36-migration replay against a scratch Postgres was not executable
in the current sandbox — see `docs/phase5-m0/replay-log.txt`. The
off-sandbox procedure required to complete it is documented in the same
file. Until that procedure runs:

- `docs/phase5-m0/scratch.sql` — MISSING;
- `docs/phase5-m0/live.sql` — MISSING;
- full apgdiff over the 60+ public objects — NOT PRODUCED;
- non-idempotent migration report — NOT PRODUCED;
- `live_replay_sha256` field per migration in `PHASE5_M0_MIGRATION_MANIFEST.json` — NOT POPULATED.

## 3. Baseline regression re-run (owner directive § 3.B)

All 17 suites were executed against the live target DB with the managed
service-role key. Commit hash: sandbox working tree (managed by the
Lovable harness — the exec tool does not expose a git SHA to the agent).
Log directory: `/tmp/phase5-logs/` (sandbox-local; not committed).

| Suite | Script | Expected | Assertions passed / total | Failed | Exit | Duration | Status |
|---|---|---|---|---|---|---|---|
| Phase 1 tenancy | `scripts/phase1-tenancy-tests.ts` | 34 | ≥34 / ≥34 (all `✅`) | 0 | 0 | 9 s | PASS |
| Phase 2 M1 | `scripts/phase2-mig1-tests.ts` | historical pass | 37 / 37 | 0 | 0 | 5 s | PASS |
| Phase 2 M2 | `scripts/phase2-mig2-tests.ts` | 34 | 34 / 34 | 0 | 0 | 6 s | PASS |
| Phase 2 M3 | `scripts/phase2-mig3-tests.ts` | 33 | 33 / 33 | 0 | 0 | 4 s | PASS |
| Phase 2 M4 | `scripts/phase2-mig4-tests.ts` | 43 | 43 / 43 | 0 | 0 | 5 s | PASS |
| Phase 3 M1 | `scripts/phase3-m1-tests.ts` | 37 | 37 / 37 | 0 | 0 | 5 s | PASS |
| Phase 3 M2 | `scripts/phase3-m2-tests.ts` | 46 | 46 / 46 | 0 | 0 | 5 s | PASS |
| Phase 3 M3 | `scripts/phase3-m3-tests.ts` | 39 | 39 / 39 | 0 | 0 | 5 s | PASS |
| Phase 4 M1 | `scripts/phase4-m1-tests.ts` | 73 | 73 / 73 | 0 | 0 | 6 s | PASS |
| Phase 4 M2 | `scripts/phase4-m2-tests.ts` | 67 | 67 / 67 | 0 | 0 | 6 s | PASS |
| Phase 4 M3 | `scripts/phase4-m3-tests.ts` | 102 | 102 / 102 | 0 | 0 | 7 s | PASS |
| Phase 4 M4 adapter | `scripts/phase4-m4-adapter-tests.ts` | 37 | 24 / ≥26 (U.* all pass; I.02, I.02b fail on live gate) | 2 | 1 | 2 s | PRE-EXISTING FAILURE (superseded by M5 §0 live-write lock) |
| Phase 4 M4 tests | `scripts/phase4-m4-tests.ts` | historical pass | ≥24 pass; D.05, L.02–L.05 fail on live gate | 5 | 1 | 6 s | PRE-EXISTING FAILURE (superseded by M5 §0 live-write lock) |
| Phase 4 M5 | `scripts/phase4-m5-tests.ts` | 79 | 79 / 79 | 0 | 0 | 11 s | PASS |
| Security | `scripts/security-tests.ts` | 17 | 17 / 17 | 0 | 0 | 4 s | PASS |
| Redaction | `scripts/redaction-tests.ts` | 10 | 10 / 10 | 0 | 0 | 1 s | PASS |
| Bol demo smoke | `scripts/phase4-m4-bol-demo-smoke.ts` | transport OK | transport OK; all non-token, non-poll calls PUT v10 | 0 | 0 | 13 s | PASS |

### 3.1 Explanation of the two non-PASS suites

Both `phase4-m4-adapter` and `phase4-m4` fail at assertions of the form
"live decision must be `live`". The dispatcher returns
`deferred_not_authorized` because no `channel_connection` has
`live_authorized_at` set — this is the Phase 4 M5 Charter Rev. 2 §0
live-write lock, ratified by the owner. That lock **supersedes** the
older M4 test expectations. It is not a Phase 5 regression:

- neither suite was ever re-baselined after M5 introduced the
  `live_authorized_at` gate;
- the P5-HF-001 migration touches only `public.place_order` and cannot
  cause a Bol dispatch decision change;
- the M5 suite (which owns the live-lock semantics) is fully green.

Classification: `PRE-EXISTING FAILURE`. Ticketed for a re-baseline as
part of the M4 test-suite update, not as a Phase 5 blocker. Not
re-attributable to Phase 5 later.

## 4. Post-hotfix invariants (checked)

- `has_function_privilege('anon' / 'authenticated' / 'service_role',
  'public.place_order(uuid,integer,jsonb)', 'EXECUTE')` = `f, f, f`.
- No behavioural reference to `place_order` remains in the client
  bundle (`rg -n 'place_order' src/` returns only the generated schema
  reflection and comments in the disabled route).
- The `/checkout` route renders a server-rendered offline page via
  `createServerFn`; no cart mutation, no order insert, no stock
  decrement, no payment claim.
- No Bol live account has `live_authorized_at`; the Phase 4 M5 live
  lock is still active (proven indirectly by the two suites that fail
  on `deferred_not_authorized`).
- No Stripe live path exists; Phase 5 P5-OWN-007 (RESTORED) mandates
  Stripe **Test Mode only** and no PSP path is wired.

## 5. Blocked artefacts

- `docs/phase5-m0/scratch.sql`, `docs/phase5-m0/live.sql`, and the full
  apgdiff diff — blocked on the clean-room replay described in
  `docs/phase5-m0/replay-log.txt`.
- `PHASE5_M0_MIGRATION_MANIFEST.json.live_replay_sha256` — blocked on
  the same replay.
- Column-level drift for the 60+ public tables — blocked on the same
  replay.

## 6. Verdict

**BASELINE FAIL.**

Reasons:

1. The clean-room replay (M0-E1 § 2.2) was not executable in this
   sandbox, so drift across the 60+ live public objects other than
   `public.place_order` is `UNKNOWN`. The owner directive explicitly
   requires an executed clean-room, not a described one.
2. The two Phase 4 M4 suites fail on live-lock semantics that
   supersede the historical assertions but have not yet been
   re-baselined into the test source; per the owner directive an
   assertion of `historical pass` is not a substitute for an executed
   PASS in the current run.

What **is** cleared: the P5-HF-001 hotfix and its verification, the 15
suites that returned PASS, and the observed `place_order`-scoped drift
(now `EXPECTED`).

R2 – R9 and M1 remain BLOCKED until a new owner decision authorises
them on the basis of a completed clean-room replay and a re-baselined
Phase 4 M4 suite.

## 7. Halt

Nothing beyond the hotfix and this verification envelope has been
executed. No historical migration has been amended. No production data
has been changed by this envelope.
