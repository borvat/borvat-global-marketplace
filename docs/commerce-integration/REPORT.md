# Original BORVAT application — commerce integration

The commercial journey previously ran in a separate createRoot preview. It now runs inside the recovered application's actual TanStack Start router, root shell, QueryClient and SSR server, using the same synthetic commercial adapter. The isolated runtime supports discovery, product/offer selection, cart, requests and the seller/admin workbench. Default mode keeps the original backend/authentication flow and hard-disabled checkout.

**Tested implementation commit:** `15fe1c65e37a936922cea831fbddaad24c380069`, parent PR26 `bd08f17eede382d4cd7e997d1a5b52a0573918b2`. All 29 changed/new implementation and governance blobs were checked against GitHub's tree, then remained byte-identical during the final verification. Publication of this report/evidence changes no application source.

Owner mandate and delivery tracking: [Issue #28](https://github.com/borvat/borvat-global-marketplace/issues/28), [delivery plan](DELIVERY-PLAN.md), BOR-DEC-161. This is an implemented engineering milestone with open release dependencies, not certification of the full marketplace or financial foundation.

## Result and fixes

- Original Bun 1.3.13 frozen installation succeeded: 567 packages. No dependency version, registry source, Bun lock or npm lock was substituted. Prior WMS package/runtime blockers were not retried or reclassified.
- The original public hero image uses its original `/images/hero.jpg` URL instead of a compile-time import. This removes the unresolved-import build failure; it does not recover the image, replace it, or satisfy visual/media parity.
- One original-router navigation adapter owns pushes/replacements, including query filters, country, offer selection and back/forward. The root owns HTML/head metadata and there is one main landmark. A provider creates synthetic state per application/SSR request rather than a process singleton.
- An eager auth-email SDK factory used to throw `Missing Lovable API key` while importing the route tree. Construction is now request-scoped. A missing configuration yields service-unavailable at that endpoint, while the storefront can render. Configured production verification/dispatch still belongs to the existing SDK; it was not activated or certified here.
- Explicit isolated mode rejects write/API dispatch before the framework handles it and avoids original backend auth effects. Its purpose is to test the real application with synthetic services. A route whitelist is not claimed as the production authorization system.
- Full-project TypeScript no longer hits the original buyer-account generated-client recursion: a narrow query callback preserves the verified buyer filter, newest-first ordering and three-row limit. The old structural reader stays supported and its original tests pass.
- Actual 320px testing exposed a product-offer grid minimum-width overflow. A minmax single-column grid, shrinkable card/fieldset/content and word wrapping fix it. Existing design, business rules and demo labels are retained.

## Executed acceptance

| Check | Result and scope |
|---|---|
| Original configuration build, canonical Cloudflare target | PASS; actual original Vite/TanStack/Nitro configuration, no deployment |
| Full application Node verification profiles | PASS for isolated and default mode |
| Default-mode HTTP | PASS: `/discover` 404, unconfigured email POST 503, no provider credentials |
| Isolated HTTP | PASS: buyer GET/HEAD works; account/MCP GET 404; write/email POST 405 before dispatch |
| Full app TypeScript | PASS, exit 0 |
| Scoped ESLint | PASS: 0 errors / 0 warnings in the eight current commercial/runtime/route/test files; not a whole-legacy-app lint claim |
| New integration tests | 4 PASS: isolated dispatch, actual router URL escape rejection and narrow buyer reader |
| Retained commercial/email regression | 37 PASS: 28 commercial/navigation/static tests plus 9 original email renderers; no email delivered |
| Original buyer reader regression | 3 PASS with Bun; total relevant functional tests: 44 |
| Original-app browser | PASS at 1440, 390 and 320px: real routed search/filter/sort, keyboard selection/focus/skip-link, exact offer-ID cart, retained state across routes, back/forward, reload reset, seller edit/stale-cart invalidation, request submission, empty/unknown product/path and separate buyer contexts |
| SSR without JavaScript | PASS: original HTML, country/lang and one main landmark before hydration; hydrated runs report zero page/hydration errors and zero attempted external requests |
| Original-source evolution review | PASS: 487 original texts unchanged + 12 explicitly hashed edits = 499; recovery manifest unchanged |
| Exact old recovery-parity / asset check | EXPECTED NONZERO: named original texts evolved; all 69 original binaries still missing |
| Historical C1 release gate | HOLD, exit 1, unchanged; development delegation is not financial-foundation/release acceptance |

Exact final argv, cwd, exits, hashes and unchanged-source check are in [commands.json](evidence/commands.json). Default/canonical build logs and HTTP results supplement the final isolated run and are bound to the same application-source snapshot. Sixteen final screenshots and the SSR HTML are in `evidence/browser`. The SHA256 manifest covers the published evidence; a hash never substitutes for acceptance.

Developmental failures are retained as an original build log and the pre-fix mobile overflow diagnostic. The initial SSR missing-key exception was observed during this stage, not presented as a separate exact-clean baseline acceptance. Browser provisioning needed system fonts; the harness also changed synchronous radio assertions to wait for actual asynchronous router state, retaining the keyboard/checked/URL assertions. No failed test was relabeled as a pass. Historical diagnostic files are not current-run results.

## Reproduce

Install the existing frozen app lock with Bun 1.3.13, then use Node 24. `npm run commerce:build:isolated` builds the complete original app with a disposable Node target and no environment files/credentials. `npm run commerce:test:unit` runs the four new isolated tests. For the 37 retained regressions, run `python3 experiments/commercial-application/prepare-local.py`, then `node --import tsx --test tests/*.test.tsx` inside that lab. Run `bun test scripts/buyer-account.test.ts` inside the app for the three original tests.

For browser acceptance set `PLAYWRIGHT_MODULE` to the installed Playwright-core module, `CHROMIUM_PATH` to a real headless Chromium executable and `BROWSER_EVIDENCE_DIR` to a fresh result directory, then run `npm run commerce:test:browser`. The tested runtime used Playwright-core from the primary runtime and Chromium 138.0.7204.0 from `@sparticuz/chromium@138.0.2`, `CHROMIUM_FONTS=/etc/fonts`, with its extracted library folder in `CHROMIUM_LIBS`. These are disposable test tools, not new application dependencies. The harness owns its loopback server, uses a credential-free environment and stops the process on completion.

`npm run commerce:build:default` plus `node scripts/commerce-integration/http.mjs default` verifies mode-off behavior on Node. The canonical deployment build uses the original config with no Nitro target override; it was built offline, not deployed. Source review runs separately with `npm run commerce:source-review`; do not update the immutable recovery manifest to manufacture a parity pass.

## Remaining delivery and rollback

All commerce state in this milestone is synthetic and reload-disposable. No durable authenticated order journey, actual native WMS/Accounting integration, stock reservation, tax acceptance, payment/refund/payout, carrier booking, customer data import, email delivery or production readiness is established. Original authenticated routes and configured email delivery remain untested live. Full load, comprehensive accessibility, screen-reader and original-media visual parity are open. Existing build deprecation/chunk-size warnings remain; no performance budget is certified.

The 69 original binaries, actual catalog/media provenance, native endpoints/runtime acceptance and financial/provider/operator decisions remain dependencies. No original media was recovered from Library search. Existing native financial/security foundation findings and all 35 full end-to-end scenarios retain their prior status. WMS, Accounting, SAM, production data, hosting, permissions and paid services were not changed. No Actions rerun, merge or deployment occurred.

Rollback discards this unmerged branch or reverts its bounded implementation commit. No migration or production data correction is needed. Next slice is M1 in the delivery plan: canonical owned catalog/read contracts and real portal adaptation, preserving one stock and one accounting authority.
