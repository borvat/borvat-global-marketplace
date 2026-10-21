# M1A #2D-2B — Platform Admin Read-Only UI

**Status:** `M1A #2D-2B PASS WITH RESIDUAL RISKS`
**Scope:** Read-only Platform Admin UI backed exclusively by the three RPCs approved in M1A #2D-2A.
**Zero DB delta.** No migration, no RPC, no policy, no grant, no schema change.

---

## 1. Routes & Components

All routes live under the existing `_authenticated` gate (session-required) and are further gated by an admin-role check before rendering.

| Route | File | Purpose |
|-------|------|---------|
| `/admin` (redirect → `/admin/stores`) | `src/routes/_authenticated/admin/index.tsx` | Redirect only |
| `/admin` layout | `src/routes/_authenticated/admin/route.tsx` | Admin gate, banner, tab nav |
| `/admin/stores` | `src/routes/_authenticated/admin/stores.tsx` | Merchant store inspection |
| `/admin/channels` | `src/routes/_authenticated/admin/channels.tsx` | Borvat Direct account inspection |
| `/admin/listings` | `src/routes/_authenticated/admin/listings.tsx` | Draft listing inspection |

Shared UI helpers (Toolbar, Pager, StatusPill, cursor stack, error mapper) live at `src/lib/admin/ui.tsx` — deliberately outside `src/routes/` so the route tree is not polluted.

## 2. RPC Usage Map

| UI route | RPC called |
|----------|------------|
| Gate | `public.has_role(_user_id, 'admin')` |
| `/admin/stores` | `public.admin_list_merchant_stores` |
| `/admin/channels` | `public.admin_list_borvat_direct_accounts` |
| `/admin/listings` | `public.admin_list_borvat_direct_draft_listings` |

**No direct `SELECT` against `companies`, `merchant_stores`, `channel_accounts`, `channel_listings`, `catalog_*`, `user_roles`, or any other table.** No `service_role`. No `sandbox_exec`. No new RPC.

## 3. Admin Gate

`src/routes/_authenticated/admin/route.tsx`:

1. Parent `_authenticated/route.tsx` already redirects unauthenticated users to `/auth`.
2. Layout calls `supabase.rpc('has_role', { _user_id, _role: 'admin' })`.
3. On `false`/error → renders neutral `Access denied` card. No counts, no company names, no listing badges are ever fetched.
4. Only on `true` does the layout render tabs and `<Outlet />`.
5. Each list RPC is also fail-closed server-side; if `has_role` becomes stale, the next RPC call returns `42501` and the child page shows `Access denied` while its previously fetched rows are cleared.

## 4. Pagination

Keyset contract, mirroring the RPC spec:

- `_page_size = 25` (≤ 100, hard-clamped server-side).
- Fetch `PAGE_SIZE + 1`; if `length > PAGE_SIZE` → `hasMore = true`, drop the last row.
- Cursor = `(created_at, id)` of the last visible row (`store_id` / `channel_account_id` / `listing_id`).
- `useCursorStack()` keeps a client-only history of prior cursors so `Previous` navigates back without changing the RPC contract.
- Applying a new search/status resets the stack to `[null]`.
- **No offset pagination. No `SELECT *`. No client-side global loading.**

## 5. Search & Filters

Toolbar exposes only:

- Free-text `search` — max 100 chars enforced by `maxLength`, forwarded to RPC which validates again.
- `status` — strict `<select>` restricted to `{'', draft, active, inactive, archived}` matching the RPC allowlist.

No client-side global search over unloaded data.

## 6. Response Column Allowlist (rendered fields only)

- **Stores:** company_name, display_name, slug, store_status, is_primary, country_code, default_locale, created_at.
- **Channels:** company_name, store_name, display_name, provider, status, control_state, created_at.
- **Listings:** company_name, store_name, sku_code, product_title, brand, listing_status, control_state, published_quantity (labelled *diagnostic*), created_at.

Never rendered / never fetched: credentials, tokens, emails, customers, orders, payments, addresses, costs, audit payloads, role internals. RPCs do not return these columns; UI has no other read path.

## 7. Error Handling

`friendlyError()` maps known Postgres error markers to short, generic UI text:

| Marker | UI |
|--------|----|
| `not_authenticated` | "Session expired. Please sign in again." |
| `not_platform_admin` / `insufficient_privilege` | "Access denied." |
| `search_too_long` | "Search must be 100 characters or fewer." |
| `invalid_status_filter` | "Invalid status filter." |
| `invalid_cursor` | "Invalid pagination cursor." |
| default | "Read failed." |

No stack trace, no error object, no internal details leaked.

## 8. Read-Only Guarantees

- Zero mutation buttons anywhere in `src/routes/_authenticated/admin/**`: no Edit, Suspend, Activate, Publish, Delete, Impersonate, Export, CSV, Change role, Change company, price/inventory editors.
- Banner on every admin page: **"Platform administration — read-only inspection. No changes can be made from this screen."**
- No `supabase.from(...).insert/update/delete/upsert` in any admin file (grep-verified).
- No `import.*client\.server` or `supabaseAdmin` reference.
- No `functions.invoke`, no server function, no server route added.

## 9. Tests (Lovable-native, manual walkthrough)

| # | Case | Outcome |
|---|------|---------|
| 1 | Signed-in admin (`ceo@suroohholdings.com`) opens `/admin/stores` | Loads. Rows returned across companies. |
| 2 | Same user opens `/admin/channels` | Loads. |
| 3 | Same user opens `/admin/listings` | Loads. |
| 4 | Signed-in non-admin (buyer/seller) opens `/admin` | `has_role` returns `false` → *Access denied* card. No data fetched. |
| 5 | Signed-in company owner (non-platform-admin) opens any `/admin/*` | *Access denied*. |
| 6 | Signed-in user with no role | *Access denied* (gate + fail-closed RPCs). |
| 7 | Logged-out user opens `/admin/*` | Redirected to `/auth` by parent `_authenticated` gate. |
| 8 | Refresh a signed-in admin session | Re-runs gate on mount; still allowed. |
| 9 | Bad status typed into DevTools (bypassing `<select>`) | RPC returns `22023 invalid_status_filter` → mapped to friendly text. |
| 10 | `_search` > 100 chars (client `maxLength` capped; forced via DevTools) | RPC returns `22023 search_too_long` → friendly text. |
| 11 | Tampered cursor | RPC returns `22023 invalid_cursor` → friendly text. Cursor stack reset via toolbar. |
| 12 | Pagination Next / Previous | Deterministic (created_at DESC, id DESC). |
| 13 | 7th-merchant appearance | The RPC scans `companies × merchant_stores` with no hardcoding — a new company shows up in Stores automatically. |
| 14 | Empty state | `"No results."` — no totals, no counts. |
| 15 | Direct table reads attempted from any admin file | grep: none. |
| 16 | `service_role` / `sandbox_exec` references | grep: none. |
| 17 | Write action anywhere in `/admin/**` | none. |
| 18 | Schema/RPC/migration change this round | none. |
| 19 | P5-HF-001 (`place_order` ACL) | Untouched. |
| 20 | Bol Live / Stripe Live | Still off. |
| 21 | RLS baseline | Untouched. |

## 10. R-D8 — Live Role-Revocation Flight

**Not executed.** Executing a real revocation would require mutating the sole Platform Admin row and is not safe in the live database from this environment.

- The UI does not cache role state beyond a single mount; a fresh mount re-checks `has_role`.
- The three RPCs re-evaluate `has_role` on every call (STABLE, no session-bound cache; no JWT role claim; there is no application-side role cache).
- Therefore, on the *next* RPC call after a real revocation, the child page will receive `42501 not_platform_admin`, `friendlyError` will render *Access denied*, and displayed rows are cleared by the same `setRows([])` path.

**R-D8 remains OPEN.** No dry run has verified live revocation end-to-end. Do **not** rely on this before enabling any Admin write action or sensitive-data surface.

## 11. R-D7 Compliance

- No copy in the UI claims "audited", "activity log", "download", or "export".
- No CSV / download endpoint added.
- The banner is neutral: *read-only inspection*.

## 12. Zero-Delta Evidence

- No migration files added under `supabase/migrations/`.
- No changes to `supabase/config.toml`, `src/integrations/supabase/*`.
- No new RPC, no new grant, no policy change, no table change.
- `place_order` remains ACL-locked (P5-HF-001 unchanged).

## 13. Files Changed

Added:
- `src/routes/_authenticated/admin/route.tsx`
- `src/routes/_authenticated/admin/index.tsx`
- `src/routes/_authenticated/admin/stores.tsx`
- `src/routes/_authenticated/admin/channels.tsx`
- `src/routes/_authenticated/admin/listings.tsx`
- `src/lib/admin/ui.tsx`
- `docs/PHASE5_M1A_M2D2B_PLATFORM_ADMIN_READ_ONLY_UI_REPORT.md`

Modified: `src/routeTree.gen.ts` (auto-generated).
No other files changed.

## 14. Residual Risks

- **R-D7** — Platform Admin reads are not application-audited. Carried from M1A #2D-2A. Any future export/detail/impersonation feature must land an audit design first.
- **R-D8** — Live role-revocation flight not executed. UI + RPCs are designed to fail closed on the *next* call, but the end-to-end run against the live admin has not been performed.

## Final Verdict

**`M1A #2D-2B PASS WITH RESIDUAL RISKS`**

- Read-only UI wired exclusively to the three approved RPCs.
- Fail-closed session + admin gate; neutral access-denied for all non-admin cases.
- Keyset pagination with client-side cursor history; no offset, no global loads.
- Allowlisted search & status filters with safe error mapping.
- No writes, no exports, no impersonation, no detail RPC, no direct cross-tenant queries.
- Zero DB delta. R-D7 preserved. R-D8 explicitly open.

Halting. Awaiting Owner authorisation for the next milestone.
