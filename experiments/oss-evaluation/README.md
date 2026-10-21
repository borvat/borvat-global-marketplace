# Isolated OSS evaluation — no application replacement

These are evaluation harnesses and synthetic fixtures, not deployed services. They do not start Codex. No real account, payment provider, SMTP, warehouse, accounting or SAM connection is configured. Read the test report before running. Candidate packages and checked-out upstream code stay outside the existing application.

`vendure/evaluate.ts` boots actual Vendure 3.8.0 with its upstream educational multivendor plugin and sql.js. The plugin must be extracted unchanged from commit e53fb43 (full SHA in pins.json), preserving its GPL/commercial license, into `vendure/upstream-multivendor`. This third-party source is deliberately not vendored into BORVAT. The harness imports it only for this experiment. Treat the harness's combined GPL-linked use/distribution as GPLv3-compatible pending legal review; no proprietary distribution permission is implied. All other third-party packages retain their own licenses. Test code authored here may be used in this repository's evaluation; the repository has no new blanket license grant for recovered application code.

`mercur/independent.spec.ts` is placed under the pinned Mercur checkout's `integration-tests/http/borvat`. It runs real REST middleware/workflows against a disposable local Postgres database. Existing upstream selected specs are run unchanged. The default payout provider is simulated; PAID is not a bank fact. Medusa Enterprise RBAC/SSO flags remain disabled; no paid feature is enabled.

`current-core/capture-rollback.test.ts` is copied into an isolated copy of `experiments/core-engine-v1/tests`. It injects a SQL failure after a simulated successful provider effect and intentionally fails the durability invariant. It never performs a financial transaction. The original archived experiment remains unchanged.

Use Node 24.19.0 and Bun 1.3.8. Provision local disposable PostgreSQL normally as a non-root account or container on a dedicated loopback port. Never use existing databases. The runner creates/drops schemas and databases, so URL validation is mandatory. See `REPRODUCE.md`. No workflow automatically installs or runs these candidate servers.
