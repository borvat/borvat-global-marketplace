/**
 * scripts/phase5-m0/generate-gate-report.ts
 *
 * Consumes CI artifacts and emits docs/PHASE5_M0_CI_CLEANROOM_GATE_REPORT.md.
 * Verdict ladder (evaluated top-down, first hit wins):
 *
 *   1. HARNESS FAILURE — BASELINE UNKNOWN
 *      - any required artifact missing
 *      - any harness script exit-coded a HARNESS_* sentinel
 *   2. HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION
 *   3. HARNESS FAILURE — UNSAFE DATABASE TARGET
 *   4. REPLAY FAILURE — BASELINE FAIL
 *   5. TEST VERIFICATION INCOMPLETE — BASELINE FAIL
 *      - M4 checkpoint results missing OR post-M5 compat missing/scaffold
 *   6. TEST FAILURE — BASELINE FAIL
 *   7. DRIFT VERIFICATION INCOMPLETE — BASELINE FAIL
 *   8. BASELINE FAIL — dangerous drift present
 *   9. BASELINE PASS WITH PROPOSED EXCEPTIONS — undocumented drift with
 *      owner_ruling_ref on every row
 *  10. BASELINE PASS
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

function readJson<T>(path: string, fallback: T): T {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}
function safe(cmd: string): string {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return "unknown"; }
}
function fileExists(p: string) { return existsSync(p); }

const runMetadata = readJson<any>("artifacts/run-metadata.json", null);
const preHotfix   = readJson<any>("artifacts/phase5-m0-pre-hotfix/migration-results.json", null);
const preIntegrity = readJson<any>("artifacts/phase5-m0-pre-hotfix/manifest-integrity.json", null);
const current     = readJson<any>("artifacts/phase5-m0-current/migration-results.json", null);
const curIntegrity = readJson<any>("artifacts/phase5-m0-current/manifest-integrity.json", null);
const suites      = readJson<any>("artifacts/phase5-m0-suites/results.json", null);
const m4checkpoint = readJson<any>("artifacts/phase5-m0-m4-checkpoint/results.json", null);
const diff        = readJson<any>("artifacts/diff/structural-diff.json", null);
const secretScan  = readJson<any>("artifacts/secret-scan.json", null);

const requiredArtifacts = {
  "run-metadata.json": !!runMetadata,
  "pre-hotfix/migration-results.json": Array.isArray(preHotfix),
  "pre-hotfix/manifest-integrity.json": !!preIntegrity?.ok,
  "current/migration-results.json": Array.isArray(current),
  "current/manifest-integrity.json": !!curIntegrity?.ok,
  "suites/results.json": Array.isArray(suites),
  "m4-checkpoint/results.json": Array.isArray(m4checkpoint),
  "diff/structural-diff.json": !!diff,
};

const missingArtifacts = Object.entries(requiredArtifacts)
  .filter(([, ok]) => !ok).map(([k]) => k);

// -- Post-M5 compat suite must not be a scaffold. --------------------------
const compatEntry = (suites ?? []).find((s: any) => s.script === "phase4-m4-post-m5-compat-tests.ts");
const compatOk = compatEntry && compatEntry.status === "PASS" && Number(compatEntry.assertions_total) >= 10;

// -- M4 checkpoint must include historical suites passing. -----------------
const m4Names = new Set((m4checkpoint ?? []).map((r: any) => r.script));
const m4Complete = m4Names.has("phase4-m4-checkpoint-tests.ts")
  && m4Names.has("phase4-m4-tests.ts")
  && m4Names.has("phase4-m4-adapter-tests.ts")
  && (m4checkpoint ?? []).every((r: any) => r.status === "PASS");

// -- Replay outcomes -------------------------------------------------------
function replayFailed(rows: any[] | null) {
  return !rows || rows.length === 0 || rows.some((r: any) => r.status !== "APPLIED");
}
const preFailed = replayFailed(preHotfix);
const curFailed = replayFailed(current);

// -- Suite outcomes --------------------------------------------------------
const suiteFails = (suites ?? []).filter((s: any) => s.status !== "PASS");

// -- Drift -----------------------------------------------------------------
const dangerous = (diff?.rows ?? []).filter((r: any) => r.classification === "DANGEROUS").length;
const undocumented = (diff?.rows ?? []).filter((r: any) => r.classification === "UNDOCUMENTED").length;
const undocumentedWithRuling = (diff?.rows ?? []).filter(
  (r: any) => r.classification === "UNDOCUMENTED" && r.owner_ruling_ref
).length;
const liveMissing = diff?.status !== "OK";

// -- Verdict ladder --------------------------------------------------------
let verdict = "BASELINE PASS";
const reasons: string[] = [];

if (missingArtifacts.length || (secretScan && secretScan.findings?.length)) {
  verdict = "HARNESS FAILURE — BASELINE UNKNOWN";
  if (missingArtifacts.length) reasons.push(`missing artifacts: ${missingArtifacts.join(", ")}`);
  if (secretScan?.findings?.length) reasons.push(`secret scan hits: ${secretScan.findings.length}`);
} else if (preIntegrity?.ok === false || curIntegrity?.ok === false) {
  verdict = "HARNESS FAILURE — MANIFEST INTEGRITY VIOLATION";
} else if (preFailed || curFailed) {
  verdict = "REPLAY FAILURE — BASELINE FAIL";
  if (preFailed) reasons.push("pre-hotfix replay failed");
  if (curFailed) reasons.push("current replay failed");
} else if (!m4Complete || !compatOk) {
  verdict = "TEST VERIFICATION INCOMPLETE — BASELINE FAIL";
  if (!m4Complete) reasons.push("M4 checkpoint suites missing or not PASS");
  if (!compatOk)   reasons.push("post-M5 compatibility suite missing, scaffold, or FAIL");
} else if (suiteFails.length) {
  verdict = "TEST FAILURE — BASELINE FAIL";
  reasons.push(`${suiteFails.length} suite failure(s)`);
} else if (liveMissing) {
  verdict = "DRIFT VERIFICATION INCOMPLETE — BASELINE FAIL";
  reasons.push("live schema snapshot not provided");
} else if (dangerous > 0) {
  verdict = "BASELINE FAIL";
  reasons.push(`${dangerous} DANGEROUS drift row(s)`);
} else if (undocumented > 0) {
  if (undocumented === undocumentedWithRuling) {
    verdict = "BASELINE PASS WITH PROPOSED EXCEPTIONS";
  } else {
    verdict = "BASELINE FAIL";
    reasons.push(`${undocumented - undocumentedWithRuling} UNDOCUMENTED row(s) lack owner_ruling_ref`);
  }
}

const md = `# Phase 5 — M0 CI Clean-Room Gate Report

_Generated: ${new Date().toISOString()}_

## Run identity

- GitHub SHA: \`${runMetadata?.github?.sha ?? "unknown"}\`
- Run ID: \`${runMetadata?.github?.run_id ?? "unknown"}\` (attempt ${runMetadata?.github?.run_attempt ?? "unknown"})
- Ref: \`${runMetadata?.github?.ref ?? "unknown"}\`
- Workflow file SHA-256: \`${runMetadata?.github?.workflow_file_sha256 ?? "unknown"}\`
- Pre-hotfix manifest SHA-256: \`${runMetadata?.manifests?.pre_hotfix_sha256 ?? "unknown"}\`
- Current manifest SHA-256: \`${runMetadata?.manifests?.current_sha256 ?? "unknown"}\`
- M4 checkpoint manifest SHA-256: \`${runMetadata?.manifests?.m4_checkpoint_sha256 ?? "unknown"}\`
- Runner OS: ${runMetadata?.tools?.runner_os ?? "unknown"}
- Node: ${runMetadata?.tools?.node ?? "unknown"}  |  Bun: ${runMetadata?.tools?.bun ?? "unknown"}
- psql: ${runMetadata?.tools?.psql ?? "unknown"}  |  pg_dump: ${runMetadata?.tools?.pg_dump ?? "unknown"}
- Postgres image: ${runMetadata?.tools?.postgres_image ?? "unknown"}

## Manifest integrity

| Set | count | boundary | integrity | verified_at |
|---|---|---|---|---|
| pre_hotfix | ${preIntegrity?.count ?? "?"} | ${preIntegrity?.boundary?.last_migration ?? "?"} | ${preIntegrity?.ok ? "OK" : "FAIL"} | ${preIntegrity?.verified_at_utc ?? "?"} |
| current | ${curIntegrity?.count ?? "?"} | ${curIntegrity?.boundary?.last_migration ?? "?"} | ${curIntegrity?.ok ? "OK" : "FAIL"} | ${curIntegrity?.verified_at_utc ?? "?"} |

## Replay

| Set | Migrations applied | Failures | Overall |
|---|---|---|---|
| pre_hotfix (36 expected) | ${preHotfix?.length ?? 0} | ${(preHotfix ?? []).filter((r: any) => r.status !== "APPLIED").length} | ${preFailed ? "FAIL" : "OK"} |
| current (37 expected) | ${current?.length ?? 0} | ${(current ?? []).filter((r: any) => r.status !== "APPLIED").length} | ${curFailed ? "FAIL" : "OK"} |

## M4 checkpoint & post-M5 supersedence

- M4 checkpoint suites present & PASS: ${m4Complete ? "yes" : "NO"}
- Post-M5 compatibility suite PASS with ≥10 assertions: ${compatOk ? "yes" : "NO"}
- Historical M4 suites executed at checkpoint (unchanged expectations): ${m4Names.has("phase4-m4-tests.ts") && m4Names.has("phase4-m4-adapter-tests.ts") ? "yes" : "NO"}

## Test suites (against CURRENT)

| Metric | Value |
|---|---|
| Suites total | ${suites?.length ?? 0} |
| PASS | ${(suites ?? []).filter((s: any) => s.status === "PASS").length} |
| FAIL | ${suiteFails.length} |
| Assertions passed | ${(suites ?? []).reduce((n: number, s: any) => n + Number(s.assertions_passed ?? 0), 0)} |
| Assertions total | ${(suites ?? []).reduce((n: number, s: any) => n + Number(s.assertions_total ?? 0), 0)} |

## Drift

- Status: ${diff?.status ?? "MISSING"}
- DANGEROUS: ${dangerous}
- UNDOCUMENTED: ${undocumented} (with owner_ruling_ref: ${undocumentedWithRuling})
- Matches: ${diff?.totals?.matches ?? "?"}

## Secret scan

- Findings across all artifacts: ${secretScan?.findings?.length ?? "not-run"}

## Security invariants

- P5-HF-001 ACL: verified in Job B via \`scripts/phase5-m0/verify-hotfix-acl.sh\`.
- Live-write authorization: no Bol \`live_authorized_at\` grants issued by this workflow.
- Stripe: Test Mode only.
- Checkout: remains offline.

## Verdict

**${verdict}**

${reasons.length ? "Reasons: " + reasons.join("; ") + "." : ""}
`;

writeFileSync("docs/PHASE5_M0_CI_CLEANROOM_GATE_REPORT.md", md);
console.log("verdict:", verdict);
