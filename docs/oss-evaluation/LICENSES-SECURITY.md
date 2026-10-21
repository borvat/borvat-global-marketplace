# Licensing, maintenance and security

Evaluated pins and public GitHub metadata are archived in `evidence/upstream-metadata.json`. Latest stable means latest non-prerelease observed in the retrieved release list, not an unsupported long-term-support claim.

| Candidate | Stable release observed | Maintenance/security evidence | Commercial/modification position |
|---|---|---|---|
| Mercur | 2.3.7, 8 October 2026 | Active releases 2.3.5/6/7 in Sep–Oct; 2.3.7 closes vendor and promotion seller-scoping gaps. Public GHSA-w4vq-6jvh-cfpg affects <=2.3.6, patched 2.3.7 | Mercur core MIT permits commercial modification subject to notice conditions. Medusa dependency and separate Enterprise modules have their own licenses; MIT branding does not cover those modules |
| Medusa | 2.22.0, 21 October 2026 | 2.20.1 fixes field-filter exposure; 2.21.0 tightens Store API fields; 2.22.0 runtime breaking change | MIT **except enumerated Enterprise materials**. RBAC/SSO and specified code require a separate commercial agreement. The same exception was verified at Mercur's dependency version 2.21.2 |
| Vendure | 3.8.0, 12 October 2026 | 3.7.2–4 and 3.8.0 include privilege, channel, session and overselling fixes. Old examples/pins must not be copied into production without upgrades | Dual GPLv3 (default) or commercial license. Commercial use and modification are possible under GPL obligations; assess distribution/linked custom work before promising proprietary licensing. Enterprise/VCL cost is unquoted |
| Saleor | 3.23.44, 20 October 2026 | 3.23.43/44 update Pillow/certifi for security; parallel 3.22 patches observed. Published auth/GraphQL advisories and patched ranges recorded | Core BSD-3-Clause allows commercial modification with notice and non-endorsement conditions. Separate dashboard/apps/cloud terms require inventory |
| BORVAT | No validated stable product release | Existing app verification blockers remain. Separate core's narrow 37 tests and audit do not certify the application | No blanket repository license is inferred for recovered code, media or third-party assets. Preserve authorship/license notices and verify rights to missing assets |

Primary license texts: [Mercur](https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/LICENSE), [Medusa](https://github.com/medusajs/medusa/blob/205aff40bacfa0049e0b9d3a7913a674738bff31/LICENSE), [Medusa Enterprise exceptions](https://github.com/medusajs/medusa/blob/205aff40bacfa0049e0b9d3a7913a674738bff31/ENTERPRISE-LICENSE.md), [Vendure](https://github.com/vendurehq/vendure/blob/e53fb43e1ca45dc869ec8d4893738e17f14774d7/LICENSE), [Saleor](https://github.com/saleor/saleor/blob/b2587a12ea15edf3432aaa4c6a5065c9c9ca049f/LICENSE). No paid license, subscription or Enterprise flag was enabled. This is a technical license inventory; final commercial distribution terms need owner/legal approval.

## Audits actually executed

| Installed dependency scope | Result | Interpretation |
|---|---|---|
| Mercur frozen full upstream workspace | Bun audit: 43 package groups; 3 critical, 45 high, 44 moderate, 10 low unique advisory URLs per severity | Includes build tools, frontend, test and backend dependencies. Not a production-only SBOM. Do not compare these counts directly with the smaller prototypes or claim all are runtime exploitable |
| Vendure prototype full install | npm audit: 10 affected dependency entries, including 2 critical | Test tooling included; inherited severity counts include meta-vulnerable ancestors |
| Vendure runtime dependency subset (`--omit=dev`) | 7 affected entries: 5 high, 2 moderate, 0 critical | Includes @graphql-tools/utils, csv-parse, re2 and transitive matching/proxy packages; 5 high entries are not 5 independent exploits |
| Archived current core locked install | npm audit: 0 reported advisories | Applies only to this small engine dependency graph at query time. Does not cover Lovable app, SQL logic, unknown vulnerabilities or the reproduced capture/rollback failure |

Raw scanner JSON is preserved. No `audit fix`, dependency override or downgrade was applied to create green output. In particular, npm's suggested Vendure downgrade is not a validated fix. Public repository advisory retrieval was limited to the first 30 returned items per repository; it is not an exhaustive vulnerability inventory. Medusa's empty repository advisory response does not mean no vulnerabilities: release notes explicitly describe security fixes.

## Blocking findings for the proposed Mercur path

1. **P1 — dependency exposure not triaged:** produce backend/frontend/tooling SBOMs; verify reachable critical/high advisories against exact lock, patch or document reviewed mitigations and re-run. Do not deploy dev tools or infer production safety from an isolated test guard.
2. **P1 — fine permissions opt-in:** `permissions-middleware.ts` grants all catalog rights when no resolver is configured. Tenant boundary tests passed, but seller-staff/operator least privilege is not established. Implement/test a Surooh-owned permission resolver or review an appropriately licensed option; never enable Medusa Enterprise flags without rights.
3. **P1 — simulated finance looks successful:** `SystemPayoutProvider` returns PAID without bank movement. Deny this provider outside explicit isolated tests. Only verified PSP facts and accounting reconciliation can mark settlements final.
4. **P1 — migrations/patch coupling:** Mercur patches Medusa core flows and changes middleware loading; pin both versions, review every patch and migration, test restore/replay. No wholesale historical Supabase migration replay.
5. **P1 — business/legal coverage:** KYB/trader approval, PSP underwriting, consumer returns, privacy retention/access, moderation/DSA and DAC7 applicability/reporting are not provided as a BORVAT compliance certificate by any candidate.
6. **P2 — buybox/line policy:** Mercur intentionally preselects one offer per variant; two old cart/SKU tests are skipped. Enforce the chosen offer and seller server-side and test switching/rejection. Use `cart.items[*].offer.sku` rather than assuming variant SKU is seller SKU.

Supply-chain checks and these probes are not penetration testing. No multi-vendor platform receives a blanket security pass here. ADR approval selects a direction; each implementation stage still requires its own authorization and acceptance evidence.
