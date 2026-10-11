# BORVAT GLOBAL MARKETPLACE — COMPLETE PLATFORM SCOPE / GAP AUDIT
Date: 2026-10-11. Status: PRODUCT SCOPE, NOT IMPLEMENTATION ACCEPTANCE.

## Hard reset
The stove conversational demo is only a discovery proof of concept. It is not the BORVAT marketplace, and previous descriptions must not imply the platform is complete. Do not move to Replit/merge into main as a substitute for building missing domain functions.

## Source of truth and reuse
- Existing Lovable BORVAT STORE project id 092a5ea2-1dc1-4ffd-a4b4-efe2d3237298; earlier project conversations describe existing storefront, professional Seller Manager shells, Admin, Support, merchant verification, catalogue, inventory ledger and policies. These are historical claims, NOT live verified in the new GitHub repo; inspect code, licenses, environment and database isolation before reuse.
- Existing Google Drive Unified Marketplace PRD MVP v1.2: https://docs.google.com/document/d/1RlS8HGwdBIMR8gLXIkWxqfAyZgQ1RecfPxE0_GlZ6VY/edit. Preserve its multi-vendor splits, independent merchant permissions, Catalog Product vs Seller Offer and legal TBD gates.
- GitHub borvat/borvat-global-marketplace is authoritative source, Replit executor, Neon isolated testing DB, Lovable UX lab. GitHub main presently lacks complete engine; feature/mercur-foundation is draft and contains only docs and prototypes.

## The 6 mandatory platforms
### 1. Identity / access platform
Buyer, merchant applicant, verified seller, advertisement operator, support, catalog reviewer, quality/risk reviewer, finance operator and platform admin. OIDC/passkeys/email link, verification and recovery, MFA for privileged users, session revocation, least privilege, tenant membership and scoped switching, KYC/KYB onboarding and independent approval. Conversational AI is UX, never authorization. No self-approval of a seller application.

### 2. Seller platform
Seller onboarding and legal contract status; company/store settings; product submissions to canonical catalog; unique per-seller Offer with price, availability and shipping promise; inventory/reservation/warehouse, pricing history; seller-order split, fulfillment, labels/tracking, return disputes, invoices, settlement ledger, fees, analytics and team RBAC. Merchant A must never read Merchant B. No unapproved seller publishing.

### 3. Advertising platform
Campaigns, sponsored placement inventory, advertiser billing model (CPC or fixed placement), budget caps, approvals, policy and category constraints, targeting based on lawful permissions, impression/click measurement and anti-click-fraud, refunds/disputes, invoices, attribution and merchant reporting. Ads clearly disclosed and never passed off as the cheapest organic result. No live spend without explicitly reviewed budget/terms.

### 4. Buyer platform
AI chat as primary discover interface; conventional catalog fallback; multilingual market/currency settings, products and offer comparisons including full tax/shipping cost, bundles, favorites, guest and authenticated cart, secure provider checkout, order tracking, cancellations, returns and refund, complaints, support and reviews. AI outputs only tool-grounded stock/pricing/delivery, explicit customer confirmation for checkout.

### 5. Administration platform
Merchant approvals/suspensions, product master curation, offers moderation, category and market configuration, order and payment issue oversight, platform service operations, advertising approval and finance reporting, fees/commissions, dispute management, audit and rights delegated by roles, reversible/dual approval for sensitive operations, organization-wide reports with strict privacy controls.

### 6. Quality, trust and anti-fraud platform
Product authenticity and safety evidence, seller risk/KYB status, duplicates and deceptive catalog claims, prohibited goods, fake reviews and listings, chargebacks, repeated cancellations, marketplace abuse, sponsored click anomalies, moderation queues, investigations, evidence chain, graded risk responses (block/hold/review), appeal workflow, reviewer audit trail and separation of duties. Never autonomous permanent sanctions based on LLM alone.

## Foundation services (not independent new apps)
Mercur/Medusa commerce core; canonical product registry vs merchant offers; pricing/VAT; tenant authorization; payments provider sandbox; split-order and seller ledger; Redis workers/queues; PostgreSQL Neon TEST; catalog search; secure webhook/event outbox; notification/support channel; monitoring; backups/restore; model gateway with allowlisted read tools; observability and release gates.

## Minimum complete sandbox acceptance — owner visible, evidence linked
A. An authenticated buyer and two independently verified test sellers with separate tenants, plus platform admin, quality reviewer, advertiser; no role escalation.
B. Shared canonical product and two independent offers; seller can edit own price/stock, not other's data; reviewer controls approval.
C. AI reads a real TEST catalog API (no hallucinated seller) and constructs compareable full-price quote; regular search also works.
D. One test buyer cart with two merchants, provider sandbox confirmation, one customer order split into two seller orders; partial refund does not modify other seller order.
E. Seller console shows order and inventory; admin console shows approvals; advertising console creates non-billable demo campaign marked sponsored; trust console raises and resolves synthetic risky-offer review.
F. Risky writes permission checked server-side, audit/correlation ids and replay safety, tenant isolation tests, accessibility/mobile and multilingual smoke tests, CI pass with commit SHA and owner preview.
G. Production only after legal, payment, refund, settlement, privacy, fraud and operational decisions approved.

## Delivery order, without scope loss
Phase 0 inventory and reuse audit (Lovable/Drive/GitHub), platform role matrix, install Mercur in isolated runtime.
Phase 1 identity + catalog + sellers + buyer core + order sandbox.
Phase 2 admin + trust/risk + advertising sandbox.
Phase 3 conversational AI grounded to real tools with buyer verification, support and full regression.
Phase 4 owner verification of all six consoles, operational release controls, staged publishing.
Passing one phase does NOT mark missing platforms done.

## Gaps verified 2026-10-11
- GitHub feature branch contains deterministic demo pricing/cart, a demo HTTP endpoint and HTML proof of concept.
- No evidence six integrated platforms run in this GitHub repo.
- Lovable BORVAT STORE exists and its project history mentions substantial seller/admin/support features, but source-level functional parity and current live behaviour have NOT been established.
- Replit executable environment, Mercur install, Neon TEST integration, Redis, payment sandbox, ads, quality/anti-fraud and cross-platform acceptance: NOT VERIFIED.
