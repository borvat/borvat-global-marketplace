# Architecture Decision Record — ADR-001 (Draft)

**Decision:** Evaluate MercurJS open-source core as a foundation; implementation NOT yet approved or validated.

## Logical domains
- Identity and access: platform staff, sellers, customers, permissions, and explicit organization/legal-entity boundaries.
- Marketplace: shared canonical products, independent seller offers, pricing, commission schedules, and settlements.
- Commerce: carts, orders, fulfillment, returns/refunds, payment intents, and immutable accounting events.
- Market configuration: currency, languages, taxes, allowed payment methods, localized fulfillment and regulations.
- External integrations: adapter-based connection to Sam AI Executive, ERP, carriers, and marketplace providers.

## Non-negotiable invariants
1. Each seller's private orders, inventory, payout and personal data remain isolated.
2. Sharing a canonical product never implies sharing seller inventory, offers, or financial balances.
3. Payments and payouts must use licensed/available payment providers; no homemade custody of funds.
4. Track market, legal entity, currency, tax jurisdiction, seller, and source system on each transaction.
5. No automatic cross-market payment, tax, or settlement assumption.
6. Idempotency, audit trails, least privilege, and independent reconciliation for money movements.
7. Keep the Sam integration optional and fail-safe; Sam cannot bypass business approvals.
8. Preserve upstream license notices and separately verify terms of any add-ons.

## Deployment
Use isolated staging with separate PostgreSQL and Redis. All service versions and image digests are to be pinned before deployment. Do not share production infrastructure until the isolation and backup plan is reviewed.

## Open technical investigations
- Mercur seller-offer and commission capabilities in the selected pinned version.
- Per-market legal entity/accounting and tenant-isolation strategy.
- EU VAT, Syrian settlement and payment-provider feasibility.
- Arabic RTL, currencies, search relevance, refund/chargeback handling.
- Resource requirements and monthly cost for a staging environment.

## Status
Documentation-only setup; no application code, migrations, containers, secrets, or live traffic.
