# BORVAT Global Marketplace — Independent OSS Foundation Evaluation

**Decision proposed, not adopted: option 1 — Mercur core plus Surooh extensions; preserve the BORVAT user experience. Owner approval PENDING. Codex, replacement, production changes, main merge and deployment remain disabled.**

Evaluated 22 October 2026, using four pinned open-source alternatives and the recovered BORVAT application/archived commerce experiments. Mercur and Vendure were selected for actual local prototypes because Mercur has a native product/offer/seller model, while Vendure offers an independent TypeScript architecture with seller/channel APIs. Medusa alone needs a custom marketplace layer; Saleor adds a Python/GraphQL runtime and custom seller settlement/onboarding work. Mercur and Medusa share a lineage and are not two independent safety signals.

| Evidence executed | Result | What this establishes |
|---|---|---|
| Mercur 2.3.7 selected upstream integration suites | 123 PASS, 2 SKIPPED; 8 suites, exit 0 | Seller object scoping, offers/cart pricing, inventory reservations, split payments/refunds, commissions and provider-boundary behavior on disposable PostgreSQL |
| BORVAT-authored Mercur isolation probes | 4 PASS, exit 0 | Anonymous/customer actor denial, cross-seller read/write denial and forged seller-header rejection |
| Vendure 3.8.0 independent GraphQL prototype | 15 PASS, 1 FAIL | Core multivendor flows work with educational plugin and fake payment; NL shipping configuration fails the BORVAT fixture |
| Existing archived BORVAT core engine | 37 PASS, exit 0 | Real PostgreSQL RLS, approval, pricing, last-unit contention, checkout and ledgers in this separate experiment |
| Additional BORVAT core fault injection | 1 FAIL, exit 1 | Simulated successful external capture is followed by SQL rollback, leaving zero durable order/payment/idempotency records |

No result certifies the original 35 acceptance scenarios. They remain NOT_RUN. No live or sandbox PSP account/API was used; all payment effects are local simulation. These are limited experiments, not production certification or a comparative load test.

Read [comparison](COMPARISON.md), [test report](TEST-REPORT.md), [licenses/security](LICENSES-SECURITY.md), [TCO model](TCO.md), [reuse/integrations](REUSE-INTEGRATIONS.md), [ADR-005](../architecture/ADR-005-oss-foundation-selection.md), and [conditional phase plan](../execution/OSS-REVISED-PLAN.md). Machine-readable results, exact pins, source file hashes and logs are under `evidence/` and `logs/`. Reproduction inputs are under `experiments/oss-evaluation`.

The recommendation does not authorize a replacement. If the owner rejects it, retain the current snapshot and use option 2 as the fallback after resolving its independently reproduced payment durability failure. Option 3 is unsupported: narrow passing tests do not show that our incomplete marketplace is superior to the alternatives.

Remote review: Draft PR [#20](https://github.com/borvat/borvat-global-marketplace/pull/20) targets the preparation branch. First evidence commit b277aff was verified against 55 local blob hashes with no mismatch and no original application/experiment change. GitHub Actions [run 39684087121](https://github.com/borvat/borvat-global-marketplace/actions/runs/39684087121) stopped at startup_failure with zero jobs; local passes are not GitHub CI success. No billing or permission change was attempted. See evidence/remote-verification.json.
