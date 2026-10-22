# Inspected original-app integration dependency map

Inspection is from the preserved source inherited at PR25. No original module was executed, no cloud endpoint queried and no dependency installation attempted.

| Boundary / actual source | Observed dependency and gap | Required later integration work |
|---|---|---|
| `apps/marketplace/vite.config.ts` | Imports Lovable TanStack config and MCP Vite plugin; original Start/Nitro setup differs from the small React/Vite preview. Those packages are absent from the installed preview runtime. | Supply a reviewed complete pinned original runtime. Use its actual configuration in a separately isolated build; do not substitute fake packages or label the standalone build as full-app success. |
| `src/router.tsx` → `src/routeTree.gen.ts` | Creates QueryClient/TanStack router and imports the generated tree. TanStack Router/Query/Start are absent locally. The tree includes original root and product routes, not just the new buyer view. | Actual typed route registration and navigation adapter wiring need that runtime. The completed host port can accept the router's location subscription and navigation callbacks, but no TanStack-specific adapter has been verified or claimed. |
| `src/routes/__root.tsx` | Mounts Supabase auth subscription and backend-aware SiteHeader; owns QueryClientProvider, HeadContent/Scripts, HTML shell, main landmark and metadata. | Separate synthetic service injection and shell ownership before mounting. Buyer currently owns a header/main plus document title/lang effects; compose these deliberately to avoid duplicated landmarks/head metadata. Initial route snapshots are supported by the port but SSR hydration is still untested. |
| `src/components/site-header.tsx` | Reads auth/session, categories/cart and imports original logo metadata. | Preserve design while injecting read-only synthetic header state and recovering authorized media. Mounting unchanged would invoke backend client paths. |
| `src/integrations/supabase/client.ts` | Lazy proxy initializes a real client when a property is accessed; requires URL/key configuration and configures persistent/refreshing auth. Root/header effects access it. Package absent locally. | Do not supply production keys or fake full-integration success. A reviewed isolated service boundary must prevent real auth/read/write activity; no changes to credentials/security settings are part of this task. |
| `src/routes/index.tsx` | Direct missing `public/images/hero.jpg` import plus Supabase catalog/category queries. | Recover originals and separate presentational catalog reads. Complete asset gate remains failed on69 original binaries. |
| `src/routes/search.tsx` | Validates `q` and `cat`; `cat` is a database category ID. Sort is local component state. Reads products/categories. | Explicitly map canonical category IDs and URL state; demo labels Wonen/Tuin must not be silently treated as original category IDs. Include country/offer/filter state in reviewed route validation. |
| `src/routes/c.$slug.tsx` | Resolves category slug through Supabase and references `/images/categories/${slug}.jpg`. | Approved slug-to-category mapping and original media; no invented image URLs or fabricated replacement assets. |
| `src/routes/product.$id.tsx`, `components/product-card.tsx` | Original product/session/profile reads and wishlist writes; product page writes `cart_items` keyed by product. Original card calls productImage fallback. | Keep original product/company/store/SKU semantics; map selected seller offer explicitly rather than collapsing offer ID into product ID. Separate wishlist/cart commands and unverified commercial promises. No fallback image substitution or real writes now. |
| `src/routes/cart.tsx` | Reads authenticated `cart_items` and updates/deletes backend rows. | Reuse the demo command store until a separately approved real contract is tested. The current shared demo cart is not an implementation of authenticated backend persistence. |

`installed-capabilities.json` records the absent packages in the existing runtime without downloads. All499 imported text hashes remain unchanged. This map is a functional dependency inspection, not a comprehensive security audit or a resubmission of previously rejected whole-app diagnostics.

## What is now connected, and what is not

Connected and tested: buyer presentation → injectable host navigation → isolated host history; buyer presentation → existing synthetic demo adapter; delayed/failed catalog projection → cancellation/error/retry boundary. Browser-history, current route and initial route are host-owned when injected. The standalone preview retains its explicit browser implementation.

Not connected: original generated TanStack tree/root/header, original Supabase reads/auth/wishlist/cart, SSR server entry/hydration, actual catalog/PIM/channel APIs, native WMS/Accounting or payments. Additional dummy routing files would not establish these integrations.

The existing [NL/BE roadmap](../buyer-discovery/ROADMAP.md) continues to apply: independently owned catalog/PIM first; bol is a separately scoped channel under its validated restrictions; WMS owns quantities/reservations/movements and Accounting/native ERPNext owns invoices/credits/GL/valuation. No shadow balances or customer-data marketing.

## Minimum owner/environment action

1. Provide an authorized export of missing original media and a reviewed complete pinned original application dependency runtime. Do not retry or reroute denied artifacts without materially new permitted-access evidence.
2. Review the narrow original root/header/route service-adapter changes required above and explicitly account for changing preserved imported text hashes. This is a scoped integration decision, not permission to connect production or weaken gates.
3. Keep full original build, actual router/SSR/mobile accessibility and isolated service acceptance as distinct checks. Native WMS/Accounting still additionally require the exact dependency access and disposable ERPNext runtime documented in the prior roadmap; neither was exercised here.

No decision is needed to complete this bounded milestone; its feasible boundary and functional defect are implemented and tested. These inputs are for the next original-app integration milestone.
