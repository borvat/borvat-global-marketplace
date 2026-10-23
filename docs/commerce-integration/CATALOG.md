# Canonical catalog continuation — 2026-10-23/24

This advances M1 in the original application; it does not close M1 or the marketplace goal.

## Implemented behavior

`catalog-contract.ts` defines `borvat.catalog.v1`: distinct canonical product, SKU/variant/pack, company, store and merchant offer IDs. Competing offers share a SKU; a company may own multiple stores. An entire import is parsed before publication. Duplicate entity IDs, broken relationships, unknown fields/version/mode, invalid integer EUR prices, invalid pack counts, duplicate countries/authority references and unlicensed/non-HTTPS media declarations reject. A rights-reference string is required metadata, not independent proof of ownership.

The contract is deliberately **synthetic-memory-only**. It is not a production PIM importer. WMS and Accounting references are optional, owner-supplied external identities, with no inferred native mapping, availability ledger, reservation or financial write. Current fixtures have empty native references and no media.

The pure paged read projection selects only published destination-eligible offers; product visibility and minimum-price sorting follow those eligible offers. Paging is deterministic with an ID tie-breaker and a bounded page size. Cursors bind revision, destination, query, category, sort and limit; mismatched/stale cursors reject. Cursors are offsets, not signed security credentials. Authentication, authorization, freshness and upstream revision assignment remain the responsibility of a future server adapter. Paging is tested at the read boundary; the current nine-item UI retains its existing discovery controls rather than claiming a remote paginated catalog.

`readDemoCatalog` now validates and maps the canonical rehearsal projection before delivering detached products/offers to the original buyer screen. Abort is honored. Existing offer IDs, routes, cart commands and immutable request price snapshots remain stable. Seller store choices now come from the validated store collection instead of two hardcoded option IDs. The role selector remains an explicitly labelled demo, not authenticated seller authorization. Multiple SKU/pack relationships are contract-tested. PR #31 adds buyer selection across available SKUs with a clearly synthetic two-item pack fixture; revisions remain process-local identities for immutable fixture arrays, not durable native catalog revisions.


## PR #31 buyer SKU/pack follow-on

The original buyer detail flow now selects a canonical SKU/variant/pack, then displays only published offers attached to that SKU. The selected SKU travels with the detail route and clears when leaving the product. Cart quantity is explicitly a number of packs; the local demo request snapshots SKU ID, variant, pack quantity and price. State survives buyer SPA route transitions in one browser tab and resets on full reload. A synthetic two-item pack makes the path visible in the preview; its price and availability are demonstration values, not source-system claims.

Validation on PR #31: 11 marketplace commerce/catalog tests and the isolated original-app build pass on the free Render preview. Browser verification selected the two-item pack, added it to cart, navigated to cart with state intact, and saved DEMO-0001 with the pack identity and price. No payment, stock reservation, WMS/Accounting write, or durable order is involved. See [PR #31](https://github.com/borvat/borvat-global-marketplace/pull/31) for the preview and exact tested commit. This does not claim remote pagination, full regression certification for this follow-on, or production acceptance.

## Verification on this continuation

- 10 integration/catalog tests PASS (six new contract/workflow tests and four existing integration tests).
- 37 retained commerce/navigation/email-render regressions PASS. The old array-reference assertion now explicitly requires equal, detached validated data; the contents and downstream cart/moderation assertions remain enforced.
- Full original application TypeScript PASS; scoped five-file ESLint PASS with no output.
- Original app isolated Node client/server build PASS.
- Actual original-app Chromium SSR/hydration, 1440/390/320px buyer navigation, seller editing, moderation/cart invalidation, request submission, reload and separate-context cycle PASS. No page/hydration errors or attempted external requests. All 16 fresh screenshots and results are retained.
- Nine foundation tests and bounded original-source review PASS. The immutable source/asset and C1 release gates remain unchanged and unresolved.

Commands, raw logs, source hashes and screenshot hashes are in `catalog-evidence/manifest.json`. The initial retained-regression invocation from repository root failed module alias resolution; the corrected invocation runs from the existing experiment directory and passed. Only the corrected final raw regression log is retained; the initial diagnostic was overwritten. That failed harness attempt is not counted as a passing run. No dependency/version/lock change was made.

## Actual integration dependencies inspected

Read-only inspection of WMS PR25 at `cf8af30d052f5cf5e4fad083555423a36764a9cc` found a native ERPNext projection restricted to `TEST-A`, plus local evidence reporting 29 native checks PASS and browser acceptance blocked. The WMS native projection includes native item IDs/UOM/components and orders/movements, not a merchant-owned commercial PIM with verified products/media/offer prices. Its internal native stock/valuation output must not be copied into a writable marketplace ledger.

Read-only inspection of Accounting PR32 at `db8c3b91c16f34b4c8f9e207d76b7c95335869e9` found a bounded native invoice workbench and published native/HTTP/browser/worker proof. That workbench explicitly excludes quotes, credits, payments, returns and stock updates. These are improvements over earlier dependency evidence; neither repository is production-complete, and their evidence does not certify a BORVAT integration. Both repositories were left unchanged.

The next native slice needs an owned catalog export with explicit SKU/company/store mappings and an isolated authenticated WMS/Accounting endpoint contract/runtime. No configured endpoint, owned export or credentials was introduced or inferred from fixture IDs. Server-side seller authorization, durable orders, provider sandbox lifecycle, media recovery and full native/release acceptance remain open. Financial foundation acceptance remains separate.

Rollback: discard/revert this unmerged continuation. No migration, production data or provider action was made; PR #31 uses a separate free Render preview and does not target production.
