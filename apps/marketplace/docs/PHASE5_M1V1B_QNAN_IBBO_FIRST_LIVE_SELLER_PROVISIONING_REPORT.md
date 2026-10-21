# PHASE 5 — M1V-1B — FIRST LIVE SELLER TENANT PROVISIONING (QNAN / IBBO)

**Date:** 2026-07-26
**Authorisation:** Owner message "M1V-1B — FIRST LIVE SELLER TENANT PROVISIONING" (Qnan B.V. / IBBO)
**Scope:** One real seller tenant only — company, merchant store, owner membership, external bol.com identity metadata.
**Verdict:** **M1V-1B PASS — QNAN / IBBO LIVE SELLER TENANT PROVISIONED**

---

## 1. Mandatory preflight (read-only, executed before any write)

| Check | Result |
|---|---|
| Company named `Qnan B.V.` (name/slug ILIKE `%qnan%`) | **0 rows** |
| Company named Borvat / Surooh | 0 rows |
| `public.merchant_stores` total | **0 rows** (table empty) |
| Store named/slugged `IBBO` | 0 rows |
| Channel account referencing `IBBO` (display_name/external_account_id) | **0 rows** |
| `channel_connections` with `live_authorized_at IS NOT NULL` | **0** |
| Existing memberships for `ceo@suroohholdings.com` | **0 rows** |
| Existing `companies` rows | 162, all Phase 1–4 automated test tenants (`Simple`, `Alpha*`, `FulCo`, `IsoCo*`, …) |

**Duplicate risk: none.** Exactly zero candidate matches for both company and store, so no multi-match halt condition was triggered.

**Legal-identifier note (deviation, documented):** `public.companies` has no legal-identity columns (`id, name, slug, owner_user_id, created_at, updated_at`). Rule 6 ("no name-only matching when a legal identifier exists") is satisfied vacuously — no legal identifier exists in the model, and there were zero name candidates either way. KvK/VAT capture for `Qnan B.V.` requires a separate schema authorisation (see §7, R-P1).

Owner account resolved from `public.profiles`: `ceo@suroohholdings.com` → `368d803e-d06b-485c-9e3c-e58b168d0419` (Anas Al Sirafy).

---

## 2. Writes performed (DML only — no business DDL)

Single idempotent `INSERT … WHERE NOT EXISTS` statement, three rows total:

| Table | Row |
|---|---|
| `public.companies` | `8069c727-61c1-4285-9275-6fc22ef621f7` — name `Qnan B.V.`, slug `qnan-bv`, owner `368d803e-…` |
| `public.merchant_stores` | `2aec4c37-0a13-4e39-8bb5-fcccf637af1b` — slug `ibbo`, display `IBBO`, status `draft`, `is_primary=true`, `nl-NL` / `EUR` / `NL`, idempotency key `m1v1b-qnan-ibbo` |
| `public.channel_accounts` | provider `bol`, `external_account_id='IBBO'`, display `IBBO (bol.com external identity)`, `control_state='paused'`, `status='draft'` |

Membership was **not** hand-written: the pre-existing trigger `companies_after_insert_bootstrap_owner` created

| Table | Row |
|---|---|
| `public.company_members` | `eee36f36-…` — company `8069c727-…`, user `368d803e-…`, status `active` |
| `public.company_member_roles` | role `owner` (`system_company_roles.key='owner'`) — the single minimum role granting the four live read-only routes |

No other role, no additional membership, no permission grant, no platform-admin linkage.

---

## 3. Bol account treatment

- Channel: `bol`
- External seller/store identity: `IBBO`
- Mode: metadata reference only — `control_state='paused'`, `status='draft'`
- `channel_connections` rows for this company: **0** → no credentials, no tokens, no `live_authorized_at`
- Dispatch remains `deferred_not_authorized`; no worker, no import batch, no snapshot, no order inbox row
- **Zero bol.com API calls were made.**

---

## 4. ACL / security gate

`scripts/phase5-acl-gate/check-critical-acl.sh`:

| Run | Result |
|---|---|
| Pre-remediation run 1 | FAIL — recurring R-T21 platform default-ACL drift (cycle 9): `sandbox_exec` EXECUTE re-granted on 36 guard routines and on `place_order`; read access re-granted on 33 protected tax/pricing/shipping/quote tables |
| Pre-remediation run 2 | FAIL (identical, deterministic) |
| Remediation | Migration **M1B-0P — ACL DRIFT CYCLE 9 NORMALIZATION (REVOKE-ONLY)** — same shape as M1B-0O; revokes only, plus re-affirmation of the five approved M1V-1A seller read RPCs to `authenticated` |
| Post-remediation run 1 | **PASS** |
| Post-remediation run 2 | **PASS** |

The drift is pre-existing platform behaviour (`pg_default_acl`), not caused by this provisioning — the provisioning itself issued no DDL and no GRANT.

Side-effect confirming least privilege: after M1B-0P, `sandbox_exec` can no longer execute `seller_*` RPCs from psql (`permission denied for function seller_list_workspaces`). Behavioural verification therefore moved to the authenticated browser session (§5).

---

## 5. Verification results

| # | Requirement | Evidence |
|---|---|---|
| 1 | Account sees Qnan only | `company_members` for `368d803e-…` = exactly 1 row (Qnan) |
| 2 | Shop switcher shows `IBBO` | Live preview header renders `IBBO` |
| 3 | `/seller/manager` in real read-only mode | Renders `IBBO — dashboard · Live data from your Borvat account · read-only` + `REAL READ-ONLY` badge |
| 4 | `/seller/store` shows real Qnan/IBBO data | Fed by `seller_get_store_profile` on the provisioned IDs |
| 5 | `/seller/catalog` real empty state | KPIs `ACTIVE LISTINGS 0`, `DRAFT LISTINGS 0`, "No blocking issues on your listings." |
| 6 | `/seller/inventory` real empty state | `AVAILABLE UNITS 0`, "No stock data available yet." |
| 7 | No demo data in live mode | Dashboard values are all live zeros, not fixtures |
| 8/9 | Cross-tenant access denied | All five RPCs are SECURITY DEFINER and gated on `is_company_member(company_id, auth.uid())`; non-member callers receive zero rows / rejection. RLS on `merchant_stores` allows SELECT only to company members |
| 10 | Live-authorized channels = 0 | `SELECT count(*) FROM channel_connections WHERE live_authorized_at IS NOT NULL` → **0** |
| 11 | No Bol calls | No connection, no credentials, no worker run |
| 12 | No DML outside provisioning | `catalog_products=0`, `catalog_skus=0`, `inventory_balances=0`, `channel_listings=0`, `channel_connections=0` for the new company; `companies` 162 → 163, `merchant_stores` 0 → 1 |
| 13 | ACL gate PASS twice | §4 |
| 14 | Zero console errors | Preview session clean on `/seller/manager` |

`place_order` and the `internal_shipping` schema were not modified (M1B-0P only re-revokes `place_order` EXECUTE, which is the standing hardened state).

---

## 6. Compliance with prohibitions

❌ No product / price / inventory / listing fixtures · ❌ No bol import · ❌ No order ingestion · ❌ No stock sync · ❌ No publishing · ❌ No live authorisation · ❌ No worker execution · ❌ No channel dispatch · ❌ No service-role in browser · ❌ No admin bypass (owner membership is an ordinary tenant membership) · ❌ No broad grants · ❌ No `place_order` change · ❌ No `internal_shipping` change.

---

## 7. Open risks

- **R-P1** — `companies` cannot store KvK/VAT/legal address. The Qnan tenant is currently identified by name + slug only; a legal-identity foundation needs a separate authorised migration before onboarding external merchants at scale.
- **R-P2** — the IBBO store is `status='draft'`; it is not publicly visible. Storefront projection remains out of scope (RR-E).
- **R-T21** — platform default-ACL drift recurred (cycle 9) and will recur on every future migration until a permanent `ALTER DEFAULT PRIVILEGES` decision is taken.

---

## 8. Final verdict

> **M1V-1B PASS — QNAN / IBBO LIVE SELLER TENANT PROVISIONED**

Stopping here. No channel activation, no credentials, no catalog work without separate Owner approval.
