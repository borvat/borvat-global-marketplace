# Functional integration boundary retained

The existing [Accounting/WMS functional contract](../c0-app-readiness/INTEGRATION.md) remains unchanged. This commercial-only stage does not call any engine endpoint or repeat upstream sensitive tests. Existing upstream pins are inherited; no new upstream readiness claim is made.

| Data | Authority | Demo workbench behaviour |
|---|---|---|
| Canonical product/offer/BOM mapping | Surooh Commerce versioned mapping | Nine original synthetic product fixtures, distinct seller offers; no new live catalog writer |
| Buyer request / seller commercial lines | BORVAT channel | Local request only; immutable item price snapshot, per-shop presentation |
| Physical quantity, reservations and movements | ERPNext via WMS workflow | availabilityExample is a fixed UI fixture; no reservation/decrement/stock endpoint |
| Dispatch/tracking | WMS/provider workflow | “Demo voorbereid” is a UI simulation; no shipment/carrier/tracking creation |
| Invoice, credit, GL, valuation/COGS | Accounting / ERPNext native documents | No invoice, credit, tax posting or financial ledger; formatEur and article totals are display calculations |
| Payment/settlement | Separately gated provider/Accounting flows | Disabled; no payment registration/adapter/provider credentials |
| SAM | Scoped read and approval-required proposals | No SAM action or mutation in this stage |

Future read adapters must preserve authoritative reference/version/company/product mapping; do not treat projected quantities as writable stock. Keep requested commercial state distinct from confirmed native document state. ACK is not reservation; prepared is not dispatched/delivered; request is not invoice/payment/settlement. The workbench labels article totals and uncalculated shipping explicitly. Backend integration, actual contracts, persistence and accountant-approved tax mapping remain NOT_RUN/OPEN, rather than inferred from frontend state.
