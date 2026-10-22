> Current continuation: the default local entry now opens the routed NL/BE buyer preview. Discovery is `/discover`, products are `/product/:id`, and the existing demo cart/requests are `/cart` and `/requests`. The prior seller/admin workbench remains at `/workbench`, sharing the same in-memory adapter during local navigation. See [current report](../../docs/buyer-discovery/REPORT.md) and [later-stage roadmap](../../docs/buyer-discovery/ROADMAP.md). This remains a standalone synthetic preview, not the original app/SSR or native integration. The historical PR23 scope below describes its starting point.

# BORVAT commercial application workbench

Preparation-only functional UI, stacked on PR22 commit `7306cd9d9479a81b3443d8611e754450b9efd4a8`. This is an additional local entry into **the existing BORVAT app**, not a replacement project or a backend implementation. New reusable application components live in `apps/marketplace/src/components/commercial` and `src/lib/commercial`. Existing 499 imported text files, route wiring, checkout disable flag, Lovable app, main and PR22 are preserved.

Buyer: search/category/price sorting, canonical product with competing seller offers, cart quantities/removal, article quote and local request review. Seller: example shop selection, offer price draft/review flow and per-shop request preparation. Admin: moderation and shared read overview. All surfaces use one explicitly synthetic in-memory adapter. Shop/view selection demonstrates UI only; it is not authentication, staff permissions or tenant-isolation implementation. No production adapter is supplied.

The UI reuses original Card, Button, Input, Label, Badge, `formatEur`, stylesheet/design tokens and `src/demo/products.ts` fixtures. It deliberately does not mount ProductCard, SiteHeader or the original root route, whose dependencies initialize live backend clients. Product imagery is not substituted: the UI displays an unavailable-image text disclosure and has no img tag. Original routes are not falsely presented as migrated/completed by this workbench.

## Local use

Requires an already installed owner-reviewed local BORVAT runtime with React, TypeScript, ESLint, Vite and tsx. Current evidence reused the existing local installation; authoritative lock selection and clean app install remain open. No package manager or dependency installation is invoked by these scripts.

From this directory:

```sh
python3 prepare-local.py
python3 verify.py
node node_modules/vite/bin/vite.js --config vite.config.mjs
```

Open `http://127.0.0.1:4178/` locally. No credentials or env file are required. Vite config has envDir=false and binds loopback only. Never expose or publish this demo to simulate production readiness. State lives only in the adapter instance: reload/reset discards it. Reset also removes all local requests; no persistence is claimed.

Whole-app diagnostic logs are excluded from this delivery pending specialist disclosure review. No blocked artifact is resubmitted. The scoped verification here checks only the commercial entry, new files and original email renderers. Full original application build remains blocked by unavailable original assets.

## Evidence and limits

[Report](../../docs/commercial-application/REPORT.md), [acceptance cases](../../docs/commercial-application/ACCEPTANCE.md), [C0 plan](../../docs/commercial-application/C0-PLAN.md). Static rendering and domain tests are not browser clicks/hydration/mobile/visual parity. Browser connection to the loopback server was unavailable; browser E2E stays NOT_RUN. Original order email templates are tested only as renderers; they contain paid-order language and are never connected to unpaid demo requests or a delivery API.

No second inventory ledger, invoice/GL, reservation or financial coordinator. Demo availability values are fixture examples and are never decremented/reserved. Article totals exclude uncalculated shipping and are not payable quotes. A demo request has payment=disabled and no invoice/shipment/provider reference. Real order/payment/return/tax/integration work is outside this stage. No C1/Codex, merge, deployment, paid service, production account or database change.

Rollback: abandon this draft branch or remove only its additive files. No schema/data rollback exists because no database is touched.
