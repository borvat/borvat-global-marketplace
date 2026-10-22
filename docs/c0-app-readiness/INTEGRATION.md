# Functional integration alignment — documentation only

Read-only refreshed sources:
- WMS [PR21](https://github.com/borvat/surooh-commerce/pull/21), head `d3cea48fe0510bf55a682cd475f21960e5d6a2ff`.
- Accounting [PR30](https://github.com/borvat/surooh-accounting/pull/30), head `1b198d437cd8f81de1eb453a87ba9b9bccab0a57`.
- [WMS proposed shared-command v1](https://github.com/borvat/surooh-commerce/blob/d3cea48fe0510bf55a682cd475f21960e5d6a2ff/contracts/shared-command-v1.md) and [Accounting authority](https://github.com/borvat/surooh-accounting/blob/1b198d437cd8f81de1eb453a87ba9b9bccab0a57/contracts/shared-core-authority.json).

These heads differ from old integration pins. Upstream reports isolated native service progress but still BLOCKED, notably reservation-to-Pick List handoff and commercial parent mapping. Those are upstream-reported results, not Marketplace integration evidence. No upstream test was repeated and no adapter endpoint was called here. Proposed shared command document still states no public endpoint deployed; synthetic lab API is not a production contract.

| Datum | Authority | BORVAT handling |
|---|---|---|
| Product/offer/BOM mapping | Surooh Commerce versioned canonical mapping | Channel IDs map to immutable versioned canonical IDs; no inferred SKU joins |
| Buyer order, seller suborder, return request | BORVAT commercial channel | Publish requested commercial facts with correlation; immutable price/tax/currency snapshot |
| Quantity/reservation/movement | ERPNext native stock/SRE documents | WMS command client + read projection; no second reservation or quantity writer |
| Inventory value/COGS | ERPNext valuation and GL | Display authorized projection only |
| Invoice/credit/GL | Accounting through ERPNext native vouchers | Store native document references/status, no parallel GL |
| Carrier shipment/tracking | WMS workflow/provider adapter | Project confirmed dispatch/status separately from customer delivery |
| SAM | Scoped read and approval-required proposals | No autonomous stock/payment/bookkeeping write |

Proposed functional operation mapping: confirmed commercial request → reserve_bundle; rejected/expired request → release_reservation; approved fulfilment → dispatch_stock; returned item → native physical disposition; commercial billing request → create_invoice_draft / create_credit_draft. These names are proposed contract vocabulary, not verified deployed routes. Each needs an operation-specific payload and versioned mapping for company, seller suborder, canonical item, quantity/base UOM, warehouse and policy/BOM version. Monetary values use exact decimal strings/currency; omit unnecessary buyer PII.

Command envelope: schema version, command/correlation ID, source, requested company binding, operation/version, external key, expected resource version, immutable mapping/BOM snapshot, typed payload. Server resolves company/service authority. Result: durable key, PENDING/COMPLETED/REJECTED/CANCELLED, immutable native document refs, projection version. Repeated identical request returns original result; changed content under same key conflicts. This documents semantics only; sensitive authorization/replay tests are deferred.

Status mapping must remain explicit: ACK/PENDING ≠ reservation; completed reservation ≠ picked; dispatch ≠ delivered; invoice draft ≠ submitted/paid; credit draft ≠ refund; PSP refund ≠ posted credit; neither invoice nor stock event implies seller settlement. Late projections must not overwrite newer versions. Never create a new stock/accounting effect merely to refresh a UI.

Future functional acceptance cases (all Marketplace adapter NOT_RUN): versioned SKU/BOM conversion; reserve→pick handoff with owner-reviewed upstream fix; multi-seller suborder mapping; dispatch/tracking projection; partial physical return versus credit request; duplicate status projection without duplicate business document; invoice draft with accountant-approved tax mapping. Run only with isolated fixtures and approved endpoint definitions after relevant gate authorization. Real bookkeeping, payment, authorization and failure-recovery tests require specialist review under the current restriction.
