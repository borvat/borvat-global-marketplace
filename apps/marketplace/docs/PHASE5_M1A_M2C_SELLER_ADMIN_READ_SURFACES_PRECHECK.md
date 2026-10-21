# PHASE 5 — M1A #2C PRECHECK

## Seller / Admin Read-Only Listing Surfaces — Analysis & Design Only

**Status:** PRECHECK ONLY — analysis and design.
**Authorization scope:** `M1A #2C PRECHECK — SELLER/ADMIN READ-ONLY LISTING SURFACES`.
**Prohibited in this deliverable and performed by this deliverable:** no
migration, no RPC creation, no RPC modification, no ACL change, no index
creation, no UI implementation, no route file added, no data mutation, no
publication, no activation, no cutover, no Bol Live, no Stripe Live.
This file is documentation only.

**Predecessor closures (unchanged, not modified by this precheck):**

- `M1A #2B-1V PASS WITH ACCEPTED RESIDUAL RISK R-5` (BOR-DEC-039).
- `M1A #2B-1 CLOSED WITH RESIDUAL RISKS`.
- `P5-HF-001` intact: `public.place_order` EXECUTE limited to `postgres` +
  `sandbox_exec`.
- Bol Live disabled; Stripe Live disabled; checkout blocked.

---

## 1. Objective

Determine whether a **read-only** internal surface, visible to authenticated
sellers of their own company and to platform administrators across
companies, can safely expose:

- Merchant stores.
- The `borvat_direct` channel account attached to each store.
- Draft channel listings created via
  `public.create_borvat_direct_draft_listing`.
- The SKUs referenced by those listings, and their parent catalog product.
- Draft / paused / not-published status labels.
- Minimal diagnostic audit information.

…without any write path, without any customer-visible artefact, and
without weakening the fail-closed guarantees established in M1A #2A and
M1A #2B-1.

---

## 2. Data-Source Map

The **single source of truth** for each field is the new tenancy /
channel stack. Legacy `public.products` is **explicitly rejected** as a
data source for this surface — it is not the M1A truth model and must
not be reintroduced as one.

| Concept                    | Source of truth                                             | Fields (proposed, non-sensitive)                                                                                                     |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Merchant Store             | `public.merchant_stores`                                    | `id`, `company_id`, `slug`, `name` (display), `status`, `country`, `locale`, `currency`, `created_at`, `updated_at`                  |
| Borvat Direct account      | `public.channel_accounts` (`provider='borvat_direct'`)      | `id`, `company_id`, `merchant_store_id`, `provider`, `display_name`, `status`, `control_state`, `external_account_id`, `created_at`, `updated_at` |
| Draft listing              | `public.channel_listings`                                   | `id`, `company_id`, `channel_account_id`, `sku_id`, `external_listing_id`, `status`, `control_state`, `published_quantity` (diagnostic only), `published_version`, `last_published_at`, `created_at`, `updated_at` |
| SKU                        | `public.catalog_skus`                                       | `id`, `company_id`, `product_id`, `code`, `tracking_mode`, `status`                                                                  |
| Product (parent of SKU)    | `public.catalog_products`                                   | `id`, `company_id`, `title`, `brand`, `status`                                                                                       |
| Company membership / role  | `public.company_members`, `public.company_member_roles`, `public.role_permissions`, `public.permissions` | Existing helpers `is_company_member(company_id, uid)`, `company_member_has_permission(company_id, uid, 'channels.read')` |
| Platform admin             | `public.user_roles` (`role='admin'`) via `public.has_role(uid, 'admin')` | Not exposed as a data field; used only for RLS predicate                                       |

Legacy sources **not** used: `public.products`, `public.orders`,
`public.order_items`, `public.channel_imported_offers`,
`public.channel_snapshots`. These would either mix truth models or
expose sales/customer data outside this surface's scope.

---

## 3. Tenant Isolation — Database/RPC-Enforced

Filtering in the UI is **not** the isolation boundary. Isolation is
already enforced at the database layer by the following RLS predicates
(verified live via `pg_policies`, unchanged by this precheck):

| Table                | SELECT policy                                     | Predicate                                                                                        |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `merchant_stores`    | `merchant_stores_select_company_member`           | `is_company_member(company_id, auth.uid())`                                                      |
| `channel_accounts`   | `channel_accounts_select`                         | `company_member_has_permission(company_id, auth.uid(), 'channels.read')`                         |
| `channel_listings`   | `channel_listings_select`                         | `company_member_has_permission(company_id, auth.uid(), 'channels.read')`                         |
| `catalog_skus`       | `catalog_skus_read`                               | `is_company_member(company_id, auth.uid())`                                                      |
| `catalog_products`   | `catalog_products_read`                           | `is_company_member(company_id, auth.uid())`                                                      |

Consequences (proof by predicate composition):

- A seller authenticated as user U in company A **cannot** read a
  `merchant_stores` row of company B — the RLS predicate on the base
  table rejects it before any join or view materialises.
- A seller of company A **cannot** read `channel_accounts` or
  `channel_listings` of company B, and additionally must hold the
  `channels.read` permission inside their own company; a company member
  without that permission is denied even for their own tenant.
- A seller **cannot** read SKUs or products of company B via
  `catalog_skus_read` / `catalog_products_read`.
- Cross-tenant leakage would require simultaneously bypassing four
  distinct RLS predicates enforced on four base tables. No such bypass
  is introduced by a read-only surface that only performs `SELECT` on
  those base tables (or on a `security_invoker=true` view over them).

**Admin cross-merchant access is NOT granted by the existing SELECT
policies.** The current policies scope every tenant to its own company.
Admin-wide visibility therefore requires either:

- Option A — extend each of the five SELECT policies with an additional
  `OR public.has_role(auth.uid(), 'admin')` disjunct. This is a
  policy change (Migration required, additive but sensitive), or
- Option B — expose admin-only reads through a `SECURITY DEFINER`
  read-only RPC that verifies `has_role(auth.uid(), 'admin')` and
  performs its own bounded query, leaving the base-table policies
  untouched.

Option B is strictly less invasive and is preferred (see §5).

---

## 4. Allowed Fields (Safe Response Schema)

Fields listed in §2 are the maximal set. Explicitly **excluded from any
response**:

- Any Vault reference, cipher, IV, auth tag, or credential handle
  (`seller_bol_credentials`, `channel_connections.*` secret columns).
- OAuth tokens, refresh tokens, `client_id`, `client_secret`, HMAC keys.
- Raw `agent_audit_log.input_summary` / `output_summary` payloads —
  only `tool_name`, `status`, `created_at`, and, for the store's own
  company, `user_id` may be surfaced, and only when the caller has
  `channels.read` for that company.
- Customer PII: `profiles`, `orders`, `order_items`, `cart_items`,
  `wishlist_items`, `channel_orders`, `channel_order_lines`,
  `channel_shipments`, `channel_order_events`.
- Supplier cost, margin, or purchase-price fields on `catalog_skus` /
  `catalog_products` (none are currently exposed for this reason).
- `channel_connections.live_authorized_at`, kill-switch state, and any
  Bol-live routing metadata.
- Internal authorisation metadata (raw JWT claims, role assignment
  tables) — only derived booleans (`is_admin`, `can_read_channels`).

`published_quantity` is included **strictly as a diagnostic display
value**. The surface must render it with a "read-only, not editable, not
customer-visible" caption and must not offer an input control.

---

## 5. View vs. RPC vs. Direct Table Query — Alternatives

| Alternative                                                                | Isolation basis                                            | Admin cross-merchant           | Sensitive-field exposure risk        | Schema change | Verdict         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------ | ------------------------------------ | ------------- | --------------- |
| **A. Direct `SELECT`s from client (RLS as filter)**                         | Base-table RLS (already in force)                          | Not possible without policy change | Low (client picks columns; RLS enforces rows) | None          | **Preferred for seller surface** |
| **B. `security_invoker=true` view joining the five tables**                 | Base-table RLS (view runs as caller)                       | Not possible without policy change | Low, but view definition must whitelist columns explicitly | Additive view | Acceptable alternative |
| **C. `security_invoker=false` (definer) view or definer RPC returning rows** | Predicate re-implemented inside the object                 | Possible (RPC checks `has_role`) | Higher — must re-prove tenant checks internally | Additive object | Required **only** for admin cross-merchant read |
| **D. Server function using `service_role` client**                          | Predicate re-implemented in application code               | Possible                       | Highest — bypasses RLS at the driver | None (app-side) | **Rejected** — regresses defence-in-depth |

Recommended composition:

- **Seller surface:** Alternative A (direct `SELECT` via
  `@/integrations/supabase/client` with the seller's JWT). No database
  change, no new object, no new grant. Zero additional attack surface.
- **Admin cross-merchant surface:** Alternative C, implemented **only
  when Owner separately authorises it**, as a `SECURITY DEFINER` RPC
  (`get_admin_read_surface_*`) that first asserts
  `public.has_role(auth.uid(), 'admin')` and then queries with a
  bounded projection and pagination. Not part of this precheck; listed
  here for completeness so the eventual proposal does not silently
  change policies.

Alternative D is rejected under the standing rule that `service_role`
must not be used for ordinary reads or authorisation decisions.

---

## 6. Query / Performance Analysis

Expected query shapes (seller surface, Alternative A):

1. **Stores list:**
   `SELECT … FROM merchant_stores WHERE company_id = $1 ORDER BY created_at DESC LIMIT $L OFFSET $O;`
   Existing per-company indexes on `merchant_stores` (BOR-DEC-031) cover
   this. Expected plan: index scan on `merchant_stores(company_id, …)`.
2. **Store detail + Borvat Direct account:**
   `SELECT … FROM channel_accounts WHERE merchant_store_id = $1 AND provider='borvat_direct' LIMIT 1;`
   `merchant_store_id` is nullable on `channel_accounts`. A **plausible**
   additive index (`channel_accounts(merchant_store_id) WHERE
   merchant_store_id IS NOT NULL`) would help; **not applied in this
   precheck**. Deferred to a future authorised migration if row growth
   makes the seq-scan cost material.
3. **Draft listings by store:**
   `SELECT … FROM channel_listings WHERE channel_account_id = $1 AND control_state IN ('draft','paused') ORDER BY updated_at DESC LIMIT $L OFFSET $O;`
   Existing index on `channel_listings(channel_account_id, …)` from
   prior phases covers this.
4. **SKU + product joins:**
   Two round-trips at most per listing page (batch by `IN (…sku_ids)`,
   then batch by `IN (…product_ids)`). N+1 avoided by page-batched
   fetch in the client, not by nested per-row queries.

Pagination: page size ≤ 50 with `OFFSET`/`LIMIT` acceptable for the
current row counts (per phase-5 baseline, `channel_listings` sits in
the low-hundreds range). Keyset pagination is a future optimisation and
not required for this milestone.

**No new index is applied in this precheck.** No index is required to
reach a safe first cut. The `channel_accounts(merchant_store_id)`
partial index is recorded as a **future optional additive index**, not
authorised here.

---

## 7. UI Route / Component Proposal — READ-ONLY

Proposed internal routes (design only, no files created in this
precheck). All routes live under the existing authenticated gate
(`src/routes/_authenticated/`) — none are public:

| Route                                                     | Audience             | Purpose                                                      |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| `/_authenticated/seller/stores`                           | Seller (company)     | List merchant stores for the seller's companies              |
| `/_authenticated/seller/stores/$storeId`                  | Seller               | Store profile, Borvat Direct account status, counts          |
| `/_authenticated/seller/stores/$storeId/listings`         | Seller               | Draft listings table (status, SKU code, product title)       |
| `/_authenticated/seller/stores/$storeId/listings/$id`     | Seller               | Listing detail — read-only fields only                       |
| `/_authenticated/admin/inspection/stores` *(deferred)*    | Platform admin       | Cross-merchant read; **requires separate Owner auth** (§3)   |

**Explicitly absent from every route** (no components, no handlers, no
buttons):

- Publish, Activate, Deactivate, Archive.
- Edit title / description / price / quantity / channel_cap.
- Connect / disconnect channel, rotate credentials.
- Create listing, delete listing.
- "Sync now", "Push to Bol", "Retry dispatch".
- Any link into checkout, cart, or public storefront.

Each page must render a persistent banner:
**"Draft — not published, not customer-visible, no inventory sync, no
active sales channel."** Labels must never use "published", "live",
"available", or "on sale".

---

## 8. Safety Labels (Status Rendering)

Mapping used by the UI (no schema change):

| Backend value                                    | Rendered label                             |
| ------------------------------------------------ | ------------------------------------------ |
| `channel_listings.control_state='draft'`         | "Draft — not published"                    |
| `channel_listings.control_state='paused'`        | "Paused — not customer-visible"            |
| `channel_listings.status` (any)                  | Rendered as a diagnostic tag, not as sale state |
| `channel_accounts.control_state`                 | "Draft account" / "Paused account"         |
| `merchant_stores.status`                         | Rendered verbatim with a "Internal status" caption |

`published_quantity`, `published_version`, `last_published_at` render
under a **"Diagnostic — not editable"** group with an explicit
"channel is not live" note.

---

## 9. R-5 Implications

R-5 (denied-branch audit rollback) does **not** block a read-only
surface, because a read-only surface performs no `RAISE EXCEPTION`
inside a `SECURITY DEFINER` write RPC and therefore cannot create the
rollback pattern that R-5 describes. However, the following rules apply
to this precheck and to any future implementation:

1. The UI must **not** claim that "all denied attempts are audited".
   Any wording that implies audit completeness is forbidden until R-5
   is resolved.
2. Audit rows that *are* present may be displayed as diagnostic
   evidence, but the surface must caption them as **"successful
   operations only — denied attempts may be absent"**.
3. R-5 remains **open**. Introducing any write / publication UI in a
   later milestone must re-open R-5 for ruling before merge.

---

## 10. Required Migrations

**None for the seller surface.** All required predicates, tables, and
grants already exist and were sealed in BOR-DEC-031 / BOR-DEC-037 /
BOR-DEC-038 / BOR-DEC-039.

**Conditional (not authorised here):**

- If Owner later authorises admin cross-merchant inspection, one
  additive `SECURITY DEFINER` read-only RPC per resource (stores /
  accounts / listings) with `has_role(auth.uid(),'admin')` guard.
- Optional additive index
  `channel_accounts(merchant_store_id) WHERE merchant_store_id IS NOT NULL`
  if measured plans justify it.

Neither is applied by this precheck.

---

## 11. Confirmation of Zero Change

Confirmed:

- No SQL migration file was created or modified.
- No RPC was created, altered, or granted.
- No RLS policy was created or altered.
- No index was created.
- No route file, component, hook, or server function was added or
  modified.
- No data row was inserted, updated, or deleted.
- `place_order` ACL unchanged (P5-HF-001 intact).
- Bol Live and Stripe Live remain disabled.
- Checkout remains blocked.
- `channel_listings`, `channel_accounts`, `merchant_stores`,
  `catalog_skus`, `catalog_products` schemas and policies verified live
  and unchanged.

Verification method: `information_schema.columns` and `pg_policies`
read via `supabase--read_query` in this same turn; results match the
schema documented in §2 and §3.

---

## 12. Recommendation & Verdict

Seller-side read-only surfaces can be built with **zero schema
change**, using existing RLS-enforced base tables and the existing
`is_company_member` / `company_member_has_permission('channels.read')`
predicates. Admin cross-merchant inspection is a separate concern,
requires either a policy extension or a definer RPC, and is deferred to
a future Owner ruling.

### Final verdict

**READ-ONLY SURFACES SAFE — NO SCHEMA CHANGE REQUIRED**
(seller scope only; admin cross-merchant inspection deferred and
un-authorised.)

### Halt

No implementation will begin until Owner issues a separate M1A #2C
IMPLEMENTATION authorisation. R-5 remains open. All previously blocked
items (public storefront, publication, activation, pricing, inventory
integration, search, checkout, orders, Bol Live, Stripe Live, M2–M10)
remain BLOCKED.
