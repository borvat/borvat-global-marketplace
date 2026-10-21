# BORVAT Marketplace — isolated Mercur bootstrap

Status: instructions validated against upstream README; install NOT executed yet.

Upstream: https://github.com/mercurjs/mercur
License of Mercur core: MIT (preserve original notices and verify all transitive licenses).

## Prerequisites
- Node.js 20 or newer
- Bun
- PostgreSQL 13 or newer
- Redis
- Separate development credentials, database, and Redis instance (NOT Lovable / Sam / QNAN production)

## Initial local setup
In a clean working folder outside other company projects:

```bash
bun create mercur-app@latest borvat-marketplace
cd borvat-marketplace
bun run dev
```

Follow the prompts, optionally include the storefront. This creates an **upstream-generated application**; inspect package manifests, version locks, license notices, and generated files before moving source to this BORVAT repository. Never overwrite this repo's documentation blindly.

According to Mercur upstream README:
- API: http://localhost:9000
- Admin: http://localhost:9000/dashboard
- Vendor: http://localhost:9000/seller

These addresses refer to local development only, not a BORVAT deployment. Upstream seeded demonstration credentials must be replaced or disabled before any network-accessible deployment.

## Version governance
The installer above uses `@latest` for initial local investigation only. Do not accept moving dependencies in CI or production. After a successful reproducible setup, record the exact Mercur, Medusa, Bun and Node versions; commit the generated lockfile, add dependency checks, and pin image digests.

## First smoke tests
1. Verify app boots and dashboards load.
2. Ensure login works only for authorized accounts.
3. Create 3 demo vendors and 30 synthetic products.
4. Confirm two vendors can offer one canonical product with distinct inventory and prices.
5. Place a multi-vendor sandbox order, inspect split, commissions, cancellation/refund.
6. Check vendor A cannot query vendor B order or payout details.
7. Capture logs and test evidence before requesting any staging publish.

## External actions prohibited in this phase
- No real Stripe accounts, card capture, vendor payouts, or customer emails.
- No production secrets, customer data, external market writes, or production database migrations.
- No paid publishing or purchases without explicit price breakdown and owner authorization.
