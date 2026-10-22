# BORVAT NL/BE Buyer Discovery and Offer Journey

Bounded synthetic functional stage, based on PR24 head `161211aae6d43164d1cd3842a5a4d44f89e007fb`. No project duplication or C1 transition. Exact final tested source: `bed52d55d81b41784bdc9bb3f3e0082a8e37c387`. Later publication contains documentation/evidence only. The checkout was clean before and after final checks.

## Delivered

The existing local preview now opens a BORVAT buyer journey at `/` or `/discover`: search/category/price sorting → `/product/:productId` → explicitly selected seller offer → `/cart` → optional local `/requests`. URL query state carries search/category/sort/NL-or-BE country and the selected offer on product routes. Real links, browser back/forward and direct product entry work; an absolute preview entry script fixes nested-path loading. No original route, auth client, wishlist or backend cart is mounted.

The new presentational component reuses original UI primitives, colors and `formatEur`, with a read-only injectable `CatalogReader` and the **same** existing commercial demo adapter. Product ID, offer ID and seller ID stay distinct; the selected offer ID is the cart command key. Seller edits from `/workbench` invalidate the same buyer offer/cart. Cart/request presentation reuses `CommercialWorkspace` with optional embedded navigation; the standalone workbench and its prior input fixes remain available.

NL/BE use explicit `nl-NL`/`nl-BE` document-language seams, Dutch text and EUR formatting. Country selection does not promise service coverage, shipping or fiscal completion. French translation is explicitly unavailable. Catalog and competing sellers are visibly fictional; no real owner catalog was imported. Missing images are text-only unavailable states, never generated assets or the productImage SVG fallback. New buyer views show no ratings, delivery-date/payment/return promises or bol assets.

Loading, empty, recoverable read-error, unknown-product, unknown-route and stale/foreign selected-offer states are implemented. The separate `buyer-states.html` test entry injects delayed/empty/failing local readers; the normal entry always uses the demo reader. It is not an error switch or remote integration in the normal buyer flow. `AbortSignal` cleanup prevents obsolete reads from updating an unmounted/replaced effect. Cart-only changes retain the current catalog DOM while refreshing the projection.

## Verification and evidence

| Check | Final result |
|---|---|
| Routed buyer Chromium journeys | PASS at 1440/390/320px; click/keyboard selection, back/forward/reload/deep links, filters/country, exact offer cart ID, local request route, stale moderated offer/cart removal, unknown/empty/loading/error-retry states |
| Existing workbench browser regression | PASS at all three widths, including earlier reset/quantity fixes and repeated actions; only entry URL changed to `/workbench` |
| Commercial/domain/static React tests | 26 PASS (22 retained plus4 new identity/route/locale/projection cases) |
| Strict commercial TypeScript | PASS, exit0; unchanged strict options, scope expanded to new code and injected-state test entry |
| Scoped ESLint | PASS, exit0, zero errors/warnings for affected TS/TSX files |
| Scoped Vite preview build | PASS, exit0; does not build the original full app |
| Foundation consistency | PASS, exit0 |
| Imported source parity | PASS, exit0,499/499 original text hashes unchanged |
| Required asset gate | FAIL, exit1:69 original binaries unresolved |
| C1 gate | HOLD, exit1; status/reasons not modified |

`evidence/receipt.json` records exact argv/cwd/exits/log digests and source cleanliness. Twenty-four buyer screenshots and both browser result summaries are published. The workbench's24 regression screenshots remain local with its full run; they are not republished as new buyer screenshots. All captured buyer states have no horizontal overflow and one main landmark. Both suites recorded zero page errors and zero attempted external browser requests. Browser routing/landmarks/labels/native radios, skip link and keyboard focus were exercised; this is not full WCAG or assistive-technology certification. A mobile product-detail screenshot was visually inspected. No bol visual comparison or pixel-perfect claim.

Development included a local JSX tag typo during editing, caught and corrected by Prettier before compilation/browser acceptance; no product or final check failure was hidden. First routed development run passed. Final source then received one complete buyer run and one affected workbench regression run. Historical PR24 failure evidence is preserved unchanged.

## Local reproduction

Use the existing permitted installed runtime and `experiments/commercial-application/README.md` to link dependencies and start Vite on `127.0.0.1:4178`. No dependency download is needed in this environment. From repository root:

```sh
PLAYWRIGHT_MODULE=/absolute/playwright-core/index.mjs \
CHROMIUM_PATH=/absolute/chromium \
BROWSER_EVIDENCE_DIR=/absolute/fresh/output \
node experiments/commercial-application/buyer-browser.mjs
```

The retained `browser-cycle.mjs` now opens `/workbench`. From the experiment directory: `node --import tsx --test tests/commercial.test.tsx tests/buyer-discovery.test.tsx` and `node node_modules/typescript/bin/tsc --project tsconfig.browser.json --noEmit`. Exact other commands and runtime versions accompany this report. Repository package/lockfiles and installed dependencies were not changed in this stage.

## Limits and authority

This is the existing **synthetic createRoot preview**, not the original TanStack application, SSR hydration or native integration. It stores no durable orders, inventory reservations, physical movements, invoices, GL or valuation. Reload intentionally clears demo data. Example availability is unchanged fixture information; no second stock or financial ledger exists. Original company/store/product/SKU semantics and imported code are untouched; the demo seller IDs are not real company/store mappings. WMS remains authoritative for quantities/reservations/movements; Accounting/native ERPNext owns invoices/credits/GL/valuation. The read adapter is an injection seam, not an approved production API.

The original69 assets and authoritative full dependency installation still block full-app readiness. WMS's prior locked-cache HTTP403 was not retried; no alternate registry, lockfile, credentials or permission change occurred. Its required pinned disposable native runtime remains unavailable, and neither WMS nor Accounting was changed or retested. C0/C1/PREPARATION/P01/M1, security isolation and professional Dutch accounting review remain separate unchanged gates.

No SAM work, real catalog/customer import, bol/API activity, external sends, paid calls, backend/business writes, production/Render changes, merge, deployment or Actions rerun. This stage ends at its Draft PR. Rollback: discard the unmerged branch or revert the bounded functional commit; the original application and databases require no rollback.

See [next-stage roadmap and channel constraints](ROADMAP.md). Those steps require their own reviewed scope; none are silently activated here.
