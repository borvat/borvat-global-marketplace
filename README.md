# BORVAT Global Marketplace — Engineering Foundation

**State: DRAFT / OWNER REVIEW. Codex execution NOT AUTHORIZED. No deployment or automatic main merge.**

This preparation branch preserves recoverable BORVAT STORE source and earlier experiments. It is not a launch-ready marketplace. `main` and the published Lovable application/database are untouched.

## Repository map

| Path | Purpose |
|---|---|
| `apps/marketplace` | 499 unchanged text files from Lovable commit 42fcde8; UI, server functions, MCP tools, SQL migrations, tests and governance |
| `experiments/product-completion` | 58 preserved files from development branch, including demo commerce and test services |
| `experiments/core-engine-v1` | 45 preserved PostgreSQL commerce-core files, not selected as replacement |
| `docs/mission03` | Original audit/design: logical data model, OpenAPI, events, 35 acceptance scenarios, EU/payment and integration study |
| `docs/architecture` | Module ownership, ADRs and integration boundaries |
| `docs/execution` | Sequential stages, dependencies, evidence and owner gate |
| `docs/source-recovery` | Provenance, hash manifest, unresolved assets and lockfile investigation |
| `tests/foundation` | Isolated preparation/gate regression tests |
| `tests/fixtures` | Synthetic test-only records |
| `.github` | Read-only CI, PR and issue templates; no deploy workflows |

## Verification

Use Node 24 and Python 3. Run `npm run foundation:check`, `npm run test:foundation`, `npm run test:core-money`, and `npm run source:check`. Full recovery is a separate blocking check: `npm run source:require-complete` intentionally fails while 69 binary assets are unavailable. No dummy image replaces a missing original.

App: `cd apps/marketplace; npm exec --yes --package=bun@1.3.0 -- bun install --frozen-lockfile --ignore-scripts; npm exec --yes --package=bun@1.3.0 -- bun test scripts/buyer-account.test.ts; npm run build`. This sequence is local-only and may fail on unresolved assets or baseline dependencies; see the evidence report. Do not run legacy tenancy scripts against a hosted database.

The original npm lock is stale. An unapproved regenerated npm lock is archived for comparison, not silently adopted. Bun's existing frozen lock is the reproducibility candidate. Runtime examples point only to localhost and contain no real credentials.

**Known blockers:** binary source parity; app clean build; failing prototype tests; pending isolated PostgreSQL/Supabase replay and E2E; ACL/legacy order and payment display findings; final legal operator/PSP decisions; manual owner review. The 35 acceptance scenarios are specifications, not 35 passing tests.

Start with [current evidence](docs/readiness/REPORT.md), [module map](docs/architecture/MODULES.md), [stages](docs/execution/STAGES.md) and [transition policy](docs/execution/GATES.md). Future implementation stays ON HOLD until the owner explicitly authorizes Codex. Do not use the old baseline's start prompt as authorization.

## Independent OSS evaluation

See [evaluation and test evidence](docs/oss-evaluation/README.md), [proposed ADR-005](docs/architecture/ADR-005-oss-foundation-selection.md) and [conditional phase plan](docs/execution/OSS-REVISED-PLAN.md). Option 1 (Mercur + Surooh extensions) is recommended, not adopted. Independent PostgreSQL verification of the archived core now passes 37 tests, while a separate injected post-capture failure exposes a durability gap. Original source and production remain unchanged. Foundation decision and Codex authorization are separate, both pending.
