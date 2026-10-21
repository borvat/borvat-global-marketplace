# PHASE 0 — P0-1 GRANT HARDENING REPORT

Date: 2026-07-31
Authority: Owner-approved Decision Packet V1 (BOR-DEC-100 … BOR-DEC-112). Phase 0 only.
Scope: F-2 closure (anon/authenticated table-grant hardening). REVOKE-only + policy-derived re-grant.
Status: **APPLIED — A1/A2/A3/A6/A7/A8/A11 PASS. ACL gate exits 1 on pre-existing R-T21 drift (not caused by this migration).**

---

## 1. Migration

| Item | Value |
|---|---|
| File | `supabase/migrations/20260731232446_f9ee9ffa-914e-4ad3-845d-40d8e570b23c.sql` |
| SHA-256 | `6af0045465a9c349c88e3b35d088e77f345d9e59236ad58f253204edca69f488` |
| Type | REVOKE-only + policy-derived allowlist re-grant |
| Rows changed | 0 |
| Schema changed | none (no DDL on tables, columns, types, functions, policies) |
| Files under `src/` modified | **none** |

### Allowlist derivation (mechanical, not hand-authored)

The allowlist was generated from `pg_policies` on schema `public`:

```
roles ∈ {anon, authenticated, public}
cmd 'ALL' expanded to {SELECT, INSERT, UPDATE, DELETE}
grant target: anon  → SELECT only, and only where the policy is reachable without auth.uid()
              authenticated → the exact expanded (table, cmd) set
```

`anon` reachability was proven policy-by-policy: every `{public}`-targeted write or read policy
except two requires `auth.uid()` to be non-NULL, which is unsatisfiable for `anon`.
The two unconditional (`USING true`) policies are `categories.categories public read` and
`inventory_dispositions.inv_disp_read`. Together with the four explicitly `anon`-targeted SELECT
policies (`permissions`, `products`, `role_permissions`, `system_company_roles`) this yields exactly
six anon-reachable tables — matching acceptance criterion A2 without any manual tuning.

`service_role` and `sandbox_exec` grants were **not touched** (out of scope; see §5).

---

## 2. Verification — before / after (verbatim)

Query (raw ACLs via `pg_class.relacl` + `aclexplode`; `information_schema.role_table_grants`
under-reports in this session because the connecting role is not a member of every grantee):

```sql
with g as (
  select c.relname, pg_get_userbyid(a.grantee) grantee, a.privilege_type priv
  from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) a
  where n.nspname='public' and c.relkind in ('r','p'))
select grantee, priv, count(*) from g group by 1,2 order by 1,2;
```

### BEFORE

```
anon|DELETE|58            authenticated|DELETE|58
anon|INSERT|59            authenticated|INSERT|59
anon|MAINTAIN|59          authenticated|MAINTAIN|59
anon|REFERENCES|59        authenticated|REFERENCES|59
anon|SELECT|59            authenticated|SELECT|60
anon|TRIGGER|59           authenticated|TRIGGER|59
anon|TRUNCATE|59          authenticated|TRUNCATE|59
anon|UPDATE|56            authenticated|UPDATE|55
sandbox_exec|INSERT|102   sandbox_exec|SELECT|102
service_role|<8 privs>|60 each
postgres|<8 privs>|102 each
```

### AFTER

```
anon | SELECT | 6
authenticated | DELETE | 14
authenticated | INSERT | 22
authenticated | SELECT | 66
authenticated | UPDATE | 19
sandbox_exec | INSERT | 102
sandbox_exec | SELECT | 102
service_role | DELETE|INSERT|MAINTAIN|REFERENCES|SELECT|TRIGGER|TRUNCATE|UPDATE | 60 each
```

anon-reachable tables after (SELECT only):
`categories`, `inventory_dispositions`, `permissions`, `products`, `role_permissions`,
`system_company_roles`.

Privileges removed: 409 anon + 296 authenticated redundant/inert entries (all
`MAINTAIN/TRUNCATE/TRIGGER/REFERENCES` for both roles, all anon DML, and every
authenticated (table,cmd) pair with no backing policy).

---

## 3. Assertion output (in-migration, fail ⇒ full rollback)

```
NOTICE:  A1 PASS: anon holds zero INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
NOTICE:  A2 PASS: anon reaches 6 tables, SELECT only
NOTICE:  A3 PASS: authenticated holds no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
```

No EXCEPTION was raised. Migration committed.

---

## 4. Row census + invariants (identical before/after)

```
policies=122  orders=0  order_items=0  companies=163
live_authorized_at IS NOT NULL = 0
products (is_active) = 38   user_roles = 188
place_order executable by {anon, authenticated, service_role, public} = false
```

| Criterion | Result |
|---|---|
| A1 anon holds zero INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES | **PASS** |
| A2 anon reaches at most 6 tables, SELECT only | **PASS** (exactly 6) |
| A3 authenticated holds no TRUNCATE/TRIGGER/REFERENCES | **PASS** (also MAINTAIN) |
| A4 no INSERT policy on user_roles | **NOT IN SCOPE** — P0-2 |
| A5 no `{public}` policy on user-facing tables | **NOT IN SCOPE** — P0-2 |
| A6 manual app verification | **PASS** — §6 |
| A7 live_authorized_at count remains 0 | **PASS** |
| A8 place_order executable by no application role | **PASS** (see §5 caveat: `sandbox_exec` retains EXECUTE — pre-existing) |
| A11 orders count remains 0 | **PASS** |
| A9/A10/A12 | P0-3 / P0-2 scope |

---

## 5. ACL gate — `scripts/phase5-acl-gate/check-critical-acl.sh`

Exit code: **1**.

Every failing line attributes to the `sandbox_exec` role (the gate's "gate role"), which holds
blanket `SELECT, INSERT` on 102 public tables — 204 grants that existed identically **before**
this migration and that P0-1 deliberately did not touch. Failing assertions:

- `place_order not executable by any application/sandbox role` → `sandbox_exec=X/postgres`
- `protected tax/pricing/publication/shipping tables owner-only` (67) and the paired runtime
  deny-proofs for shipping, transit/calendar, delivery destination, manual-quote and M1V-1D tables
- `M1C-1D-B / 1D-C / 1D-D / 1D-F / 1E-B / 1E-C` guard functions locked (sandbox EXECUTE)
- `m1v1da_require_reviewer()` not in the approved-routine allowlist (pre-existing, M1V-1D-A residue)

This is R-T21 (platform post-migration re-grant), cycle 15. Per handover §7 no further
sandbox_exec normalization cycle was run: it is a treadmill, and the structural fix is
BOR-DEC-107 (P0-5, relocate business schema out of `public`). **P0-1 does not claim to fix R-T21.**
Measured result: R-T21 is unchanged by P0-1 — neither improved nor worsened.

---

## 6. A6 — manual application verification

Environment: headless Chromium (Playwright), viewport 1280×1800, unauthenticated session,
`http://localhost:8080`.

| Screen | Route | Observed |
|---|---|---|
| Storefront home | `/` | Header + category nav + product grid rendered (1773 chars of text) |
| Category page | `/c/boeken`, `/c/elektronica` | Category headings and listings rendered |
| Product page | `/product/19367fc3-…` | Full PDP: title, price, "In winkelwagen", product features, description |
| Search | `/search?q=lamp` | Search page rendered with query state |
| Cart | `/cart` | Empty-cart state rendered |
| Signup / login | `/auth` | Auth form rendered |
| Seller dashboard | `/seller` | Rendered (unauthenticated gate copy) |

Console errors across the run: **none** (`[]`). No `42501` / permission-denied response was
observed on any anonymous route. No 4xx network responses on the PDP run.

Behavioural delta noted in the handover (RLS denial → grant denial, both SQLSTATE 42501) was
not triggered by any exercised anonymous path.

---

## 7. Surprises

1. The mechanically-derived anon allowlist landed on **exactly** six tables, independently
   reproducing acceptance criterion A2. No judgement calls were needed.
2. Postgres 17 exposes an eighth privilege, `MAINTAIN`, which the handover census did not list;
   anon and authenticated each held 59. It is now revoked from both.
3. `information_schema.role_table_grants` returned only `sandbox_exec` rows in this session
   (grantee-membership visibility rule). All census work was redone against `pg_class.relacl`.
   Anyone re-running the handover's census query from a non-superuser session will see a
   misleadingly empty result — this is a measurement artefact, not a state change.
4. `authenticated` retains `INSERT ON public.user_roles`, because the escalation policy
   "users can become seller" still exists. P0-1 is policy-derived and must not pre-empt P0-2;
   this grant is dropped together with the policy in P0-2.

---

## 8. Reversibility

Fully reversible. To restore the prior state:
`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;` — which is precisely the
posture this migration removed. No rollback is expected to be needed.

---

## 9. STOP

P0-1 is complete and reported. **P0-2 is not started** and awaits owner authorization per
handover §6. P0-3 remains BLOCKED (no verified backup, no staging — BOR-DEC-110).
