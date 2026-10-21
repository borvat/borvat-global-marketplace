# BORVAT Six-Platform Synthetic Sandbox — Execution Notes
Status: Source committed on feature/mercur-foundation, NOT deployed, not integrated with MercurJS, Neon, Replit or Lovable.

Files:
- prototypes/marketplace-sandbox.mjs
- tests/marketplace-sandbox.test.mjs

Run in a local Node 22 environment from repository root:
`node --test tests/marketplace-sandbox.test.mjs`
For all sandbox tests:
`node --test tests/*.test.mjs`

Test journey:
1. Create buyer, admin, reviewer, ad operator and two sellers.
2. Apply and independently approve sellers.
3. Reject publishing prior to seller approval.
4. Add merchant offers for a common product and independently approve publication.
5. Quote one cart and create a synthetic customer order with two seller sub-orders.
6. Verify seller A cannot see seller B sub-order.
7. Create a synthetic campaign, require admin approval, and reject budget overspend.
8. Hold a suspicious offer; reject its purchase and allow admin release.
9. Check privileged audit read.

LIMITATIONS: This is in-memory educational domain logic; actor identities are plain objects, not signed sessions. It is NOT authorization enforcement, RLS, data persistence, advertising delivery/billing, real fraud scoring, PSP payment integration, tax/VAT quotation or live inventory reservation. Production must reimplement authorization in the trusted backend and isolated DB, with concurrency/idempotency tests.

Before Replit execution, no merge to main solely for importer convenience. Use existing repository PR review/commit chain and reconcile architecture ownership before installing Mercur.
