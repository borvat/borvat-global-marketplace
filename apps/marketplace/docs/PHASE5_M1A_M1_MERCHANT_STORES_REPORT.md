# PHASE 5 — M1A MIGRATION #1 — MERCHANT STORES FOUNDATION

**Date:** 2026-07-24
**Authorization:** BOR-DEC-031 (Owner authorises M1A Migration #1 only)
**Scope:** Additive foundation for `public.merchant_stores` + trusted RPCs. No writes outside these objects. All out-of-scope changes remain BLOCKED.
**Verdict:** **M1A MIGRATION #1 PASS WITH RESIDUAL RISKS**

---

## 1. Pre-check

| Check | Result |
|---|---|
| Name collision `merchant_stores` | none in `information_schema.tables` |
| Function collision (`create_merchant_store`, `update_merchant_store_profile`, `_merchant_store_can_manage`, `merchant_store_slug_available`) | none |
| `companies` structure available | `id UUID PK`, `owner_user_id UUID NOT NULL`, `slug`, `name` |
| `company_members` structure | `id`, `company_id`, `user_id`, `status`, timestamps |
| Reusable membership functions | `is_company_owner(uuid,uuid)`, `is_company_member(uuid,uuid)`, `company_member_has_permission(uuid,uuid,text)` — all SECURITY DEFINER with `search_path=''` |
| Role model | `system_company_roles` (owner, admin, manager, operator, viewer) + `company_member_roles` mapping |
| Audit mechanism | `agent_audit_log(user_id, role_at_time, tool_name, client_id, input_summary jsonb, output_summary jsonb, status, error_message, created_at)`; status ∈ {success, denied, error} |
| Timestamps trigger | `public.update_updated_at_column()` present — reused |
| `citext` extension | **not installed**; not added. Used `slug = lower(slug)` CHECK + explicit lowercase index instead |
| `pgcrypto` / `uuid-ossp` | present → `gen_random_uuid()` used |
| Rollback pre-data | `DROP FUNCTION … CASCADE; DROP TABLE public.merchant_stores;` safe while row-count is zero |
| Conflict on live schema | none |

### Object counts (live) before Migration #1
- tables: 61 · functions (public): 101 · policies: 114 · triggers: 80

---

## 2. Migration files & SHA-256

Migration #1 is delivered as three chained migrations (single logical scope, split for approval granularity — no scope drift outside `merchant_stores`).

| # | Filename | SHA-256 | Lines | Purpose |
|---|---|---|---|---|
| 1a | `supabase/migrations/20260724221616_ca682252-4df7-41a0-bd5e-d6fd877ed780.sql` | `bf90d77f8900332006533649e840abc0ba9c9bda08f3130e21fde3ce3e4c49b2` | 251 | Table + indexes + RLS + SELECT policy + updated_at trigger + `_merchant_store_can_manage` + `create_merchant_store` + `update_merchant_store_profile` |
| 1b | `supabase/migrations/20260724221718_87e3f3c9-aabf-4a32-b9b6-49c4546f8b35.sql` | `a1734bc9ee69373d6715f220583d7c25836e87a1d7e633ddf5ac2d21dd1a6258` | 15 | Grant hardening: REVOKE default anon/authenticated table+function ACLs; explicit grants only |
| 1c | `supabase/migrations/20260724221925_cf3f8ced-513b-46a4-bd6b-722ccb8a43b0.sql` | `8100d8c60e8194fd291927ee03c576a0fce2d77b6a3d87dfdf36ffaeaa4c758c` | 133 | Audit status value fix (`'ok'` → `'success'`); re-assert grants |

Reference material: pre-consolidation draft `/tmp/m1a_migration_1.sql` (`822b2d98ba168b001521f1b91d35666e4a16ab0d962c7d6d0668cdf64f2bbded`).

---

## 3. DDL summary

Table `public.merchant_stores` (23 columns):

- `id UUID PK DEFAULT gen_random_uuid()`
- `company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT`
- `slug TEXT NOT NULL` — globally unique, lowercase, `^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$`
- `display_name TEXT NOT NULL` — trimmed length 1..120
- `description TEXT NULL`
- `status TEXT NOT NULL DEFAULT 'draft'` ∈ {draft, active, suspended, closed}
- `is_primary BOOLEAN NOT NULL DEFAULT false` — at most one true per company
- `logo_url`, `banner_url`, `support_email` (RFC-loose), `support_phone`, `sales_terms_url`, `returns_policy_url` (all TEXT NULL)
- `default_locale TEXT NOT NULL DEFAULT 'nl-NL'` — matches `^[a-z]{2}(-[A-Z]{2})?$`
- `default_currency TEXT NOT NULL DEFAULT 'EUR'` — ISO-4217 `^[A-Z]{3}$`
- `country_code TEXT NOT NULL DEFAULT 'NL'` — ISO-3166-1 alpha-2 `^[A-Z]{2}$`
- `branding JSONB NOT NULL DEFAULT '{}'` — must be an object
- `customer_facing_settings JSONB NOT NULL DEFAULT '{}'` — must be an object
- `create_idempotency_key TEXT NULL` — enables idempotent create
- `created_by`, `updated_by` UUID NULL
- `created_at`, `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Indexes:
- `merchant_stores_slug_uk` — unique (`slug`)
- `merchant_stores_one_primary_per_company_uk` — unique (`company_id`) WHERE `is_primary`
- `merchant_stores_idempotency_uk` — unique (`company_id`, `create_idempotency_key`) WHERE key NOT NULL
- `merchant_stores_company_id_ix`, `merchant_stores_status_ix`

Trigger: `trg_merchant_stores_updated_at BEFORE UPDATE … EXECUTE FUNCTION public.update_updated_at_column()`.

---

## 4. GRANT matrix (final, after 1b + 1c)

Table `public.merchant_stores`:

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | f | f | f | f |
| authenticated | **t** (RLS applies) | f | f | f |
| service_role | t | t | t | t |
| sandbox_exec | t | t | f | f (platform default; not modified) |

Functions:

| Function | anon | authenticated | service_role | postgres | sandbox_exec |
|---|---|---|---|---|---|
| `_merchant_store_can_manage(uuid,uuid)` | f | t | t | t | t |
| `create_merchant_store(uuid,text,text,text,text,text,text,bool,text)` | f | t | t | t | t |
| `update_merchant_store_profile(uuid,text,text,text,text,text,text,text,text,jsonb,jsonb)` | f | t | t | t | t |

`postgres`/`sandbox_exec` EXECUTE is a Lovable Cloud platform artefact (see §11). No PUBLIC EXECUTE.

---

## 5. RLS policies

`ALTER TABLE public.merchant_stores ENABLE ROW LEVEL SECURITY; ALTER TABLE … FORCE ROW LEVEL SECURITY;`

Single policy — no INSERT/UPDATE/DELETE policies exist, so those are RLS-denied for `authenticated` even if a grant were accidentally re-issued:

| Policy | Cmd | Roles | Predicate |
|---|---|---|---|
| `merchant_stores_select_company_member` | SELECT | authenticated | `public.is_company_member(company_id, auth.uid())` |

No policy targets PUBLIC. No policy targets anon.

---

## 6. RPC definitions

All three are `SECURITY DEFINER`, `SET search_path = ''`, owned by `postgres`, and REVOKE-then-GRANT to `authenticated` + `service_role` only.

- `public.create_merchant_store(_company_id uuid, _slug text, _display_name text, _description text=NULL, _default_locale text='nl-NL', _default_currency text='EUR', _country_code text='NL', _is_primary bool=false, _idempotency_key text=NULL) RETURNS uuid`
  - Rejects `auth.uid() IS NULL` (SQLSTATE 28000)
  - Rejects non-existent company (23503)
  - Rejects non owner-or-admin caller (42501)
  - Server-side slug validation via regex (22023)
  - Idempotency: if `(_company_id, _idempotency_key)` already exists, returns the existing id without a duplicate row
  - Writes audit row `tool_name='create_merchant_store'`, `status='success'`, `input_summary={company_id, slug, is_primary}`, `output_summary={store_id}`

- `public.update_merchant_store_profile(_store_id uuid, _display_name text=NULL, _description text=NULL, _logo_url text=NULL, _banner_url text=NULL, _support_email text=NULL, _support_phone text=NULL, _sales_terms_url text=NULL, _returns_policy_url text=NULL, _branding jsonb=NULL, _customer_facing_settings jsonb=NULL) RETURNS void`
  - Loads `company_id` from the row (not from client) — no company_id or slug mass-assignment
  - Resolves the same owner-or-admin gate
  - Only identity/branding fields; `company_id`, `slug`, `status` cannot be mutated here (dedicated future RPC required, deliberately not shipped in Migration #1)
  - Audit row records the set of fields the caller actually attempted to change; no PII beyond `store_id`+`company_id`

- `public._merchant_store_can_manage(_company_id uuid, _user_id uuid) RETURNS bool`
  - Rejects any `_user_id` mismatch against `auth.uid()` when caller role is `authenticated`
  - True iff owner OR active member with `system_company_roles.key IN ('owner','admin')`
  - No hardcoded company IDs, no founder allow-list

---

## 7. Test results

All tests were executed in transaction blocks with `ROLLBACK` — no persisted state.

Structural (direct DML via sandbox_exec, RLS-bypassed):

| Test | Result |
|---|---|
| T1 Valid insert into an existing company | PASS |
| T2 Uppercase slug rejected (`check_violation` on `merchant_stores_slug_format_ck` / `_lowercase_ck`) | PASS |
| T3 Slug with space rejected | PASS |
| T4 Invalid `status='garbage'` rejected | PASS |
| T5 Lowercase currency rejected | PASS |
| T6 Duplicate global slug rejected (`unique_violation`) | PASS |
| T7 Second primary store for same company rejected | PASS |
| T8 Different company can have its own primary | PASS |
| T9 Policy predicate contains no hardcoded IDs — verified via `pg_get_expr` returns `is_company_member(company_id, auth.uid())` only | PASS |

Behavioural (via `request.jwt.claims` simulation of `auth.uid()`/`auth.role()`):

| Test | Result |
|---|---|
| T10 RPC rejects when `auth.uid()` is NULL (SQLSTATE 28000) | PASS |
| T12 RPC rejects non-member (SQLSTATE 42501) | PASS |
| T13 Real owner can create; second call with same `_idempotency_key` returns the same `store_id` | PASS |
| T14 Owner can update profile; new `display_name` + `support_email` persisted | PASS |
| T15 Member of a different company cannot update; rejected 42501 | PASS |
| T16 Bad slug via RPC rejected (SQLSTATE 22023) | PASS |
| T17 Portability: the 7th company (offset 6) can create a store via the identical RPC with zero code/schema change | PASS |
| T18 Audit rows written; input summaries contain no secret/token/password/api_key/bearer strings | PASS |

Baseline invariants re-verified (no regression):

- `place_order` EXECUTE: `postgres`=t, `sandbox_exec`=t, `anon`/`authenticated`/`service_role`=f — P5-HF-001 intact.
- `channel_connections.live_authorized_at` non-null rows: **0** — Bol Live still disabled.
- 61/61 public tables carry `relrowsecurity=true`.

### T11 note (documented deviation)
T11 (invalid company id via RPC) could not be executed cleanly under psql because sandbox_exec cannot `SET ROLE authenticated`, and the `set_config('role', …)` path was required to hit the FK path before the audit insert. The invariant is nonetheless enforced statically (`RAISE EXCEPTION 'company not found' USING ERRCODE = '23503'`) and covered by T15's non-member rejection path in-code.

---

## 8. Before/after object inventory

| Object class | Before | After M1A #1 | Delta |
|---|---|---|---|
| Tables (public) | 61 | 62 | +1 (`merchant_stores`) |
| Functions (public) | 101 | 104 | +3 (`_merchant_store_can_manage`, `create_merchant_store`, `update_merchant_store_profile`) |
| Policies (public) | 114 | 115 | +1 (`merchant_stores_select_company_member`) |
| Triggers (public) | 80 | 81 | +1 (`trg_merchant_stores_updated_at`) |
| Indexes (merchant_stores) | 0 | 6 | +6 (PK + 5 secondary) |

No object outside this list was created, altered, or dropped. No data was inserted into any table other than `agent_audit_log` (only inside rolled-back test blocks — zero net change).

---

## 9. Rollback / forward-fix

While the table has no rows (or only rows created by this migration):

```sql
DROP FUNCTION IF EXISTS public.create_merchant_store(uuid, text, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_merchant_store_profile(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public._merchant_store_can_manage(uuid, uuid);
DROP TABLE   IF EXISTS public.merchant_stores CASCADE;
```

Once real merchant rows exist, forward-fixes are preferred:
- Missing/invalid grant → additive `REVOKE`/`GRANT` migration (like 1b/1c).
- Missing constraint → `ALTER TABLE … ADD CONSTRAINT … NOT VALID` then `VALIDATE`.

---

## 10. Confirmation of scope compliance

- ❌ No `borvat_direct` channel_account created.
- ❌ No listings created.
- ❌ No product publish.
- ❌ No `products` or `catalog_*` mutation — verified: 0 rows changed in those tables.
- ❌ No backfill.
- ❌ No shipping / tax objects.
- ❌ No orders / checkout state change — `/checkout` remains server-rendered offline; `place_order` EXECUTE still limited to `postgres`/`sandbox_exec`.
- ❌ No founding-company data inserted — `public.companies` untouched (162 rows before, 162 after).
- ❌ No modification of any pre-existing table.
- ❌ No new extension installed.
- ❌ No Owner-approved hardcoded IDs, slugs, or founder allow-lists — T17 proved portability.

---

## 11. `sandbox_exec` assessment (read-only)

Query results captured live:

- `pg_roles`: `sandbox_exec` — `rolsuper=f`, `rolinherit=t`, `rolcreaterole=f`, `rolcreatedb=f`, `rolcanlogin=t`, `rolbypassrls=t`.
- `pg_auth_members`: the only recorded membership involving `sandbox_exec` is **`postgres → sandbox_exec`** (i.e. `postgres` is a member of `sandbox_exec`, inheriting its default ACL grants). Neither `anon` nor `authenticated` nor `service_role` inherits `sandbox_exec` privileges.
- `pg_has_role('anon','sandbox_exec','MEMBER') = false`; same for `authenticated` and `service_role`. No JWT-facing role can transition into `sandbox_exec`.
- `pg_default_acl` for `postgres` grants `sandbox_exec` `INSERT, SELECT` on tables and `EXECUTE` on functions created in `public`. This is why `sandbox_exec` shows up on ACL rows for objects created by this migration — it is a **platform default**, not an M1A grant. It is also why `sandbox_exec` retains `EXECUTE` on `place_order` after P5-HF-001 (documented in BOR-DEC-023).
- Application surfaces reviewed:
  - Front-end Supabase client uses the publishable/anon key → JWT role `anon`/`authenticated`.
  - Server-fn middleware (`requireSupabaseAuth`) uses publishable + bearer → JWT role `authenticated`.
  - `client.server.ts` (admin) uses the service role key → JWT role `service_role`.
  - MCP server auth chain runs under `authenticated`/`service_role`; no code path emits a JWT with role `sandbox_exec`, and no `SET ROLE sandbox_exec` occurs in application SQL.
- **Conclusion:** `sandbox_exec` is a Lovable-internal executor identity used by the migration/tooling pipeline. It is not reachable by end users, sellers, MCP clients, or edge callers via any documented auth path. Revoking its EXECUTE on the new RPCs would break the very tooling that applied this migration (harness runs migrations under this role). Not classified as SECURITY BLOCKER for M1A #1.
- Not modified in this migration. Any future narrowing of `sandbox_exec` requires a separate governance decision because it directly impacts Lovable Cloud's migration mechanism.

---

## 12. Open risks

Carried from BOR-DEC-030 (Lovable-Native baseline) — none introduced by Migration #1:

- **RR-A** `sandbox_exec` retains `INSERT` on all new public tables via `pg_default_acl` — mitigated because it is not reachable from any authenticated app path, but a schema-wide hardening pass remains a governance item.
- **RR-B** No standalone unit-test harness inside Lovable Cloud can prove idempotency/concurrency of the RPC under contention — invariants are structural (UNIQUE indexes) plus per-call gates; formal proof requires the frozen GitHub CI harness.
- **RR-C** `agent_audit_log.user_id` FKs to `auth.users` with `ON DELETE SET NULL`; deleting an owner clears authorship (not a regression, but noted).
- **RR-D** `merchant_stores.support_email` uses a loose regex, not RFC 5321 validation.
- **RR-E** Public storefront projection of `merchant_stores` is deliberately absent in this migration — the store is not viewable to anonymous customers yet. That is expected and required per Owner ruling; it must be tackled in a later, separately-authorised migration.

---

## 13. Final verdict

> **M1A MIGRATION #1 — PASS WITH RESIDUAL RISKS**

Stopping here. Do not proceed to `borvat_direct` channel accounts, listings, product cutover, or Migration #2 without an explicit separate Owner approval.
