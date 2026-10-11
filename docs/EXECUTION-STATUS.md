# Execution ledger — BORVAT Marketplace

2026-10-10

## Verified
- GitHub repository borvat/borvat-global-marketplace is private.
- Development branch feature/mercur-foundation exists.
- Mercur upstream README and LICENSE inspected via GitHub connector.
- Mercur MIT copyright holder: Rigby, 2025.
- Official project bootstrap command in README: `bun create mercur-app@latest my-marketplace`.
- Local execution environment has Node.js 22 and Git, but no Bun and no DNS access to github.com.
- A guarded local bootstrap script is version-controlled for execution on a suitable machine.

## Not verified / not done
- Mercur source code has NOT been imported into this repository.
- Bootstrap has NOT run. There is NO successful build, tests, or storefront.
- No PostgreSQL/Redis server, staging environment or paid resources have been provisioned.
- No actual seller-order isolation or settlements have been verified.
- No deployments, merges, payments or production integrations.

## Required evidence for next gate
- Record exact upstream package version/commit, license file, runtime versions and dependency lock.
- Installer transcript with credentials redacted.
- Build and test outputs, 3 vendor / 30 product evidence, authorization-negative tests.
- Separate staging DB and Redis identifiers with no production credentials.
- Security, costs and operational approval before any publish.

Do not label this phase LIVE_PROVEN without logs and a running environment.
