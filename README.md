# borvat-global-marketplace

Global Multi-Vendor Marketplace Platform.

This branch contains a **working commerce core**: a real PostgreSQL schema, a real
HTTP API, real tenant isolation enforced by the database, and a test suite that
runs against PostgreSQL rather than mocks. It is the engine a multi-vendor
marketplace needs before any storefront or assistant is layered on top.

Everything described below has been executed and verified. Anything not yet built
is listed explicitly at the end, so the gap is never hidden.

## What actually works today

One customer order can contain offers from several independent vendors. The
system validates every line against live stock and price, reserves stock
atomically so two buyers cannot buy the same last unit, splits the order into one
sub-order per vendor, records platform commission per vendor, charges once
through a payment provider boundary, and exposes each vendor only its own
sub-order and its own money ledger.

Verified end to end through the HTTP API:

| Step | Result |
| --- | --- |
| Public catalogue search, no authentication | returns active products with the cheapest offer |
| Competing offers for one product | ranked by full payable total, not headline price |
| Cart mixing two vendors | `items=6295 shipping=395 tax=1161 total=6690` at 21% VAT |
| Checkout with idempotency key | one order `PAID`, split into 2 vendor sub-orders |
| Commission | vendor A 1500 bps → 645, vendor B 2000 bps → 478 |
| Idempotent replay | same order returned, no second charge, no second stock movement |
| Vendor isolation | vendor Alpha sees 3 offers (its own), never vendor Beta's |
| Unauthenticated access | `401` on seller and buyer endpoints |

## Architecture

```
buyer / vendor / admin HTTP request
        |
   Express API  (authentication, role checks, request validation)
        |
   domain services  (catalog, offers, inventory, cart, pricing, checkout, vendors)
        |
   one transaction with tenant context installed as PostgreSQL session variables
        |
   PostgreSQL 16 with row level security on every business table
```

This layer is deterministic by design. Money, stock and authorisation are decided
by SQL constraints and transactions, which is what makes an assistant safe to add
on top later.

### Why the database enforces isolation

The API connects as `borvat_app`, a role that does **not** own the tables, so every
row level security policy applies to it. Trusted server code installs a context per
transaction:

| Setting | Meaning |
| --- | --- |
| `borvat.platform = 'on'` | trusted platform operation: checkout, approvals, authentication lookup |
| `borvat.public_read = 'on'` | buyer-facing catalogue read of ACTIVE offers only |
| `borvat.curator = 'on'` | catalogue curation by a trusted reviewer path |
| `borvat.org = '<uuid>'` | the vendor organization acting right now |
| `borvat.user_id = '<uuid>'` | the authenticated user acting right now |
| `borvat.guest_token` | an anonymous cart owner |

Request input never reaches these settings directly. A bug in a route handler
therefore cannot silently read another tenant's rows: the query returns nothing.

## Domain model

A **product** is the canonical master record. A **vendor offer** is one seller's own
price, stock, condition and delivery promise for that product. This separation is
what makes a marketplace different from a shop, and it is enforced in the schema.

Money is always an integer count of minor units with ISO 4217 precision, so JPY has
0 decimals and EUR has 2. No currency amount is ever a float, and JSON serialises
amounts as strings so nothing is lost in transit.

Tax is extracted from a tax-inclusive consumer price (`tax = gross * rate / (1 + rate)`),
which is the European convention. Shipping is charged once per vendor per order,
because one vendor ships one parcel; a free-shipping threshold on the vendor's goods
subtotal removes it.

## Schema highlights

| Guarantee | Where it lives |
| --- | --- |
| A seller cannot approve its own application | `vendor_applications` check constraint and a trigger on `vendor_profiles` |
| Money can never be edited after the fact | `ledger_entries` append-only trigger, no update or delete policy |
| Stock history can never be rewritten | `inventory_ledger` append-only trigger |
| A quoted price can never be altered | `quotes` append-only trigger plus a content hash |
| Commission plus payout equals what the buyer paid | `vendor_orders` check constraint |
| Stock cannot go negative, even under concurrency | guarded `update ... where stock_available + delta >= 0` |
| A refund cannot be approved by its requester | `refunds.no_self_refund_approval` |

## Running it

Requires Node.js 22 and PostgreSQL 16.

```bash
npm install

# two connections on purpose: the admin one migrates, the app one is policed by RLS
export ADMIN_DATABASE_URL=postgres://postgres:...@127.0.0.1:5432/borvat_dev
export APP_DATABASE_URL=postgres://borvat_app:...@127.0.0.1:5432/borvat_dev

npm run db:migrate          # applies migrations and records content hashes
npm run seed                # platform admin, two vendors, catalogue, competing offers
npm run api                 # HTTP API on PORT (default 8080)
```

The migration runner refuses to continue if a file that was already applied has
changed, so schema history cannot drift silently.

## Verification

```bash
npm run typecheck           # strict TypeScript, no errors
npm test                    # 37 tests against real PostgreSQL
bash scripts/e2e-http.sh    # full flow through the running HTTP API
```

The test suite rebuilds the schema from migrations for every file and asserts the
guarantees above, including two concurrent buyers racing for the last unit, a
declined payment leaving no order and no reserved stock, and a repeated
idempotency key returning the original order instead of charging twice.

## HTTP API

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | anyone |
| GET | `/api/me` | authenticated |
| GET | `/api/catalog/search`, `/api/catalog/products/:id`, `/api/catalog/products/:id/offers` | public |
| GET/POST | `/api/vendor/applications` | authenticated |
| GET | `/api/admin/vendor/applications` | platform admin |
| POST | `/api/admin/vendor/applications/:id/approve`, `/reject` | platform admin |
| POST | `/api/admin/products` | platform admin |
| GET/POST/PATCH | `/api/vendor/offers`, `/api/vendor/offers/:id` | seller |
| POST | `/api/vendor/offers/:id/stock` | seller |
| GET | `/api/vendor/stock-ledger`, `/api/vendor/orders`, `/api/vendor/ledger`, `/api/vendor/profile` | seller |
| POST | `/api/guest-session` | anyone |
| POST/GET | `/api/cart`, `/api/cart/:id` | buyer or guest |
| POST/PATCH/DELETE | `/api/cart/:id/items[/:itemId]` | buyer or guest |
| POST | `/api/cart/:id/quote` | buyer or guest |
| POST | `/api/checkout` (requires `Idempotency-Key`) | authenticated buyer |
| GET | `/api/orders/:id` | owning buyer |

## Payments

Payment sits behind a provider interface. The sandbox provider is deterministic so
order behaviour is testable without real money, including a decline path. A real
provider is added by implementing the same interface; the marketplace never stores
card data and never talks to a card network directly.

## Not built yet

These are genuine gaps, not hidden ones:

- **Conversational shopping layer.** The "smart" assistant is not implemented here.
  It belongs on top of this core and must read stock, price and availability only
  through these APIs, so it can never invent a price or promise a delivery date.
- **Refund execution.** The schema and approval constraints exist; the service and
  the provider refund call do not.
- **Fulfilment, shipping labels, returns and payouts.** Vendors currently see
  confirmed sub-orders and a ledger balance; there is no carrier integration and no
  payout run.
- **Vendor KYC documents, advertising platform, trust and anti-fraud queues.**
  Specified in `docs/COMPLETE-MARKETPLACE-PLATFORM-SCOPE.md`, not implemented.
- **Hosted CI.** The repository workflow exists but GitHub Actions is blocked on
  this account, so the verification above was executed locally on real PostgreSQL.
- **Production deployment.** No TLS ingress, no managed database, no monitoring.

## Repository layout

```
migrations/      SQL schema, including row level security and append-only guards
src/config.ts    runtime configuration
src/db/          connection pools, migration runner, seed
src/domain/      money, pricing, catalog, offers, inventory, cart, checkout, vendors, identity
src/http/        Express API
tests/           37 tests against real PostgreSQL
scripts/         end-to-end HTTP proof and its JSON formatter
```