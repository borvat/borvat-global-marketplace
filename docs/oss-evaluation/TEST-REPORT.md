# Independent execution evidence

## Scope and isolation

Both candidates ran actual upstream backend code, not reimplementations with matching names. All fixture identities are synthetic and all payment outcomes are local fakes. Runtime Node code was preloaded with `scripts/foundation/no-external-network.mjs`; that guard rejects non-loopback fetch/http/socket connections and known privileged environment variables. It is a test harness guard, not a hardened sandbox for hostile code. No service credentials, SMTP, hosted database, production application, provider sandbox account or real seller was used. Preparation downloaded public source/packages; runtime network scope was local.

Mercur was built from release SHA 57fa9cf7de35829ce493a3ace29deb4f36d0838b with Bun 1.3.8, frozen upstream lock and Medusa 2.21.2. Only core and its build dependencies were built; full storefront/admin browser testing was not performed. Its CLI defaults to a moving canary routes manifest. The successful build used a loopback HTTP copy of the manifest generated from the pinned checkout/dependencies; no canary code was imported. Generated route types changed as build output; backend source was not patched.

PostgreSQL 17.6 ran in disposable data directories bound to 127.0.0.1; test server and test client were launched in the same command environment. This host maps only OS uid 0 and forbids setuid/Unix sockets. A test-host-only first-call `geteuid` shim allowed initdb/Postgres startup; Unix sockets were disabled. This is a portability limitation and is not a production recipe or a change to SQL/transaction/RLS semantics. Use an ordinary non-root PostgreSQL account/container in repeatable CI. No identity shim was applied to Node or marketplace code. The current core's application role was explicitly NOSUPERUSER/NOBYPASSRLS; see `logs/current-app-role.txt`.

Vendure ran published `@vendure/core` and `@vendure/testing` 3.8.0 with the release-pinned educational plugin, sql.js 1.13.0, a real loopback GraphQL server, and own synthetic CSV. Its bootstrap was bound to 127.0.0.1. No actual connected PSP SDK was used.

## Mercur selected suites

| Suite | Passed | Skipped | Relevant behavior |
|---|---:|---:|---|
| Vendor auth | 1 | 0 | Seller identity registration |
| Vendor seller APIs | 72 | 0 | Membership, profile operations, restricted fields and cross-seller object scopes |
| Offer/cart | 11 | 2 | Offer pricing, forged client price rejection, missing offer, stock limits and quantity multiplier |
| Offer/order | 7 | 0 | Seller splits, offer links, reservations, fulfill/cancel inventory, return receipt restock |
| Split-order payments | 13 | 0 | Capture shares, capture replay, foreign seller denial, refund/over-refund and cancellation shares |
| Commission calculation | 8 | 0 | Rule specificity, currency fixed amounts, shipping and idempotent commission lines |
| Payout module service | 4 | 0 | Row-before-provider call, idempotency key propagation, provider failure and processing status |
| Offer promotions/cart | 7 | 0 | Seller-scoped promotions and refresh/split-order behavior |
| **Selected upstream total** | **123** | **2** | 8 suites; exit 0; 200.751 seconds |
| BORVAT independent M01–M04 | **4** | **0** | Anonymous/customer denial, own-read positive control, foreign read/write denial, forged seller context denial; exit 0 |

These are 127 passing tests plus 2 skipped across the principal runs. An additional 1-case auth setup smoke passed; it is a repeat and not added to the count. Existing upstream fixtures use synthetic USD/US examples in several suites; they do not validate NL VAT, EUR settlement or DAC7. Payout tests replace provider calls with local spies/fakes. Real bank settlement and network failure reconciliation remain untested.

The two upstream skips are intentional historical behavior changes: one offer is preselected per variant/cart, and seller SKU is read via the offer rather than overwriting variant SKU. We did not enable obsolete assertions to inflate a failure count. BORVAT must test server-side seller/offer switching and SKU presentation against its own contract before adoption. We added four independent REST isolation probes; M04 originally expected 401/403, but source and response showed a typed membership rejection at HTTP 400. The corrected assertion requires both 400 and the precise membership-denial message and absence of offer data. This is a harness expectation correction, not a permission change.

## Vendure independent prototype

V01–V12 and V15 passed: seller registration/assignment, foreign product/order read denial, anonymous admin denial, cart pricing, stock quantity cap, seller shipping selection, fake split payment/fee, forged channel denial, foreign product write and refund denial, and over-refund rejection. V13 passed local fulfillment through Shipped and Delivered after assigning synthetic stock to the correct seller location. V14 passed the observed limitation: refund state is Pending because the example has no refund implementation. That is not a completed refund.

**V16 FAIL:** the unmodified educational plugin hardcodes a 20% shipping tax argument, while the BORVAT NL fixture requires 21% for this synthetic standard-rated scenario. This is an adaptation/configuration failure for BORVAT, not proof that Vendure cannot handle NL VAT. Final result: **15 PASS / 1 FAIL**, process exit 1. sql.js does not establish PostgreSQL locking/concurrency or production migration performance. No carrier action or PSP settlement happened.

## Current BORVAT code

The recovered Lovable app was not modified. Its earlier 3 buyer helper tests pass, but the app's clean build/type/lint blockers and 69 missing binaries persist. The separate archived `core-engine-v1` was copied unchanged into an isolated directory, installed with its existing npm lock and tested against new PostgreSQL databases. **37 PASS**, including non-owner RLS, self-approval denial, last-unit contention, immutable ledger attempts, money/pricing and multivendor checkout. This is new verification of that archived engine, not integration with the storefront or proof about the hosted Supabase database.

An independently authored fault probe adds a SQL trigger that aborts the PAID update *after* a provider object records a successful local capture effect. The transaction then rolls back. Evidence: **1 simulated external effect, 0 persisted orders, 0 payments, 0 idempotency keys**. The durability invariant fails, exit 1. This demonstrates a missing durable intent/reconciliation boundary; it does not prove a real PSP double charge. A provider honoring its idempotency key may prevent a retry charge, but the database still loses its recovery record. Original experiment source was preserved; the failing test was not fixed or weakened.

## Limits and diagnostics

Earlier setup attempts failed because a tag checkout left untracked files from a newer checkout, the CLI wanted a canary manifest, and the Medusa test helper treats a literal `127.0.0.1` DB host as SSL while `localhost` disables that option. Clean pinned source, a pinned local manifest, fresh disposable data directories, `DB_HOST=localhost`, and telemetry disabled produced the saved successful runs. Those setup errors are not counted as upstream feature failures. The raw current fault and Vendure business-fit failures are preserved.

NOT_RUN: full application/browser E2E, all upstream suites, actual PSP sandbox/webhooks, production database inspection/migration, three connected Surooh APIs, penetration testing, comparative load tests, PITR restore, legal approval, complete production SBOM reachability triage, all 35 BORVAT acceptance cases. No test result changes their status. Evidence file hashes are recorded in `evidence/manifest.json`.
