# Codex delivery plan — staged, testable, no live side effects

All stages use synthetic data, local containers or explicitly isolated staging with separate secrets and accounts. No automated publish/production migration, no live PSP, no emails to real customers. PRs remain reviewable; passing a phase does not grant permission to merge/deploy. Do not install paid services. Every PR supplies tested commit SHA, commands, logs, failures, rollback/compensation and explicit untested scope. Failed tests remain failed; never suppress ACL assertions or replace the journey with mocks and label it E2E.

## C0 — source baseline and architecture decision

Depends: none. Read AGENTS.md, master blueprint, current state, decision log and GitHub ADR-001. Resolve true Lovable-linked git remote and capture exact SHA. The target marketplace repository has no application at audited main; do not assume clone contains the app. Inventory tracked source, migrations, functions, constraints, RLS, roles, external effects and fixture-only data. Obtain export via existing source access; never commit .env or credentials. Build a non-production workspace and reproduce schema from zero, including Supabase auth compatibility, forward migrations and no production fixture purge. Inventory destructive/data-dependent migrations for safe replay adaptation.

Run same small Mercur spike only if needed to resolve ADR-001: pinned upstream/version/license; two sellers sharing a product but independent offers; unauthorized read denial; sandbox order/refund/commission evidence. Compare reuse cost vs replacement and document recommendation. No approved new engine is inferred from existing draft.

Exit: `SOURCE_PROVENANCE.json`, complete file/migration inventory, working reproducible baseline, ADR-002 proposed with migration mapping, baseline test report and documented blocker if unavailable. No redesign while provenance unresolved. Correct documentation headers that misrepresent appended newer state, preserving decisions.

## C1 — identity, ACL and legacy lockdown

Depends C0. Resolve F02/F03/F04/F05/F07, scoped buyer/seller/admin authorization and MFA policy. Explicitly deny arbitrary order/item/amount writes through REST/RPC/MCP. Keep old place_order neutralized and checkout off. Critical audit transactional; company context in SAM. Do not grant new platform admins or approve real sellers.

Exit: A01–A05, A15, A28, A29, A31 pass; ACL gate failure injection exits nonzero; no production changes; blocked schema grants documented. Demo and real surfaces visibly classified. Unit test payment display fix and server runtime status validation.

## C2 — seller and catalog/offer workflow

Depends C1. Implement real seller onboarding and independent review, private document access, stores, canonical product dedup, seller SKU/offer versions, restricted category policies, tax/shipping quote configurations. No fake verified badge or global hardcoded seller. Reuse existing functions only after authorization tests.

Exit: A03–A08, A27 and A32 pass with at least two synthetic sellers plus a seventh external-style tenant created through the same workflow. Screenshot/video is supporting proof, not authorization evidence.

## C3 — quotes, order and inventory lifecycle

Depends C2. Server totals, one seller per checkout, reservations, timeout/retry, pending order, line snapshots, per-seller shipping. Warehouse simulated adapter supports atomic last unit and reconciliation. PSP adapter fake deterministic at this stage; no claim of PSP integration.

Exit: A09–A13, A16, A17, A25 pass; state machine/currency/rounding invariants tested. No client-controlled price/seller/tax/commission accepted.

## C4 — PSP sandbox and finance subledger

Depends C3. Provider hosted connected-account onboarding in sandbox, hosted checkout, signed webhooks, async states, fees, refund, payout observations, immutable commission schedules and daily reconciliation. Store provider account scoped IDs. Never set live flags or load live keys. Select direct-charge configuration only after responsibility/fee agreement documented.

Exit: A10, A12–A16, A20–A24 pass against actual provider sandbox plus local failure injection; submit provider object IDs (redacted appropriately), amount/currency/account verification and reconciliation totals. If sandbox credentials are absent, mark BLOCKED; fake adapter success cannot close C4.

## C5 — fulfilment, after-sales and accounting

Depends C4. Real persisted support/return/refund workflows, tracking adapter sandbox, split lines/quantities, withdrawal confirmation through captured mailbox, verified purchase reviews and moderation. Accounting contract test adapter without changing e-Boekhouden. Test late refund after payout and accounting outage.

Exit: A18–A24, A26, A30, A33–A35 pass with original order/refund/invoice/commission/payout linkage. Refund and delivery must be independently verified; carrier status screenshot alone is insufficient.

## C6 — acceptance, resilience and review packet

Depends C5. Run all acceptance cases from clean state on a fixed SHA with real application/UI/database, sandbox PSP and explicitly named test adapters for external systems. Include happy journey seller→buyer→payment→stock→carrier→delivery→statement; separate partial return→refund→commission credit; and independent provider reconciliation. Run security/tenancy, load, restore and worker crash scenarios. Fix and rerun affected scope.

Exit: signed-off evidence table for every A-ID (PASS/FAIL/BLOCKED; never blanket complete), operational runbooks, dependency/licence inventory and security review, no unresolved P0/P1, operator/PSP/compliance decisions supplied. Deliver a launch-readiness report; do not launch. Acceptance against test doubles proves the contracts, not live carrier/ERP compatibility. Later connector certification remains explicit.

## Later backlog

L1: mixed-seller cart and one payment; evaluate provider marketplace split product and charge/refund/chargeback ownership, deterministic allocation and multi-seller fail/partial delivery cases. L2: BE then other EU countries with tax/consumer/language/carrier/PSP support tested independently. L3: seller bulk tools, multichannel, campaigns/coupons and transparent promoted offers. L4: advanced fraud/BI, warehouse network, B2B and auctions only with new scope and acceptance. Wallets/store credit require separate legal/provider analysis; no assumed custody.

## Codex start prompt

> Execute C0 only for WORK MISSION 03. Read all package files and repository AGENTS.md. Audit target borvat/borvat-global-marketplace and the proven BORVAT STORE source at commit 42fcde8cf1b2a11422c32301b6b423d3b5d39942; first resolve its real connected git remote. Existing target main 02243d583fb935555177d105e22ee45dc0b93a34 is docs-only. Preserve history. Do not fabricate source linkage, assume Mercur selected, repeat old production fixture purges, read/commit secrets, merge, deploy, enable checkout/live PSP, send messages or move money. Produce a draft reviewable C0 change with source provenance, schema replay evidence and ADR recommendation. List blockers precisely. Remain within isolated synthetic environments. Follow later phases only after their dependencies and separate authorized implementation scope are satisfied. Treat the proposed OpenAPI/data model as contracts to reconcile with proven existing schema, not blind replacement migrations.
