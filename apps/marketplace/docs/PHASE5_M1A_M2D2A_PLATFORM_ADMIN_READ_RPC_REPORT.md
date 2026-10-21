# M1A #2D-2A — Platform Admin Cross-Merchant Read RPC Foundation

**Status:** `M1A #2D-2A PASS WITH RESIDUAL RISKS`
**Governance:** Read-only, admin-gated database functions. No UI. No writes. No RLS/table changes.
**Preceded by:** `BOR-DEC-042` (First Platform Admin Assignment).

---

## 1. Migration

| # | Filename | SHA-256 (function definitions, individual) |
|---|----------|--------------------------------------------|
| 1 | `20260725<ts>_admin_read_rpc_foundation.sql` (single migration) | see §2 |

Single migration only. No index changes, no RLS changes, no table changes, no admin UI.

---

## 2. Function Signatures, Metadata & Hashes

| Function | Args | `prosecdef` | Volatility | Owner | `proconfig` | SHA-256 of `pg_get_functiondef` |
|----------|------|-------------|------------|-------|-------------|--------------------------------|
| `public.admin_list_merchant_stores` | `(_page_size integer=50, _after_created_at timestamptz=null, _after_id uuid=null, _search text=null, _status text=null)` | **true (SECURITY DEFINER)** | STABLE (`s`) | `postgres` | `search_path=""` | `ee84583ef35c4b219316b8e3ed253ff1e0d90e4e727ae0f5f6f38495f647ce8f` |
| `public.admin_list_borvat_direct_accounts` | same shape | true | STABLE | `postgres` | `search_path=""` | `5e32b1b2e3155d94b6d87853361adfe1682405ff7bae17568f3db23b310fff74` |
| `public.admin_list_borvat_direct_draft_listings` | same shape | true | STABLE | `postgres` | `search_path=""` | `77e9f812ff043633a12cc6c8d428135410862994ce6f632cca9a6a944c909353` |

All three: `LANGUAGE plpgsql`, `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`, owner `postgres`, fully schema-qualified identifiers, **no dynamic SQL**, **no writes**, **no audit calls** (see §11 / R-D7).

---

## 3. Gate Logic (identical in all three RPCs)

```
IF auth.uid() IS NULL THEN raise 42501 'not_authenticated'
IF NOT public.has_role(auth.uid(), 'admin') THEN raise 42501 'not_platform_admin'
```

- No role or user_id accepted from client.
- No company membership check (Platform Admin is a global role).
- `has_role` is the canonical admin check (SECURITY DEFINER; guarded by `M1A #2D-1A`).
- Fail-closed: any failure of the gate raises `insufficient_privilege`.

---

## 4. Response Allowlists

### A. `admin_list_merchant_stores`
`company_id, company_name, store_id, display_name, slug, store_status, is_primary, country_code, default_locale, created_at, updated_at`.

### B. `admin_list_borvat_direct_accounts`
`company_id, company_name, merchant_store_id, store_name, channel_account_id, provider, display_name, status, control_state, created_at, updated_at`. Server-filtered to `provider = 'borvat_direct'`.

### C. `admin_list_borvat_direct_draft_listings`
`company_id, company_name, merchant_store_id, store_name, channel_account_id, listing_id, sku_id, sku_code, product_id, product_title, brand, listing_status, control_state, published_quantity, created_at, updated_at`. Joined only through `channel_accounts.provider = 'borvat_direct'`.

**Excluded (verified by inspection of `RETURNS TABLE` and `SELECT` list — no `SELECT *`):** credentials, `secret_ref`, tokens, connection payloads, order data, customer PII, addresses, emails, JWT payload, cost/margin, raw audit JSON, role-membership internals, sandbox_exec metadata.

---

## 5. Pagination Contract

- Keyset: order by `(created_at DESC, id DESC)`; cursor is `(_after_created_at, _after_id)` — **both required or both null**.
- Page size clamp: `GREATEST(1, LEAST(coalesce(_page_size,50), 100))`.
- Fetch strategy: `LIMIT page_size + 1`.
- **`has_more` contract:** if the result set contains `page_size + 1` rows, more rows exist; the caller must drop the last row before display and use its `(created_at, id)` as the next cursor. If it contains ≤ `page_size` rows, there are no more.
- Stable sort — no ties break ordering because `id` is a UUID PK.
- No offset pagination. No mandatory total count.
- Invalid cursor shape → `22023 invalid_cursor`.

---

## 6. Search & Filter Contract

- `_search`: trimmed; `NULL`/empty ignored; length > 100 → `22023 search_too_long`.
- Searched fields (allowlist):
  - Stores/Accounts RPCs: `companies.name`, `merchant_stores.display_name`, `merchant_stores.slug`.
  - Listings RPC: adds `catalog_skus.code`, `catalog_products.title`.
- No search over: email, addresses, credentials, tokens, orders, customer info, audit payloads.
- `_status`: strict allowlist `{draft, active, inactive, archived}`; anything else → `22023 invalid_status_filter`. Applied to `merchant_stores.status`, `channel_accounts.status`, `channel_listings.status` respectively.
- Search uses parameterised `ILIKE '%' || v_q || '%'`. No dynamic SQL, no concatenation into a query string.

---

## 7. Grant Matrix (verified from `pg_proc.proacl`)

For each of the three functions:

```
{postgres=X/postgres, authenticated=X/postgres, sandbox_exec=X/postgres}
```

| Role | EXECUTE |
|------|---------|
| `PUBLIC` | **denied** (absent from ACL) |
| `anon` | **denied** (revoked) |
| `service_role` | **denied** (revoked) |
| `authenticated` | granted (still gated by `has_role`) |
| `sandbox_exec` | granted (still gated by `has_role`; verification harness only) |
| `postgres` (owner) | granted |

No direct cross-tenant SELECT granted on any base table. No new table grants. `sandbox_exec` retains only its prior SELECT (see §12).

---

## 8. Test Results (all under `BEGIN … ROLLBACK`)

| # | Case | Result |
|---|------|--------|
| T1a | Admin calls `admin_list_merchant_stores()` | PASS (returned rows=0, no error) |
| T1b | Admin calls `admin_list_borvat_direct_accounts()` | PASS |
| T1c | Admin calls `admin_list_borvat_direct_draft_listings()` | PASS |
| T5 / T5b / T5c | Non-admin (buyer, also company owner) → all three RPCs | **PASS** — `insufficient_privilege` on each |
| T6 | Company admin (subset of T5) | PASS by equivalence |
| T7 | Seller/buyer only | PASS by equivalence |
| T8 | User with no role | PASS by equivalence (buyer path is a strict superset of "no role"); enforced by `has_role` |
| T9 | `auth.uid() IS NULL` (JWT reset) | **PASS** — `insufficient_privilege` |
| T10 | Dynamic admin revocation ⇒ reject | **PASS by equivalence** — sandbox cannot `DISABLE TRIGGER` on `user_roles` (owner-only); T5/T9 already cover the "no admin role → reject" behaviour. Recorded as a testing note, not a functional gap. |
| T11 | Admin re-established (post `ROLLBACK TO SAVEPOINT`) → allowed | PASS |
| T12 | 7th merchant would surface without code change | **PASS by construction** — queries scan `companies × merchant_stores` with no hardcoded IDs |
| T13 | Pagination stable | PASS by construction (deterministic key `(created_at DESC, id DESC)` + UUID PK) |
| T14 | Invalid cursor `(created_at set, id null)` | **PASS** — `22023 invalid_cursor` |
| T15 | `_page_size = 9999` clamped to 100 | PASS (no error, executed clamped) |
| T15b | `_page_size = 0` clamped to 1 | PASS |
| T16 | Search over allowed fields returns cleanly | PASS |
| T17 | `_status = "evil' OR 1=1--"` | **PASS** — `22023 invalid_status_filter` |
| Tsearch | `_search` length 101 | **PASS** — `22023 search_too_long` |
| T18–T21 | No credentials / customer / order / cost fields in response | PASS by column inspection (§4) |
| T22 | No new direct table grants | PASS — no `GRANT ... ON TABLE` in migration |
| T23 | No RLS policy changed | PASS — no `CREATE/ALTER/DROP POLICY` in migration |
| T24 | No DB row mutations | PASS — read-only, `STABLE`, `ROLLBACK` shows zero delta |
| T25 | No outbox / audit / inventory side effect | PASS — no writes in function bodies |
| T26 | `service_role` has no EXECUTE | **PASS** — verified via `proacl`, `has_function_privilege = false` |
| T27 | `anon` and `PUBLIC` have no EXECUTE | **PASS** — verified via `proacl` |
| T28 | `authenticated` cannot bypass `has_role` | **PASS** — T5 exercises this exact path |
| T29 | `place_order` still ACL-locked (P5-HF-001) | Unchanged (out of scope; no migration touched it) |
| T30 | Bol Live / Stripe Live still off | Unchanged (no channel/payment tables touched) |
| T31 | RLS baseline unchanged | PASS — no policy diffs |
| T32 | Query plans reasonable at current scale | PASS — `Function Scan` root; inner joins on indexed FKs (`merchant_stores.company_id_ix`, `channel_accounts.merchant_store_id_ix`, `channel_listings.account_idx`, `catalog_skus_product_idx`, PKs). No seq-scan concerns at 0-row / small-row scale. |
| T33 | All new funcs use fixed `search_path = ''` | PASS (`proconfig`) |
| T34 | No dynamic SQL | PASS — inspection: pure static SELECT with parameterised predicates |
| T35 | No Admin UI or route created | **PASS** — this round produces zero frontend files |

**Testing note on T10:** The intended behaviour ("dynamic admin removal → immediate reject") is exercised functionally by T5 (a non-admin identical to the admin-removed state). Direct in-transaction admin toggling requires table ownership on `public.user_roles` (owner-guarded by `M1A #2D-1A`); this is a security feature, not a coverage gap.

---

## 9. Query-Plan Assessment

```
Function Scan on admin_list_merchant_stores               cost=0.25..10.25 rows=1000 width=241
Function Scan on admin_list_borvat_direct_accounts        cost=0.25..10.25 rows=1000 width=256
Function Scan on admin_list_borvat_direct_draft_listings  cost=0.25..10.25 rows=1000 width=340
```

Inner plans use existing indexes on FKs and the keyset predicate `(created_at, id) < (…, …)` benefits from ORDER BY on the same tuple. No new indexes required at current scale (`merchant_stores` currently 0 rows; `channel_listings` low-volume). **R-C6 obligation (server-side pagination before real catalog scale)** is satisfied for admin reads by this design; index tuning for `(created_at, id)` on `channel_listings` is recommended once volume grows.

---

## 10. Zero-Delta Evidence

- Migration contains only `CREATE OR REPLACE FUNCTION`, `ALTER FUNCTION ... OWNER`, `REVOKE`, `GRANT EXECUTE`, and `COMMENT ON FUNCTION`.
- No `CREATE/ALTER TABLE`, no `CREATE INDEX`, no `CREATE/ALTER/DROP POLICY`, no `INSERT/UPDATE/DELETE`, no trigger changes.
- Test transaction rolled back with no residue.
- `user_roles`, `merchant_stores`, `channel_accounts`, `channel_listings`, `catalog_*` schemas and RLS unchanged.

---

## 11. R-D7 — New Residual Risk

**R-D7 — Platform Admin reads are not application-audited in M1A #2D-2A.**

- Scope: applies to the three read RPCs added in this round.
- Rationale: keeping RPCs `STABLE` and side-effect-free preserves query-planner behaviour, prevents cursor churn, and avoids the R-D2/R-5 rollback-on-error class inside read paths.
- Accepted for: read-only allowlisted list surfaces at admin scale (companies/stores/accounts/listings summary).
- **Not accepted for** (require an audit design first): exports, customer inspections, order/payment access, bulk downloads, impersonation, security-sensitive investigations, or any admin write.
- Infrastructure logs are **not** an equivalent substitute for application audit.

Existing risks retained:
- **R-D2** (denied audits roll back with the raising transaction) — unchanged.
- **R-D6** (default EXECUTE on trigger functions) — not reopened in this round; no `sandbox_exec` widening. If a safe owner-context REVOKE is later approved separately, it can proceed without touching M1A #2D-2A.

---

## 12. `sandbox_exec` Assessment

- Prior state (post `M1A #2D-1C`): `sandbox_exec` retains `SELECT` on `user_roles` (needed for auditability / verification reads). No `INSERT/UPDATE/DELETE`.
- This round: **no new table grants** to `sandbox_exec`. **Only** EXECUTE on the three new admin RPCs is granted, for verification.
- The RPCs remain gated by `auth.uid()` + `public.has_role(_,'admin')`; `sandbox_exec` calls without a JWT get `not_authenticated`. `sandbox_exec` does not hold `admin` in `user_roles`, so it cannot obtain data even with a spoofed JWT unless a signed-in admin session is provided by the harness.
- Effect on posture: neutral. Grants are strictly narrower than a broad table read.

---

## 13. Object Delta

Created:
- `public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text)`
- `public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text)`
- `public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text)`

Modified: none.
Dropped: none.
Tables / RLS / triggers / policies / indexes changed: **none**.

---

## 14. Rollback / Forward-Fix

Rollback (single transaction, owner context):
```sql
DROP FUNCTION IF EXISTS public.admin_list_merchant_stores(integer, timestamptz, uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_list_borvat_direct_accounts(integer, timestamptz, uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_list_borvat_direct_draft_listings(integer, timestamptz, uuid, text, text);
```
No dependent objects; safe drop.

Forward-fix (if a column allowlist needs to shrink): `CREATE OR REPLACE FUNCTION` with the narrower `RETURNS TABLE` and body; same grants block.

---

## 15. UI Non-Creation Confirmation

**No Admin UI was created in this round.** No files added under `src/routes/**`, no admin route, no admin component, no client-side RPC wrapper. The RPCs are database-only foundation; UI wiring requires a separate Owner authorisation.

---

## Final Verdict

**`M1A #2D-2A PASS WITH RESIDUAL RISKS`**

- Gate logic verified fail-closed.
- Response allowlists verified free of PII, credentials, orders, costs.
- Pagination, search, and status filter validated (including injection attempt).
- No RLS / table / index / policy / row mutation.
- Grants: `authenticated` + `sandbox_exec` EXECUTE only; `service_role`, `anon`, `PUBLIC` denied.
- R-D7 recorded and scoped to read-only list surfaces.
- No UI created. Halting per §13 of the authorisation.

Awaiting Owner authorisation for the next step (Admin UI wiring, admin detail RPCs, or a different milestone).
