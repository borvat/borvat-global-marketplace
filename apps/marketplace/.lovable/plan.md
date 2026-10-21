# BORVAT STORE — Read-only code audit (no changes)

Scope: inventory only. Nothing will be edited, migrated, queried for customer data, or published. "Approve" just means the audit is accepted; there are no build steps.

Classification legend: LIVE-WIRED = page reads/writes the real backend (not proven correct end-to-end in this audit). DEMO = renders fixtures from `src/demo/*` or `DemoBanner`. STUB = gated off or no data source.

## Framework
- TanStack Start v1 (React 19, Vite 7), deployed to Cloudflare Workers runtime (`package.json`, `src/server.ts`, `src/start.ts`).
- Backend: Lovable Cloud (Postgres + auth + RLS), 127 migrations in `supabase/migrations/`, ~100 public tables.
- Tailwind v4 + shadcn/radix (`src/components/ui/`), React Query, MCP server (`src/lib/mcp/`, `src/routes/mcp.ts`).
- No payment SDK in dependencies (no Stripe/Mollie package found).

## 1. Identity / login / roles
- Routes: `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx` (gate), `src/routes/account.tsx`, `src/routes/[.]lovable.oauth.consent.tsx`.
- Tables: `profiles`, `user_roles` (enum `app_role`: buyer, seller, admin, seller_verification_reviewer), `company_members`, `company_member_roles`, `system_company_roles`, `permissions`, `role_permissions`.
- Functions: `has_role`, `guard_user_roles_mutation`, `grant_seller_role_from_approved_application`, `company_member_has_permission`.
- Status: LIVE-WIRED. Admin gate is client-side check + RPC (`src/routes/_authenticated/admin/route.tsx` lines 50-67); server RPCs enforce their own checks.
- Blocker: role model is split between platform roles (`user_roles`) and tenant roles (`company_member_roles`); MercurJS uses its own auth/actor model, so users cannot be migrated 1:1.
- Reusable: role/permission matrix and RLS rule ideas (as spec), not code.

## 2. Seller Center
- LIVE-WIRED pages: `seller.dashboard`, `seller.manager`, `seller.catalog`, `seller.inventory`, `seller.products*`, `seller.orders`, `seller.store`, `seller.stores*`, `seller.listings.$listingId`, `seller.onboarding`, `seller.suggestions` (all under `src/routes/_authenticated/`). Hooks: `src/hooks/useSellerData.ts`, `src/hooks/useSellerApplication.ts`.
- DEMO pages: `seller.analysis`, `seller.finances`, `seller.order-desk`, `seller.performance`, `seller.promotions`, `seller.questions`, `seller.quotes`, `seller.reviews`, `seller.shipping`, `seller.settings` (partial). STUB/no source: `seller.messages`.
- Tables: `companies`, `merchant_stores`, `merchant_store_public_profiles`, `catalog_products`, `catalog_skus`, `catalog_offers`, `inventory_*` ledger, `channel_*` (Bol), `seller_applications`, shipping rate/transit/quote tables.
- Blocker: only one real tenant (Qnan B.V. / IBBO, draft, not legally verified); Bol live is blocked by governance.
- Reusable: UI shell `src/components/demo/shell.tsx`, inbox `src/components/demo/inbox.tsx`, Bol adapter `src/lib/outbox/bol-adapter.ts` + `bol-worker.ts` (needs porting to MercurJS module/workflow), shipping/ETA data model as spec.

## 3. Advertising
- Route: `src/routes/_authenticated/seller.advertising.tsx` only.
- Status: DEMO. No advertising/campaign table exists in the table list.
- Blocker: no data model, no billing, no ad-serving logic.
- Reusable: page layout only.

## 4. Buyer storefront / checkout
- Routes: `index.tsx`, `search.tsx`, `c.$slug.tsx`, `product.$id.tsx`, `store.$slug.tsx`, `seller.$id.tsx`, `cart.tsx`, `_authenticated/orders.tsx`, `_authenticated/wishlist.tsx`, `_authenticated/checkout.tsx`.
- Tables: `products` (legacy, anon SELECT), `categories`, `cart_items`, `wishlist_items`, `orders`, `order_items`.
- Status: browse/cart/wishlist LIVE-WIRED on the legacy `products` model. Checkout is STUB: `CHECKOUT_ENABLED = false` (`checkout.tsx` line 15, hotfix P5-HF-001); legacy `place_order` revoked.
- Blocker: no working order placement or payment; two product models coexist (legacy `products` vs canonical `catalog_*`).
- Reusable: `src/components/product-card.tsx`, `src/components/site-header.tsx`, order status timeline `src/lib/order-status.ts`, Dutch email templates `src/lib/email-templates/`. MercurJS storefront would replace data layer.

## 5. Admin Center
- Routes: `src/routes/_authenticated/admin/*` (16 files).
- LIVE-WIRED: `stores`, `listings`, `channels`, `seller-applications` (via `src/components/review/seller-applications-panel.tsx`), plus reviewer workspace `_authenticated/review/`.
- DEMO: `dashboard`, `companies`, `products`, `orders`, `quotes`, `shipping`, `security` (hardcoded gate/risk arrays, lines 18-31), `users` (hardcoded users, lines 19-25), `support`. No data source: `audit`, `health`.
- Blocker: most admin views are not backed by real queries; no admin write actions beyond application review.
- Reusable: seller-application review state machine (as spec), admin RPC patterns `admin_list_*`.

## 6. Trust & Safety / fraud
- Files: `admin/security.tsx` (DEMO), `seller_verification_events`, `seller_application_events`, `agent_audit_log`, `channel_kill_switches`, append-only audit triggers.
- Status: seller KYB verification workflow LIVE-WIRED; no fraud scoring, buyer risk, review moderation, or chargeback handling exists.
- Blocker: no fraud model at all; legal verification of Qnan still pending independent reviewer.
- Reusable: KYB legal-identity model (`company_legal_identities`, `company_legal_identifiers`) as spec.

## Production data note
- One backend instance serves preview and the published site (`private-shop-space.lovable.app`, `ibbo.shop`, `www.ibbo.shop`). Treat it as production.
- Holds real business data: Qnan B.V. legal identity (KvK/VAT), IBBO store, owner accounts, encrypted Bol credentials (`seller_bol_credentials`), audit logs. Test fixtures were purged in P0-3 (`docs/PHASE0_P0_3_FIXTURE_PURGE_REPORT.md`). Customer data was not queried for this audit.

## Integration risks with a separate MercurJS codebase
- Stack mismatch: MercurJS = Medusa v2 (Node, own Postgres schema, own auth); this project = TanStack Start on Workers + RLS-heavy Postgres. Code is mostly not portable; schemas/specs are.
- Dual source of truth if both run against live data (products, orders, inventory) — must pick one system of record.
- Bol credentials are encrypted with a key held here (`src/lib/mcp/crypto.ts`); migrating requires controlled re-encryption.
- Recurring ACL/grant drift (R-T21) documented in `docs/BORVAT_CURRENT_STATE_V1.md`; any schema export must re-check grants.
- Governance gates (no Bol live, no payments, no unverified seller publication) must be re-implemented in MercurJS.

## Proof index
`src/routes/_authenticated/checkout.tsx`, `src/routes/_authenticated/admin/route.tsx`, `src/routes/_authenticated/admin/security.tsx`, `src/routes/_authenticated/admin/users.tsx`, `src/hooks/useSellerData.ts`, `src/demo/*`, `src/lib/outbox/*`, `src/lib/mcp/index.ts`, `docs/PHASE0_P0_3_FIXTURE_PURGE_REPORT.md`, `docs/BORVAT_CURRENT_STATE_V1.md`.
