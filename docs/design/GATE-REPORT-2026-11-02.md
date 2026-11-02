# Delivery gate report — BORVAT storefront redesign (2026-11-02)

Branch `design/premium-storefront-20261102` · HEAD at the time of the run: `8fc614a`
Run: `vlab gate --config C:/Users/Zulik/verification-lab/gate.config.borvat-storefront.json`
Machine report: `C:/Users/Zulik/verification-lab/out/gate-borvat-storefront-2026-11-02T04-51-09-699Z.json`

## Verdict: BLOCKED — stage 4 (security review)

Every stage that the redesign could pass passed. The single blocker is a secrets scan that
flags four **pre-existing** credential-shaped literals in files this branch never touched.

| # | Stage | Result | Evidence |
|---|---|---|---|
| 1 | Implementation (syntax/build) | PASS | `tsc --noEmit` clean on the branch |
| 2 | Automated tests | PASS | 27/27 (commerce-integration, catalog-contract, shopping-flow) |
| 3 | Browser E2E | PASS | 2/2 playwright tests, `console: 0 total, 0 non-resource` |
| 3.1 | Accessibility | PASS | axe 0 serious/critical, 0 minor/moderate |
| 3.2 | Performance | PASS | perf 90, CLS 0.000, LCP 1345ms, TBT 122ms, a11y 100, SEO 100 |
| 4 | Security review | **FAIL** | 7 checks pass, 4 high findings (below) |
| 5 | GitHub | N/A | branch pushed, no PR opened |
| 6 | Deployment | SKIPPED BY SCOPE | owner mandate: no deploy |
| 7 | Live verification | SKIPPED BY SCOPE | owner mandate: no deploy |
| 7.1 | Persistence (local restart) | N/A | external app, the gate does not own its process |
| 7.2 | Persistence (live) | SKIPPED BY SCOPE | no published target in scope |
| 8 | Owner acceptance | N/A | the owner has not looked at this build yet |

What stage 4 confirmed: CSP, `x-content-type-options`, `x-frame-options`, `referrer-policy`
present on the served response, both authorization probes answered as declared, 830 tracked
files scanned.

## The four high findings, read line by line

| File | Line | What it is |
|---|---|---|
| `apps/marketplace/scripts/phase5-m0/scan-artifacts-for-secrets.sh` | 40 | the scanner's own detector pattern `'private-key-block\|-----BEGIN [A-Z ]*PRIVATE KEY-----'` — a regex, not a key |
| `apps/marketplace/scripts/redaction-tests.ts` | 14 | a `SECRET` constant holding a synthetic 41-character string — the fixture that proves redaction works (value masked here: the report must not reproduce it) |
| `experiments/core-engine-v1/scripts/e2e-http.sh` | 10 | a `PASSWORD` assignment for the local demo buyer account (value masked) |
| `experiments/oss-evaluation/vendure/evaluate.ts` | 22 | an inline synthetic seller password in the evaluation harness (value masked) |

`git log -1` for all four paths: `c417d7e` / `b277aff`, both 2026-10-22, before this branch.
`git log origin/work/inventory-single-writer..HEAD -- apps/marketplace/scripts experiments` is empty:
this branch modified none of them.

## Smallest path to a green verdict

1. Preferred: teach `scripts/gate.mjs` a documented `security.secretsIgnore` list (path + line +
   reason) and list these four, since three are fixtures and one is the detector itself. That is a
   change to the verification lab, not to the product, and it needs your approval.
2. Or move the two marketplace fixtures behind a `.fixtures/` path the scanner already treats as
   test data, and leave the two experiment files alone until the experiments are archived.
3. Neither option touches the redesign.

## Reproduce

```bash
# app (WSL), served on 4173
wsl -d Ubuntu -- bash -c 'cd ~/dsgn && node scripts/commerce-integration/build.mjs isolated'
wsl -d Ubuntu -- bash -c 'cd ~/dsgn/apps/marketplace && PORT=4173 node .output/server/index.mjs &'
# gate
vlab gate --config C:/Users/Zulik/verification-lab/gate.config.borvat-storefront.json
```

Two traps found while running this gate, worth keeping:

- A server process left over from an earlier build keeps serving an HTML whose asset hashes no
  longer match the rebuilt files; every `/assets/*.js` then answers 500 and the page renders but
  never hydrates. Kill the process on the port and confirm one asset returns 200 before running.
- The gate requires its `local.port` to be free even in `external` mode, so the app port and the
  config port must differ (4173 app / 4174 config here).
