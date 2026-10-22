# Synthetic commercial browser continuation — 2026-10-22

Real Chromium interaction now passes for the existing commercial workbench at 1440, 390 and 320 CSS pixels. This is a browser-validation follow-up to Draft PR23, not C1 acceptance or full original application readiness. No application business code changed. All original source and missing-media disclosures remain intact.

Tested commit: `f37a41e` (full SHA in evidence/receipt.json), based on `2d665f2b14e0e489f1b1be9f713c51ef81b190cf`. Test checkout was clean before and after execution. This later evidence publication commit is documentation only. Current owner authorization permits Codex functional continuation and isolated tests; it does not grant merge, deploy, production, security work, or stage acceptance. Existing gate records are preserved.

## Executed

- Chromium 154.0.8037.57, Playwright Core 1.58.2: three complete viewport cycles PASS. Search/empty results/category/price sort, two-seller cart and quantity edit, disabled payment, request creation, both shops preparing, invalid seller price, draft/review/publish, immutable requested price, reset and reload. Screenshots of catalog/cart/request/seller/admin accompany every viewport.
- Zero page errors, zero attempted external requests, no horizontal document overflow at each captured state. Screenshots are synthetic data only. One 320px admin screenshot was visually inspected; this is not comprehensive visual parity or accessibility certification.
- 22 commercial adapter/static React tests PASS. Preview Vite build PASS. Foundation/reference check PASS. Original source parity: 499/499 text hashes match, 69 original binaries unresolved.
- C1 gate remains HOLD (exit1). No full application build, email renderer suite, TypeScript or lint rerun is claimed in this continuation.

The initial browser harness failed because the seeded review fixture and new offer matched the same button selector. The corrected harness targets the changed offer; the original pending review remains. Its failure summary is retained. A final unit command initially used repository cwd and failed alias resolution; the unchanged tests passed with the documented experiment cwd. Both logs and exits are retained. Neither failure was a product defect or suppressed assertion.

## Runtime and reproduction

The fresh whole-app `npm ci --ignore-scripts` did not complete and was terminated (143). Instead, a separate disposable runtime installed the preview's public packages at versions pinned in the existing package-lock, plus tsx4.20.6 and Playwright Core1.58.2. All resolved runtime versions are recorded. Application manifests/locks are unchanged. This does not establish authoritative whole-app dependency installation. No denied private package URL was rewritten or retried.

Use the existing preview README to link a suitable local Vite/tsx runtime and start its loopback server on127.0.0.1:4178. Then, from repository root:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
CHROMIUM_PATH=/absolute/path/to/chromium \
BROWSER_EVIDENCE_DIR=/absolute/fresh/output \
node experiments/commercial-application/browser-cycle.mjs
```

The harness blocks non-loopback browser requests and exercises only the explicit synthetic adapter. It does not connect WMS/Accounting, send email, create real orders, activate payment, or reserve stock. Successful React client mounting is shown; SSR hydration is not exercised by this createRoot preview.

## Paired continuation and remaining gates

Git and connector access verified WMS `e668ed35d0d0f37286b50e8ae787dc2a40fa7256` and Accounting `34adb0e16be584b5e3823b2cb46a80abb5eaf869`. Their differences from prior tested sources are documentation/evidence only. Their shared native authority contracts are byte-identical (SHA256 `01c792be997043eea23630d436242415bf55ac8543edfe17fe3919bf81d2c8b6`). ERPNext remains the sole physical quantity/reservation/valuation/GL owner; this demo creates only channel request state.

WMS frozen Bun install exited1 on HTTP403 from the lockfile's Lovable package cache. No access bypass attempted. WMS units:91 PASS,2 loader errors/failures; the full109 result was not reproduced. WMS foundation25, atomic evidence gate7, verification gate14 passed. Accounting foundation check, foundation25, reference arithmetic28 and verification gate14 passed; reference checks are not native financial proof.

Native browser lifecycle remains BLOCKED: locked WMS packages are inaccessible and this isolated environment lacks the marked pinned ERPNext/Frappe16.52.0/Python3.14/MariaDB11.8.9/Redis runtime. Browser presence alone cannot close that gap. Smallest prerequisite: permitted read access to those exact dependency artifacts (or owner-reviewed complete runtime) and a disposable pinned native test runtime. No native security/isolation tests were retried.

C0/C1, WMS PREPARATION/P01, Accounting M1, non-root security isolation and Dutch professional review remain separate gates. No competing newer PR continuation was found at the access check. SAM checkout was untouched. No merge/deploy/production/Render/billing/credential/permission change or Actions rerun. Rollback: discard this additive test/evidence branch.
