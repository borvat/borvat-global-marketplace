# Final Blocker Resolution & Engineering Readiness

Basis: owner-accepted PR #20 at `44228fbf911b83e108a69183ea1ab18d5d8d878a`. Existing source/research artifacts are inherited, not re-uploaded. Mercur remains the preferred candidate; **the project is not yet eligible to begin unrestricted C1 implementation**, even after a generic approval. Close the remaining foundation/security evidence gaps and obtain approval tied to the reviewed SHA and precise stage scope. No Codex was launched.

## Closed in this isolated candidate

| Finding | Evidence | Limit |
|---|---|---|
| H07 installed dependency mismatch | [Runtime preflight](evidence/runtime-preflight.json), [clean install](logs/clean-install.log), native H07 | A clean frozen install loads Framework 2.21.2 → Express 4.22.3 → proxy-addr 2.0.8. Dirty workspace symlinks caused the prior mismatch. Do not reuse installed folders or certify from lock content alone. |
| H06 deletion after lost response; H08 SQL finalization fault | [Native patch](../../experiments/blocker-resolution/patches/H06-native-retention.patch), [28 passing native tests](logs/native/test.log) | Committed pending record is retained, caller cannot override provider key, explicit ambient transactions rejected. Recovery record retention is fixed; full native reconciliation and all other money routes are NOT closed. |
| Job command gateway scope | [10 passing PostgreSQL tests](logs/payment/jobs.tap) | Proof gateway rejects foreign company/resource, buyer/admin impersonation, revoked membership and duplicates, with atomic effect+audit. Not certification of every native job/subscriber. |
| Isolated BORVAT TypeScript | [Typecheck exit 0](logs/borvat/typecheck-exit.json) | Uses the previously supplied narrow Supabase type patch in a formatted sandbox; original source remains unchanged. |

## Remaining blockers

| Blocker | Current fact | Required closure |
|---|---|---|
| Native full payment recovery | H06 retention passes. Separate payment schema has [24 passing crash/concurrency/recovery tests](logs/payment/test.tap) and [logical restore](logs/payment/restore.json). Native replay business key, provider lookup/reconciliation, full process-crash recovery, capture/refund paths and implicit transaction contexts remain unproven | Wire a durable operation coordinator to every native financial entry point; test real PostgreSQL rollback, lost responses, restart, lease takeover and no second external effect with a synthetic provider. Never retry by creating a fresh payout. |
| Critical/high dependencies | [Actual installed traversal](evidence/reachability.json): 777 package nodes, 14 affected package/version instances on dependency paths from backend roots, eight unresolved edges. Graph presence is not request-path exploitability | Resolve unknowns and classify actual runtime/import/request/build exposure. [Four dependency trial tests](logs/http-trial-tests.tap) pass and that small graph's [audit](evidence/http-trial-audit.json) reports zero, but candidate pins are NOT promoted into native Mercur. Whole-workspace critical tar/Storybook and remaining high advisories are not waived. |
| Native job authorization | Module services still trust privileged callers. Current job proof protects only its own typed gateway | Inventory every native subscriber/job/workflow/MCP ingress. Persist trusted actor/company and recheck current authority before effect. Prevent native direct service bypass; attach negative tests to each real entry point. |
| BORVAT assets/build | [Fresh retry](evidence/asset-retry.json): 401 original preview, 404 public URL, binary connector text lossy; 0 recovered, 69 missing. [Build fails](logs/borvat/build.txt) on hero.jpg | Recover exact bytes from authorized original export/object source. Do not invent assets, change imports to placeholders or claim a successful build. |
| BORVAT lint | [Isolated result](evidence/borvat-lint-summary.json): 156 errors / 25 warnings, down from prior diagnostic 174 errors / 25 warnings after safe formatter autofix. 152 explicit-any, 3 empty catch, 1 prefer-const errors remain | Apply typed boundaries and review catch behavior without disabling rules or treating generated formatting as functional certification. Preserve original source. |
| Native operations / restore | Proof restore and failed proof migration rollback pass; Mercur full schema backup/PITR, compatible upgrade, sustained load and cross-system E2E not run | Disposable native backup/restore and upgrade rehearsal with measured recovery objectives, followed by all required acceptance paths. No production migration authorized. |
| 35 end-to-end cases | Baseline statuses remain authoritative; no complete journey was promoted to PASS | Execute full scenarios on the reviewed integrated candidate, with synthetic data and evidence review. |

## Verification and source integrity

[Run receipt](evidence/run-receipt.json) records baseline SHA, exact upstream/runtime versions, patch SHA256 and lock SHA256. New source/patch/log hashes are in [manifest](evidence/manifest.json). Native suite: **28 pass, zero fail/skip**; no claim that the prior 86-test suite was rerun on this clean installation. Separate scopes: 24 payment regressions, 10 new worker gateway tests and four dependency component tests pass. These counts must not be added to prior runs as unique full-marketplace coverage.

Native build passes with telemetry disabled and outbound networking blocked. One earlier build follow-up was rejected by automatic approval review for Vercel telemetry; the safer rerun disabled telemetry and used the loopback-only guard successfully. A lab-only tsconfig exclusion ignores leftover renamed node_modules backup folders; no business source is excluded. Reproduce on a fresh checkout rather than keeping backups inside source. The original root-only PostgreSQL startup-host limitation remains documented in the approved report; app roles are not superusers. No production host readiness is inferred.

GitHub Actions billing is out of scope: `HOSTED_CI_BLOCKED — ALTERNATIVE_VERIFICATION_REQUIRED`. No billing repair or repeated Actions rerun was attempted. Local evidence independently verifies test execution, while completion requires hash review, scoped acceptance and owner review. See [future tasks](FUTURE-TASKS.md) and [recovery plan](RECOVERY.md).

## Readiness and cost

Recommendation: **retain Mercur as candidate; HOLD final foundation and C1 execution**. H07 and native record-retention counterexamples are resolved within the isolated candidate. Dependency exposure, complete native financial recovery, native job coverage, missing assets/build and operational/E2E evidence remain release/foundation blockers. Preparing these patches does not approve migration from BORVAT or allow Codex to start.

The prior 10–20 engineering-day hardening reserve remains a planning range, not a completion guarantee. Apply dependency upgrades in small verified groups; native financial integration and unrecoverable source access can increase the range. No paid service or live provider was used. Original application and archived experiment source hashes remain unchanged.
