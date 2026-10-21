# BORVAT — Legacy Reuse and Six-Console Execution Register

Date: 2026-10-11. Explicit outcome: keep the six full business surfaces in the same system; no more isolated chat-demo-driven scope.

## Confirmed artifacts
1. Lovable project BORVAT STORE (project id 092a5ea2-1dc1-4ffd-a4b4-efe2d3237298), status ready in Lovable, historical seller/admin/support work. Its existing database may contain live data and MUST NOT be imported into Neon TEST or migrated automatically.
2. Drive original smart global store specification and Unified Marketplace PRD v1.2, previously reviewed.
3. GitHub `borvat/surooh-commerce` is a separate Lovable Bundle Stock source snapshot; the README says it is not production certified and bol outbound writes are disabled. It is NOT the same as BORVAT STORE and must not be assumed to contain that store's full code.
4. GitHub `borvat/borvat-global-marketplace` feature branch holds foundation plans and prototypes only, not a production app.

## Reuse admission checklist
- Obtain actual version-controlled code for the BORVAT STORE project, preserving history and licenses.
- Inventory routes, component boundaries, migrations, auth and tenancy policies, merchant dashboard, storefront, admin, support, risk, ads; identify implementation vs mocked UI.
- Review source against MercurJS/Medusa APIs before any copying; do not merge incompatible framework code into Mercur blindly.
- Audit original Supabase auth/data coupling; migrate schema or validated isolated fixtures only after review, never live customer records.
- Verify branch, exact commit, local build and test; only then bring reviewed code to canonical GitHub repo.
- Replit main-only import is an operational constraint, not permission to merge unverified feature work to main.

## Platform checkpoints
| Surface | Historical evidence | Current canonical runtime | Next acceptance |
|--|--|--|--|
| Identity | Historical Lovable auth/RBAC workflows | not verified | buyer/seller/reviewer independent sessions; no self-approval |
| Seller | Historical Lovable Seller Manager and onboarding | not verified | isolated merchant orders/offers and shipping |
| Advertising | no implementation evidence in canonical repo | not verified | demo sponsored placement, approval, budgets, fraud counters |
| Buyer | Lovable storefront and GitHub synthetic chat demo | prototype only | buyer cart/checkout linked to live TEST engine |
| Admin | Historical Lovable Admin shell | not verified | approvals, catalog, support, finance permission matrix |
| Quality/anti-fraud | policy plans, no complete risk console proof | not verified | evidenced moderation queue, appeals, audit trail |

## Immediate engineering sequence (not fully executed)
1. Provenance inventory for BORVAT STORE.
2. Full domain ERD, API contracts and access matrix for all six surfaces.
3. Isolated MercurJS + Neon TEST + Redis installation and test tenant provisioning.
4. Hook buyer and seller to verified core API.
5. Deliver admin, ads, quality consoles in same app.
6. Add multi-model shopping assistant, grounded tools and session-safe action policy.
7. Evidence-backed acceptance, then Replit import/deployment via reviewed main.

### Work completed in this branch
`prototypes/platform-access.mjs` and `tests/platform-access.test.mjs` provide a dependency-free ROLE POLICY REFERENCE with six platform scopes and six tests. This is demonstrative only and must not be connected to live identities: authoritative RBAC belongs server side, with Neon RLS and application service integration verified separately.
