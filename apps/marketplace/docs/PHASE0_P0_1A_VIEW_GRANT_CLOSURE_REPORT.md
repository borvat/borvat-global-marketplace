# PHASE 0 — P0-1a VIEW GRANT CLOSURE REPORT

Date: 2026-07-31
Authority: Owner-approved Decision Packet V1 (BOR-DEC-100 … BOR-DEC-112). Phase 0 only.
Scope: hotfix to P0-1 — close the single relation P0-1 skipped: the VIEW `public.channel_connections_safe`.
Type: REVOKE-only. Rows changed: 0. Schema changed: 0. Reversible: yes.
Status: **APPLIED — ALL POST-CONDITIONS PASS.**

---

## 1. Defect

P0-1 iterated over base tables only (`relkind='r'`), so `relkind='v'` was never touched.
`public.channel_connections_safe` retained the full platform default ACL for both roles:

```
anon          : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
authenticated : SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
```

It was the sole source of all remaining `anon` write grants and all remaining
`authenticated` TRUNCATE/TRIGGER/REFERENCES grants in schema `public`.

Exploitability at time of discovery: none. The view is defined
`WITH (security_invoker = true)`, so it executes with the caller's privileges and RLS.
An anon caller would need SELECT on base table `public.channel_connections` (revoked by P0-1)
and would additionally be filtered by RLS (no anon policy). Two independent denials.
Closed regardless: the grant becomes live the moment `security_invoker` is flipped off or the
base table is re-granted.

---

## 2. Migration

```sql
REVOKE ALL ON TABLE public.channel_connections_safe FROM anon, authenticated, PUBLIC;
GRANT SELECT ON TABLE public.channel_connections_safe TO authenticated;
```

Post-conditions ran in-migration (fail ⇒ full rollback) and now cover **all** relation kinds,
not just base tables: anon write grants, authenticated TRUNCATE/TRIGGER/REFERENCES,
anon object count ≤ 6, and non-SELECT grants on any `relkind <> 'r'` relation.

No EXCEPTION raised. Committed.

---

## 3. Verification — AFTER (verbatim, via `pg_class.relacl` + `aclexplode`)

```
anon          | SELECT | r | categories
anon          | SELECT | r | inventory_dispositions
anon          | SELECT | r | permissions
anon          | SELECT | r | products
anon          | SELECT | r | role_permissions
anon          | SELECT | r | system_company_roles
authenticated | SELECT | v | channel_connections_safe
```

Cross-check query for non-base relations and anon writes returned **zero rows**.

| Criterion | Result |
|---|---|
| anon holds zero INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES (all relkinds) | **PASS** (0) |
| anon reaches at most 6 objects, SELECT only | **PASS** (exactly 6) |
| authenticated holds no TRUNCATE/TRIGGER/REFERENCES | **PASS** (0) |
| no non-SELECT grant on any view/non-base relation | **PASS** (0) |
| `channel_connections_safe` reachable by authenticated, read-only | **PASS** |
| rows changed | 0 |
| schema changed | none |

Tenant boundary for the view remains RLS on `public.channel_connections`
(`security_invoker = true` preserved; not modified by this migration).

---

## 4. Rollback

```sql
BEGIN;
  GRANT ALL ON TABLE public.channel_connections_safe TO anon, authenticated;
COMMIT;
```

Re-opens the gap. Log as an incident, not a routine revert.

---

## 5. Not fixed here — expected, not a regression

`place_order` ACL is `{postgres=X/postgres, sandbox_exec=X/postgres}`; `sandbox_exec` still
reaches 103 public tables. R-T21 (platform post-migration re-grant) has fired again since P0-1.
**No further normalization cycle was run.** Per BOR-DEC-152 the structural fix is BOR-DEC-107 /
P0-5 (relocate the business schema out of `public`). `place_order`'s body remains fail-closed,
so this is a governance defect, not an exploitable order path.

---

## 6. STOP

P0-1a is complete and reported. **P0-2 is not started** and awaits owner authorization.
P0-3 remains BLOCKED (no verified backup, no staging — BOR-DEC-110).
