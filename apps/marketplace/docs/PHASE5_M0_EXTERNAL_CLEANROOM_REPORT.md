# Phase 5 — M0-E2 External Clean-Room Replay & Baseline Closure — REPORT

**Version:** 1.0 (structural — replay pending)
**Date:** 2026-07-24
**Authorization:** Owner directive dated 2026-07-24 — M0-E2 authorized;
Production replay explicitly forbidden.

---

## 1. Executive summary

- **P5-HF-001** — ACCEPTED AND CLOSED (per owner ruling this cycle).
- **R2** — SECURITY OBJECTIVE SATISFIED BY P5-HF-001. Not re-executed as a
  standalone migration. Any residual documentation work (registry, dependency
  metadata) will be folded into a future migration without repeating the
  `REVOKE`.
- **M0-E2 external clean-room replay** — **NOT EXECUTED** in this environment.
  See §2 for the environment constraint and §6 for the required off-sandbox
  procedure.
- **17-suite regression** — unchanged from prior report:
  - 15 suites: PASS
  - 2 suites (`phase4-m4-tests`, `phase4-m4-adapter-tests`): PRE-EXISTING
    FAILURE due to M5 live-write lock. Path to `ACCEPTED SUPERSEDED
    EXPECTATION` is documented in §5 and cannot be closed until the checkpoint
    + post-M5 compatibility suite both pass off-sandbox.

## 2. Environment constraint (why replay is not in this report)

The Lovable build sandbox is **not** an authorized clean-room target:

| Requirement | Sandbox reality |
|---|---|
| Isolated Postgres instance | Only the production DB is reachable via `PG*`. |
| Docker for `supabase db reset` | Not available. |
| Unprivileged replay role | Process runs as root; `useradd` / `su` unavailable. |
| Non-production target | Production is the only DB endpoint. |

Owner directive forbids replay against Production. Therefore M0-E2 must be
executed on one of the environments listed in
`docs/phase5-m0/current-replay-log.txt` (CI runner, local Docker, ephemeral
Lovable project, or ephemeral non-production Postgres).

## 3. Manifest field correction

The manifest at `docs/PHASE5_M0_MIGRATION_MANIFEST.json` deliberately **omits**
`live_replay_sha256`. That field cannot be honestly populated: the live DB
proves schema state, not the byte content of the migration file historically
applied, and no trusted external deployment manifest with those hashes exists
for this project.

Fields used instead:

- `repo_sha256` — SHA-256 of the migration file as it exists in the repo (populated).
- `scratch_applied_sha256` — SHA-256 of bytes applied during clean-room replay (populated by M0-E2).
- `scratch_execution_status` — `APPLIED` / `FAILED` / `NOT_REACHED` (populated by M0-E2).
- `scratch_execution_order` — order of application in the scratch DB (populated by M0-E2).
- `live_migration_record_present` — whether `supabase_migrations.schema_migrations` has a row for this file (populated by M0-E2).
- `live_schema_effect_match` — whether the live schema effect matches the scratch effect (populated by M0-E2 §4 comparison).
- `evidence_source` — currently `repo_filesystem_only`; upgraded to
  `repo+scratch_replay+live_pg_catalog` after M0-E2.

`deployed_artifact_sha256` is intentionally **not defined** unless an external
deployment-manifest source with per-file hashes is introduced. If ever added,
the source system must be named in `evidence_source`.

## 4. Two manifest sets

Both sets are materialized in `docs/PHASE5_M0_MIGRATION_MANIFEST.json`:

- `sets.pre_hotfix_manifest` — 36 migrations, excluding
  `20260724210701_b6184936-e4a0-410d-8047-f67a2d026319.sql`.
- `sets.current_manifest` — 37 migrations, **including** P5-HF-001. This is
  the clean-room baseline going forward.

## 5. M4 test handling — checkpoint + post-M5 compatibility

The two failing M4 suites will NOT be rewritten in place. The accepted
resolution path is:

1. **Historical execution:** run `scripts/phase4-m4-tests.ts` and
   `scripts/phase4-m4-adapter-tests.ts` **unchanged** against the pre-M5
   checkpoint of the clean-room replay (i.e. stop replay just before the
   migration that introduced `live_authorized_at`, run the suites, then
   continue).
2. **Post-M5 compatibility suite:**
   `scripts/phase4-m4-post-m5-compat-tests.ts` (scaffolded this cycle)
   proves the current schema enforces the intended M5 supersession without
   regressing kill-switch, tenancy, shadow, or read-only behavior.

Reclassification of the two suites to **ACCEPTED SUPERSEDED EXPECTATION** is
only permitted when **both** phases pass and the linked decision entry is
recorded. Until then they remain PRE-EXISTING FAILURE.

## 6. Off-sandbox execution checklist (for the next runner)

1. Provision a fresh empty Postgres 15+ DB.
2. Confirm `SELECT count(*) FROM pg_tables WHERE schemaname='public'` is 0.
3. Apply `supabase/migrations/*.sql` in filename lexicographic order.
   Record per-file: `scratch_applied_sha256`, exit code, wall time.
4. Stop on first non-zero exit. Do not hand-patch. Any fix is a new migration
   and restarts the replay from step 1.
5. Repeat once with `sets.pre_hotfix_manifest` (stop before P5-HF-001) to
   produce the pre-hotfix scratch DB.
6. Extract schema-object inventory per
   `docs/phase5-m0/schema-object-comparison.json` shape.
7. Diff scratch (current) vs. live post-hotfix. Classify each row
   `EXPECTED` / `UNDOCUMENTED` / `DANGEROUS`.
8. Fill `docs/phase5-m0/structural-diff-final.md`.
9. Run M4 checkpoint suites at step-5 checkpoint DB.
10. Run `scripts/phase4-m4-post-m5-compat-tests.ts` against current scratch DB.
11. Re-run the 15 green suites against current scratch DB; they must remain green.
12. Update `docs/BORVAT_CURRENT_STATE_V1.md` and `docs/BORVAT_DECISION_LOG_V1.md`.
13. Issue final verdict in this document.

## 7. Success gate (owner-defined, restated)

Baseline PASS requires **all** of:

- Current clean-room replay applies all 37 migrations cleanly.
- Zero `DANGEROUS` drift.
- Zero unapproved `UNDOCUMENTED` drift.
- The 15 green suites remain green on scratch.
- Both M4 suites resolved via checkpoint + post-M5 compatibility (not by
  editing expected results).
- P5-HF-001 is present in the current clean-room baseline.

## 8. Deliverables produced this cycle

- `docs/PHASE5_M0_EXTERNAL_CLEANROOM_REPORT.md` (this file)
- `docs/PHASE5_M0_MIGRATION_MANIFEST.json` (37 entries; scratch fields empty pending replay)
- `docs/phase5-m0/current-replay-log.txt` (procedure + non-execution reason)
- `docs/phase5-m0/pre-hotfix-replay-log.txt` (procedure + non-execution reason)
- `docs/phase5-m0/structural-diff-final.md` (schema + classification skeleton)
- `docs/phase5-m0/schema-object-comparison.json` (required shape)
- `scripts/phase4-m4-post-m5-compat-tests.ts` (scaffold; fixtures wired during replay)
- `docs/BORVAT_CURRENT_STATE_V1.md` updated
- `docs/BORVAT_DECISION_LOG_V1.md` updated (append-only)

## 9. Verdict

**BASELINE FAIL** — clean-room replay not executed; two M4 suites unresolved
pending checkpoint + post-M5 compatibility execution. M1 and R3–R9 remain
BLOCKED. Awaiting owner-provisioned off-sandbox environment to execute M0-E2.
