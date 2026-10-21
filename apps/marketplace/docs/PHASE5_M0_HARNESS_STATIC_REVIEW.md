# Phase 5 — M0-E3 Harness Static Review (v2, post-patch)

**Reviewer:** Lovable (static inspection only — no execution).
**Prior version:** v1 (2026-07-24) — 4 Critical / 5 High / 3 Medium / 0 Low.
**This revision:** covers the patch applied under BOR-DEC-029.

## File SHA-256 (post-patch)

| File | SHA-256 |
|---|---|
| `.github/workflows/phase5-m0-cleanroom.yml` | `e6a494779a9353e0dfacac58b6963ccbcb9083590111bb380b01c472814d2e53` |
| `scripts/phase5-m0/lib/common.sh` | `9a145a2455d6f530ec40d7b82e856efeb9ad7673eae0b4831ed7bb66ed71f686` |
| `scripts/phase5-m0/run-cleanroom.sh` | `afed38e7610f13ebd8b9d94bfe0856dac53ca762b86cc9abe0496ea7a29761b7` |
| `scripts/phase5-m0/assert-empty-db.sh` | `d2dfa714150fd6f5e1968d5262753ab3052ac3ca86d1c362c02a37cd20320c64` |
| `scripts/phase5-m0/verify-hotfix-acl.sh` | `12f43cec6856bd1027cc93b6ac1b72b212c26323f70509fcf4aec2d9451202ba` |
| `scripts/phase5-m0/verify-live-readonly-role.sh` | `6ca1e9b0e18ca68dace05c578d0223dc140f8724c799b79e2662c04838c39740` |
| `scripts/phase5-m0/dump-schema.sh` | `b473f0a03667e85b0d9fba13644a37ddcf5dc1029bc19cde125def231768db2c` |
| `scripts/phase5-m0/compare-schema.sh` | `7b3b962d495a28c36f2cecb514c3d27df22927f20516f1b46c00620194d664f5` |
| `scripts/phase5-m0/scan-artifacts-for-secrets.sh` | `2355d3eed3076b79a7412e72040596c756c664f56afff4c9eb6c4899fe00f3fb` |
| `scripts/phase5-m0/write-run-metadata.sh` | `27a733a621bdb6f667d319553a9880df15472983d95e6df4578078835ecc8910` |
| `scripts/phase5-m0/run-baseline-suites.sh` | `5b930bffd65fef7e536d9161ed9d6949a7b6873281c24a72972def2b4430aff6` |
| `scripts/phase5-m0/run-m4-checkpoint.sh` | `62768c5bad4d9e481b8883139faa3e65f1d6c8022cbff3ad3d2060ce30da9ac8` |
| `scripts/phase5-m0/generate-gate-report.ts` | `aca405884711c63df56b363b83bbaca0c9aba615269c3101562e19b44f743e24` |
| `scripts/phase5-m0/manifests/pre-hotfix-manifest.json` | `5fa574e5a3809e6af75e8195829568a0e0ac0e73bfad04e2e9a3e541bcc82075` (36 entries) |
| `scripts/phase5-m0/manifests/current-manifest.json` | `24d2e5a8387000b85d08d9878180735e95f91c8ce85800323cf331d0b10f0bb1` (37 entries) |
| `scripts/phase5-m0/manifests/m4-checkpoint-manifest.json` | `eacace60bd2ff70db9ad1adb9207a3daf42ff362672262048237acd16f413f60` (29 entries) |
| `scripts/phase4-m4-post-m5-compat-tests.ts` | `993305fb9da0f45444fdd7d8419bbac9694700e53915fe2ba88af5f16032ae6e` |
| `scripts/phase4-m4-checkpoint-tests.ts` | `99407df1066a58b0e70518cc7dad773928fcda77ccf68c96d7eee0875401bb59` |

## Findings — before/after

| ID | Sev (before) | Before | Patch commit target | After | Residual risk |
|---|---|---|---|---|---|
| F-01 | Critical | Dynamic `ls\|sort` migration discovery | 3 pinned manifests + integrity phase in `run-cleanroom.sh` | **FIXED** | none |
| F-02 | High | No workflow permissions block | `permissions: { contents: read }` | **FIXED** | none |
| F-03 | Medium | No `PHASE5_CLEANROOM` marker | Workflow env + `require_cleanroom_env()` | **FIXED** | Medium-#1 (bootstrap-schema allowlist may lag Supabase-CLI versions — fails closed) |
| F-04 | Medium | `set -euo pipefail`, `--no-privileges=0`, no ERR trap | `set -Eeuo pipefail` everywhere + `_harness_on_err` trap + correct flag | **FIXED** | none |
| F-05 | High | Single `pg_tables` count | `assert-empty-db.sh` probes 6 categories + stray-schema allowlist | **FIXED** | Medium-#1 (same allowlist concern) |
| F-06 | Critical | Job D jumped straight to `pg_dump` | `verify-live-readonly-role.sh` — 7 preflight gates on `pg_roles` + `has_*_privilege` (no INSERT probes) | **FIXED** | none |
| F-07 | High | Malformed pg_dump flag | Correct boolean; version + size + hash logged | **FIXED** | none |
| F-08 | High | Boolean verdict, no failure taxonomy | 10-step verdict ladder in `generate-gate-report.ts` | **FIXED** | none |
| F-09 | Critical | Scaffold compat suite + no real M4 checkpoint | Real compat suite (7 invariants, SAVEPOINT rollback) + `run-m4-checkpoint.sh` + `phase4-m4-checkpoint-tests.ts` + `m4-checkpoint-manifest.json` (29 migrations) | **FIXED** | Medium-#2 (M5 boundary derived from `live_authorized_at` marker; boundary suite fails closed if wrong) |
| F-10 | High | Only commit SHA emitted | `write-run-metadata.sh` covers all §13 fields (RUN_ID, RUN_ATTEMPT, workflow SHA, 3 manifest SHAs, tool versions) | **FIXED** | none |
| F-11 | Medium | No pre-upload secret scan | `scan-artifacts-for-secrets.sh` wired into every upload; 16 pattern categories, redacted output | **FIXED** | none |
| carve-out | High | `run-baseline-suites.sh` masked M4 failures as `PRE-EXISTING FAILURE` | Historical M4 suites removed from Job C; moved to Job C2 only | **FIXED** | none |

## Section pass-through (v2)

1. Manifests — **PASS**. 36 / 37 / 29 entries; SHA-256 + size + execution_order per row; runtime hash re-verified before applying each migration; UNDECLARED files rejected in `current` set.
2. Triggers & permissions — **PASS**. `workflow_dispatch` + `pull_request` (bounded paths). `permissions: contents: read`. Job D gated by `github.event_name == 'workflow_dispatch' && inputs.include_live_snapshot == true` AND environment `phase5-m0-live-readonly`. No auto-commit/push/tag.
3. Prod isolation — **PASS**. Marker + allowlist; refuses supabase.co / lovable.app hostnames; refuses when production DSN variables present.
4. Shell safety — **PASS**. `set -Eeuo pipefail` + ERR trap in `lib/common.sh`; RESULTS truncated; no `eval`; DSN passed only via env.
5. Empty-DB — **PASS**. 6-way check + explicit project-object probe.
6. Job D preflight — **PASS**. 7 gates (attributes, ownership, membership recursion, session read-only, schema CREATE, table writes, sensitive-RPC EXECUTE); zero INSERT probes on Production.
7. Schema dump — **PASS**. Correct flags; size + hash + version recorded; inventory JSON emitted; live mode requires preflight marker file.
8. Gate logic — **PASS**. 10 verdict outcomes; fails closed on missing artifact, integrity break, replay fail, suite fail, missing M4/compat proof, dangerous drift, missing snapshot; PASS-WITH-EXCEPTIONS requires `owner_ruling_ref` on every UNDOCUMENTED row.
9. Compat suite — **PASS**. Real assertions, real fixtures, SAVEPOINT rollback, ≥ 10 assertions when schema preconditions hold; no TODO / no `.skip`.
10. M4 checkpoint path — **PASS**. Separate Job C2, separate service container `cleanroom_m4`, separate manifest capping at position 29, checkpoint suite proves absence of `live_authorized_at` + `shipment_outbox`, historical M4 suites run unchanged.
11. Carve-out removed — **PASS**. Suite classification is evidence-driven; no name-based allowlist.
12. Verdict order — **PASS**. Matches charter §12 verbatim.
13. Metadata — **PASS**. All 14 fields present via `run-metadata.json` bundled into every artifact.
14. Upload hygiene — **PASS**. `if: always()`; blocking secret scan before every upload; retention 7 / 14 / 30 days per class.

## Verdict

**HARNESS READY FOR FIRST RUN.**

Findings after patch: **0 Critical / 0 High / 2 Medium (documented, ACCEPTED, fail-closed)**.
No TODO. No scaffold. No dynamic manifest selection. No live-privilege gap.

Overall project status remains:

- **BASELINE FAIL — WORKFLOW NOT YET EXECUTED**
- **M1 BLOCKED**
- **R3–R9 BLOCKED**

The `HARNESS READY FOR FIRST RUN` label authorizes the first `workflow_dispatch` but does not by itself lift any BLOCKED item; that requires the actual gate report from a real GitHub Actions run and a separate owner ruling.
