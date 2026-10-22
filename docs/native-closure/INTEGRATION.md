# Pinned Accounting / WMS alignment and integration tests

Reviewed Accounting PR #29 at `c2254e85fb708fbdb53a91522213ec29dd255e67` and WMS PR #17 at `a158106e61241e66a4148638b59bfd50e28f023e`. The shared-command schema is byte-identical in both. Source paths/hashes are bound in the receipt; neither repository was modified. Both remain preparation drafts; this is not evidence of deployed ERPNext endpoints or joint G0 acceptance.

The reviewed shared authority assigns physical quantities, movements, reservations, valuation, COGS, invoices/credits and GL to ERPNext. The Surooh facade orchestrates commands/state without a second quantity ledger. WMS is a command client/read projection. Surooh Commerce owns versioned canonical product/offer/bundle mapping; BORVAT stores channel content/offers and commercial order/provider facts linked to that mapping. SAM performs scoped reads/proposals; no direct financial or stock write is granted.

A native Mercur inventory reservation/decrement and a separate ERPNext reservation/decrement must **not** both become authoritative. Native inventory must be adapted to the accepted reservation port/projection model before shared operation. Likewise, Marketplace operation evidence and commercial commissions are not a second posted GL. These adapter changes have not been implemented or proven; do not connect engines based on schema tests alone.

The real shared schema accepts reserve_bundle/release_reservation/dispatch_stock/return commands and create_invoice_draft/create_credit_draft; it does not expose submit_invoice or pay_seller. [Ten synthetic contract cases](evidence/contract-tests.json) check these boundaries and reject version/identity-envelope drift. Schema validation alone does not authorize a company, validate quantities or post a voucher.

Required actual-adapter suite:

1. Map native opaque IDs to company-scoped stable external keys and pinned master/BOM versions; reject unknown/foreign mappings.
2. Concurrent reserve/release/retry and last-unit contention execute once in the ERPNext owner; Marketplace/WMS cannot create another quantity or reservation ledger.
3. Persist inbox/outbox deduplication by company, operation, external_key and payload hash. Conflicting payloads, stale BOM/policy and out-of-order release/return enter quarantine.
4. Create invoice/credit drafts once; require separate approved posting/financial authority. ACK is not a posted invoice, charge, refund or settlement.
5. Exercise crash before/after remote commit and local acknowledgment, restored databases with an advanced provider/ERPNext, actual cross-company credential rejection and native-company revocation.
6. Reconcile delivered/returned physical facts with native orders and posted credits without a second stock, valuation or GL writer. Measure recovery objectives.

Status: schema/authority fixtures PASS; all actual endpoint/ERPNext engine integration cases above NOT_RUN. Previous proposed event-envelope tests remain historical partial evidence, not live integration acceptance.
