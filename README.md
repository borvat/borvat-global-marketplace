# BORVAT Global Marketplace

Development is authorized under the owner's 2026-10-23 mandate. The application is **not ready for production sales**. Work continues from PR #26, preserving the existing product, source history and authoritative WMS/Accounting boundaries.

Current implementation and evidence: [integration report](docs/commerce-integration/REPORT.md), [delivery plan](docs/commerce-integration/DELIVERY-PLAN.md) and [reviewed original-source changes](docs/commerce-integration/source-changes.json). Earlier foundation reports remain historical evidence for their exact snapshots, not the current implementation mandate.

## Application and verification

Use Node 24 and Bun 1.3.13. Install `apps/marketplace` using `bun install --frozen-lockfile --ignore-scripts`. Its original Bun lock and dependency declarations are retained; do not silently adopt the archived stale/regenerated npm locks.

- `npm run commerce:build:isolated`: full original TanStack Start/Vite/Nitro application, explicit isolated mode, disposable Node server profile, no credential files or outbound network.
- `npm run commerce:build:default`: same application with isolated mode off, Node verification target. This is a build profile check, not a release.
- `npm run commerce:test:unit`: isolated route/dispatch, real router URL-boundary and buyer-reader regressions.
- `npm run commerce:test:browser`: original built app SSR and real browser journey. Requires `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `BROWSER_EVIDENCE_DIR`; optional browser library/font paths are documented in the report. The harness starts and stops its own loopback server.
- `npm run commerce:source-review`: verifies every recovered original text against either its immutable recovery hash or an explicitly recorded changed hash.
- `npm run foundation:check` and `npm run test:foundation`: historical reference/policy checks. They do not approve a release.

The original `source:check` remains an exact recovery-parity check and fails on intentional source evolution; it has not been weakened or rewritten. `source:require-complete` additionally fails on the 69 missing original binaries. A successful full app build does not satisfy asset parity. No replacement image is represented as an original.

The default application retains its original backend/authentication flows and disabled checkout. The isolated build uses synthetic products and disposable memory only; it creates no real orders, stock movements, payments, invoices or financial entries. Do not point legacy migration/test scripts at a hosted database.

## Repository map

| Path | Purpose |
|---|---|
| `apps/marketplace` | Recovered original BORVAT application plus bounded reviewed implementation |
| `scripts/commerce-integration` | Full-app build, HTTP/browser and source-evolution verification |
| `docs/commerce-integration` | Current mandate, delivery plan, acceptance limits and evidence |
| `experiments/commercial-application` | Earlier standalone commercial preview and retained regression tests |
| `experiments/core-engine-v1`, `experiments/product-completion` | Preserved prototypes; not production APIs |
| `docs/mission03`, `docs/architecture` | Requirements, original acceptance specifications and architectural contracts |
| `docs/source-recovery`, `docs/execution` | Immutable recovery provenance and retained release/financial foundation gates |

Final financial-engine adoption, complete native acceptance, original media, actual provider contracts, security/professional review and operational launch remain open. No main merge, deployment, paid service or live financial activation is performed by this milestone.
