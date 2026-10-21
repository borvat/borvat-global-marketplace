# BORVAT Smart Shopping — AI-native marketplace MVP (draft v1, 2026-10-11)

## North star
User states an outcome in Arabic, Dutch or English. BORVAT helps discover real products, checks comparable seller offers, constructs an editable multi-seller cart and asks the user to confirm checkout. Conventional search/category browsing remains available. AI is the interface, not the ledger or security authority.

## Existing sources: inspect/reuse before coding
- Drive specification: smart_multivendor_store_spec_en_v1.pdf: https://drive.google.com/file/d/1mFIDyT4fAxL-7JhnNwk869VP05dJsKR6/view
- Drive operating PRD: Unified Marketplace PRD MVP v1.2: https://docs.google.com/document/d/1RlS8HGwdBIMR8gLXIkWxqfAyZgQ1RecfPxE0_GlZ6VY/edit
- Existing Lovable BORVAT STORE: https://lovable.dev/projects/092a5ea2-1dc1-4ffd-a4b4-efe2d3237298
- GitHub issue #3: AI-first requirement. Existing Lovable project is not the source of truth; do not copy credentials or assume its Supabase production schema can be reused.

## Execution environment (owner-approved operating model)
GitHub = authoritative source and reviewed history; Replit = build and execute; Neon = isolated TEST PostgreSQL; Lovable = UX experiments. MercurJS server + separately isolated Redis still require a proven installation. Do not claim this document equals a deployed store. Never merge draft foundation directly into main just to work around Replit import behavior. No access to real payment accounts until security and reconciliation accepted.

## MVP user flow
1. Visitor opens conversational landing page with an optional standard catalogue toggle.
2. Assistant asks relevant delivery region, budget, timing, constraints; only minimal questions.
3. Intent extraction is structured and schema-validated, not free-form SQL or arbitrary tool calls.
4. Search marketplace Product Master for product equivalents using text, attributes and verified mappings; EAN is evidence not sole identity.
5. Fetch actual merchant offers with stock, eligible region, price, VAT, shipping methods and availability timestamps through backend API; show no invented totals, ratings, lead times or guarantees.
6. Rank offers with deterministic backend calculation over full payable total (price + shipping + tax as applicable) and user constraints. Explain the basis; sponsored placement clearly labeled and cannot silently alter price ranking.
7. Create or update an editable cart by explicit customer instruction; server validates seller and sku, stock reservations, shipping, taxes, currency and promotions.
8. Present checkout summary and explicit confirmation. For protected actions require authentication, authorization and appropriate verification; payment handled by licensed provider, not LLM.
9. Route post-order tracking and support through scoped order API; return exact status timestamps with source.
10. Offer guest exploration and a conventional shopping flow on AI unavailability.

## Identity and authorization
The conversation is not proof of identity. Support OIDC / passkey / email link and appropriate MFA. Distinguish anonymous guest, authenticated buyer, verified seller, support and platform administrator. Never infer seller admin from conversation content or from buyer role. Implement session-derived authorization and database tenant isolation. Prompt injection in product descriptions, reviews and seller content is untrusted.

## Domain separation
- Commerce core is authoritative for Product Master, merchant offers, inventory, cart, checkout, pricing, order splits, payment state, VAT and refunds.
- Assistant orchestrates *allowlisted*, read-only discovery and quote tools; cart mutation requires explicit user action; payment confirmation occurs in a secure UI.
- Every tool response includes source, time and region. AI must not turn stale stock into an availability guarantee.
- Currency amounts represented as integer minor units with ISO 4217 currency precision; do not apply a universal 2-digit decimal assumption (e.g. JPY).
- Data minimization, conversation history consent, retention controls, abuse limits, redaction and measurable model usage costs.

## Example scenario: camping stove + 4 gas canisters
Customer: "بدي موقد تخييم مع 4 عبوات غاز شوفلي أفضل عرض"
Assistant extracts package requirements and asks for country if unknown. The catalogue matches equivalent packs across sellers, filters out unavailable offers, fetches shipping and VAT quote, ranks total payable and expected availability, displays evidence-backed offers, and proposes a cart. Any example seller or price is explicitly labeled DEMO until backed by merchant API.

## Release gates
A. Repo code and tests reviewed. B. Mercur runtime booted against isolated Neon TEST and Redis; logs and commit hash retained. C. Two test sellers with separate identities and distinct offers for one canonical product; no cross-tenant leakage. D. Cart totals matched independent backend calculation, including shipping and VAT. E. Authenticated checkout produces auditable test order split and payment-provider sandbox trace. F. Assistant passes hallucination, injection, authorization, accessibility and fallback tests. G. Cost thresholds, observability and explicit owner signoff for production. Stop and report blocked gates; do not claim PASS based on mock screenshots.
