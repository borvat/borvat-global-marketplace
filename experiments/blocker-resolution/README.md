# Final blocker resolution — isolated preparation

Basis: approved `44228fbf911b83e108a69183ea1ab18d5d8d878a`. Do not re-import existing files. No Codex execution or production integration is authorized.

## Native H06/H07

Use a **fresh disposable** Mercur checkout at `57fa9cf7de35829ce493a3ace29deb4f36d0838b`. Restore the package.json and Bun lock from the already-reviewed `docs/hardening/evidence/four-overrides-candidate-*.gz` into that checkout only. Use Bun 1.3.8 / Node 24.19.0, run `bun install --frozen-lockfile --ignore-scripts` with no old node_modules in any workspace. Backups must live outside the checkout: core's broad tsconfig include otherwise traverses renamed dependency folders. Never perform this on BORVAT/Lovable production.

Run `node <foundation>/experiments/blocker-resolution/verify-runtime.cjs <disposable-mercur>`; it verifies Framework 2.21.2 → Express 4.22.3 → proxy-addr 2.0.8 and IPv4/mapped-IPv6 boundaries. Failures are blocking even when a lock scanner looks clean.

Apply `patches/H06-native-retention.patch` with `git apply` in the disposable pinned checkout. Copy native/*.spec.ts into integration-tests/http/borvat. Build using a loopback server for the pinned CLI routes manifest, with TURBO_TELEMETRY_DISABLED=1, DO_NOT_TRACK=1, MEDUSA_TELEMETRY_DISABLED=true and the repository loopback-only network guard preloaded. Then run the three native suites listed in the receipt, in-band on fresh local PostgreSQL. Raw native tests need the upstream integration fixture, not the proof schema.

H06 retains the precommitted PENDING payout, pins provider idempotency to that record and refuses explicit ambient transactions. H08 injects a PostgreSQL UPDATE trigger failure after the synthetic provider success. H09 verifies the transaction guard. **No automatic retry method is added:** reconciliation must load the same durable operation, look up provider facts and finalize; blindly calling createPayouts again creates a new operation. No guarantee is made for implicit transaction managers, process crash across the whole native workflow, native refund/capture paths, or deletion by other privileged services. Those remain acceptance work.

## PostgreSQL payment/worker proof

`reproduction/run-resolution-payment.py` extends the approved isolated payment harness. It needs the original lab layout (or BORVAT_LAB_ROOT / BORVAT_FOUNDATION_ROOT), PostgreSQL 17.6 binaries and the documented host-only startup shim. It starts fresh local main/provider databases with NOSUPERUSER/NOBYPASSRLS application roles, runs the existing 24 payment tests and logical restore, then jobs/jobs.test.mjs. It never connects to a provider account. Restore remains proof-schema logical restore, not a Mercur backup/PITR certificate.

The job prototype is a dedicated PostgreSQL command gateway: fixed operation, queue-time resource/company check, current membership checked again under lock during execution, atomic effect+audit and SKIP LOCKED dispatch. Server-only authenticated context sets actor/company; untrusted payloads cannot select them. The SQL role is a trusted backend role, not a browser login. Native Mercur subscribers/jobs are **not** replaced or declared secured by these ten tests.

## Dependency trial

`dependency-trial`: run `npm ci --ignore-scripts`, then Node with the repository network guard and `--test trial.test.mjs`; `npm audit --json` records this small graph only. compression 1.8.2, axios 1.20.0 and tar 7.5.22 are compatible in four isolated transport/archive probes. These are proposals, **not installed into Mercur**. Full-graph advisory reachability and the native upgrade regression gate remain open.

## Local evidence gate

`node experiments/blocker-resolution/verify-evidence.mjs --hashes-only` checks every new evidence hash. Without that flag, it returns HOLD while any readiness blocker or owner-review condition is outstanding. GitHub remains source/review authority; hosted CI stays `HOSTED_CI_BLOCKED — ALTERNATIVE_VERIFICATION_REQUIRED`. No automatic stage advancement, merge, deployment or paid infrastructure is available here.
