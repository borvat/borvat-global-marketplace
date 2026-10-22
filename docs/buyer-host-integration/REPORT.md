# Buyer host-navigation boundary and interrupted-read recovery

This bounded follow-up starts at PR25 head `888f7822cd35ed365a3231c4d054d608e5a8f940`. Final tested source: `cf3f6a1803ca3703269c87d36044b19ff3f304c9`, clean before and after verification. Later publication is documentation/evidence only. Prior branches and all499 original imported text hashes remain unchanged.

## Actual milestone

The buyer view previously wrote browser history and synthesized popstate events directly. It now accepts a `BuyerNavigation` port: stable location subscription/snapshot, initial location and a navigation callback. `createHostBuyerNavigation` forwards push/replace requests to the host and suppresses identical current-location clicks. All buyer links, filters and embedded cart navigation use the same injected port. The existing standalone preview supplies its browser-history implementation by default; no runtime dependency was added.

An isolated host fixture proves ownership by preserving its own history metadata through real buyer clicks, back/forward and replace updates. The fixture is explicitly **not TanStack or the original application**. This is the independently feasible integration boundary, not full router integration. The original root, generated route tree, header and routes remain unmounted and untouched for the reasons in [DEPENDENCIES.md](DEPENDENCIES.md).

The new reader-boundary tests also reproduced a functional defect: a reader that throws synchronously blanked the UI with two page errors and no retry control. Promise normalization now routes synchronous failures through the existing visible error/retry state. It checks cancellation before invoking a superseded reader. Before-fix observations are preserved in `reader-before.json`; they used an uncommitted development fixture against the pre-fix reader handling, not an exact-clean acceptance candidate.

## Final verification

| Check | Result |
|---|---|
| New isolated-host Chromium flows | PASS at1440/390/320px: pending-read navigation, repeated link without duplicate history, host metadata retention, filter replace, back/forward, stale cart, out-of-order obsolete read ignored, keyboard focus and synchronous failure/retry recovery |
| Affected buyer-route browser regression | PASS at all3 widths; regression evidence, not newly delivered functionality |
| Commercial/route/navigation tests |28 PASS:26 retained plus2 new host-port contract tests |
| Strict commercial TypeScript | PASS exit0; scoped config expanded to new fixture/tests |
| Scoped lint | PASS exit0; zero errors/warnings |
| Preview build / foundation / original text parity | PASS exit0;499/499 imported texts unchanged |
| Asset gate | FAIL exit1;69 original binaries unresolved |
| C1 gate | HOLD exit1, unchanged |
| Original TanStack mount/build/SSR hydration/auth/backend | NOT RUN; blocked prerequisites, not simulated as acceptance |
| Native WMS/Accounting and prior standalone workbench browser loop | NOT RUN in this milestone; no unrelated repeat |

The new race fixture intentionally ignores AbortSignal and resolves an older captured catalog after the latest one. It cannot resurrect the moderated offer or move the current cart route. Navigation during a pending read, a stale cart blocked from submission, removal, repeated same-route clicks and browser traversal all use the existing adapter and rendered UI. This is not persistence, native inventory retry or financial-ledger proof.

Twelve host screenshots are published, with receipts, exact commands/exits, log hashes and both browser summaries. The24 buyer regression screenshots remain local; previous stage images are not relabeled as new work. Both suites report zero page errors and attempted external requests. Host screenshots verify one main landmark and no horizontal overflow; keyboard route focus was exercised. No comprehensive accessibility or screen-reader certification is claimed.

## Reproduction

Use the existing installed runtime and loopback Vite preview. Run `host-browser.mjs` with the same `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and fresh `BROWSER_EVIDENCE_DIR` environment arguments documented for the prior buyer harness. Its test entry is `host-navigation.html`; it mounts no original router/backend. All other final commands are in `evidence/receipt.json`. No dependencies, registries, package locks, credentials or permissions changed.

The smallest next prerequisite is an authorized original-media export and a reviewed complete pinned application runtime, followed by a narrowly scoped decision to adapt original root/header/router/service boundaries while accounting for the imported-source parity change. Do not solve missing dependencies by rerouting denied downloads or connecting production. See the dependency map for the exact boundaries.

No real orders/payment, second stock/financial ledger, WMS/Accounting/SAM modifications, live provider, security-settings change, blocked security retry, purchases, merge, deployment, Render change or external sends. No new access denial occurred. The prior WMS cache403 was not retried. C0/C1/PREPARATION/P01/M1 and separate security/accountant gates remain HOLD. Rollback: discard this unmerged branch or revert its bounded functional commit.
