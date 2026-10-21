# ADR-005 — Prefer Mercur core with Surooh extensions; preserve BORVAT UX

Date: 2026-10-22. **Status: PROPOSED / OWNER DECISION PENDING. Recommendation: option 1. Not adopted, implemented or authorized for Codex.** Supersedes ADR-003's deferral of evaluation only if the owner accepts this ADR. ADR-002 source preservation remains in force. Existing apps and experiments remain untouched.

## Context and evidence

BORVAT needs canonical products with competing seller offers, separated buyer/member identities, approved sellers, reservations, order lifecycle, commissions and provider-based settlements. Existing UI and Supabase code are reusable but checkout is disabled, several dashboards use demo values and source/build parity remains blocked. The archived core now passes 37 PostgreSQL tests, but an independent post-capture SQL-failure probe leaves no durable recovery record. Its success-path tests do not justify an end-to-end product superiority claim.

Four pinned OSS alternatives were inspected: Mercur 2.3.7, Medusa 2.22.0, Vendure 3.8.0 and Saleor 3.23.44. Actual isolated prototypes ran Mercur (123 upstream cases plus 4 independent isolation cases passed; 2 upstream cases skipped) and Vendure (15 passed, 1 NL shipping configuration failure; fake refund remains Pending). Sources, exact commits, commands, JSON results, scanner results and limits are in `docs/oss-evaluation`. No real PSP or production data was touched.

## Proposed decision

Choose **option 1: adopt Mercur OSS core as the future commerce foundation and build Surooh-owned extensions/adapters above it**, preserving the BORVAT TanStack/React experience and useful business invariants. This is a direction for an owner-approved later implementation, not a runtime switch in this PR. Keep Medusa pinned at the version validated with Mercur; do not assume the newest Medusa alone is a safe dependency upgrade.

Mercur has the closest implemented product/offer/seller/commission/order-split model and compatible TypeScript stack. It reduces bespoke commerce work relative to the other choices. Prefer extension seams and BORVAT contracts over a deep permanent fork; every necessary patch must have provenance, an owner, regression coverage and an upstream/retirement plan.

## Alternatives

- **Option 2 — retain current project plus OSS components:** fallback if permission hardening, dependency/license review or upgrade coupling cannot be resolved within the agreed budget. Preserves the strongest existing invariants but requires building and maintaining more critical payment/return/reconciliation behavior. Reproduced durability failure is a blocker, not deferred debt.
- **Option 3 — keep developing current as superior:** rejected on current evidence. Thirty-seven narrow tests and reusable screens do not establish a complete, scalable, compliant marketplace.
- **Vendure:** credible runner-up with proven channel isolation/order strategies in this test, but seller integration is educational, payments/refunds simulated, canonical offers require work and license/distribution decisions remain.
- **Medusa alone:** good commerce primitives but recreates the marketplace layer Mercur already implements; Enterprise exceptions also require care.
- **Saleor:** substantial implemented commerce, but custom marketplace domains plus an additional Python runtime increase migration and ownership cost here.

## Conditions before implementation authorization

1. Owner approves this exact ADR/change SHA through a reviewable decision record. This does not itself authorize Codex, merge, deployment or live payments; those remain separate approvals.
2. Triage critical/high dependency findings with a deployable SBOM, documented reachability/patches and retests; resolve license boundaries. Do not enable paid RBAC/SSO flags without rights.
3. Define/test a deny-by-default Surooh permission resolver and all buyer/seller/staff/operator scopes. Default grant-all behavior inside a tenant is insufficient.
4. Lock the NL/EUR single-seller checkout and offer/buybox policy, identity mapping, money/tax snapshots and refund/reconciliation responsibilities. The default SystemPayoutProvider must be impossible outside explicit isolated tests.
5. Preserve source, recover the 69 missing assets, restore clean app verification, rehearse disposable migrations/restore and establish a measured parity contract. Do not replace the hosted app or replay its historic SQL chain.
6. Treat integrations and European applicability/legal/PSP signoff as uncompleted launch work. Pass the relevant acceptance cases at each stage, then the full 35-case E2E gate.

## Consequences, cost and rollback

Planning-only 12-month model estimates EUR 69,850–116,000 for Mercur versus EUR 112,200–181,200 for current+components, excluding unquoted commercial licenses/provider fees/legal/operations listed in TCO.md. Confidence is limited; patch/security requirements may erase the saving.

New responsibilities include Medusa/Mercur patch review, migrations, API adapters, Supabase identity bridge, immutable accounting/outbox/inbox and legal/operational controls. No production scale, PITR, provider reconciliation or compliance has been proven. A failure at any condition keeps the project ON HOLD and reopens this ADR; do not silently change the foundation.

Before cutover, rollback is simply discarding the isolated candidate branch and keeping Lovable/current source. After an approved future cutover, use reviewed compatibility flags and reconciled forward recovery; never down-migrate or delete financial history to hide a failure. No migration or cutover is performed by this evaluation.

## Owner decision record

Decision: **PENDING**. Accepted option: **none yet**. Approval URL and reviewed commit: **not supplied**. All execution/deployment/payment policies remain false. The offline gate cannot authenticate a human review and never starts an agent.

## Hardening review update — 2026-10-22

The owner accepted the research and Mercur as the first design candidate, explicitly withholding application transfer, Codex, PR merge and production approval. Candidate status is accepted; final foundation status is **NOT APPROVED**. See ../hardening/REPORT.md and ../hardening/ARCHITECTURE.md. Expanded tests prove native API isolation and the opt-in permission hook, but raw services trust privileged callers and native payout H06 loses its recovery row on simulated response loss. A separate durable Surooh proof does not close native financial wiring. Dependency/source/build/restore/contract gaps also remain. Recommendation: retain Mercur as preferred candidate and **reject final foundation/readiness acceptance for now**. This does not reject its suitability permanently. Original sources and default/main branches are unchanged.

Hardening addendum: actual module-resolution test H07 failed: Framework Express still loads proxy-addr 2.0.7 despite attempted 2.0.8 override. H06 financial recovery failure remains. See [hardening report](../hardening/REPORT.md). Final adoption remains rejected at this gate; preferred-candidate status is unchanged.
