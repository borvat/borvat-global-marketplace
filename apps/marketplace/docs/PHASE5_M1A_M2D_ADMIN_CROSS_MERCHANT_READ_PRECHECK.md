# PHASE 5 — M1A #2D PRECHECK

## Platform Admin Cross-Merchant Read-Only Access — Analysis Only

**Authorization scope:** `M1A #2D PRECHECK` — analysis and design only. No
migration, no UI, no RPC, no policy or grant change performed by this
deliverable.

**Predecessors closed:** M1A #2B-1 (BOR-DEC-039), M1A #2C-1 + #2C-1P
(BOR-DEC-040). R-5, R-C1..R-C6 remain open and unchanged by this precheck.

**Bol Live disabled. Stripe Live disabled. P5-HF-001 intact. `place_order`
ACLs revoked.**

---

## 1. Current role and permission model (evidence)

Two parallel role systems coexist. They are NOT interchangeable.

### 1.1 Global user roles — `public.user_roles`

- Enum `public.app_role` = `{ buyer, seller, admin }`.
- Schema: `(id, user_id → auth.users, role app_role, created_at)`; unique
  `(user_id, role)`.
- Helper: `public.has_role(_user_id uuid, _role app_role)` — SECURITY
  DEFINER, `search_path=''`, guards against querying another user's roles
  when called from an authenticated session (raises `42501` if
  `_user_id <> auth.uid()`).
- Live row distribution: `buyer = 186`, `seller = 0`, **`admin = 0`**. No
  Platform Admin exists yet.
- Existing RLS references to `has_role(..., 'admin')`: only on legacy
  tables `agent_audit_log` (SELECT), `orders` (SELECT), `order_items`
  (ALL), `products` (ALL). None on `merchant_stores`, `channel_accounts`,
  `channel_listings`, `catalog_products`, `catalog_skus`, `companies`.

### 1.2 Company-scoped roles — `public.system_company_roles` + `company_members` + `company_member_roles`

- System roles keyed by `key`: `owner, admin, manager, operator, viewer`
  (all `is_system = true`).
- `company_members(company_id, user_id, status)` maps a user into a
  company; `company_member_roles(member_id, role_id)` attaches the system
  role(s).
- Fine-grained permissions in `public.permissions` (35 rows, examples:
  `catalog.read`, `catalog.manage`, `channels.read`, `channels.activate`,
  `channels.connect`, `credentials.manage`, `orders.read`, `orders.manage`,
  `members.manage`, `ownership.transfer`, `billing.manage`,
  `break_glass.approve`, `break_glass.execute`).
- Helper:
  `public.company_member_has_permission(_company_id, _user_id, _permission)`
  — SECURITY DEFINER, `search_path=''`, joins members + role permissions
  and returns `boolean` for that single company; the same
  `auth.uid()`-vs-`_user_id` guard applies.

### 1.3 Grant and revocation paths (as they exist today)

- Global admin (`user_roles.role='admin'`):
  - Insert/delete rows in `public.user_roles`. RLS on `user_roles` allows
    users to read their own row; writes are limited to service_role (no
    self-serve admin promotion path exists).
  - Function `public.prevent_admin_self_grant` and
    `public._company_member_roles_guard_owner_role` are defined **but
    NOT wired to any trigger** — `pg_trigger` returns 0 rows for
    `user_roles` and `company_member_roles`. That is a governance gap
    worth flagging (§13); it is not created or fixed here.
- Company roles: `company_members` and `company_member_roles` are
  maintained by tenant-owner flows; not relevant to Platform Admin.

### 1.4 Audit path (as it exists today)

- `agent_audit_log` is the closest surface but is written by app flows,
  not by trigger. No trigger exists on `user_roles`. R-5 (denied-attempt
  rollback in `create_borvat_direct_draft_listing`) is unrelated but
  reminds us: **audit completeness must never be claimed without a
  trigger-backed write path**. See §10.

### 1.5 Definitions used in this precheck

- **Platform Admin** = a user with `user_roles.role='admin'` (global,
  tenant-independent). Currently zero users.
- **Company Owner** = `company_members` row with the `owner` system role
  in that company. Tenant-scoped.
- **Company Admin** = `company_members` with the `admin` system role in
  that company. Tenant-scoped. NOT a Platform Admin, despite the shared
  word "admin".
- **Support / Customer Service** = **not modelled**. No permission key
  starting with `support.` / `cs.` / `customer_service.` exists; no
  system role of that name exists. Treating any existing role as CS
  today would be a fabrication.
- **service_role** = Postgres role used server-side only; MUST NOT be
  used to power the Admin UI (§3).

---

## 2. What Platform Admin can read *today* on the M1A #2D target tables

| Table | RLS SELECT that would apply to a Platform Admin |
| --- | --- |
| `companies` | `is_company_member(id, auth.uid())` only — Platform Admin gets **nothing** unless they are also a member. |
| `merchant_stores` | `merchant_stores_select_company_member` — same. Platform Admin gets nothing. |
| `channel_accounts` | `company_member_has_permission(company_id, uid, 'channels.read')` — nothing. |
| `channel_listings` | Same predicate — nothing. |
| `catalog_products`, `catalog_skus` | `catalog.read` inside the company — nothing. |

**Conclusion:** the current base-table policies are correctly tenant-scoped
and there is **no cross-tenant read path** for a Platform Admin on any of
the target tables. This is the correct starting posture; it also means
delivering §1's goal requires an *additive* mechanism.

---

## 3. Forbidden designs (explicit rejection list)

Rejected outright as unsafe:

- `service_role` in the browser bundle or client-side code.
- `supabaseAdmin` (`client.server.ts`) imported into any client-reachable
  module.
- `sandbox_exec` or any equivalent RLS bypass.
- Dropping / weakening base-table RLS to admit Platform Admin.
- Loading all tenants into React and filtering client-side.
- Route-hiding as the only defence (defence in depth requires a DB gate).
- Fake `company_members` rows to give Platform Admin implicit membership.
- Hardcoded owner UUIDs or admin emails anywhere in code, migrations,
  fixtures, or config.

If the only route to satisfy §1 required any of the above, the verdict
would be **ARCHITECTURE BLOCKER — SAFE ADMIN READ PATH ABSENT**. It does
not; see §4 and §12.

---

## 4. Alternatives evaluated

### A. Trusted read-only SECURITY DEFINER RPC(s) — **RECOMMENDED**

Shape:
- Small set of RPCs, all `SECURITY DEFINER` with `SET search_path=''`.
- First line of every handler:
  `IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'access denied' USING ERRCODE = '42501'; END IF;`.
  Company ID is never accepted as a source of authorization; it is at most
  a **filter** parameter after the role check succeeds.
- Return only allowlisted columns (§5) as `TABLE(...)` result types — no
  `SELECT *`, no JSONB blobs.
- Server-side pagination + filtering (§6): `_limit int`, `_after uuid`
  (keyset) or `_offset int` (bounded), `_q text`, `_status text`.
- Grants: `EXECUTE ... TO authenticated`; **not** `TO anon`. The role
  check inside the function is the real gate.
- Called from server functions (`createServerFn` with
  `requireSupabaseAuth` middleware) or from the browser with the user's
  bearer token. Base-table RLS remains untouched.

Pros:
- Zero widening of base-table policies. Tenant isolation for
  non-Platform-Admin users is unchanged.
- Deterministic response schema; auditable at the RPC boundary.
- Pagination/filter/sort live in Postgres, not the client. Directly
  addresses R-C6 for this surface.
- Idiomatic to the existing codebase (`create_borvat_direct_account`,
  `create_borvat_direct_draft_listing` follow the same pattern).

Cons:
- Additive migration required (RPC creation + grants). No schema
  change, no policy change, no new table.
- Response allowlist must be maintained in one place.
- Admin can be granted only through direct `INSERT` into `user_roles`
  (service_role, via a governance-controlled flow) — see §11 and R-D1.

### B. Admin-specific security-barrier Views

Shape:
- `CREATE VIEW admin_v_merchant_stores WITH (security_barrier=true) AS SELECT ... FROM merchant_stores WHERE has_role(auth.uid(),'admin');`
  and analogous views for accounts/listings/companies.
- Views inherit base-table RLS by default (`security_invoker`). To make
  them useful for cross-tenant Platform Admin reads, the view would need
  `security_invoker=off` (i.e. run as the view owner), which is
  effectively a definer-view — same trust as (A) but harder to audit and
  harder to constrain output to an allowlist (columns are declared once,
  but any downstream query can add joins).
- Pagination/filter/sort are pushed to the caller.

Pros:
- Feels declarative.

Cons:
- Owner-definer view semantics are exactly the "invisible privilege
  escalation" pattern the platform has avoided so far. If the view owner
  is later given write privileges on the base tables, callers gain them
  transparently.
- Cannot easily enforce keyset pagination or query shape.
- Harder to review: the security posture is spread across view
  definition, view owner, and grants.
- No advantage over (A) that isn't already delivered by (A).

Not recommended.

### C. Server-side function acting as the authenticated user

Shape:
- `createServerFn().middleware([requireSupabaseAuth]).handler(async ({context}) => context.supabase.from('merchant_stores').select(...))`.
- `context.supabase` is a Supabase JS client wearing the caller's bearer
  token. RLS is enforced **as that user**.

Reality check:
- Because the base-table policies are `is_company_member` /
  `company_member_has_permission`, a Platform Admin who is not a member
  of any tenant sees **zero rows**. The server-side execution does not
  change what RLS admits.
- Therefore this alternative *does not deliver* §1 without one of:
  (i) widening base-table policies to `OR has_role(auth.uid(),'admin')`
       — this widens the surface every base-table caller already trusts,
       and increases the blast radius of any future policy bug; or
  (ii) calling a SECURITY DEFINER helper from within the server fn —
       which collapses back to (A).

Not sufficient on its own. Rejected as a standalone option.

---

## 5. Response schema (Allowlist)

Applied uniformly across the recommended RPCs. Any column not listed here
is prohibited from the response envelope.

**Companies**
- `id, name, status, created_at`.

**Merchant stores**
- `id, company_id, display_name, slug, status, is_primary, default_locale,
  default_currency, created_at, updated_at`.
  *(Note: current `merchant_stores` schema has `default_locale`,
  `default_currency`; there is no `country` column. If a country field is
  required later, that is an additive schema change and out of scope.)*

**Channel accounts (Borvat Direct scope)**
- `id, company_id, merchant_store_id, provider, display_name, status,
  control_state, created_at, updated_at`.

**Draft listings**
- `id, company_id, channel_account_id, sku_id, status, control_state,
  published_quantity (diagnostic), created_at, updated_at`.

**SKU / product labels**
- SKU: `id, code, status` (+ `product_id` FK).
- Product: `id, title, brand, status`.

**Explicitly forbidden fields:**
- `seller_bol_credentials.*`, `channel_connections.*`, and any column
  ending in `_secret`, `_token`, `_ref`, `oauth_*`, `credentials_*`.
- Customer PII: `profiles.email`, `profiles.full_name`, addresses.
- Orders / order lines / shipments / payment data.
- Raw `agent_audit_log.payload` or any audit payload bodies.
- Supplier costs, margin, purchase price (columns do not exist today; the
  allowlist blocks them even if added later).
- Internal security metadata: `permissions.*`, `role_permissions.*`,
  full `user_roles.*`, service tokens, kill-switch state.
- Membership rosters beyond the company owner label (not required by §1).

---

## 6. Pagination and filtering strategy

Per R-C6, cross-merchant surfaces must be server-paginated from day one.

- **Page size:** hard-cap at 50; default 25. Enforced inside the RPC
  (`_limit := least(coalesce(_limit, 25), 50)`).
- **Ordering:** stable — `ORDER BY created_at DESC, id DESC` on every
  listing endpoint.
- **Cursor:** keyset pagination `(_after_created_at, _after_id)`; falls
  back to bounded offset only when explicitly requested with `_offset` ≤
  5000 to prevent deep-offset scans.
- **Filters (server-side only):**
  - `_company_id` — filter after auth passes, not a bypass.
  - `_status` — enum-checked against known lifecycle values.
  - `_q` — case-insensitive prefix search on company name, store name,
    store slug, SKU code, product title. Uses trigram or prefix indexes
    (see §8).
- No count-of-all is returned by default (avoids leaking totals across
  privilege boundaries); a `has_more` boolean derived from
  `count(*) OVER () > _limit` or an extra-row probe is acceptable.

---

## 7. Customer Service permissions

Explicitly out of scope for this precheck to *implement*, but the design
constraint is set here:

- Platform Admin: cross-merchant read on the allowlisted surface only.
- Customer Service (**not modelled today**): if introduced later, it MUST
  be a distinct permission (e.g. `support.read_orders` scoped to order
  numbers or customer email) — NOT a broad
  `merchants.read_all` / `platform.read`. Do not add Customer Service to
  the Platform Admin RPCs. Cross-merchant customer/order data is out of
  scope entirely.
- Company Admin: single tenant only — unchanged.
- Seller: single tenant only — unchanged.

No permission consolidation. Adding a broad `platform.read` key that
covers unrelated surfaces is explicitly rejected.

---

## 8. Index assessment (read-only)

Existing indexes on target tables (from `pg_indexes`):

- `companies`: pkey, `companies_slug_key`, `companies_owner_idx`. OK for
  paginated listing by `created_at DESC, id DESC` — add-only concern:
  no `created_at` index yet, but companies is small; acceptable at
  current cardinality. No index created in this precheck.
- `merchant_stores`: pkey, `merchant_stores_company_id_ix`,
  `merchant_stores_status_ix`, `merchant_stores_slug_uk`,
  `merchant_stores_one_primary_per_company_uk`. Covers `company_id` and
  `status` filters.
- `channel_accounts`: pkey, `channel_accounts_merchant_store_id_ix`,
  `channel_accounts_borvat_direct_per_store_uk`,
  `(company_id, provider, external_account_id) unique`.
- `channel_listings`: pkey, `channel_listings_account_idx`,
  `channel_listings_company_idx`,
  `(channel_account_id, external_listing_id) unique`. Adequate for
  by-company and by-account browsing.
- `catalog_skus`: pkey, `catalog_skus_product_idx`,
  `(company_id, lower(code)) unique`. Covers SKU code prefix search.
- `catalog_products`: pkey, `catalog_products_company_idx`,
  `(company_id, status)`. Product title search would benefit from a
  `pg_trgm` index later; **not** created here (§ authorization forbids).

**Search feasibility without new indexes:** company name, product title,
and store name have no trigram index today. At current cardinality
(companies = single digits, listings = 115 legacy rows) a sequential
scan behind a Platform-Admin-only RPC is acceptable. Before real
catalog scale, add `pg_trgm` GIN indexes on the searched columns — this
belongs to the same authorization that lifts R-C6.

**No index created in this precheck.**

---

## 9. Security risks

- **R-D1 (new, medium) — Grant path relies on service_role only.**
  Platform Admin is granted by inserting into `user_roles`, but no
  application-level flow, no audit trigger, no `prevent_admin_self_grant`
  trigger is wired. The dormant guard functions must be attached before
  the first Platform Admin is provisioned. This precheck flags it; the
  fix belongs to a separate authorization ("M1A #2D-G — Admin grant
  hardening").
- **R-D2 (new, medium) — Broad allowlisted read is still broad.**
  Even with an allowlist and no PII, a Platform Admin can enumerate all
  companies and their stores. Rate-limit or audit-log those reads
  before general availability (see §10 and R-D3).
- **R-D3 (new, medium) — Admin read audit not yet designed.**
  See §10. Do not claim audit coverage before the trigger-backed path
  is authorised and shipped. R-5 applies conceptually: RPC-issued audit
  rows written in the same transaction can be rolled back on error.
- **R-D4 (low) — Search leakage.** Prefix search over company names
  could reveal existence of a tenant to any Platform Admin. Since
  Platform Admin is intended to see all tenants, this is by-design; the
  risk is only if the role is over-granted (mitigated by R-D1 fix).
- **R-D5 (low) — RPC surface drift.** As new lifecycle fields are added
  (e.g. `country`, `suspension_reason`), the allowlist must be reviewed
  before exposing them. Establish that as a governance rule alongside
  the acceptance decision.

Unchanged from prior closures: R-5 (open), R-C1..R-C4 (accepted),
R-C5 (client-side reads accepted for Seller UI only — **NOT** for this
Admin surface; Admin RPCs are called from server functions or from
authenticated clients but always transit an explicit role check),
R-C6 (server-side pagination required — this design honours it).

---

## 10. R-5 implications for Admin reads

R-5 is the denied-attempt audit rollback in a write RPC. The Admin read
surface has an analogous but distinct concern:

- Read endpoints do not raise on success, so audit rows written by a
  successful admin read would persist normally.
- Failure paths (unauthorized caller, invalid parameters) that raise
  `access denied` would roll back any audit row written in the same
  transaction. Same shape as R-5.

Recommendation:
- **Do not claim audit completeness** in any Admin UI text or governance
  record until an out-of-band audit path (outbox row / dblink /
  autonomous) is authorised.
- Successful bulk exports and sensitive inspections MUST be audited (out
  of scope of §11 today; needed before GA).
- Routine paginated listing may be omitted from audit initially to avoid
  audit-flood, provided the acceptance record says so explicitly.

**No audit migration is created in this precheck.**

---

## 11. Required migrations / RPCs (if the recommendation is adopted later)

Precondition (separate authorization, not part of §12):
1. Wire `prevent_admin_self_grant` as a `BEFORE INSERT` trigger on
   `public.user_roles`.
2. Wire `_company_member_roles_guard_owner_role` on
   `public.company_member_roles` (owner-role guard).
3. Add an append-only audit trigger for `user_roles` INSERT/DELETE (or
   equivalent outbox) so grants and revocations are observable.

Then the Admin read migration (single migration, additive only):
4. `create function public.admin_list_companies(...)`  — SECURITY
   DEFINER, `has_role('admin')` gate, allowlist, keyset paging.
5. `create function public.admin_list_merchant_stores(_company_id?, _status?, _q?, _limit?, _after_*)`.
6. `create function public.admin_list_channel_accounts(_company_id?, _merchant_store_id?, _q?, ...)`.
7. `create function public.admin_list_channel_listings(_company_id?, _channel_account_id?, _sku_q?, _status?, ...)`.
8. `create function public.admin_get_merchant_store(_id)` /
   `admin_get_channel_account(_id)` / `admin_get_channel_listing(_id)`
   — detail lookups returning the same allowlist.
9. `revoke execute on function public.admin_* from public, anon;
   grant execute on function public.admin_* to authenticated;`
   (The role check inside is the gate.)

None of the above is created here.

---

## 12. Confirmation of zero change

- **Migrations submitted this precheck:** 0.
- **RPCs created/altered:** 0.
- **Policies created/altered:** 0.
- **Grants changed:** 0.
- **Indexes created:** 0.
- **UI routes added:** 0.
- **Code files modified:** 0 (only `docs/…` and the decision-log
  update proposal below).
- **P5-HF-001:** intact (`place_order` ACL still revoked).
- **Bol Live / Stripe Live:** disabled.
- **R-5:** unchanged.

Verification queries performed were `SELECT`-only inspections of
`pg_enum`, `pg_proc`, `pg_indexes`, `pg_trigger`, `information_schema.
columns`, `public.permissions`, `public.system_company_roles`,
`public.user_roles`, and `pg_policies`.

---

## 13. Governance flags surfaced (not fixed here)

- **G-1:** `prevent_admin_self_grant()` and
  `_company_member_roles_guard_owner_role()` exist as functions but are
  **not attached to any trigger** on `user_roles` /
  `company_member_roles`. Provisioning the first Platform Admin without
  wiring them first is unsafe. Track under R-D1.
- **G-2:** No trigger-based audit on `user_roles` grant/revoke. Track
  under R-D3.
- **G-3:** Existing legacy admin RLS policies live only on
  `agent_audit_log`, `orders`, `order_items`, `products`. They do **not**
  cover the M1A #2D target tables, so Platform Admin currently sees
  nothing on those tables (correct posture; documented so a future
  reviewer does not mistake absence for a gap).

---

## 14. Proposed test plan (for the eventual implementation, not run now)

- Platform Admin sees > one company.
- Company Admin (system role) does NOT see other companies.
- Seller does NOT reach admin RPCs (`access denied`).
- Customer Service does NOT inherit Platform Admin automatically
  (permission key does not exist; test asserts non-existence).
- Unauthenticated caller: `access denied`.
- URL / filter tampering (`_company_id` for a company the caller is a
  Platform Admin of vs. not) — role check gates equally on both.
- Pagination does not return totals beyond `has_more`.
- Response JSON matches the §5 allowlist byte-for-byte on schema diff.
- No customer PII, no credentials, no order data.
- No `.rpc('...write...')` / `.insert` / `.update` / `.delete` /
  `.upsert` reachable from the admin UI.
- No `service_role` reference in any client bundle.
- No unbounded client-side fetch — every listing bounded by `_limit`.
- The seventh (external) merchant appears in results without any code
  change, hardcode, or per-tenant switch.
- R-5 audit disclaimer visible in any Admin UI that reads audit-adjacent
  data; success-only audit claims explicitly avoided.
- Sign-out and role revocation: subsequent reads fail on the next call
  or on refresh (the role check re-runs each RPC invocation).

---

## 15. Recommendation

**Option A — Trusted read-only SECURITY DEFINER RPCs.**

- No schema change, no policy change, no grant widening on base tables.
- Additive migration only (RPCs + narrow `EXECUTE` grants).
- Compatible with server-side pagination (R-C6).
- Compatible with the existing SECURITY DEFINER pattern already used and
  reviewed in earlier phases.
- Requires a preceding grant/audit hardening (G-1, G-2 / R-D1, R-D3)
  before the first Platform Admin is provisioned.

---

## 16. Final verdict

**SAFE ADMIN READ PATH REQUIRES ADDITIVE RPC**

with the following mandatory precondition inherited from §13:

> Attach the dormant guard functions and add trigger-backed audit for
> `user_roles` before provisioning a Platform Admin. Absent that,
> **Platform Admin provisioning is not safe**, and the RPCs would have no
> trustworthy caller.

Halting here. No admin cross-merchant UI, no public storefront, no
publication, no activation, no writes, and no migration will be
introduced without a separate Owner authorization.
