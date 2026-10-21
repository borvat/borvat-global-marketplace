# BORVAT six-platform build gate — next verified implementation slice
Date: 2026-10-11
Target branch: feature/mercur-foundation
Current truth: only isolated in-memory prototypes. No MercurJS environment, Neon test migrations, Replit preview or payment processor integration has been accepted.

## Concrete fixes already committed
1. Sandbox user creation ignores caller-supplied sellerId to prevent mock tenant selection.
2. Demo order creation now requires a buyer-scoped idempotency key and returns a previously created order for exact replay.
3. Test stock is decremented once for each created demo order. It is not a transactional inventory reservation system.
4. Sandbox ad budget arithmetic checks safe-integer overflow.

## Important constraints not to mistake for production
- JavaScript object identity is not authentication; only a trusted server-issued session and DB tenant binding can determine sellerId.
- Production idempotency is enforced by a unique database constraint and transaction, with payload fingerprint and response replay.
- Product, offer and stock reads plus reservation/write must be within a transaction with locking or optimistic versioning, expiring holds and event outbox.
- Money calculation must respect VAT, per-seller delivery, currency precision, provider fees and refunds.
- A moderator hold needs enforcement in search, quote, payment authorization and fulfillment.
- Ad spend requires atomic budget accounting under concurrency, publisher verification and sponsorship disclosure.
- Order fulfillment, partial returns, dispute liability, payouts and audit need durable tables and independent finance reconciliation.

## Engineering execution order and acceptance evidence
1. Install MercurJS dependencies into isolated branch runtime, fingerprint versions/license and run its own tests. Do not write to old Lovable production backend.
2. Neon TEST database migration set with identity/org/seller policies, product master, offers, reservations, orders, ads, risk cases, immutable audit and outbox. Integration tests must reject cross-tenant reads/writes.
3. Seller Center: KYB application, reviewer independent approval, offer lifecycle and inventory.
4. Buyer Center: browse, AI tool API, cart quote, explicit checkout test provider and multi-seller order split.
5. Admin and Trust: real moderation queues and server policy enforcement.
6. Ads console: non-billable campaign, approval, labelled sponsored listing, capped metering.
7. Real auth flow, credential rotation, concurrency replay tests, accessibility and smoke tests for all six consoles.
8. Replit deployment of a reviewed branch and demonstration to owner. Merge main only when acceptance gates and owner signoff are established.

## Test commands once repository is checked out
`node --test tests/marketplace-sandbox.test.mjs`
`node --test tests/*.test.mjs`

No claim of live acceptance until test stdout, exit code, runtime metadata and commit SHA are retained.
