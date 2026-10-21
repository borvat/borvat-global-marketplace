# Product and architecture specification — proposed, not implemented

## Scope and business ownership

MVP: NL domestic B2C, EUR, verified business sellers, domestic stock, ordinary new low-risk goods, one seller per checkout. Many seller offers can compete on one product. Buyer sees legal seller, item gross price, shipping, promised delivery range, total, cancellation rights and platform role before paying. No default opening to regulated goods, imports, auctions, wallets, BNPL, cash-on-delivery, cross-currency or channel repricing.

Operator legal entity is a configurable, explicitly approved record. Do not infer Borvat.com BV, QNAN or Surooh as operator. Seller is the contractual goods supplier for ordinary MVP transactions; platform supplies intermediation services. Actual contracts, VAT deemed-supplier exceptions and PSP underwriting must agree with this mapping before launch.

| Area | MVP must deliver | Later |
|---|---|---|
| Buyer identity | email registration/verification, login/reset/logout, profile/address controls, order privacy | passkeys, guest checkout |
| Discovery | categories, text search, category/price/availability filters, pagination; product page with comparable seller offers | relevance ranking and recommendations |
| Purchase | persisted cart grouped by seller, immutable server quote, one-seller checkout, PSP hosted sandbox, order detail and tracking | unified multi-seller payment, bundles |
| After-sales | partial return/withdrawal, refund status, support ticket, delivery complaint, verified-purchase rating with moderation | advanced helpdesk and automated mediation |
| Seller | application, KYB documents, independent approval, store profile, products/offer drafts, price/stock controls, order acceptance/packing/shipment, return response, fee statement, sales KPIs | multichannel SaaS, advertising, bulk tools |
| Admin | seller review, product dedup review, restricted-goods block, versioned commissions, dispute/risk queue, scoped permissions and audit | campaigns, fraud models, advanced BI |
| Integrations | Warehouse reservation/fulfilment, Accounting immutable export, SAM scoped read/approved command | multiple warehouses/countries/carriers |

Operational MVP may use human review for KYB, restricted products, disputes and shipping tracking entry. Human decisions must use real persisted queues, scoped authorization and audit; a mock screen is not a manual operation. Required consumer and privacy obligations cannot be deferred as growth features.

## Architecture decision

Prefer a modular monolith plus background worker for the first implementation, keeping the useful existing TypeScript UI/Auth/PostgreSQL stack if the baseline proves portable. Avoid new microservices until independently measured bottlenecks justify them. Domain modules: identity, seller compliance, canonical catalog, offers/pricing, checkout, orders, payment reconciliation, fulfilment, returns, commission statements, support/risk, audit. PostgreSQL transaction + outbox for state changes; idempotent inbox for external events; object storage with signed URLs for documents; search initially PostgreSQL indexed queries. A later search index is a disposable read model.

This is a proposed direction, not a silent override of GitHub ADR-001. Phase C0 must compare the existing stack with a pinned Mercur core spike using the same acceptance cases; record reuse/migration cost and a reversible recommendation. No paid infrastructure or public deploy in this mission.

Internal money values: integer minor units in API (EUR cents) and bigint in DB, bounded within JavaScript safe integer; no floating point. Currency on every money record. Server round-half-up at line tax, allocate discounts/fees/refunds deterministically using largest remainder and stable line ID ordering. Money totals recompute from snapshots; client amounts never authoritative. Tax rules versioned; unknown treatment blocks quote.

## End-to-end journey

1. Seller signs in, creates legal entity/application, supplies register/VAT/contact and return address, accepts versioned seller terms. Documents private, minimal and access logged.
2. Separate reviewer validates business evidence; prohibits reviewing own company. PSP hosted onboarding verifies payment eligibility separately. Platform approval alone cannot activate charges/payouts.
3. Seller creates SKU and suggests mapping to canonical product; catalog admin resolves duplicates, safety information and restrictions. Shared product content does not expose private inventory or supplier cost.
4. Seller publishes offer only when KYB, store, PSP capability, category, tax, price and shipping rules are valid. Automatic suspension blocks new sales when any prerequisite lapses. Pending orders handled by explicit policy.
5. Buyer searches, selects a seller offer and sees gross item, shipping and seller identity. Cart groups by seller; MVP checkout rejects mixed sellers with 422 mixed_seller_checkout, offering separate checkouts without surprise charges.
6. Server quotes totals and delivery using offer/tax/shipping versions and destination. Quote expires, e.g. 10 minutes. Quote is not a stock promise until reservation.
7. Checkout creates durable attempt and atomic stock reservation. Transaction records pending-payment order, quote snapshot and outbox command. Worker creates PSP sandbox session with the same idempotency key. PSP network request is outside DB transaction; timeout is reconciled by provider object/key, not by creating another payment.
8. Browser redirect only shows pending. Verified signed webhook plus provider status/currency/amount/account correlation confirms success. Async payment processing remains pending. Payment captured and fulfilment state are independent. Duplicate/out-of-order events cannot regress confirmed payment.
9. Warehouse commits reservation after success, records pick/pack and shipment. If paid late after reservation expiry: re-reserve atomically; if unavailable, create support exception and sandbox refund command. Never oversell or silently leave a paid order unfulfilled.
10. Seller/carrier submits tracking and delivered evidence. Buyer can track without seeing another seller's package or customer records. Carrier failure produces actionable exception; no fabricated delivery state.
11. Accounting receives seller goods-invoice request as required by approved invoicing policy, separate platform commission invoice/credit, PSP fees and clearing/reconciliation references. Platform is not booked as gross goods revenue when acting as agent. Accounting deduplicates by source event/document ID.
12. Daily statement reconciles PSP charges, fees, refunds, disputes, payout movements and order allocations. PSP pays seller bank per provider schedule and holds/eligibility; BORVAT only records the payout confirmation. Delivery is not payment settlement; expected payout is not bank receipt.
13. Buyer withdraws/returns whole or part. Persist notice and confirmation timestamp independently of logistics approval. Validate line/quantity, calculate legally due shipping and item amounts, inspect returned stock into quarantine, and request refund via PSP. Refund confirmed only on provider evidence. Reverse commission/fee allocation according to agreed policy and applicable rights; PSP fee recovery is not assumed. Dispute after payout creates recoverable balance/PSP deficit case, never an invented internal cash wallet.
14. Delivered buyer can review purchased product/seller; moderation preserves original and reasons, forbids fabricated verified-purchase status. Support cases and seller dispute replies remain scoped; safety recalls can identify affected buyers with minimum disclosure.

## State contracts

| Aggregate | States and rules |
|---|---|
| Seller application | draft→submitted→in_review→approved/rejected/information_required; suspended and reinstatement audited; no self-review |
| Offer | draft→review→active→paused/withdrawn; activation guards server-side; price changes make new version |
| Order | pending_payment→confirmed→fulfilling→completed; cancelled/exception allowed by guarded command. Payment, shipment and return are separate axes |
| Payment | created→requires_action/processing→succeeded/failed/cancelled; partial/full refunded totals derive from refund records. Out-of-order payload never overwrites succeeded blindly |
| Reservation | held→committed→consumed; held→expired/released; cancellation after pick uses compensation rather than stock magic |
| Shipment | planned→packed→handed_over→in_transit→delivered/exception; split quantities supported |
| Return | requested→authorized→in_transit→received→inspected→closed; rejected/exception with reason, without suppressing statutory withdrawal notice |
| Refund | requested→submitted→pending→succeeded/failed; sum successful + pending allocations bounded by refundable captured balance |
| Statement/payout | draft→reconciled→closed; corrections new entries. Provider payout pending→paid/failed/reversed tracked independently |

Cancellation and capture concurrency lock the order/payment allocation. If capture wins, cancellation becomes a refund workflow. If cancellation wins, a late success is reconciled and refunded. Never hide ambiguity by returning a successful order cancellation before compensation status is visible.

## Permissions and security

User identity and company membership are different concepts. One human can buy personally and manage multiple sellers, selecting an authorized context. Server derives accessible companies from trusted session/token, never trusts company_id from UI alone. Composite FKs prevent cross-company references. Buyers read own orders, sellers only own seller-order items and necessary fulfilment PII, support staff only assigned cases, finance only scoped statements, admins separate from company owners. Use capabilities (catalog.publish, shipment.create, return.review etc.) and revocable short-lived credentials, staff MFA, server rate limits and CSRF protection for cookie sessions.

Private business tables in explicit schema with least privilege; allowlisted RPC/API plus RLS defense. Browser never has service-role credentials. SECURITY DEFINER functions require pinned search_path, explicit auth/tenancy, minimal grants, and regression checks across all relation types. Verify live ACL and regrant mechanism before schema relocation; do not repeatedly REVOKE and call the architecture solved. Critical audit append participates in command transaction; if it fails, command fails before external side effect. Outbound intent and effect evidence are durable. Best-effort logs may supplement, not replace it.

Uploads: MIME and size allowlist, antivirus/quarantine, random paths, private bucket, expiring authorization-bound download links, no public identity-document URLs. Tracking links allowlisted/escaped. No secrets or documents in logs, analytics, events or SAM context. Retention and deletion policy separate audit identity from financial evidence, with legal-hold controls. Vendor/cookie/marketing consents separated from transaction processing.

## Integration ownership

| System | Authoritative data | Contract and failure behaviour |
|---|---|---|
| Marketplace | offers, price/quote/order contracts, returns/support, statement allocations | publishes event_id + schema_version + aggregate/version + company_id + market + legal entity |
| Warehouse | physical inventory, reservation availability, pick/pack/ship/return disposition | reserve/commit/release idempotent; unknown stock blocks checkout; reconciliation of stale holds. MVP may use existing reservation module behind same boundary; do not make two stock masters |
| Accounting | legal invoice numbering, books and tax postings | append/export request with dedup key; async retries/DLQ; reconciliation before statement closure; no edits to e-Boekhouden read-only integration |
| PSP | charge, refund, fee, dispute and payout truth | hosted KYB/checkout, signed webhooks, provider re-fetch, daily reconciliation, no platform bank pass-through |
| SAM | derived analysis and authorized commands only | company and purpose scoped reads; proposal→approval→command→verification. SAM cannot set paid, approve itself, change payouts or directly update DB |

Warehouse unavailable before payment: fail closed, no charge. Accounting outage after payment: retain outbox and alert, continue safe fulfilment but prevent false reconciled/closed financial report. SAM outage: marketplace commerce continues. PSP webhook outage: pending queue and reconciliation recover without duplicate effect.

## Scalability and operating gates

Initial planning targets (to test, not capacity claims): 100 active sellers, 10k offers, 50 concurrent browsers; p95 search API <800ms and internal quote <1s excluding provider calls; no oversell in 100 concurrent attempts for one unit; queue lag alert >2min, payment ambiguity alert >15min. Measure on declared staging resources with synthetic data. Index company_id+status+created_at, buyer_id+created_at, product/active price, provider external IDs; cursor pagination and bounded queries. Track conversion, fulfilment SLA, cancellation/return rate, gross merchandise value and platform net revenue separately.

Daily backup plus restore drill with target RPO≤1h/RTO≤4h subject to host capability/cost review. No promise these are met. Reconciliation, deploy rollback, worker crash recovery, security incident and recall runbooks are launch blockers. Marketing campaigns, coupons, loyalty, auctions, native mobile apps, multiple currencies and external marketplaces follow after proven core journey.
