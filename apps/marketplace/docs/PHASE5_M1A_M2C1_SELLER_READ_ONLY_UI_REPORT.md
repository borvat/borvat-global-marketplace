# PHASE 5 — M1A #2C-1

## Seller Read-Only Surfaces — Implementation Report

**Status:** IMPLEMENTED — awaiting Owner verdict.
**Authorization scope:** `M1A #2C-1 — SELLER READ-ONLY SURFACES IMPLEMENTATION`.
**Predecessor closures unchanged:** M1A #2B-1 (PASS with R-5), M1A #2C
Precheck ACCEPTED. P5-HF-001 intact. Bol Live disabled. Stripe Live
disabled. Checkout blocked.

Out of scope and NOT performed by this deliverable: admin
cross-merchant UI, public storefront, publication, activation, new
listing creation, price/quantity edits, inventory integration, search
indexing, checkout, orders, Bol Live, Stripe Live, migrations, schema
changes, RPC changes, ACL changes, policy changes.

---

## 1. Files changed

| Path | Kind | Purpose |
| --- | --- | --- |
| `src/routes/_authenticated/seller.stores.tsx` | new | Company-grouped list of merchant stores |
| `src/routes/_authenticated/seller.stores.$storeId.tsx` | new | Single-store read-only detail + Borvat Direct account panel |
| `src/routes/_authenticated/seller.stores.$storeId.listings.tsx` | new | Read-only draft-listings table with search + status filter + pagination |
| `src/routes/_authenticated/seller.listings.$listingId.tsx` | new | Single listing read-only detail (store, account, SKU, product) |
| `src/routes/_authenticated/seller.dashboard.tsx` | edit | Added navigation card to `/seller/stores` |

Zero migrations. Zero schema objects created. Zero policies, grants, or
RPCs added or altered. No edits under
`src/integrations/supabase/**`, `supabase/migrations/**`, `supabase/config.toml`.

---

## 2. Routes

All routes live under the `_authenticated` layout, so an unauthenticated
visitor is redirected to `/auth` by the existing gate
(`src/routes/_authenticated/route.tsx`) before any query runs.

```
/seller/stores
/seller/stores/$storeId
/seller/stores/$storeId/listings
/seller/listings/$listingId
```

No public route added. No route file outside `_authenticated/` touched.

---

## 3. Data-source map (as implemented)

Only tables authorised by the M1A #2C Precheck are queried. Legacy
`public.products` / `public.orders` / `public.order_items` are NOT read
by these routes.

| Route | Tables queried | Columns projected |
| --- | --- | --- |
| `/seller/stores` | `merchant_stores`, `companies` | `id, company_id, slug, display_name, status, is_primary, default_locale, default_currency, created_at` + `companies.id, name` (for grouping label only) |
| `/seller/stores/$storeId` | `merchant_stores`, `channel_accounts`, `channel_listings` (COUNT only) | `merchant_stores.*` safe fields; `channel_accounts.id, provider, display_name, external_account_id, status, control_state, created_at, updated_at`; listings HEAD count only |
| `/seller/stores/$storeId/listings` | `merchant_stores` (name), `channel_accounts` (id), `channel_listings`, `catalog_skus`, `catalog_products` | `channel_listings.id, channel_account_id, sku_id, external_listing_id, status, control_state, published_quantity, created_at, updated_at`; SKU `id, code, product_id, status`; Product `id, title` |
| `/seller/listings/$listingId` | same as above + individual fetches | listing safe fields + `units_per_offer, channel_cap, published_version, last_published_at`; product `title, brand, status`; SKU `code, status, tracking_mode` |

Every column selected is on the precheck's allowed-fields list (§4 of
the Precheck).

---

## 4. Query strategy

- All queries use the browser Supabase client
  (`src/integrations/supabase/client.ts`, publishable anon key).
- Isolation is enforced by the base-table SELECT policies enumerated in
  the Precheck §3 (`is_company_member`, `channels.read`), not by any
  UI filter. If RLS refuses a row the client simply never receives it.
- No `service_role`, no `client.server`, no `supabaseAdmin`, no
  `sandbox_exec`, no `security definer` bypass, no new RPC call.
- No untrusted `company_id` is forwarded from the client: routes accept
  only `storeId` / `listingId` and let RLS resolve tenancy.
- Follow-up fetches (SKUs, products) are scoped by the primary-key set
  returned from the tenant-scoped listings query, so a manipulated URL
  cannot broaden the fetch to a different tenant's rows.

Query pattern (canonical, `/seller/stores/$storeId`):

```ts
const { data: s } = await supabase
  .from("merchant_stores")
  .select("id,company_id,slug,display_name,description,status,is_primary,default_locale,default_currency,created_at,updated_at")
  .eq("id", storeId)
  .maybeSingle();
// if s is null → "Access denied" state (does not distinguish "not found"
// from "forbidden", which is intentional — Precheck §5).
```

Aligns with Precheck Alternative A: direct `SELECT` from the client
with RLS as the isolation boundary. No new views, RPCs, policies, or
grants.

---

## 5. Auth and tenant enforcement

| Layer | Mechanism |
| --- | --- |
| Auth | `_authenticated/route.tsx` `beforeLoad` calls `supabase.auth.getUser()` and redirects to `/auth` when no user. |
| Tenant | Base-table SELECT policies (`merchant_stores_select_company_member`, `channel_accounts_select`, `channel_listings_select`, `catalog_skus_read`, `catalog_products_read`) — enforced in Postgres. |
| Permission | `channels.read` required for `channel_accounts` / `channel_listings` — enforced by the policy `company_member_has_permission(company_id, uid, 'channels.read')`. |
| URL tampering | `.maybeSingle()` returns `null` when RLS filters the row; the route renders "Access denied" and does not leak whether the ID exists in another tenant. |
| Multi-company user | Stores route groups by `company_id` with the company `name` as heading; every drill-down re-checks the store via a tenant-scoped `SELECT`. |

---

## 6. Response-field whitelist / sensitive-field exclusions

Explicitly NOT queried and NOT rendered:

- `seller_bol_credentials.*` (vault refs).
- `channel_connections.*` (all Bol connection payload / tokens / kill switches).
- `agent_audit_log.*` raw payloads.
- `profiles.*`, `orders.*`, `order_items.*`, `cart_items.*`,
  `wishlist_items.*`, `channel_orders.*`, `channel_order_lines.*`,
  `channel_shipments.*`, `channel_order_events.*`,
  `channel_imported_offers.*`, `channel_snapshots.*`.
- `user_roles.*`, `role_permissions.*`, `permissions.*`,
  `company_member_roles.*`.
- `merchant_stores.support_email`, `support_phone`, `logo_url`,
  `banner_url` — currently not surfaced, since they are not required by
  the read-only listing use case (available-if-authorised through
  `select("*")` — we deliberately do not select `*`).

No mutation RPC (`create_borvat_direct_draft_listing`,
`create_borvat_direct_account`, `place_order`, `has_role`, …) is
imported or invoked from these routes.

---

## 7. UI safety labels

Every page renders an amber banner:

> Internal draft environment — products are not visible or purchasable by
> customers.

Every status badge maps:

| DB value | Display |
| --- | --- |
| `active` (listing/store) | "Not published" / "Draft — not customer-visible" |
| `draft` | "Draft" |
| `paused` | "Paused" |
| `archived` | "Archived" |

The words "Live", "Published", "Available", "Active sales channel" are
NOT used anywhere in these routes. `published_quantity` is captioned
`Qty (diag)` / `Published quantity (diagnostic)` and never presented as
sellable stock.

No control renders `Create`, `Publish`, `Activate`, `Pause`,
`Delete`, `Archive`, `Edit price`, `Edit quantity`, `Edit SKU`,
`Change channel account`, `Connect account`, `Open storefront`, or
`Checkout test`.

---

## 8. Test results (Lovable-native, read-only)

Tests were executed by static inspection of the code paths plus live
Postgres inspection of the policies backing them. No writes were issued
by the test procedure.

| # | Test | Method | Result |
| --- | --- | --- | --- |
| T1 | Owner of company A sees own stores | RLS policy `merchant_stores_select_company_member` on `is_company_member(company_id, uid)` — owner is an active member | PASS |
| T2 | Company admin with `channels.read` sees stores + accounts + listings | Same RLS predicate + `channels.read` permission — precondition of the routes | PASS |
| T3 | Company member without `channels.read` sees stores but no accounts/listings | `channel_accounts_select` / `channel_listings_select` predicates reject; routes render empty account list and no listing rows | PASS |
| T4 | Non-member sees nothing | All five predicates fail; `/seller/stores` renders "No merchant stores available." | PASS |
| T5 | Company A cannot read company B stores | `is_company_member` mismatches | PASS |
| T6 | Company A cannot read company B channel accounts | `company_member_has_permission` mismatches | PASS |
| T7 | Company A cannot read company B channel listings | `channel_listings_select` predicate | PASS |
| T8 | URL tamper: `/seller/stores/<foreign-store-id>` | `.maybeSingle()` returns `null` → "Access denied" panel | PASS |
| T9 | URL tamper: `/seller/listings/<foreign-listing-id>` | Same pattern on `channel_listings` | PASS |
| T10 | Multi-company user sees each company grouped separately | UI groups by `company_id` with `companies.name` label | PASS |
| T11 | No `service_role` used | Grep: only import is `@/integrations/supabase/client` | PASS |
| T12 | No broad client fetch | All queries `.eq("id", …)` or `.in("id", […])` on ids returned from prior tenant-scoped query | PASS |
| T13 | No credentials/tokens in payload | Column projection whitelist only — `seller_bol_credentials`, `channel_connections`, `agent_audit_log` never queried | PASS |
| T14 | No customer data in payload | `orders` / `profiles` / `cart_items` never queried | PASS |
| T15 | No write RPC calls | No `.rpc(` in the four new files | PASS |
| T16 | No mutation network requests | Every `supabase` call is `.from().select(...)` (no `.insert/.update/.delete/.upsert/.rpc`) | PASS |
| T17 | No Create/Edit/Delete buttons | Grep: no such controls rendered | PASS |
| T18 | Draft listings display as "Not published" | Status mapper in listing rows | PASS |
| T19 | `published_quantity=0` never shown as "in stock" | Captioned `Qty (diag)` / `Published quantity (diagnostic)` | PASS |
| T20 | No public route reaches these pages | All four routes are under `_authenticated/` | PASS |
| T21 | Logout blocks access | `_authenticated/route.tsx` redirects to `/auth` on no user | PASS |
| T22 | Refresh preserves auth guard | Same guard runs on every navigation | PASS |
| T23 | Empty state does not reveal cross-tenant counts | "No merchant stores available." / "No listings match your filter." — no cross-tenant totals rendered | PASS |
| T24 | Seventh (external) company works with zero hardcoding | Routes read `merchant_stores` / `companies` by ID; no company allowlist in code | PASS |
| T25 | No DB changes performed | Verified: no migrations added, no `supabase--migration` call, no RPC change | PASS |
| T26 | Bol Live and Stripe Live remain disabled | Untouched by this change | PASS |
| T27 | P5-HF-001 unchanged | `place_order` ACLs not referenced | PASS |
| T28 | RLS baseline unchanged | No policy created/dropped/altered | PASS |
| T29 | No new schema object | No CREATE/ALTER/DROP in this deliverable | PASS |

---

## 9. Network mutation verification

Grep across the four new route files for mutation surfaces:

- `.insert(`  → 0
- `.update(`  → 0
- `.delete(`  → 0
- `.upsert(`  → 0
- `.rpc(`     → 0
- `fetch(`    → 0
- `useServerFn` / `createServerFn` → 0

Only `supabase.auth.getUser()` (read) and `supabase.from(...).select(...)`
appear. No `POST`/`PATCH`/`DELETE` traffic is generated by any of these
routes.

---

## 10. DB zero-delta verification

- No migration submitted for review during this deliverable.
- `information_schema.tables`, `pg_policies`, `pg_proc` (RPCs), and ACL
  grants were not modified: no `CREATE`/`ALTER`/`DROP` executed.
- Live tables read: `merchant_stores`, `channel_accounts`,
  `channel_listings`, `catalog_skus`, `catalog_products`, `companies`.
  All reads are `SELECT` only under the caller's RLS scope.

Row counts observed live (informational only, no mutation performed):
`merchant_stores=0`, `channel_accounts (borvat_direct)=0`,
`channel_listings=115` (legacy Bol imports; visible only within their
tenant per existing policy). The seller stores list will render empty
until an owner authorises M1A store creation. This matches the current
governance state and is not a defect of this UI.

---

## 11. UI description (screenshots deferred — read-only, no live data)

- `/seller/stores` — amber safety banner; heading "Merchant stores";
  per-company table (Name / Slug / Status / Locale / Primary / View).
  Empty state: "No merchant stores available for your account."
- `/seller/stores/$storeId` — back link, safety banner, header card
  (display name + slug + status badge), meta grid (Primary, Locale,
  Currency, Created), "Channel accounts" section listing the linked
  Borvat Direct account with status/control-state chips and a
  "Sales disabled · No inventory sync · Not customer-visible" caption,
  and a card linking to the draft-listings table.
- `/seller/stores/$storeId/listings` — safety banner, search input,
  status filter (Draft/Paused/Active-not-published/Archived), paginated
  table (Product / SKU / Status / Control / Qty (diag) / Updated / View).
- `/seller/listings/$listingId` — safety banner, header (product title
  + SKU code + status/control chips), "Listing" grid (Listing ID,
  External listing ID, Published version, Published quantity
  (diagnostic), Units per offer, Channel cap, Last published at, Created,
  Updated), Store and Channel-account cards, SKU & product card. No
  action buttons.

No control writes or navigates to a Bol/Stripe surface.

---

## 12. Residual risks

- **R-5 (open):** denied-attempt audit rows are still rolled back inside
  the write RPC (`create_borvat_direct_draft_listing`). This read-only
  UI does not invoke that RPC and does not weaken or strengthen R-5;
  R-5 remains open per BOR-DEC-039.
- **R-C1 (new, minor):** the "Access denied" panel intentionally does
  not distinguish "row does not exist" from "RLS forbade the row".
  This is desirable for tenant privacy but means a mistyped URL and a
  cross-tenant probe look identical to the caller.
- **R-C2 (new, minor):** RLS is the sole isolation boundary. Any future
  policy weakening on the five backing tables would immediately widen
  the UI's exposure. Mitigation: policies are covered by the M1A test
  suite and no ACL change is included in this deliverable.
- **R-C3 (new, minor):** the SKU/product enrichment queries use
  `.in("id", […])` on IDs returned from a tenant-scoped listings query.
  RLS on `catalog_skus` / `catalog_products` still filters, but any bug
  that returned a cross-tenant listing ID from the first query would be
  hidden by the enrichment — defence in depth is provided by the SKU /
  product policies themselves.

No new authorization gap, cross-tenant leak, or data-integrity risk was
introduced.

---

## 13. R-5 handling in the UI

- No text in these routes claims audit completeness, "all denied
  attempts audited", "complete security audit", or "full forensic
  history".
- No audit-log table is rendered.
- No control triggers the write RPC that carries R-5.

R-5 remains open and unchanged.

---

## 14. Governance state

- P5-HF-001: unchanged (`place_order` ACLs remain revoked).
- Bol Live: disabled.
- Stripe Live: disabled.
- Checkout: blocked.
- RLS baseline: unchanged.
- Schema: unchanged.
- Decision Log: no new BOR-DEC required for this deliverable (the
  Owner's authorisation instruction is the record); a closure entry
  will be added upon Owner verdict.

---

## 15. Verdict (self-assessed, pending Owner)

**M1A #2C-1 PASS WITH RESIDUAL RISKS**

Basis: routes ship read-only, tenant-isolated exclusively via existing
RLS, use only allowlisted fields, expose no credentials or customer
data, invoke no mutation RPC, generate no write traffic, and introduce
no schema/policy change. Residual risks R-C1..R-C3 are minor and
observational; R-5 remains open and is not touched.

Halted here pending Owner ruling. No admin cross-merchant UI, no public
storefront, and no write capability will be introduced without a
separate Owner authorisation.

---

## 16. Owner-Required UI Corrections (M1A #2C-1P)

Applied per Owner ruling on the conditional acceptance. No backend,
schema, policy, ACL, or RPC change.

### 16.1 Correction summary

| # | Correction | Files touched |
| --- | --- | --- |
| C1 | Lifecycle status no longer renamed as publication state. `merchant_stores.status` and `channel_listings.status` render their true DB value (`draft`, `active`, `paused`, `archived`, `suspended`). | `seller.stores.tsx`, `seller.stores.$storeId.tsx`, `seller.stores.$storeId.listings.tsx`, `seller.listings.$listingId.tsx` |
| C2 | A separate, visually distinct "Channel state" badge/caption carries the operational messaging: `Not customer-visible · Sales disabled · No inventory sync` (as applicable per surface). Lifecycle and channel state are never merged into one label. | same four files |
| C3 | Permission-neutral messaging on the store detail's empty "Channel accounts" panel and on the listings table's empty state: `No channel accounts are accessible to your role. The store may have no linked account, or your role may not permit viewing it.` No account count, no listing count, and no "account not linked" claim are exposed. The store-detail "Draft listings" card also switches to `Visibility depends on your role` when zero accounts are visible. | `seller.stores.$storeId.tsx`, `seller.stores.$storeId.listings.tsx` |
| C4 | Status filter option relabeled `Active` (was `Active (not published)`), so lifecycle names are consistent across all controls. | `seller.stores.$storeId.listings.tsx` |

No new backend object created. No new RPC. No new View. No policy /
grant / ACL change. No `service_role` usage. No `.rpc(`, `.insert(`,
`.update(`, `.delete(`, `.upsert(`, or `fetch(` calls introduced.

### 16.2 Patch tests

| # | Test | Result |
| --- | --- | --- |
| P1 | User with `channels.read` sees channel accounts and listings | PASS (RLS predicates unchanged; UI unchanged for this branch) |
| P2 | User without `channels.read` no longer sees a misleading "no account linked" / empty table — sees the ambiguous, permission-neutral message instead | PASS |
| P3 | Store `status = active` renders as `Status: active` + separate `Channel state: Not customer-visible · Sales disabled` caption | PASS |
| P4 | Listing `status = active` renders as `Status: active` + separate `Channel state: Not published · Sales disabled` badge | PASS |
| P5 | Lifecycle and safety/channel-state chips are rendered as independent elements, not merged into one label | PASS |
| P6 | No mutation, no new RPC (`.rpc / .insert / .update / .delete / .upsert / fetch` grep across the four files = 0) | PASS |
| P7 | No schema/policy/ACL change (no `supabase--migration` submitted) | PASS |
| P8 | Cross-tenant isolation intact — `.maybeSingle()` on `merchant_stores` / `channel_listings` still returns `null` for foreign IDs and renders "Access denied" | PASS |
| P9 | No credentials or customer data queried (`seller_bol_credentials`, `channel_connections`, `orders`, `profiles`, `channel_orders*` still absent) | PASS |
| P10 | All four routes remain under `_authenticated/` gate | PASS |

### 16.3 Residual risks (post-patch)

- **R-5** — open (denied-attempt audit rollback in `create_borvat_direct_draft_listing`). Unaffected by this UI patch.
- **R-C1 … R-C4** — accepted per Owner ruling; unchanged.
- **R-C5 — CLIENT-SIDE RLS READ PATH ACCEPTED FOR M1A READ-ONLY SELLER UI ONLY.** Per Owner ruling: browser Supabase client is permitted for these four read-only seller routes because (a) queries are read-only, (b) RLS is the sole isolation boundary, (c) no `service_role`, (d) columns are allowlisted, (e) queries are chained on IDs already scoped by prior tenant-scoped queries. NOT a precedent for admin cross-merchant, writes, publication, checkout, orders, or sensitive-data reads — those require independent server-side review.
- **R-C6 — CLIENT-SIDE PAGINATION MUST BE REPLACED BEFORE REAL CATALOG SCALE.** The listings table currently loads all RLS-scoped rows and paginates in memory. Acceptable while the channel is empty; must be replaced with server-side (range / cursor) pagination and server-side filtering before real product listings are onboarded or the public storefront is opened.
- **R-C7 (new, minor)** — the permission-neutral wording deliberately conflates "no linked account" with "no permission to view accounts". Owner-approved as unavoidable without a new backend object; recorded so a future permissions surface can resolve it.

### 16.4 Final verdict

**M1A #2C-1 PASS WITH ACCEPTED RESIDUAL RISKS** (post-patch).

Halted here. Still blocked without a separate Owner authorisation:
admin cross-merchant UI, public storefront, publication, activation,
real product listings, pricing, inventory integration, search
indexing, checkout, orders, Bol Live, Stripe Live, migrations, new
RPCs.
