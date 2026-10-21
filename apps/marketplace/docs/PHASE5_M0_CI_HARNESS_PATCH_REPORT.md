# Phase 5 — M0-E3 CI Harness Patch Report

**Authorization:** M0-E3 HARNESS PATCH SCOPE AUTHORIZED (owner ruling, 2026-07-24).
**Scope:** harness only. No migrations, no schema, no product code, no checkout re-enable, no live grants.
**Charter reference:** `docs/PHASE5_M0_HARNESS_STATIC_REVIEW.md` (findings F-01…F-11 + Critical items).
**Verdict at end of this patch:** **HARNESS READY FOR FIRST RUN** (static review pass — 0 Critical / 0 High / 2 residual Medium documented).

## Files created

| File | SHA-256 |
|---|---|
| `scripts/phase5-m0/lib/common.sh` | `9a145a2455d6f530ec40d7b82e856efeb9ad7673eae0b4831ed7bb66ed71f686` |
| `scripts/phase5-m0/assert-empty-db.sh` | `d2dfa714150fd6f5e1968d5262753ab3052ac3ca86d1c362c02a37cd20320c64` |
| `scripts/phase5-m0/verify-live-readonly-role.sh` | `6ca1e9b0e18ca68dace05c578d0223dc140f8724c799b79e2662c04838c39740` |
| `scripts/phase5-m0/scan-artifacts-for-secrets.sh` | `2355d3eed3076b79a7412e72040596c756c664f56afff4c9eb6c4899fe00f3fb` |
| `scripts/phase5-m0/write-run-metadata.sh` | `27a733a621bdb6f667d319553a9880df15472983d95e6df4578078835ecc8910` |
| `scripts/phase5-m0/run-m4-checkpoint.sh` | `62768c5bad4d9e481b8883139faa3e65f1d6c8022cbff3ad3d2060ce30da9ac8` |
| `scripts/phase5-m0/manifests/pre-hotfix-manifest.json` | `5fa574e5a3809e6af75e8195829568a0e0ac0e73bfad04e2e9a3e541bcc82075` |
| `scripts/phase5-m0/manifests/current-manifest.json` | `24d2e5a8387000b85d08d9878180735e95f91c8ce85800323cf331d0b10f0bb1` |
| `scripts/phase5-m0/manifests/m4-checkpoint-manifest.json` | `eacace60bd2ff70db9ad1adb9207a3daf42ff362672262048237acd16f413f60` |
| `scripts/phase4-m4-checkpoint-tests.ts` | `99407df1066a58b0e70518cc7dad773928fcda77ccf68c96d7eee0875401bb59` |

## Files rewritten

| File | New SHA-256 |
|---|---|
| `.github/workflows/phase5-m0-cleanroom.yml` | `e6a494779a9353e0dfacac58b6963ccbcb9083590111bb380b01c472814d2e53` |
| `scripts/phase5-m0/run-cleanroom.sh` | `afed38e7610f13ebd8b9d94bfe0856dac53ca762b86cc9abe0496ea7a29761b7` |
| `scripts/phase5-m0/verify-hotfix-acl.sh` | `12f43cec6856bd1027cc93b6ac1b72b212c26323f70509fcf4aec2d9451202ba` |
| `scripts/phase5-m0/dump-schema.sh` | `b473f0a03667e85b0d9fba13644a37ddcf5dc1029bc19cde125def231768db2c` |
| `scripts/phase5-m0/compare-schema.sh` | `7b3b962d495a28c36f2cecb514c3d27df22927f20516f1b46c00620194d664f5` |
| `scripts/phase5-m0/run-baseline-suites.sh` | `5b930bffd65fef7e536d9161ed9d6949a7b6873281c24a72972def2b4430aff6` |
| `scripts/phase5-m0/generate-gate-report.ts` | `aca405884711c63df56b363b83bbaca0c9aba615269c3101562e19b44f743e24` |
| `scripts/phase4-m4-post-m5-compat-tests.ts` | `993305fb9da0f45444fdd7d8419bbac9694700e53915fe2ba88af5f16032ae6e` |

## Files NOT touched (confirming scope discipline)

- No `supabase/migrations/**` edits — SHAs for all 37 migrations are the values pinned in `current-manifest.json`; the manifest was derived from disk contents, not the other way around.
- No `src/**` changes.
- No `docs/BORVAT_MASTER_BLUEPRINT_V1.md` change.
- No Stripe / Bol / RLS / edge-function change.

## Findings closure

| ID | Severity | Charter § | Before | After | Evidence |
|---|---|---|---|---|---|
| F-01 | Critical | §1 | `ls\|sort` + single-filename skip; no manifests present | **FIXED** — three pinned manifests with per-entry SHA-256 + `size_bytes` + `execution_order`; `run-cleanroom.sh` verifies count, uniqueness, ordering, on-disk hash and size, rejects UNDECLARED files (`current` set), stops before applying SQL on any mismatch (`HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION`) | `scripts/phase5-m0/manifests/*.json` + `run-cleanroom.sh` L48-88 |
| F-02 | High | §2 | No `permissions:` block | **FIXED** — workflow declares `permissions: { contents: read }`; `packages:`/`deployments:`/`id-token:` never requested; no auto-commit/push/tag | `.github/workflows/phase5-m0-cleanroom.yml` L29 |
| F-03 | Medium | §3 | No `PHASE5_CLEANROOM` marker | **FIXED** — workflow sets `PHASE5_CLEANROOM: "true"` and `require_cleanroom_env()` asserts the marker, `PGHOST` allowlist, `PGDATABASE` name allowlist, absence of production DSN/service-role env vars, and refuses hosts matching supabase.co/supabase.io/lovable.app/lovable.dev | `lib/common.sh` L20-56, workflow L34 |
| F-04 | Medium | §4 | `set -euo pipefail`, no ERR trap, `--no-privileges=0`, unflushed result JSON | **FIXED** — every script uses `set -Eeuo pipefail`; central `_harness_on_err` trap in `lib/common.sh` logs redacted line info; `dump-schema.sh` uses `--no-privileges` (boolean); result JSON is truncated with `: > "$RESULTS"` before write | `lib/common.sh` L8-18; `run-cleanroom.sh` L21; `dump-schema.sh` L38 |
| F-05 | High | §5 | Only counted `pg_tables` | **FIXED** — `assert-empty-db.sh` probes `pg_tables`, `pg_proc`, `pg_views`, `pg_matviews`, project types, well-known project object names (`place_order`, `companies`, `catalog_products`, `outbox_events`, `products`, `order_items`, `wishlist_items`, `user_roles`), and rejects any stray schema outside a documented Postgres/Supabase bootstrap allowlist. Failure emits `HARNESS FAILURE — TARGET DATABASE NOT EMPTY` | `scripts/phase5-m0/assert-empty-db.sh` |
| F-06 | Critical | §6 | Job D jumped straight from `select 'ok'` to `pg_dump` | **FIXED** — `verify-live-readonly-role.sh` runs BEFORE `pg_dump` and asserts (a) `rolsuper/rolcreatedb/rolcreaterole/rolbypassrls/rolreplication` all false, (b) role is not the database owner, (c) role is not a direct or transitive member of any privileged role (recursive `pg_auth_members`), (d) `default_transaction_read_only='on'`, (e) no CREATE on `public`/`auth`/`storage`, (f) no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on any table in those schemas, (g) no EXECUTE on the sensitive RPC list. All checks use `has_*_privilege` and `pg_roles` — no INSERT probe on Production. Any failure emits `LIVE SNAPSHOT SECURITY CHECK FAILED` and Job D aborts before dump | `scripts/phase5-m0/verify-live-readonly-role.sh` |
| F-07 | High | §7 | Malformed `--no-privileges=0` | **FIXED** — `--no-privileges` boolean; script logs `pg_dump --version`, output size, output SHA-256, verifies `--schema-only` support and refuses to run live-mode dump without a passing readonly preflight marker file | `scripts/phase5-m0/dump-schema.sh` |
| F-08 | High | §8 | Boolean chain, no HARNESS/REPLAY/TEST/DRIFT distinction | **FIXED** — `generate-gate-report.ts` implements the required 10-step verdict ladder; `HARNESS FAILURE — BASELINE UNKNOWN`, `HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION`, `REPLAY FAILURE — BASELINE FAIL`, `TEST VERIFICATION INCOMPLETE — BASELINE FAIL`, `TEST FAILURE — BASELINE FAIL`, `DRIFT VERIFICATION INCOMPLETE — BASELINE FAIL`, `BASELINE FAIL`, `BASELINE PASS WITH PROPOSED EXCEPTIONS` (requires `owner_ruling_ref` on every UNDOCUMENTED row), `BASELINE PASS`. Gate refuses PASS if any of: missing artifact, secret-scan hit, M4 checkpoint missing/not-all-PASS, post-M5 compat missing/scaffold/FAIL, any suite FAIL, dangerous drift, undocumented drift without ruling. Gate report emitted even on failure via `if: always()` | `scripts/phase5-m0/generate-gate-report.ts` |
| F-09 | Critical | §9 & §10 | Compat suite was scaffold with TODO; no M4 checkpoint path | **FIXED** — (a) `scripts/phase4-m4-post-m5-compat-tests.ts` rewritten as a real suite that inserts fixtures inside a SAVEPOINT, tests seven concrete invariants (deferred_not_authorized, sibling isolation, kill-switch precedence, shadow-mode unaffected, authorized enable, idempotency, no live write) and rolls back — never calls Bol. (b) new `scripts/phase5-m0/run-m4-checkpoint.sh` + `manifests/m4-checkpoint-manifest.json` (29 migrations, ending BEFORE `20260724003715` where `live_authorized_at` is introduced) + `scripts/phase4-m4-checkpoint-tests.ts` that asserts pre-M5 schema shape, then runs the two historical M4 suites unchanged against the checkpoint DB — a real schema checkpoint, not a data-only fake | `scripts/phase4-m4-post-m5-compat-tests.ts`, `scripts/phase4-m4-checkpoint-tests.ts`, `scripts/phase5-m0/run-m4-checkpoint.sh`, `manifests/m4-checkpoint-manifest.json` |
| F-10 | High | §13 | Only commit SHA + node/psql version emitted | **FIXED** — `write-run-metadata.sh` writes `artifacts/run-metadata.json` with `GITHUB_SHA`, `GITHUB_REF`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, workflow filename + workflow SHA-256, manifest SHAs (pre-hotfix, current, M4 checkpoint), runner OS, Node, Bun, psql, pg_dump, Docker, and Postgres image. Bundled into every artifact | `scripts/phase5-m0/write-run-metadata.sh` |
| F-11 | Medium | §14 | No pre-upload secret scan | **FIXED** — `scan-artifacts-for-secrets.sh` scans every artifact directory before upload for 16 secret categories (DSN, sb_secret, sb_publishable, JWT, Bearer, Stripe live/restricted/test, GitHub PAT/fine-grained/app, AWS AKID, PEM/OpenSSH private key, BOL_CLIENT_SECRET, password literals). Findings are redacted (first 3 + last 3 chars, length reported) — never full match. Any hit blocks upload and returns `HARNESS FAILURE — SECRET DETECTED IN ARTIFACT`. Wired into Jobs A, B, C, C2, D, and E | `scripts/phase5-m0/scan-artifacts-for-secrets.sh`; workflow steps in each job |

### Additional carve-out removals

- `run-baseline-suites.sh` no longer tags `phase4-m4-tests.ts` / `phase4-m4-adapter-tests.ts` as `PRE-EXISTING FAILURE`. Those two suites are excluded from Job C entirely (they belong to the M4 checkpoint DB, not the current DB) and are executed only inside Job C2 (`run-m4-checkpoint.sh`) where their expectations are valid.
- No `ACCEPTED SUPERSEDED EXPECTATION` verdict is achievable unless the checkpoint suites PASS *and* the post-M5 compat suite passes with ≥ 10 assertions. `generate-gate-report.ts` enforces this.

## Residual risk (Medium — kept OPEN with explicit acceptance)

1. **Bootstrap-schema allowlist inside `assert-empty-db.sh` is a code constant.** If Supabase changes the set of schemas its local Postgres image auto-creates (e.g. adds `pgmq`), the first run in that environment will emit `TARGET DATABASE NOT EMPTY` until the constant is updated. Impact: false HARNESS FAILURE, not a false PASS. **ACCEPTED** — safer to fail closed and update the allowlist per Supabase-CLI version bump than to over-permit unknown schemas.
2. **M5 boundary in the M4 checkpoint manifest** is derived from a single feature-marker (`live_authorized_at` first appears in `20260724003715_7e73d357-...`). If the owner considers a different migration to be the true M4/M5 boundary, `m4-checkpoint-manifest.json` must be re-pinned; the checkpoint suite (`phase4-m4-checkpoint-tests.ts`) also asserts the absence of `shipment_outbox`, so an incorrect boundary would surface as a checkpoint suite FAIL, not a silent PASS. **ACCEPTED** pending owner ruling if the boundary is disputed.

Neither residual affects correctness of the verdict or the security posture of Job D; both fail closed.

## Findings summary

| Severity | Before | After |
|---|---|---|
| Critical | 4 | **0** |
| High | 5 | **0** |
| Medium | 3 | 2 (documented, ACCEPTED) |
| Low | 0 | 0 |

## First-run readiness checklist (owner side)

Before triggering `workflow_dispatch`:

1. Push the patch commit and create tag `phase5-m0-e3-first-run`.
2. On GitHub: create protected environment `phase5-m0-live-readonly` with required-reviewer.
3. Create Postgres role for read-only snapshot with the constraints proved by `verify-live-readonly-role.sh` (NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION, not db-owner, `ALTER ROLE ... SET default_transaction_read_only = on`).
4. Add DSN as environment secret `PHASE5_LIVE_READONLY_DSN` scoped to that environment only.
5. First run: `workflow_dispatch` with `include_live_snapshot = false` — Jobs A/B/C/C2/E only.
6. Second run: `workflow_dispatch` with `include_live_snapshot = true` — adds Job D.

## Post-run deliverables (workflow will produce)

- `docs/PHASE5_M0_CI_CLEANROOM_GATE_REPORT.md`
- `artifacts/run-metadata.json`
- `artifacts/{pre-hotfix,current,m4-checkpoint,suites}/…`
- `artifacts/diff/structural-diff.json`
- `artifacts/secret-scan.json`
- (only with Job D) `artifacts/live/schema.sql`, `.inventory.json`, `readonly-verification.json`

## Final status

**HARNESS READY FOR FIRST RUN.**
**BASELINE FAIL — WORKFLOW NOT YET EXECUTED** (unchanged until the first run completes and its Gate Report is reviewed).
M1 remains BLOCKED. R3–R9 remain BLOCKED. R2 remains CLOSED (not re-opened).
