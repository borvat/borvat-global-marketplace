# BORVAT Legacy Audit — Evidence-Based Integration Decisions
Date: 2026-10-11
Status: historical Lovable SOURCE INSPECTION via project agent (read-only audit requested). NOT a verified live acceptance test.

## Audit source
Lovable BORVAT STORE project 092a5ea2-1dc1-4ffd-a4b4-efe2d3237298. Agent examined route/component patterns and supplied code paths. The plan-mode agent unexpectedly authored an internal .lovable/plan.md audit proposal; no deployment, DB migrations or release authorised. Production data was not inspected.

## Main architecture decision
Legacy: TanStack Start / React 19 / Cloudflare Workers / Lovable Cloud PostgreSQL+Auth+RLS. New proposed Mercur: Medusa v2 server with separate PostgreSQL, identities and schema. DO NOT copy a live PostgreSQL schema into Neon test, merge auth/ledger implementations blindly, or give both stacks write access to orders. All reused pieces require license check, component-by-component diff, tests, and explicit bounded-context ownership.

## Evidence inventory (NOT claims of tested production reliability)

| Area | Legacy route/component evidence | Current assessment | Gap to ship |
| --- | --- | --- | --- |
| Identity | src/routes/auth.tsx, src/routes/_authenticated/route.tsx; user_roles, company_members, permissions | backend-connected legacy roles | Auth migration contract, buyer/seller/admin segregation, no self-approval and cross-tenant tests |
| Seller | seller.dashboard, seller.manager, seller.catalog, seller.inventory, seller.orders, useSellerData.ts | mix of backend-wired features and demo seller finance/shipping/reviews; seller.messages stub | reconcile with Mercur vendor/offer/seller order modules, real shipping and settlement |
| Ads | src/routes/_authenticated/seller.advertising.tsx | demo UI only, no verified campaign tables or ad serving | complete ad schema, approval, budget cap, metering, disclosures and abuse checks |
| Buyer | index.tsx, search.tsx, product.$id.tsx, cart.tsx, _authenticated/checkout.tsx | browsing/cart legacy products; checkout has CHECKOUT_ENABLED=false | canonical catalog, cart quote, test PSP and order split |
| Admin | src/routes/_authenticated/admin/*, review/seller-applications-panel.tsx | reviewer and some store/listing flows wired; dashboards/health/users partly fake | consistent privileged server-side authorization and live reporting |
| Trust | src/routes/_authenticated/admin/security.tsx; seller_verification_events, agent_audit_log, channel_kill_switches | seller KYB workflow; security screen demo | fraud events/scoring evidence, triage/appeals, independent reviewers, chargeback workflow |

Legacy contains business accounts, IBBO storefront and potentially bol connection secrets. Assume PROD SENSITIVITY. Reuse UI or process design only until environment is proven isolated.

## Workstreams and contracts before Replit
P0 source ownership / verify Mercur modules vs legacy, ensure code sources/license provenance; test DB credentials only.
P1 identity, buyer, seller, product master+merchant offer, inventory isolation and order sandbox. Identity server decides access, not AI.
P2 full admin and trust/quality workspaces with independent review.
P3 ads domain with non-chargeable fake campaign, user-visible sponsored label, capped budgets.
P4 AI shopping grounded exclusively to P1 commerce APIs, guardrails; manual cart and payment confirmation.
P5 cross-role end-to-end and security regression, then owner acceptance.

## Concrete acceptance tests
1. Logged-out customer cannot read seller financials; seller A cannot read seller B orders/stock/ads; seller reviewer cannot self-approve.
2. Single canonical product, two merchant offers; compare full costs and filter out unavailable or out-of-market offers.
3. One buyer order produces two separate seller orders with isolated cancellation/refund state in PSP sandbox.
4. Advertising budget hard cap enforced transactionally; clicks do not silently alter organic ranking and sponsored entries are labelled.
5. Quality reviewer can hold potentially fraudulent offer with evidence and audit trail; publisher cannot approve own case.
6. AI has read tools and explicit cart intent, cannot trigger financial actions directly; invalid/unverified catalog input cannot prompt-inject tools.
7. Each result has linked runtime logs, database fixture IDs, commit SHA and role evidence. Mock UI screenshots are not acceptance.
