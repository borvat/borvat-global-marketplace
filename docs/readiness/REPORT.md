# BORVAT Engineering Foundation — evidence report

Date: 22 October 2026, Damascus. **DRAFT / OWNER REVIEW. Codex has not been started or assigned.**

## Delivered

- Independent branch `prep/engineering-foundation-2026-10-22` from unchanged main `02243d583fb935555177d105e22ee45dc0b93a34`.
- **499/499 eligible text files** recovered unchanged from Lovable `42fcde8cf1b2a11422c32301b6b423d3b5d39942`, including application routes/server functions, company/seller RPC and migration source, MCP tools, original tests and governance. Full source hash verification exits 0. Original .env never read/copied.
- **103 previous experimental files** preserved: product-completion 58 and PostgreSQL core 45. Existing remote branches/PRs unchanged; neither engine adopted silently.
- Module map covering all 12 requested domains, ADRs, 35-entity logical data model, 49-operation OpenAPI proposal, event/integration contracts, 35 original acceptance scenarios, MVP boundary, EU/payment study and rollback plan in repository.
- Seven native GitHub milestones and seven sequential stage issues; three explicit source/build/prototype blockers. Full links and stage mapping in docs/execution/github-tracker.json. Existing #2 CI and #4 consolidation remain linked.
- PR/issue templates, read-only CI for foundation/source completeness/app checks/prototype regressions, isolated fixture and fail-closed phase gate tests. No deploy, auto-merge or Codex workflow.

## Verification actually executed

| Check | Result | Evidence |
|---|---|---|
| Contract references / 35 specifications / policy / 12-module structure | PASS | logs/foundation.txt |
| Phase-gate regressions | **7 PASS** | logs/gate-tests.txt |
| Original buyer-account Bun tests | **3 PASS** | logs/buyer-account.txt |
| Original independent core money/pricing tests | **10 PASS** | logs/core-money.txt |
| Eligible text hash parity | **499/499 PASS**, no mismatches | logs/source-parity.txt |
| Strict all-assets parity | BLOCKED / exit 1 | logs/asset-completeness.txt |
| Original prototype suite | FAIL, retained unchanged | logs/prototype-regressions.txt |
| App TypeScript | FAIL / TS2589 in src/routes/account.tsx:73 | logs/app-typecheck.txt |
| App ESLint | FAIL: 9,360 errors + 25 warnings; many formatting findings | logs/app-lint.txt.gz (full raw output compressed) |
| App build with frozen Bun dependencies | FAIL: unrecovered public/images/hero.jpg import | logs/app-build.txt |
| Attempt to advance C1 | **EXPECTED HOLD / exit 1** | logs/stage-hold.txt |
| Actual PSP sandbox, live carrier/ERP, 35 end-to-end cases | NOT_RUN | no claim of execution |
| PostgreSQL/Supabase replay, RLS live probes, restore/load | NOT_RUN: no local PostgreSQL/Docker runtime; no hosted DB touched | future isolated verification required |

Commands, exit codes and SHA256 per log are in local-verification.json. Node 24.19.0 and Bun 1.3.0 were used. No reported historical suite count is substituted for current execution. Passing 20 small tests across distinct areas does not prove a complete marketplace journey. Foundation/source checks are additional structural checks, not E2E.

## Unresolved source parity and portability

**69 original binary files remain unavailable**: 68 flagged binary plus one WebM mislabeled as text. The connector decoded binary into replacement characters; those corrupt strings were rejected. Preview static read returned HTTP 401; the original domain returned HTTP 402; Lovable editor browser requires authentication. No original asset was overwritten and no fake substitute was generated. The external logo descriptor was preserved but its linked binary is not independently recovered. See manifest.json and blocker #13.

Accordingly, no function/source-loss guarantee or visual/full restore guarantee is claimed. All eligible text is verified; binary/visual parity and a clean app build remain explicit C0 acceptance blockers. Original Lovable project remains the recoverable binary/runtime reference. Recovered source is now reviewable on GitHub, but owner approval and missing artifacts are still needed before it becomes a complete authoritative development baseline.

Original npm ci failed due to stale package-lock. Original package-lock and Bun lock remain byte-preserved in the app. A separately archived regenerated npm lock demonstrates an alternative install but is **not adopted**. Frozen Bun install succeeded. Local build tooling temporarily regenerated routeTree.gen.ts; original file was restored, then all 499 hashes passed. No functional app code change or mass formatting occurred.

## Existing functionality versus unfinished work

Real source exists for email/Google authentication, buyer order reads, seller membership/workspaces/application review, store/canonical catalog and reservation/outbox foundations. This is code presence plus limited unit evidence, not current end-to-end production certification. Checkout remains hard-disabled. Financial/shipping/admin-order surfaces include demo imports. A `new` order payment label defect, permissive legacy write paths requiring final ACL verification, best-effort audit and mixed company/user ownership remain tracked for C1. No live seller verification or financial state was inferred from a company name.

## Boundaries verified / remaining risks

Lovable source SHA and last-edited timestamp were re-read and remained unchanged during recovery. No application mutation, production database query/write, seller account creation, live provider connection, real order, outbound message, paid service, publication or main merge was performed. Only new preparation-branch git objects, planning Issues/Milestones and a Draft PR are authorized outputs.

GitHub CI is configured; successful execution must be read from actual run evidence. Existing #2 documents pre-runner startup failures; current browser also shows an account billing warning. Neither cause nor runner success is assumed. No billing/permissions settings were changed. Main is unprotected: this report does not claim settings-enforced protection. A Draft PR and explicit manual approval policy are the current boundary; no automatic transition or merge mechanism exists.

**Decision requested later, not now:** review the Draft PR and blockers. No Codex handoff until the owner gives final explicit approval. Failed/blocked checks must be resolved or specifically reviewed as scope-limited risks; they are not hidden behind a green documentation check.

## Published draft and remote verification

[Draft PR #16](https://github.com/borvat/borvat-global-marketplace/pull/16) remains draft, unmerged, with no auto-merge. Snapshot commit `c417d7e53666f86858fa815134235cffd53ea999`: all **663 local files match GitHub blob hashes**, with 665 repository blobs including two unchanged inherited main documents. Recursive tree is not truncated; zero mismatches. This is byte-level import evidence, not functional E2E.

[CI run 39679615135](https://github.com/borvat/borvat-global-marketplace/actions/runs/39679615135) completed with **startup_failure**, before usable test execution. Exact account/runner cause is not established. Local check results are reported separately and do not stand in for this failed run. No payment/billing/permissions change was attempted. REMOTE-VERIFICATION.json contains the observed remote state.

Main and Lovable source SHA were rechecked unchanged. Seven milestones and stage Issues #6–#12 exist, with blockers #13–#15; no Codex assignment/dispatch was made. This evidence addendum changes documentation only.
