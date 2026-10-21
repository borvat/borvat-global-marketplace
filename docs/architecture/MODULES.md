# Domain ownership and source map

All route paths below are relative to apps/marketplace/src/routes unless qualified. No domain code was rewritten merely to match folders.

| Domain | Existing source | Maturity |
|---|---|---|
| Buyer Accounts & Experience | `auth.tsx; account.tsx; _authenticated/orders.tsx; lib/buyer-account.ts` | Real auth/read code; full privacy E2E NOT_RUN |
| Seller Onboarding & Seller Center | `hooks/useSellerApplication.ts; hooks/useSellerData.ts; _authenticated/seller.*; components/review` | Membership/RPC workflow exists; current approval/KYB unverified |
| Product Catalog & Offers | `product.$id.tsx; c.$slug.tsx; search.tsx; product-card.tsx; catalog SQL` | Legacy public products and canonical catalog coexist; cutover pending |
| Cart & Checkout | `cart.tsx; _authenticated/checkout.tsx` | Cart code exists; checkout hard-disabled |
| Order Management | `_authenticated/orders.tsx; lib/order-status.functions.ts; order RPC` | Legacy status path present; no canonical E2E proof |
| Payment Provider Integration | `future server adapter; checkout + payment event contracts` | NOT_IMPLEMENTED/NOT_VERIFIED; test-only design |
| Commissions & Seller Settlements | `_authenticated/seller.finances.tsx; finance contracts` | Demo UI; no proven operational settlement engine |
| Shipping & Fulfillment | `_authenticated/seller.shipping.tsx; inventory reservation SQL; outbox` | Foundations and demos; carrier order lifecycle pending |
| Returns & Refunds | `future return/refund domain; support routes` | No verified complete return-to-provider-refund flow |
| Admin & Moderation | `_authenticated/admin/*; review/*` | Mixed real review surfaces and demo orders/metrics |
| Security & Multi-Tenant Isolation | `integrations/supabase; lib/mcp/context.ts; ACL scripts; migrations` | Foundations exist, historical ACL drift; live state NOT_VERIFIED |
| Analytics & Reporting | `seller.analysis/performance; MCP analyze tools` | Mixed demo/read analysis; no cross-system reconciliation proof |

Target relationships, company/store/product/offer boundaries and transactional invariants are in docs/mission03/03-data-model.json. API and events are proposed contracts, not declarations of implemented endpoints.
