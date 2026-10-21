# Dependencies, licenses and security boundaries

## Tested graph versus proposed graph

Mercur 2.3.7 / Medusa 2.21.2 is the tested pair. Do not substitute Medusa 2.22 solely because its source was inspected. Experimental lodash 4.18.1, express 4.22.3 and @graphql-tools/utils 13.1.1 overrides built successfully and passed 86 selected native tests (two skipped). The major GraphQL utilities override needs broader compatibility coverage before adoption.

The attempted fourth override proxy-addr 2.0.8 passed package-integrity validation and standalone IPv4/IPv6 boundary assertions, but **H07 fails on the actual Framework → Express dependency chain, which still loads 2.0.7**. Frozen-install success and lockfile audit output do not establish installed vulnerability closure. Preserve this failing test and repair actual resolution in an isolated clean install before accepting it.

Before changes, full Bun workspace scanner reported 3 critical / 45 high / 44 moderate / 10 low unique advisory URLs. [Final scanner counts](evidence/audit-summary.json) are scoped to the candidate lock, not a deployed image or authoritative runtime graph. Critical/high remain. Three-overrides scanner output and four-overrides candidate output are preserved separately. The backend-only npm plan reduced metadata vulnerability entries from 101 (31 high, 70 moderate) to 90 (15 high, 75 moderate); these include affected ancestors and are not independent exploit counts. The backend plan has zero reported critical entries, but excludes parts of the actual workspace and cannot establish zero runtime critical risk.

Known unresolved items include braces GHSA-vfj7-8cjw-p6xm (no fixed published version verified), installed proxy-addr GHSA-jqcg-44mw-7w3h, and Storybook/tooling advisories. No advisory was hidden with audit exclusions. For every remaining critical/high: determine shipped package/route reachability, update/remove or provide a verified containment control, rerun a clean installed-image scan and regression tests, and retain evidence. Build-only scope does not automatically waive developer/CI exposure.

## SBOM

- [CycloneDX 1.6 backend SBOM](evidence/backend-sbom.cdx.json.gz): 1,124 components / 1,125 dependency nodes from resolved npm backend package plan. Not the installed deployment image.
- [Schema validation](evidence/sbom-validation.json): official CycloneDX JSON schema validation PASS. npm's built-in SBOM rejected peer constraints, so explicit lock conversion was used; no unresolved nodes in that plan.
- [Actual Bun workspace inventory](evidence/actual-workspace-inventory.json.gz): 3,319 resolved locators with integrity/dependency metadata; license completeness requires review. The failed H07 illustrates why installed module-resolution evidence is also required.
- Three-overrides tested lock and four-overrides rejected candidate lock/package are archived separately. Do not promote either into the recovered BORVAT application lockfile.

## Licenses and paid boundaries

Mercur core repository license is MIT; inspect upstream LICENSE at the pinned commit: https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/LICENSE . Medusa open source core is MIT, with separate commercial/enterprise license boundaries in its repository; enterprise RBAC/SSO features are not licensed by enabling a flag. Preserve notices and inspect file-specific licenses plus transitive licenses for the shipped image before distribution. Commercial use/modification of MIT-covered code requires copyright/license notice retention; it does not grant rights over unrelated trademarks or paid modules.

No Medusa Enterprise RBAC/filter-fields flag was enabled or paid feature assumed. Mercur permissions were exercised through the core extension hook with a fixture resolver; that is not a persisted production authorization service. Own Surooh adapters remain outside the upstream core. This phase does not provide a complete transitive-license clearance; runtime SBOM review, enterprise feature boundary and third-party assets remain release blockers.

## Permission evidence limits

H01/H02 deny selected seller→admin and buyer→seller/admin routes. Existing native vendor isolation suites cover inventory, reservations, returns, offers and order workflows. H03 tests deny-by-default/read-only policy through a fixture. H04 simulates a job adapter that derives trusted actor context then calls the real authenticated API. H05 proves direct module services trust the caller and can update a foreign seller. This is a boundary observation, not proof that an externally reachable exploit exists or that all native jobs are guarded. Every real queue consumer, workflow, webhook and admin extension must enforce trusted principal/company scope or an explicit internal service authority. Never accept tenant/actor authority from untrusted job payload fields.
