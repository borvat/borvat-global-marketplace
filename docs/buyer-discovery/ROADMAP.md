# Later NL/BE catalog and channel stages — proposals only

BORVAT should serve the owner's independently owned catalog first and retain separate seller-offer identities for a later marketplace. bol is one sales channel, never the canonical catalog or customer source. The current fictional collection does not establish ownership, licensing, commercial service terms or real integrations.

| Next bounded stage | Required input / acceptance |
|---|---|
| Owner catalog and original media | Authorized owner PIM/export and proof of media/content rights; recover the69 original assets from an approved source. Map legal company → store → canonical product → SKU → channel offer without treating EAN or bol IDs as physical-stock identity. Start with validated offline fixtures/read-only import rehearsal; no live import authorized now. |
| Authoritative read projections | Review versioned read contracts with owner/catalog, WMS and Accounting. Preserve company/store/product/SKU references, freshness and native document IDs. WMS supplies quantity/reservation/movement projections; Accounting supplies invoice/credit/value references. No projected balance becomes a writable stock or financial ledger. Actual read-only integration requires approved isolated endpoints and synthetic data. |
| Separately scoped bol adapter | Confirm permitted channel-only purposes and content rights before any implementation. Independently owned PIM data can be the candidate source for BORVAT, with a separate bol sales-management adapter subject to validated API terms. No extraction of bol catalog/reviews/customer lists to populate BORVAT is proposed. |
| NL/BE commercial readiness | Confirm actual owner inventory/products, service regions, shipping/returns/customer-service terms, pricing/tax presentation and applicable languages. The current Dutch/EUR seam is not complete French localization or fiscal acceptance. Obtain professional review where required before commercial promises. |
| Original app integration and native acceptance | Recover assets and resolve the authoritative dependency/runtime gaps; review real auth/read boundaries before original route wiring. Test the original full build, SSR hydration, native warehouse/accounting journeys and retries in separately authorized environments. Keep the current demo isolated until those gates are reviewed. |

## Channel restrictions supplied by the parent's official-source research

These are roadmap constraints from research supplied to this task, not an independent comprehensive legal opinion or permission to use a channel API:

- bol's [self-promotion policy](https://partnerplatform.bol.com/nl/idp/zelfpromotie) restricts own-webshop links, coupons/inserts, own-shop URLs on invoices and off-platform solicitation. The company-name-only packaging exception is narrow. Do not design a bol-order marketing funnel around inserts or customer redirection without a separately confirmed permitted scope.
- bol's [privacy/AVG policy](https://partnerplatform.bol.com/nl/idp/avg) prohibits using order customer data for marketing/profiling. No bol customer-data import, audience creation or messaging is part of this roadmap implementation.
- [Retailer API terms, Article3.1](https://api.bol.com/retailer/public/Retailer-API/legal/terms-of-service.html) limit API purposes to managing sales via bol. Treat any unresolved cross-channel reuse as requiring clarification from the provider/qualified reviewer; do not infer permission from technical access.

The earlier user wish to build curiosity among existing buyers does not override these boundaries. Independent BORVAT discovery and owner-controlled catalog work can proceed within separately authorized scope; promotional distribution, API use and customer-data processing are distinct decisions.

## Exact current environment blockers

WMS is still pinned at `e668ed35d0d0f37286b50e8ae787dc2a40fa7256`; Accounting at `34adb0e16be584b5e3823b2cb46a80abb5eaf869`. Previous frozen WMS install returned HTTP403 from `https://europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/` for locked artifacts including `@supabase/supabase-js@2.117.2`, `@tanstack/react-start@1.168.60` and `@lovable.dev/cloud-auth-js@1.2.1`. No retry or bypass in this stage.

Required environment action: owner/environment administrator provides permitted access to exact locked artifacts or a reviewed complete runtime, plus disposable ERPNext/Frappe16.52.0 with matching upstream archives/sources, Python3.14.8, MariaDB11.8.9, Redis7.0.15, Node24.19.0/Bun1.3.13, native dependencies, fresh synthetic sites/databases/storage and available loopback ports14306/17379/18080/18081. Chromium is available but its path must be explicitly configured for the native harness. Provisioning alone does not satisfy security isolation or professional accounting gates. No authorization or permission changes are made by this document.
