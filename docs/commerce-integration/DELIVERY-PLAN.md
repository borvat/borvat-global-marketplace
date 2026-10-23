# BORVAT marketplace completion

Owner mandate: 2026-10-23, implementation with routine technical decisions delegated. Preserve the existing BORVAT product and commercial design. The first benchmark is an operational multi-seller marketplace comparable in core customer/seller workflows to bol, not a claim to bol's scale, traffic or logistics network. The broader SaaS/auction/loyalty blueprint remains a later roadmap, not silently removed.

## Ordered milestones and acceptance

| Milestone | Required result | Current evidence / remaining work |
|---|---|---|
| M0 — original application integration | Reproducible locked runtime, full app build, original router and SSR/hydration, buyer/seller/admin UI cycle on desktop/mobile | This stage implements the isolated original-app integration; final commands and limits are in REPORT.md. Original media recovery remains OPEN. No paid order exists. |
| M1 — canonical catalog and read contracts | Owner-controlled products, SKU/variant/pack and distinct company/store/seller offers; reviewed import validation, pagination, media provenance and WMS/Accounting read references | Demo has nine synthetic products; independently owned real PIM/export and actual adapter acceptance remain OPEN. bol stays a separate sales channel. |
| M2 — accounts and seller operation | Buyer ownership, verified identity, seller team scopes, independent onboarding decisions, full own-data workflows; seventh-company test without special code | Imported code exists; original authenticated application and cross-company end-to-end acceptance remain OPEN. Do not self-approve a seller or equate a demo role switch with authorization. |
| M3 — checkout and payment lifecycle | Server-priced destination-valid quote, multi-seller split, atomic stock handoff, provider sandbox authorization/capture, cancellation/refund/dispute, durable idempotency and reconciliation | Existing native/prototype evidence is partial. Final engine/provider integration, independent review and complete failure/restart journeys remain OPEN. No live PSP activation from this milestone. |
| M4 — warehouse and delivery | One authoritative WMS for reservations and physical movements; pick/pack/ship/return, real carrier sandbox label/tracking contracts, rates and delivery promises | Actual WMS/Accounting endpoints and disposable native ERPNext runtime acceptance are OPEN; do not implement another writable stock source in BORVAT. |
| M5 — customer lifecycle and trust | Durable own-order history, status/tracking, invoice references, verified-purchase reviews, support cases, partial/full returns and disputes | Some original screens exist; complete authenticated workflow and failure/retry evidence are OPEN. |
| M6 — seller finances and administration | Auditable moderation and scoped staff roles; commission/settlement statements, support escalation and explainable risk review | Accounting owns invoices, credits, GL and valuation. Preserve native financial references; no parallel financial ledger. Real portal and reconciliation acceptance OPEN. |
| M7 — operational release | Full end-to-end scenarios, concurrent last-unit/retry/fault tests, restore/restart/load, accessibility, owned media, policy/terms review and launch runbooks | Original 35 full acceptance scenarios are not certified by scoped UI tests. Close remaining security and financial foundation findings before release review. |
| M8 — growth after core acceptance | Measured discovery/ranking, sponsored listings, external marketing, recommendations and later blueprint modules | Existing advertising/finance demo screens do not constitute connected services. Define consent, budgets, attribution and billing before activation. |

Each milestone closes only with an exact source snapshot, commands and exits, raw logs and hashes, operating UI evidence, explicit open findings and a rollback. No percentage or schedule is inferred from file counts or test totals.

## Immediate next implementation slice

Complete M1 with a versioned canonical catalog read projection and explicit product/SKU/company/store/offer identities, then adapt the real buyer/seller portals to those contracts. Begin with owner-controlled synthetic import fixtures and read-only endpoint rehearsals. Keep WMS and Accounting as their respective authorities. Track actual source exports, native endpoint/runtime access, the financial foundation and provider/operator choices as dependencies; do not invent them or substitute a simulated acceptance result.

## Current boundaries

The isolated build runs the original application, but uses the existing disposable in-memory commercial adapter. Reload resets it. The default application still has its existing authentication/backend flows and disabled checkout. This stage neither installs Mercur into BORVAT nor changes WMS, Accounting, SAM, any production database or hosting. C0/C1 and professional/release reviews remain open; the new development mandate is not their acceptance.

The 69 original binaries remain missing. Removing a compile-time import of a public image does not recover that image. No new substitute picture or media-rights claim is introduced. Library search found historical design/test archives; no original media was recovered in this stage. Previous archive inspection and failed asset recovery evidence remain authoritative for their stated snapshots.
