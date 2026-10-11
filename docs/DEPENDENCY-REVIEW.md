# Technical due diligence — MercurJS

## Findings from upstream references
- Mercur is a multi-vendor marketplace core on Medusa.
- MIT-licensed core supports vendors, offers, commissions, payouts, and admin/vendor dashboards.
- Advanced enterprise capabilities (including EAN matching / deduplication, Buy Box, channel stock sync and automated split payouts) are not assumed part of free core.
- The official installer is `bun create mercur-app@latest <folder>`; upstream says clone monorepo chiefly for Mercur contributors.
- Requirements: Node >=20, PostgreSQL >=13, Redis; Bun recommended.
- Mercur 2.2.x includes an architectural change to master products and offers, so any historical storefront integrations require compatibility testing.

## Decisions
- Candidate only; NO technical acceptance or production selection yet.
- Preserve proprietary Surooh, Lovable, Sam and QNAN projects unchanged.
- Choose extension-by-module rather than modifying upstream internals where possible.

## Mandatory gaps to investigate
- Verified exact version and security advisory status
- Feature gap between free and enterprise modules
- EU and Syria legal/payment feasibility
- Vendor and market isolation (not assumed just because multi-vendor exists)
- Multi-currency reconciliation, VAT, refund and settlement rules
- Staging hosting and full recurring-cost estimate
- Arabic RTL and accessibility
- Independent restore and disaster recovery test

Sources:
https://github.com/mercurjs/mercur/blob/main/README.md
https://github.com/mercurjs/mercur/releases
https://github.com/mercurjs/mercur/blob/main/templates/basic/README.md
