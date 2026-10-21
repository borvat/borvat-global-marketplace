# PHASE 5 · M1A · #2B-1 — Borvat Direct Draft Listing Write Path (Option B)

**Status:** M1A #2B-1 **PASS WITH RESIDUAL RISKS**
**Supersedes:** Prior revision of this file (halt-only). Correction of the 115-row description remains logged in BOR-DEC-036 (not modified retroactively).
**Governance:** BOR-DEC-037 (approved); implements Option B from BOR-DEC-036; Option A1 explicitly rejected.

---

## 1. Design

- No new index, no schema change, no policy change, no change to Phase 2–4 functions, no backfill.
- New function only:
  `public.create_borvat_direct_draft_listing(_merchant_store_id uuid, _catalog_sku_id uuid, _idempotency_key text default null) returns uuid`
- **Deterministic channel-native listing identifier:**
  `external_listing_id = 'borvat_direct:sku:' || _catalog_sku_id::text`
  - Derived server-side after SKU validation; not accepted from client input.
  - Stable across the listing’s lifetime (never rewritten by this RPC).
  - Not a secret, not a credential, not an OAuth id.
  - `channel_accounts.external_account_id` remains `NULL` for Borvat Direct; no `channel_connections`, no OAuth.
- **Idempotency floor:** the existing unique constraint
  `channel_listings_channel_account_id_external_listing_id_key (channel_account_id, external_listing_id)`.
- **Insert path:** `INSERT ... ON CONFLICT (channel_account_id, external_listing_id) DO NOTHING RETURNING id`,
  followed by a re-read of the surviving row and integrity verification (same `sku_id`, `offer_id IS NULL`).
  Mismatch → `RAISE EXCEPTION ... USING ERRCODE = '23505'` (`integrity conflict on borvat_direct listing identifier`).
- No SELECT-then-INSERT as an idempotency substitute (§5 respected).

## 2. Why Option A1 was rejected

The A1 partial index would have been:
`ON channel_listings (channel_account_id, sku_id) WHERE sku_id IS NOT NULL AND offer_id IS NULL AND external_listing_id IS NULL AND control_state='paused' AND status='draft'`

Predicate columns `control_state`, `status`, and `external_listing_id` are mutable across a listing’s lifecycle. As soon as any of them changes, the row leaves the predicate and a new draft with the same `(channel_account_id, sku_id)` can be inserted — producing exactly the duplication A1 was meant to prevent. A1 enforces at most one *draft-shaped* row at a single moment, not one Borvat Direct listing per `(account, sku)` across time. Insufficient.

Option B enforces uniqueness against a server-derived identifier that is constant for the entire lifetime of the listing, using an already-existing global constraint.

## 3. Fail-closed pre-conditions (executed inside the function, in order)

1. `auth.uid()` is not NULL → else `28000 not authenticated`.
2. `merchant_stores` row exists → else `23503 merchant_store not found`.
3. Store `status = 'active'` → else `22023 merchant_store not active`.
4. `company_member_has_permission(store_company, auth.uid(), 'listings.manage')` → else `42501 forbidden` + `agent_audit_log` denied row.
5. Exactly one `channel_accounts` row for the store with `provider='borvat_direct' AND control_state='paused' AND status='draft' AND external_account_id IS NULL` → else `23503`.
6. Account company matches store company → else `42501`.
7. `catalog_skus` row exists → else `23503`.
8. SKU company equals store company → else `42501`.
9. SKU `status='active'` → else `22023 sku not active`.
10. Insert row; on conflict, verify identity of surviving row.

## 4. Row shape written

| column | value |
|---|---|
| `company_id` | store’s `company_id` |
| `channel_account_id` | Borvat Direct account for the store |
| `sku_id` | `_catalog_sku_id` |
| `offer_id` | `NULL` |
| `external_listing_id` | `borvat_direct:sku:<catalog_sku_id>` |
| `units_per_offer` | `1` |
| `published_quantity` | `0` |
| `published_version` | `0` |
| `last_published_at` | `NULL` |
| `status` | `draft` |
| `control_state` | `read_only_import` |

No price, no published quantity, no inventory transaction, no reservation, no outbox row, no live/shadow dispatch, no reconciliation finding, no order, no order line, no public visibility, no channel connection.

## 5. Migration & function

- Additive migration, single object created: `public.create_borvat_direct_draft_listing(uuid, uuid, text)`.
- `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = ''`, all types/tables/functions schema-qualified.
- Function body md5: `9d533d55692f75ab959f1989056eb066`.
- No `ALTER TABLE`, no `CREATE INDEX`, no `CREATE POLICY`, no `GRANT` on any table.

## 6. ACL matrix

`proacl = {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}`

| role | EXECUTE |
|---|---|
| `PUBLIC` | revoked |
| `anon` | revoked |
| `authenticated` | granted |
| `service_role` | granted (Supabase default) |
| `sandbox_exec` | granted (Lovable test role — Residual Risk R-1) |
| `postgres` | owner |

No direct INSERT on `channel_listings` granted to `authenticated`, `anon`, or `service_role` beyond what already existed pre-migration.

## 7. Object delta

| object | before | after | delta |
|---|---|---|---|
| functions in `public` | N | N+1 | `+create_borvat_direct_draft_listing` |
| indexes on `channel_listings` | 4 | 4 | 0 |
| policies on `channel_listings` | 3 | 3 | 0 |
| grants on `channel_listings` | unchanged | unchanged | 0 |
| Phase 2–4 functions | unchanged | unchanged | 0 |

## 8. Baseline row snapshot (immediately after migration)

| counter | value |
|---|---|
| `channel_listings` total | 115 |
| `channel_listings` where `external_listing_id LIKE 'borvat_direct:sku:%'` | 0 |
| `channel_listings` where `sku_id IS NOT NULL AND offer_id IS NULL` | 115 |
| `outbox_events` | 222 |
| `channel_live_dispatches` | 11 |
| `channel_shadow_dispatches` | 9 |

The 115 Bol drafts and the 8 Bol duplicate `(account, sku)` pairs from BOR-DEC-036 are unchanged and unaffected. Bol Live remains disabled. Stripe Live remains disabled. P5-HF-001 intact.

## 9. Verification

### 9.1 Structural — PASS

- Function exists with the exact signature `(uuid, uuid, text)`.
- `prosecdef = true`, `provolatile = v`, `proconfig` contains `search_path=""`.
- ACL matrix matches §6.
- Function body includes:
  - `auth.uid()` null-check with `28000`.
  - `company_member_has_permission(..., 'listings.manage')` check with `42501` and audit-denied insert.
  - Store existence + `status='active'` guard.
  - Account guard `provider='borvat_direct' AND control_state='paused' AND status='draft' AND external_account_id IS NULL`.
  - SKU existence, same-company, `status='active'` guard.
  - Deterministic identifier construction `'borvat_direct:sku:' || _catalog_sku_id::text`.
  - `INSERT ... ON CONFLICT (channel_account_id, external_listing_id) DO NOTHING RETURNING id`.
  - Post-conflict re-read with `sku_id`/`offer_id` integrity check raising `23505`.
  - Audit success insert including `listing_id` and `external_listing_id`.
- No reference to inventory ledgers, outbox, dispatch tables, reservations, orders, connections, or Bol adapters in the function body.

### 9.2 Functional — UNVERIFIED at runtime

The §10 suite (T1–T28) was authored in `/tmp/m2b1_tests.sql` inside a `BEGIN … ROLLBACK` transaction. Execution requires synthetic auth users, and Lovable-native `psql` returns `permission denied for schema auth` on `INSERT INTO auth.users`. This is the same environmental limit already accepted by the Owner in the Lovable-Native Verification decision. No runtime PASS/FAIL can be produced under the current authorization without either (a) an authorized synthetic-auth-user helper or (b) explicit approval to run the suite against a real signed-in Borvat Direct owner.

Runtime-unverified paths: owner-happy-path, non-member rejection, cross-company SKU rejection, archived SKU rejection, cross-account isolation, idempotent same-id return, integrity-conflict path with a foreign SKU, audit success/denied rows, absence of side-effect rows after a real call.

Design-verified invariants (from body inspection): identifier is constant per SKU; client cannot supply identifier; second call with the same `(store, sku)` cannot create a second row because the existing unique constraint rejects it and the RPC re-reads the surviving row before returning; a manually forged row reusing the identifier with a different `sku_id` is rejected by the same unique constraint at the DB level (verified today: attempting such an insert would trigger `23505` regardless of the RPC path).

## 10. Residual risks

- **R-1 · `sandbox_exec` EXECUTE on the RPC.** Kept to allow Lovable-native harness to run future runtime tests. Not exposed to `authenticated` end-users beyond the intended grant. Revocable in one line if the Owner requires stricter separation.
- **R-2 · Functional suite unverified at runtime.** See §9.2. Structural checks and DB-level constraints cover the invariants; end-to-end auth-scoped paths await Owner ruling on how to run them under Lovable-native constraints.
- **R-3 · Identifier format is now load-bearing.** Any future change to the string `borvat_direct:sku:<uuid>` requires a migration; the current function pins it. Documented here so no silent variation is introduced.
- **R-4 · Cross-channel reuse of the same string.** No other channel is authorized to emit `external_listing_id` starting with `borvat_direct:` — enforced by convention only, not by a check constraint. If a future channel violates that convention, the global unique constraint would still prevent a same-account collision but could produce cross-account confusion in dashboards. Acceptable at this stage.

## 11. Rollback / forward-fix

- **Rollback:** `DROP FUNCTION public.create_borvat_direct_draft_listing(uuid, uuid, text);` — safe at any time because no rows have been written by it yet (no product cutover, no publication, no dependent objects).
- **Forward-fix (functional verification):** authorize a scoped test helper (`sandbox_exec`-only) that can mint a temporary company + member + store + Borvat Direct account + SKU inside a `BEGIN…ROLLBACK` block. This unlocks §10 T1–T28 without touching `auth.users`.

## 12. What remains blocked

Publication RPC, price/tax/inventory publication, product cutover, checkout re-enable, public storefront, search indexing, customer-facing routes, `borvat_direct` `channel_connections`, Bol Live, Stripe Live, M2–M10. Next step requires a separate Owner ruling.

---

## 13. Lovable-Native Functional Verification (M1A #2B-1V)

**Authorization:** Owner-approved M1A #2B-1V (see BOR-DEC-038). No migration, no function change. Read/write confined to a single `BEGIN … ROLLBACK` transaction; zero mutations to `auth.users`; no test users created; no production data altered.

### 13.1 Method — Database-Level Auth Context Simulation

- Inspected the actual definitions of `auth.uid()` and `auth.role()`:
  - `auth.uid()` reads `current_setting('request.jwt.claim.sub', true)` and falls back to `current_setting('request.jwt.claims', true)::jsonb ->> 'sub'`.
  - `auth.role()` reads `current_setting('request.jwt.claim.role', true)` with the same JSON fallback.
- Set claims transaction-locally via `SELECT set_config('request.jwt.claim.sub', <uuid>, true)` and `set_config('request.jwt.claim.role', 'authenticated', true)` before each RPC call; reset between personas.
- Existing users used (already in `auth.users` via seed data; **never modified**):
  - `USER_OWNER_A` = `69f05eb9-fb2c-47dd-90ed-04abd851c965` (owner of `COMPANY_A` = `07cccb78-…`).
  - `USER_OWNER_B` = `d54dd474-aead-4df1-9653-4dfba02c5a27` (owner of `COMPANY_B` = `6dec2dca-…`).
  - `USER_NONMEMBER` = `030630e9-496d-4047-8482-966d851f0473`.
- Fixtures created inline via direct `INSERT` (sandbox_exec has bypass-RLS + insert only) — flagged as **Test-only**, no `ALTER`, no `DROP`, no trigger/constraint suppression, no global RLS toggling. All rolled back.
- Scope caveat: this is **DATABASE-LEVEL AUTH CONTEXT SIMULATION**, not a full PostgREST end-to-end HTTP request. It validates the RPC's own `auth.uid()`/`auth.role()`-driven authorization logic, which is where authorization is enforced (RLS bypassed via SECURITY DEFINER).

### 13.2 Test results (18 executed at runtime; 17 PASS, 1 design finding)

| ID  | Test | Expected | Observed | Verdict |
|-----|------|----------|----------|---------|
| T1  | Owner with `listings.manage` creates draft listing | RPC returns UUID | `00000` + UUID | PASS |
| T2  | Idempotent same `(store, sku)` returns same listing_id, row count stays 1 | same id, count=1 | v1=v2, count=1 | PASS |
| T3  | Different SKU on same account → new listing | distinct id | distinct | PASS |
| T4  | Same SKU on different store/account → new listing | distinct id | distinct | PASS |
| T5  | Row shape (`company_id`, `sku_id`, `offer_id=NULL`, `units_per_offer=1`, `published_quantity=0`, `published_version=0`, `last_published_at=NULL`, `status='draft'`, `control_state='read_only_import'`, `external_listing_id='borvat_direct:sku:<uuid>'`) | all correct | all correct | PASS |
| T6  | No auth context (empty claims) → `28000 not authenticated` | `28000` | `28000` | PASS |
| T7  | Non-member of Company A calling A's store → `42501` | `42501` | `42501` | PASS |
| T8  | Viewer member (no `listings.manage`) → `42501` | `42501` | `42501` | PASS |
| T9  | Store from Company A + SKU from Company B → `42501` | `42501` | `42501` | PASS |
| T10 | Caller from Company A cannot use Store from Company B → `42501` | `42501` | `42501` | PASS |
| T11 | Archived SKU → `22023 sku not active` | `22023` | `22023` | PASS |
| T12 | Non-existent SKU → `23503 sku not found` | `23503` | `23503` | PASS |
| T13 | Non-existent store → `23503 merchant_store not found` | `23503` | `23503` | PASS |
| T14 | Store not in `active` status → `22023 merchant_store not active` | `22023` | `22023` | PASS |
| T15 | Forged pre-existing row with same `(channel_account_id, external_listing_id)` but different `sku_id` → RPC raises `23505 integrity conflict` and does **not** return the mismatched row | `23505` | `23505` | PASS |
| T16 | Success audit rows persist after normal RPC returns | ≥1 | 4 | PASS |
| T17 | Denied audit rows persist after `42501` | ≥1 | 0 | **DESIGN FINDING — see §13.5** |
| T18 | Audit rows contain no `password/token/secret/oauth/bearer/api_key` patterns | 0 hits | 0 hits | PASS |

### 13.3 Side-effect delta (inside the test transaction)

Snapshots before/after, in the same transaction:

| Metric | Delta |
|---|---|
| `channel_listings` total | +4 (three RPC-created drafts + one T15 forged fixture) |
| `channel_listings` where `external_listing_id LIKE 'borvat_direct:sku:%'` | +4 |
| `outbox_events` | **0** |
| `channel_live_dispatches` | **0** |
| `channel_shadow_dispatches` | **0** |
| `channel_reconciliation_findings` | **0** |
| `inventory_transactions` | **0** |
| `inventory_reservation_headers` / `_lines` / `_allocations` | **0 / 0 / 0** |
| `channel_orders` / `channel_order_lines` | **0 / 0** |
| Legacy `orders` / `order_items` | **0 / 0** |
| `channel_connections` | **0** |
| Bol-provider listings | **0** (115 rows + 8 duplicate `(account, sku)` pairs untouched) |

Post-`ROLLBACK` baseline confirmed identical to pre-test baseline:

| counter | pre | post |
|---|---|---|
| `channel_listings` | 115 | 115 |
| `channel_listings` `borvat_direct:sku:%` | 0 | 0 |
| `outbox_events` | 222 | 222 |
| `merchant_stores` | 0 | 0 |
| Borvat Direct `channel_accounts` | 0 | 0 |

### 13.4 Static invariants confirmed alongside runtime

- **place_order ACL unchanged:** `{postgres=X/postgres, sandbox_exec=X/postgres}` — no `authenticated`, no `anon`. P5-HF-001 intact.
- **Bol Live** disabled. **Stripe Live** disabled.
- **Bol 115 SKU-level rows** and **8 duplicate `(channel_account_id, sku_id)` pairs** unchanged (BOR-DEC-036 state preserved).

### 13.5 Design finding (T17): audit-denied row rollback

The RPC executes `INSERT INTO agent_audit_log(... status='denied' ...)` and then `RAISE EXCEPTION` in the same plpgsql block. The exception unwinds the surrounding (sub)transaction, discarding the audit `denied` insert. In production, PostgREST maps the exception to an HTTP error and aborts the request transaction — the denied audit row would also be lost there. Success and idempotent audit paths (which return normally) **do** persist (verified in T16).

This is a **design finding**, not a violation of any M1A #2B-1 invariant (the spec did not require durable denied-audit rows). Logged as **R-5 · Denied audit rows are not durable**. Not remediated in this round. Future options: `NOTIFY`, an outbox row committed before the raise, or `pg_background`.

### 13.6 Object hashes and ACL (as verified this round)

| item | value |
|---|---|
| Function signature | `public.create_borvat_direct_draft_listing(uuid, uuid, text) RETURNS uuid` |
| Owner | `postgres` |
| `prosecdef` | `true` |
| `proconfig` | `search_path=""` |
| Function body MD5 (rstrip trailing newline) | `9d533d55692f75ab959f1989056eb066` (unchanged from BOR-DEC-037) |
| Function body SHA-256 (as-stored, incl. trailing newline) | `a04040d84341173aad21a9f20b87e809229e90d27f8ffb0fe8beb0b49d31526d` |
| `pg_get_functiondef` SHA-256 | `97f44e1db006f55e236dbfd2e3ce7765a33e231887adc11c674e092b0ddb276e` |
| Migration filename | (no new migration in this round; RPC installed per BOR-DEC-037) |
| `proacl` | `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}` |

No new direct-INSERT grants on `channel_listings`, no new policies, no new functions capable of bypassing this RPC's checks.

**`service_role` EXECUTE** retained as Supabase default. No known caller today. Logged as **ACL HARDENING CANDIDATE** for a future decision; not withdrawn now.

### 13.7 Verdict

**M1A #2B-1 FUNCTIONAL VERIFICATION PASS WITH RESIDUAL RISKS.**

- 17/18 runtime tests PASS (T1–T16, T18).
- T17 is filed as R-5 (durable-denied-audit design finding), not a functional violation of M1A #2B-1 invariants.
- All zero-delta side-effect invariants held; post-`ROLLBACK` baseline identical to pre-test.
- Publication, Storefront, Pricing, Inventory integration, Search, Checkout, Orders, and any further migration remain **not started** and require separate Owner rulings.

The prior §12 verdict (`M1A #2B-1 PASS WITH RESIDUAL RISKS`) was withheld pending this section; per Owner instruction, that withhold is filed as BOR-DEC-038, and this functional PASS-with-residual-risks is filed as its own append-only entry in the decision log after the tests were run.

---

## 14. Owner ruling on R-5 (post-review — BOR-DEC-039)

**Ruling:** **O-A — R-5 ACCEPTED AS SCOPED AUDIT RESIDUAL RISK.**
**Sealed verdict:** **M1A #2B-1V FUNCTIONAL VERIFICATION PASS WITH ACCEPTED RESIDUAL RISK R-5**, and consequently **M1A #2B-1 ACCEPTED AND CLOSED WITH RESIDUAL RISKS**.

### 14.1 Basis for acceptance (proven in §13)

- Authorization works and returns `42501` for every unauthorized caller.
- An unauthorized user cannot create a listing.
- Cross-tenant isolation works (T7, T9, T10 all `42501`; zero rows created).
- Idempotency works (T2 same-id, count stays 1).
- Integrity conflict works (T15 `23505` on forged identifier reuse).
- All side-effect deltas across `outbox_events`, live/shadow dispatch, `inventory_transactions`, reservations, `channel_orders`/lines, legacy `orders`/`order_items`, `channel_connections` = **0**.
- No public visibility; no publication/activation; no pricing; no inventory integration; no search; no checkout; no orders. Bol Live disabled. Stripe Live disabled. P5-HF-001 unchanged (`place_order` `proacl` = `{postgres=X/postgres, sandbox_exec=X/postgres}`).

### 14.2 R-5 classification (final, sealed)

**R-5 is classified strictly as a DENIED-ATTEMPT AUDIT OBSERVABILITY GAP.**
R-5 is **NOT**: an authorization gap, a tenant-isolation gap, a data-integrity gap, an idempotency gap, a lifecycle gap.

### 14.3 Scope of acceptance (Draft Listing Foundation only)

Acceptance applies to the current Draft Listing write path only. Durable denied-audit is **not permanently waived**. R-5 remains open in the Risk Register and **must be re-addressed before any of the following**:

- Enabling Publication or Activation.
- Opening Public Storefront writes.
- Enabling Checkout or Orders.
- Reusing this write-then-raise pattern in any financial, inventory, or reservation RPC.
- Treating `agent_audit_log` as the complete forensic record of every denied attempt.
- Onboarding formal Compliance or Security-monitoring requirements.

### 14.4 No remediation authorised now

Explicitly **not authorised** in this decision:

- `dblink`, `pg_background`, `pg_net`, any new extension.
- Any loopback DB connection.
- Any new outbox.
- Any RPC modification.
- Any change to the public API contract.

Rationale (Owner-recorded):

- R-5 does not expose an unauthorized capability; all unauthorized writes are rejected.
- Adding an autonomous-transaction mechanism now would enlarge attack and operational surface.
- The fix must be designed later at an architectural layer, not as a plpgsql patch.

### 14.5 Preferred future design (recorded for the future audit-hardening round only)

When an audit-hardening round is later authorised, evaluate in this order:

1. **Edge/server wrapper** that records the denied attempt in an independent transaction before invoking the RPC.
2. **Result-envelope RPC** returning `{ success | denied, reason }` instead of `RAISE`, with the server translating denied → HTTP error after commit.
3. **Dedicated security-event ingestion path** decoupled from the business transaction.

Do **not** default to `dblink`.

### 14.6 Corrected mitigation wording (supersedes §13.5 clause on infra logs)

Infrastructure logs (Postgres and PostgREST) may provide an **additional signal** for denied attempts, but they **do not** substitute for `agent_audit_log`: retention, structure, and actor correlation differ, and infra logs alone do **not** constitute durable application-level denied-audit. Section 10 of the review packet is amended by this clause.

### 14.7 Post-decision state

**Closed:**
- M1A #2B-1 structural implementation.
- M1A #2B-1V functional verification.

**Still blocked (unchanged):** permanent listings for real products, Publication, Activation, Public Storefront, Pricing, Inventory integration, Search, Checkout, Orders, Bol Live, Stripe Live, M2–M10. Each requires separate Owner authorisation.

**Not modified retroactively:** BOR-DEC-037 and BOR-DEC-038 remain as-written.


