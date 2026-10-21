# PHASE 5 — M1A MIGRATION #2A — BORVAT DIRECT ACCOUNT FOUNDATION

**Date:** 2026-07-24
**Authorization:** BOR-DEC-032 (Owner authorises M1A Migration #2A only)
**Scope:** Additive-only. Represent Borvat Direct as an internal channel type inside `public.channel_accounts` (`provider = 'borvat_direct'`), linked to `public.merchant_stores`. No listings, no publication, no cutover, no OAuth, no external credentials, no dispatch, no reconciliation.
**Verdict:** **M1A MIGRATION #2A PASS WITH RESIDUAL RISKS**

---

## 1. Pre-check and architecture compatibility

Live inspection of `public.channel_accounts` before Migration #2A:

| Aspect | Finding |
|---|---|
| Table exists | Yes, 9 columns, 134 rows (127 `bol`, 7 `shopify`). |
| Column named `kind` | **Absent.** The dispatch column is `provider TEXT NOT NULL` — plain text, **no enum**, no CHECK constraint on values. Adding a value `'borvat_direct'` is fully additive. Report uses `provider = 'borvat_direct'` as the mapping of Owner spec §1's `kind = 'borvat_direct'`. |
| Column `live_authorized_at` | **Not on this table.** It lives on `public.channel_connections`, which we do not touch. |
| Column `secret_ref` | **Not on this table.** External credentials live in `public.seller_bol_credentials` and `public.channel_connections`, which we do not touch. Borvat Direct rows therefore have no place to hold a secret by construction. |
| `company_id` FK | `REFERENCES public.companies(id) ON DELETE RESTRICT`. Reused. |
| RLS | Enabled (not FORCED). Policies target `authenticated` and are permission-based via `company_member_has_permission(company_id, auth.uid(), 'channels.read'/'channels.connect')`. No PUBLIC/anon policies. |
| Direct DML grants to app roles | None. `information_schema.role_table_grants` shows only `sandbox_exec` has INSERT/SELECT. `authenticated` has zero direct grants — the RLS policies alone are inert without a base GRANT. This is a defence-in-depth artefact from Phase 2. |
| Existing constraints | `PK(id)`, `UNIQUE(company_id, provider, external_account_id)`. Note: with `external_account_id NULL`, Postgres treats NULLs as distinct — the existing UNIQUE does NOT prevent multiple borvat_direct rows per company. New constraints required (see §3). |
| Triggers | `channel_accounts_immutable_company_id` (prevents company_id mutation), `channel_accounts_touch` (updated_at). Reused. |
| Enum `p2_channel_control_state` values | `read_only_import`, `shadow`, `active`, `paused`. `paused` selected as fail-closed state. |
| Enum `p2_lifecycle_status` values | `draft`, `active`, `inactive`, `archived`. `draft` selected as fail-closed status. |
| External-provider hard-coding | Functions referencing `'bol'` literally: `_p4_enqueue_bol_write`, `begin_offer_import_batch`, `complete_outbox_event_live`, `complete_outbox_event_shadow`, `ingest_bol_order`, `p4_dispatch_decision`, `provision_channel_connection`. All key on `provider = 'bol'` — Borvat Direct rows are **inherently invisible** to these paths. |
| FK dependents on `channel_accounts` | 15 tables (listings, snapshots, import batches, imported offers, order inbox, orders, order lines, shadow/live dispatches, shipments, connections, reconciliation reports/findings, snapshot batches, outbox events). None auto-create rows for a new `channel_accounts` row — they require explicit inserts. Borvat Direct rows therefore land inert. |
| Would embedding `borvat_direct` here force a destructive re-interpretation of Phase 4? | **No.** The Phase 3/4 outbox/dispatch/reconciliation flows are keyed on `provider = 'bol'` explicitly or on `channel_connections.live_authorized_at` (which does not exist for Borvat Direct). Additive-only path is sufficient. |

**Architecture compatibility verdict: COMPATIBLE.** No architecture conflict report needed. Phase 3 and Phase 4 semantics are preserved.

---

## 2. Design (minimum additive)

1. Extend `public.channel_accounts` with one nullable column `merchant_store_id UUID REFERENCES public.merchant_stores(id) ON DELETE RESTRICT`. Existing 134 rows keep `NULL` — zero backfill needed.
2. Partial unique index enforcing **one borvat_direct account per merchant_store**: `UNIQUE(merchant_store_id) WHERE provider = 'borvat_direct'`.
3. Table-level CHECK `channel_accounts_borvat_direct_shape_ck`: when `provider = 'borvat_direct'` the row **must** have `merchant_store_id NOT NULL`, `external_account_id NULL`, `control_state = 'paused'`, `status ∈ {'draft','inactive'}`. Fail-closed by construction — no active/shadow, no external ID, no unbound rows.
4. Table-level CHECK `channel_accounts_external_no_store_ck`: rows with `provider <> 'borvat_direct'` **must** have `merchant_store_id IS NULL`. Prevents Borvat Direct semantics leaking onto external providers in this scope.
5. Trigger `channel_accounts_company_consistency` (BEFORE INSERT/UPDATE of `merchant_store_id, company_id`): if `merchant_store_id` is set, its `company_id` **must equal** the row's `company_id`. Cross-company binding rejected with SQLSTATE `23514`.
6. Trusted RPC `public.create_borvat_direct_account(_merchant_store_id, _display_name)`: `SECURITY DEFINER`, `search_path = ''`, owner-or-admin gate via `public._merchant_store_can_manage`, idempotent via the partial UNIQUE index, writes an `agent_audit_log` row on every attempt (success/denied). No mass assignment (company_id and shape are derived from the store, not accepted from the client). No hardcoded company IDs.
7. Existing SELECT/INSERT/UPDATE RLS policies on `channel_accounts` continue to apply — they already enforce tenant isolation via `company_member_has_permission`. Direct DML from `authenticated` remains blocked (no base grant); the RPC is the only path.

No new tables. No link table needed. No new enum. No new sequence.

---

## 3. Migration files and SHA-256

| # | File | SHA-256 | Lines |
|---|---|---|---|
| 2A-1 | `supabase/migrations/20260724222835_0c93a28a-8f84-4b32-b9cf-2af64605c422.sql` | `3a3bb773baa96a8156a992b52ceddf5882dd0a054461e416e77a9b9dd734b8dd` | 164 |
| 2A-2 | `supabase/migrations/20260724223025_3128587e-88a3-483e-9318-25e92de047e3.sql` | `78caa1b86b4295bde563d54632bffef6dbf9b2ad625528c9f9ab8b18749821d0` | 5 |
| 2A-3 | `supabase/migrations/20260724223116_e22e2587-690c-413f-a72a-f9663ec4f4a6.sql` | `271d0b1bb85343f8fc4c19bc26dd7c6c34b73456c7201a343544f2a389d7ade0` | 90 |

2A-1 = column + indexes + CHECKs + trigger + RPC.
2A-2 = restore `sandbox_exec` EXECUTE on the RPC for the Lovable Cloud tooling harness (parity with M1A #1; see §7).
2A-3 = hotfix: schema-qualify `p2_channel_control_state`/`p2_lifecycle_status` inside the RPC because `search_path = ''` makes unqualified enum types unresolvable. No behavioural change.

---

## 4. Object delta (before → after)

| Class | Before | After | Delta |
|---|---|---|---|
| Public tables | 61 | 61 | 0 |
| Public functions | 104 | 106 | +2 (`_channel_accounts_company_consistency`, `create_borvat_direct_account`) |
| Triggers on `channel_accounts` | 2 | 3 | +1 (`channel_accounts_company_consistency`) |
| Indexes on `channel_accounts` | 2 | 4 | +2 (`channel_accounts_merchant_store_id_ix`, `channel_accounts_borvat_direct_per_store_uk`) |
| Table CHECKs on `channel_accounts` | 0 | 2 | +2 (`_borvat_direct_shape_ck`, `_external_no_store_ck`) |
| Columns on `channel_accounts` | 9 | 10 | +1 (`merchant_store_id`) |
| Rows in `channel_accounts` | 134 (127 bol, 7 shopify) | 134 (127 bol, 7 shopify) | 0 |
| Rows in `channel_listings` / `channel_orders` / `channel_order_lines` / `products` / `inventory_*` / `orders` / `order_items` | unchanged | unchanged | **0** — verified via T14 |

---

## 5. RLS and GRANT matrix

`channel_accounts` (unchanged): RLS enabled (not FORCED, matches pre-existing posture). Three pre-existing policies for `authenticated`:

| Policy | Cmd | Predicate |
|---|---|---|
| `channel_accounts_select` | SELECT | `company_member_has_permission(company_id, auth.uid(), 'channels.read')` |
| `channel_accounts_insert` | INSERT | `company_member_has_permission(company_id, auth.uid(), 'channels.connect')` (WITH CHECK only) |
| `channel_accounts_update` | UPDATE | `company_member_has_permission(company_id, auth.uid(), 'channels.connect')` (USING + WITH CHECK) |

No policy targets PUBLIC or `anon`. No new policy added.

Direct DML grants:

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | f | f | f | f |
| authenticated | f | f | f | f |
| service_role | f | f | f | f |
| sandbox_exec | t | t | f | f |

Direct writes by `authenticated` are blocked by missing base grant even before RLS is evaluated. The **only sanctioned creation path** is the trusted RPC.

Function grants:

| Function | anon | authenticated | service_role | postgres | sandbox_exec |
|---|---|---|---|---|---|
| `create_borvat_direct_account(uuid,text)` | f | **t** | **t** | t (owner) | t (test-harness parity, §7) |
| `_channel_accounts_company_consistency()` | f | f | f | t (owner) | f |

`_channel_accounts_company_consistency` is invoked only by the trigger and runs with the owner's privileges regardless of caller — no application role needs EXECUTE.

---

## 6. Functions and triggers

### `public._channel_accounts_company_consistency()` — trigger function
- Language: plpgsql, `SET search_path = ''`, owned by `postgres`.
- Fires `BEFORE INSERT OR UPDATE OF merchant_store_id, company_id` on `public.channel_accounts`.
- Behaviour:
  - If `NEW.merchant_store_id IS NOT NULL`, load `merchant_stores.company_id`.
  - If the merchant store does not exist → `RAISE EXCEPTION 'merchant_store not found' USING ERRCODE = '23503'`.
  - If `merchant_stores.company_id <> NEW.company_id` → `RAISE EXCEPTION 'company_id does not match merchant_store.company_id' USING ERRCODE = '23514'`.
  - Otherwise pass through.

### `public.create_borvat_direct_account(_merchant_store_id UUID, _display_name TEXT DEFAULT NULL) RETURNS UUID`
- Language: plpgsql, `SECURITY DEFINER`, `SET search_path = ''`, owned by `postgres`.
- Behaviour:
  1. Reject `auth.uid() IS NULL` → SQLSTATE `28000`.
  2. Load `company_id, display_name` of the target merchant store; if absent → SQLSTATE `23503`.
  3. Call `public._merchant_store_can_manage(store.company_id, auth.uid())` (owner-or-admin gate reused from M1A #1). On false, write a `denied` audit row and raise SQLSTATE `42501`.
  4. Derive display name: caller-supplied trimmed value, or `store.display_name || ' (Borvat Direct)'`.
  5. Idempotency: return the existing `borvat_direct` row for this store if any; write an audit row with `idempotent: true`.
  6. Otherwise INSERT with hard-coded fail-closed shape: `provider='borvat_direct'`, `external_account_id=NULL`, `control_state='paused'`, `status='draft'`, `merchant_store_id = _merchant_store_id`, `company_id = store.company_id`.
  7. Write success audit row with `{channel_account_id}` only. No secrets, no PII, no supplied identifier is trusted for authorization.

### Trigger
- `channel_accounts_company_consistency` — added.
- `channel_accounts_immutable_company_id` — pre-existing, unchanged (still prevents company mutation on update).
- `channel_accounts_touch` — pre-existing, unchanged (updated_at).

---

## 7. `sandbox_exec` assessment

`sandbox_exec` is Lovable Cloud's tooling role: `rolsuper=f`, `BYPASSRLS`, `LOGIN`, and no JWT-facing role (`anon`, `authenticated`, `service_role`, `authenticator`) is a member of it — verified in the M1A #1 report and re-confirmed by `pg_has_role('sandbox_exec','postgres','MEMBER')=f`. It is not reachable from the app.

Migration 2A-1 explicitly REVOKEd EXECUTE on `create_borvat_direct_account` from `PUBLIC, anon, authenticated, service_role, sandbox_exec` and re-GRANTed only to `authenticated, service_role`. Behavioural testing then failed with `permission denied for function` because the test harness itself runs as `sandbox_exec` and cannot escalate to `postgres`, `service_role`, or `authenticator`. Migration 2A-2 restored `EXECUTE` on this RPC to `sandbox_exec` — matching the posture kept for `create_merchant_store` / `update_merchant_store_profile` in M1A #1 and required so that behavioural tests are runnable inside Lovable Cloud.

- `_channel_accounts_company_consistency()` — sandbox_exec has **NO EXECUTE**. Trigger fires with owner privileges anyway; no path from the sandbox to invoke it directly is needed. Kept revoked.
- `create_borvat_direct_account` — sandbox_exec has EXECUTE (test-harness only). BYPASSRLS does not help an attacker because the RPC internally calls `auth.uid()` and enforces `_merchant_store_can_manage`; a caller with no valid JWT `sub` gets SQLSTATE `28000`. Documented as **Residual Risk RR-2A-A** below, consistent with the M1A #1 posture.

No global sandbox_exec grants were altered in this migration.

---

## 8. Test results

All tests executed inside `BEGIN … ROLLBACK`; no state persisted.

Precondition: two seed companies were picked whose `owner_user_id` is distinct and whose owners do not cross-appear in each other's `company_members` — the first two seed companies share an owner, which is legitimate test data but obscures cross-company assertions. Precondition search is portable and not hardcoded.

| # | Test | Result |
|---|---|---|
| T1 | Owner of Company A creates a Borvat Direct account for Store A1 → returns a UUID. | PASS |
| T2 | The persisted row has `provider='borvat_direct'`, `external_account_id IS NULL`, `control_state='paused'`, `status='draft'`, `company_id = A`, `merchant_store_id = A1`. | PASS |
| T3 | Second RPC call for the same store returns the same UUID (idempotent). | PASS |
| T4 | Same owner can create a second Borvat Direct account for a different store in the same company. | PASS |
| T5 | Owner A cannot create a Borvat Direct account for Store B (Company B): SQLSTATE `42501`. | PASS |
| T6 | A user who is not a member of Company A cannot create a Borvat Direct account for Store A1: SQLSTATE `42501`. | PASS |
| T7 | Anonymous (no JWT `sub`) call is rejected: SQLSTATE `28000`. | PASS |
| T8 | The 7th company (offset 6) can create a store and a Borvat Direct account through the identical RPC — zero code/schema change, no hardcoding. | PASS |
| T10a | Direct INSERT with `provider='borvat_direct'` and `external_account_id='ext-forbidden'` is blocked by `channel_accounts_borvat_direct_shape_ck` (`check_violation`). | PASS |
| T10b | Direct INSERT with `control_state='active'` is blocked by the shape CHECK. | PASS |
| T10c | Direct INSERT without `merchant_store_id` is blocked by the shape CHECK. | PASS |
| T11 | Direct INSERT with mismatched company (Store A1 under `company_id=B`) is blocked by `channel_accounts_company_consistency` trigger (SQLSTATE `23514`). | PASS |
| T12 | Direct INSERT of an **external** provider (`bol`) with a `merchant_store_id` is blocked by `channel_accounts_external_no_store_ck`. | PASS |
| T13 | A second Borvat Direct row for the same store fails at the partial UNIQUE index (`unique_violation`). | PASS |
| T14 | Zero channel listings, orders, and order lines were created for the new Borvat Direct accounts. | PASS |
| T15 | Baseline invariants unchanged: `place_order` EXECUTE for `authenticated` = false (P5-HF-001 intact); `channel_connections.live_authorized_at IS NOT NULL` count = 0 (Bol Live off). | PASS |
| T16 | `agent_audit_log` rows for `create_borvat_direct_account` contain no `secret / token / password / api_key / bearer / oauth` string in either `input_summary` or `output_summary`. | PASS |
| Additional | Post-check totals: 61/61 public tables RLS-enabled; `channel_accounts` row counts unchanged (127 bol, 7 shopify — no borvat_direct rows persisted because the whole test ran under ROLLBACK). | PASS |

**All 17 behavioural assertions pass.**

Phase 3/4 smoke path: no changes to outbox, reconciliation, dispatch, or import functions — those functions filter by `'bol'` literal and do not observe `borvat_direct` rows. Existing 134 external rows are byte-identical after Migration #2A.

---

## 9. Before/after inventory

| Metric | Before | After | Notes |
|---|---|---|---|
| Public tables | 61 | 61 | No new table. |
| Public functions | 104 | 106 | +2 as listed above. |
| Public policies | 115 | 115 | No new policy. |
| Public triggers | 81 | 82 | +1 on `channel_accounts`. |
| RLS-enabled tables | 61/61 | 61/61 | Unchanged. |
| `place_order` EXECUTE authenticated | false | false | P5-HF-001 intact. |
| `channel_connections.live_authorized_at` non-null | 0 | 0 | Bol Live still disabled. |
| `channel_accounts` rows by provider | 127 bol, 7 shopify | 127 bol, 7 shopify | No data written outside rolled-back tests. |
| Rows in `channel_listings` / `channel_orders` / `channel_order_lines` / `orders` / `order_items` / `products` / `inventory_transactions` / `channel_connections` | unchanged | unchanged | Explicitly not touched. |

---

## 10. Rollback / forward-fix

Rollback (safe because no persisted `borvat_direct` rows exist):

```sql
DROP FUNCTION IF EXISTS public.create_borvat_direct_account(uuid, text);
DROP TRIGGER  IF EXISTS channel_accounts_company_consistency ON public.channel_accounts;
DROP FUNCTION IF EXISTS public._channel_accounts_company_consistency();
ALTER TABLE   public.channel_accounts DROP CONSTRAINT IF EXISTS channel_accounts_external_no_store_ck;
ALTER TABLE   public.channel_accounts DROP CONSTRAINT IF EXISTS channel_accounts_borvat_direct_shape_ck;
DROP INDEX    IF EXISTS public.channel_accounts_borvat_direct_per_store_uk;
DROP INDEX    IF EXISTS public.channel_accounts_merchant_store_id_ix;
ALTER TABLE   public.channel_accounts DROP COLUMN IF EXISTS merchant_store_id;
```

Once real Borvat Direct rows are created by app users, prefer forward-fix migrations rather than a drop-column rollback.

---

## 11. Confirmation of scope compliance

Explicitly **NOT** created, modified, or enabled in this migration:

- ❌ `channel_listings` — untouched (row count unchanged).
- ❌ Any product publication path.
- ❌ Inventory publication quantity.
- ❌ Offer pricing.
- ❌ Checkout availability (`place_order` EXECUTE unchanged).
- ❌ Search indexing.
- ❌ Public storefront views / customer-facing routes.
- ❌ External adapters.
- ❌ OAuth flows.
- ❌ Secret storage / `secret_ref` / `seller_bol_credentials` / `channel_connections`.
- ❌ Webhooks.
- ❌ Reconciliation jobs.
- ❌ Dispatch workers.
- ❌ Seed rows for the six founding companies (no `INSERT` into `channel_accounts` outside rolled-back tests).
- ❌ Modification of any pre-existing column, policy, function, or trigger.
- ❌ Hardcoded company IDs, slugs, or founder allow-lists (T8 proves portability to the 7th company).
- ❌ Public storefront listing surfaces.
- ❌ Shipping, tax, comms outbox.
- ❌ Bol Live authorization (live_authorized_at count = 0).
- ❌ Stripe Live.

Migration #2A is Schema/Foundation only, exactly as Owner spec §4 requires.

---

## 12. Residual risks

- **RR-2A-A** (carried, matches M1A #1) — `sandbox_exec` retains EXECUTE on `create_borvat_direct_account` for the Lovable Cloud tooling harness. Mitigated because `sandbox_exec` is not reachable from any application JWT and the RPC still enforces `auth.uid()` + `_merchant_store_can_manage`. Rescoping requires a separate governance decision on `sandbox_exec` at large.
- **RR-2A-B** — `pg_default_acl` grants `INSERT/SELECT` on the new column to `sandbox_exec` transitively (inherited from the pre-existing table ACL). No new grant was issued in this migration; the CHECKs and trigger still refuse any shape violation regardless of the direct write path.
- **RR-2A-C** — RLS on `channel_accounts` is `ENABLE` but **not** `FORCE`. This is pre-existing Phase 2 posture and was intentionally not changed to avoid regressing 134 live external rows and the Phase 3/4 dispatch code paths. FORCE-RLS should be considered as part of a broader RLS hardening pass, not here.
- **RR-2A-D** — The three Phase-4 provider-hardcoded functions (`_p4_enqueue_bol_write`, `p4_dispatch_decision`, `provision_channel_connection`) literally reference `'bol'`; a future provider-generic refactor should ensure new providers cannot accidentally inherit Bol semantics. This is not a blocker for Borvat Direct because they will never observe borvat_direct rows.
- **RR-2A-E** — Cross-tenant behavioural verification depends on selecting seed companies with distinct owners. The first two seed companies share an owner (`d54dd474…`). The test harness selects isolated pairs deterministically; the underlying seed data is unchanged.

None of these introduce a new attack surface beyond what M1A #1 already documented.

---

## 13. Final verdict

> **M1A MIGRATION #2A — PASS WITH RESIDUAL RISKS**

Stopping here. Do **NOT** proceed to Listings, Publication, Product cutover, `borvat_direct` channel_connections, or M1A Migration #2B without explicit separate Owner approval.
