# Bounded commercial/application review

Static source review of preserved Lovable import; no new broad engine comparison, session, production database, checkout or browser E2E was executed. Type/lint/renderer results certify the separate candidate only.

| Area | Preserved implementation | Reuse / remaining work | Evidence level |
|---|---|---|---|
| Buyer discovery | src/routes/index.tsx, search.tsx, c.$slug.tsx, product.$id.tsx; product-card/site-header | Reuse route/components and visual structure; original images needed; canonical product/offer mapping pending | STATIC; rendered parity NOT_RUN |
| Buyer account/orders | account.tsx, _authenticated/orders.tsx, src/lib/buyer-account.ts | Keep centralized buyer query helper and explicit user filter; native marketplace identity/order adapter still required | STATIC; real session/RLS E2E NOT_RUN |
| Cart/checkout | cart.tsx, _authenticated/checkout.tsx | Preserve cart UI; CHECKOUT_ENABLED=false stays; no working payment/order completion claim | STATIC / DISABLED |
| Seller center | seller.dashboard/products/catalog/inventory/orders/order-desk routes | Reuse navigation/forms; distinguish legacy Supabase reads/writes from future Mercur services; versioned seller/offer adapter required | STATIC; no seller operational certification |
| Seller finances/shipping | seller.finances.tsx uses DemoAction/demoInvoices; seller.shipping.tsx uses demo shipping data | Demo UI only; no settlement/label/dispatch certification | DEMO |
| Support/admin | support.* and admin/* routes | Reuse UI shells; actual moderation/service workflows require separately gated implementation | STATIC / mixed demo; E2E NOT_RUN |
| Emails | registry + order templates + auth preview | Seven-file isolated typing candidate; valid order rendering parity preserved, preview fixture site fields completed | 12 renderer PASS; delivery NOT_RUN |

Target separation stays: BORVAT buyer/seller experience → application adapters → Mercur domain; separate Surooh adapters for WMS/Accounting, no fork-wide rewrite or duplicate ERP stock/financial ledger. Product identity, seller offer price/availability, seller order split, shipment projection and commercial return request must remain distinct. No native Mercur migration into BORVAT is authorized. Existing prototype tables are not proof of this target model. Original source stays recoverable; no production functionality is removed or newly certified by this patch.
