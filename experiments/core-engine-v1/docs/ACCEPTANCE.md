# Phase 0 Acceptance Plan

## Baseline checks
- [ ] Select and pin MercurJS release/commit; verify license and package licenses.
- [ ] Record deployment architecture, resource estimates, security risks and budget.
- [ ] Bootstrap app in isolated staging and verify repeatable build.
- [ ] Run unit, integration, and security scans without live customer data.

## Commerce acceptance scenario (staging only)
- [ ] Create 3 isolated vendors.
- [ ] Import 30 synthetic product records.
- [ ] Create one canonical product with 2 independent seller offers.
- [ ] Complete a synthetic checkout including products from at least 2 vendors.
- [ ] Verify order-splitting behavior, stock reservations, commission rules and refunds.
- [ ] Verify vendor A cannot access vendor B information by API or UI.
- [ ] Verify platform operator permissions, audit log and cancellation idempotency.

## Global readiness gates
- [ ] EU legal entity, currency and VAT tests.
- [ ] Syria market configuration and local payment/legal feasibility review.
- [ ] Arabic/RTL, English and Dutch localization checks.
- [ ] Shipping, payouts, reconciliation, data retention and backup/restore tests.
- [ ] No production launch until independent security and operational readiness sign-off.

**Current result:** NOT RUN / NOT VERIFIED.
