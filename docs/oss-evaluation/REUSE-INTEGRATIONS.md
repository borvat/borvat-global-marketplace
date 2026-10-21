# Reuse, migration and Surooh boundaries

## What can be reused

| Existing material | Mercur direction | Vendure alternative | Conditions |
|---|---|---|---|
| 499 recovered Lovable text files | Preserve TanStack/React shell, navigation, product/search/account and seller/admin layout patterns; adapt server data layer through BORVAT contracts | Same UI reuse with GraphQL adapters | 69 binaries missing, stale npm lock and app build/type/lint blockers must be fixed. UI demo totals/orders/rates are not operational features |
| Supabase buyer authentication and company membership concepts | Server-verified identity bridge/custom auth provider maps subject to customer/member and approved seller | Map identity to Customer and channel-scoped Administrator/Role | Never treat a browser-supplied company/seller/channel ID as authority. Verify issuer/audience/signature and current membership server-side; test revoked membership and role changes |
| Canonical product/SKU/offer SQL and invariants | Map to Product/Variant/Offer and upstream stock/price links | Requires explicit seller-offer model, not only product-channel assignment | Preserve stable external ID mapping, provenance and reconciliation; do not replay 127 historic migrations into either engine |
| Archived core tests/domain ideas | Reuse money minor-unit invariants, self-approval/RLS isolation expectations, stock concurrency and immutable accounting tests as contract tests | Same reusable business requirements | Do not copy its capture-inside-transaction implementation; independent failure is recorded. SQL RLS is not automatically present in Mercur/Vendure |
| Product-completion experiment | Preserve tests/fixtures that express useful requirements and selectively recover pure helpers | Same | Existing regression failures remain. No automatic promotion into production |
| Replit work | No independent codebase could be established from available connector discovery | Same | Replit search `BORVAT` returned no apps and exact `BORVAT STORE` resolver found false. No Replit agent was started. Do not invent its stack or claim its source migrated; require a proven repo/export relationship before counting reuse |
| 35 acceptance specs / OpenAPI / events | Keep as BORVAT boundary; map implemented upstream operations and explicit gaps | Same | Proposed contracts remain specifications until adapter and E2E proofs exist |

Lovable original and connected branches stay unchanged. Preserve export/import manifests and compare all identities, products, offers, routes and assets before any future cutover. No automatic password migration; use a reviewed identity bridge or re-authentication strategy. No production dual writing of orders or money. An approved future shadow-read catalog exercise precedes any transactional cutover. Rollback selects the old deployment only while backward-compatible data is maintained; never delete committed financial history.

## Integration architecture (proposed; not connected)

| System | Owns | Marketplace adapter | Retry/reconciliation rule |
|---|---|---|---|
| Surooh Warehouse | Physical stock, reservation, pick/pack and dispatch facts | Mercur workflow hooks/API adapter; Vendure stock/fulfillment strategies; Saleor allocation/webhook adapter; current core would need a durable outbox | Exactly one authoritative reservation system. If Warehouse owns reservations, native marketplace inventory is a projection; do not reserve independently in both. Idempotency key per order line/reservation, TTL, compensation release, dispatch acknowledgement and daily balance reconciliation |
| Surooh Accounting | Legal invoices/credit notes, accounting journals, commission postings and reconciliation | Map immutable order/commission/tax snapshots and verified PSP settlement facts into versioned accounting commands | Currency + integer minor units + tax snapshot + issuer identity. Unique external document key, inbox deduplication, retry/DLQ and balancing. A local PAID status cannot trigger a fictional bank posting |
| SAM Executive Agent | Approved analytics/monitoring and explicitly authorized operations | Read projections/events through scoped tools; proposals carry actor, scope, expiry and approval reference | Read-only first. No direct SQL or unrestricted provider credentials. Write commands pass the same domain API/authorization/ledger gates and immutable audit trail. No agent is launched by this evaluation |

Common proposed envelope: `event_id`, `event_type`, `schema_version`, `occurred_at`, `correlation_id`, `causation_id`, `tenant_id`, `aggregate_id`, `aggregate_version`, `payload`. Send through a transactional outbox; receivers use an inbox unique on event/consumer, authenticate sender/signature, validate schema and tenant authorization, reject stale/invalid mutations, retry transient errors and quarantine poison messages. Delivery is at least once; exactly-once business effects require idempotency, not a queue marketing claim.

Do not assume upstream events are durably delivered to external systems. Map documented/verified Medusa order/fulfillment/return events, Vendure EventBus events or Saleor webhooks through this adapter and prove persistence/replay. Exact Surooh API URLs, schemas, credentials and SLAs were not supplied or inspected: existing `docs/mission03/09-integration-contracts.md` is a proposed contract, not a claim of working integration.

## Launch scope and regulatory work

Retain the proposed NL/EUR business-seller, low-risk goods MVP with one seller per checkout, multiple competing offers in discovery, verified seller approval, deterministic prices/stock, PSP-hosted payment onboarding, buyer order visibility, shipping/tracking, returns/refunds, commission/reconciliation and basic moderation/support. Server-side selection must reject or explicitly handle seller/offer switches. Mixed-seller checkout is deferred even though the prototype can demonstrate it.

No candidate establishes GDPR, DSA, DAC7, GPSR, consumer or payment-law compliance for the operator. Carry forward the applicability analysis and official sources in `docs/mission03/08-eu-payments.md`; identify operator country/legal entity, launch markets, trader status, legal invoice issuer, retention and reporting duties with qualified review. Implement scoped access/export/erasure and retention holds, trader verification/notices/complaints, restricted-product moderation, statutory consumer flows, applicable seller/tax reporting and audit evidence. These are C1–C6 acceptance work, not checkboxes satisfied by installing a package.

PSP marketplace underwriting and approved charge/transfer/refund responsibilities must precede any live setup. Stripe Connect remains only a conditional sandbox candidate from the earlier design; the evaluation uses no provider. Never route customer funds into an ordinary platform bank account to imitate a licensed PSP. Shipping carriers, accounting and SAM are also unconnected.
