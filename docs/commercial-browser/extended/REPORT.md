# Bounded synthetic UI follow-up — 2026-10-22

This is the current follow-up on Draft PR24, superseding earlier claims that the PR changes no application code. The original report and evidence remain historical. No new project or native integration was created.

## Reproduced defects and fixes

1. Reset demo left an unsaved seller price (`17.00`) visible after restoring the adapter price (`749.00`). Reset now remounts only offer editors through a local reset counter, discarding their unsaved input. Before-fix assertion: `reset-before.json`.
2. Selecting a cart quantity and pressing Backspace converted the empty string to zero and removed the line. An empty edit now remains local input state; typing a replacement commits it through the existing adapter, while blur restores the last valid quantity. Explicit removal and the adapter's existing quantity validation remain intact. Before-fix browser observation: `quantity-before.json`.

Only the existing commercial workspace component changed. No price/quantity authority, adapter rules, original design, production route, payment activation, database, inventory or financial ledger changed. All499 original imported text hashes still match; the commercial workspace is the later PR23 addition.

## Exact final verification

Tested source: `f9dc58c545d964b2676f677133ae34a48d73445b`. The checkout was clean before and after the complete run. Later publication adds documentation/evidence only. See `evidence/receipt.json` for argv, cwd, actual exits and log hashes.

| Check | Result |
|---|---|
| Real Chromium cycles at1440/390/320px | PASS, all original cases plus11 extended scenario groups at each width |
| Extended coverage | Valid/stale cart removal, stale-cart submission block, return-to-draft, republish/reprice, double-click submit/prepare, Tab/Shift+Tab/Enter/Space view navigation, reset unsaved price, reload saved drafts/cart, keyboard quantity replacement/blur/invalid-value handling |
| Browser observations | Zero page errors/external requests; no horizontal overflow at captured states;24 screenshots |
| Commercial adapter/static React tests |22 PASS, exit0 |
| Strict commercial TypeScript | PASS, exit0; `tsconfig.browser.json` inherits compiler settings and scopes to commercial code/tests, excluding unrelated email tests |
| Changed component lint | PASS, exit0, zero errors/warnings; existing ESLint configuration |
| Scoped preview build | PASS, exit0 |
| Foundation and original source parity | PASS, exit0;499 text files match,69 binaries still unavailable |
| C1 gate | HOLD, exit1; existing reasons unchanged |

Before-fix reproduction used an uncommitted extended harness against the unchanged pre-fix component; it is development evidence, not clean-commit acceptance. The final clean run includes both regressions and the complete original browser cycle. The intermediate fixed run passed before final assertions for blur/invalid quantity/stale removal were added; only the final receipt is the complete current acceptance evidence.

Interruption means browser reload of documented disposable memory state. Repeated operations mean actual UI double-clicks with no duplicate request/preparation. These do not prove HTTP retries, persistence, crash recovery, stock reservations or financial idempotency. Keyboard checks cover the named controls, not comprehensive accessibility certification. This createRoot preview does not test SSR hydration or the full original application.

## Reproduce

Use the original preview README to link an installed local runtime and start Vite on127.0.0.1:4178. The browser command remains the one in `../REPORT.md`; choose a fresh evidence directory. From `experiments/commercial-application`, run:

```sh
node --import tsx --test tests/commercial.test.tsx
node node_modules/typescript/bin/tsc --project tsconfig.browser.json --noEmit
```

Runtime versions are recorded separately here. Scoped TypeScript/ESLint tools were installed into the existing disposable tools directory at versions from Marketplace's package-lock. No repository manifest/lockfile or WMS registry was changed. The prior whole-application install remains incomplete. Email tests, full build and full application lint/typecheck were not rerun.

## WMS/Accounting handoff — unchanged blockers

WMS stays at `e668ed35d0d0f37286b50e8ae787dc2a40fa7256`; Accounting stays at `34adb0e16be584b5e3823b2cb46a80abb5eaf869`. Neither repository was edited or retested during this follow-up. Their shared native authority contract remains unchanged.

The previous WMS frozen install exited1/HTTP403 for locked artifacts, including `@supabase/supabase-js@2.117.2`, `@tanstack/react-start@1.168.60`, and `@lovable.dev/cloud-auth-js@1.2.1`, under `https://europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/`. It was not retried, rerouted or bypassed. This is a remote access denial; underlying cause unknown, no automatic approval-review rejection.

Next environment action: owner/environment administrator provides permitted access to the exact locked artifacts or a reviewed complete runtime, plus a marked disposable pinned native environment: ERPNext/Frappe16.52.0 with matching original archives/extracted sources, Python3.14.8, MariaDB11.8.9, Redis7.0.15, Node24.19.0/Bun1.3.13, configured native dependencies, fresh synthetic sites/databases/storage and available loopback ports14306/17379/18080/18081. Chromium is available but must be configured explicitly in the native harness. No permissions or credentials were changed here, and provisioned runtime would not itself clear security-isolation gates.

Previous independent checks remain exactly as reported: WMS foundation25/atomic evidence7/verifier14 PASS; units91 PASS with2 module-loading failures. Accounting foundation consistency and foundation25/reference28/verifier14 PASS. No native tests ran in either continuation. Native warehouse lifecycle, native financial values and interrupted native actions remain BLOCKED/NOT_RUN. Marketplace full build still requires authorized original assets. C0/C1, PREPARATION/P01/M1, separate security and Dutch accountant gates remain held.

No SAM, merge, deployment, production, paid services, Render, emails, credential/permission changes, blocked security work or Actions reruns. This bounded follow-up ends with the tested fixes and evidence. Rollback: revert the functional/test commit on this continuation branch or discard the unmerged PR.
