# Phase 1 — Production Deployment Report

**Status:** ✅ DEPLOYED — All post-deployment verifications PASSED
**Deployment window (UTC):** 2026-07-23T20:39:52Z → 2026-07-23T20:39:54Z
**Environment:** Lovable Cloud (managed Supabase, project ref `bmtjeyuiwfubwvpxwojr`)
**Authorization scope:** Phase 1 only. Phase 2 NOT authorized.

---

## 1. Deployment mechanics (transparency)

On Lovable Cloud, database migrations authored via the migration tool are
applied to the single managed Supabase instance at approval time — there is
no separate staging→production promotion step, and no self-serve
DB snapshot/restore endpoint exposed to the project. Every one of the 12
Phase 1 migration files below was applied to this same instance in filename
order at authoring time, through the supported migration mechanism, with no
manual reruns and no ad-hoc SQL. Point-in-time recovery is retained by the
platform; no additional user-visible "backup checkpoint" artifact is
produced.

This deployment step therefore reduces to: (a) re-confirming the
authoritative file set and checksums that constitute the deployed baseline,
and (b) executing the post-deployment verifications against the live DB.

---

## 2. Authoritative migration set (12 files, applied in filename order)

| # | Filename | SHA-256 |
|---|----------|---------|
| 1 | `20260723113505_4664c694-4392-4872-8635-1d7e84fe7d3d.sql` | `2abf03a5fbc626251344ab631c4e26c7c9b63fa96642fe24b6467e8765c95789` |
| 2 | `20260723113515_228a0455-6dfe-4120-8af3-6d2b9ed3fd88.sql` | `a9e06bcb6d1fc77dcc380a3ea117197878e8fef5db19ee681ace1abd6fceaecf` |
| 3 | `20260723113622_b82a2a64-35d6-4285-8c72-050e88b1af52.sql` | `16276fbdcf86d7d77495c593c9060ec9c793f19c9d58cf4767dbc6eac49c160a` |
| 4 | `20260723114313_5e523486-d737-4816-9891-d6d9fbfc7355.sql` | `4f59367b0f3fa3cd9b02c55efed2601c2e9a79175790717937188dab018100b8` |
| 5 | `20260723145302_079b61ee-6d53-41fe-801b-37f746a8956a.sql` | `fa67dd9c87c69896d66bff14845651590cdb890c833e44e94a514450bbaf3b3b` |
| 6 | `20260723151729_abdb9fc8-b808-4f91-84d4-975d90127826.sql` | `08304151f0fb0a459eb2f72671fae5bf12b6fc3b73bb8f3ed04f8e5e8e5414fe` |
| 7 | `20260723152640_8af6146e-5348-4a7d-9a13-4d942e40c6df.sql` | `e1086bd40079f23d0dd8432d7a7cf6555bfca583ae7c0c01ef9c18ecf33e17b9` |
| 8 | `20260723154058_0d2ed9e8-3b00-4d74-a90e-bb79f1a4f2b5.sql` | `126490d00c66b66156a99ff89eb5b1dfe30f0b2c7b7eeeabc6681d426d1f48cc` |
| 9 | `20260723194859_c42c8642-3f61-477a-bf8a-8b06581de0a4.sql` | `6bb92659d782ff6bb934ab99650b7435ad6ca987dd7d3852dc372215b1f193ec` |
| 10 | `20260723195605_b9bc6b44-01b1-43b7-bcfb-252d2e695154.sql` | `3413b4cc09eb691a4574dd951a30d01bbb52c11fa8a0b809de1d27c6407a7686` |
| 11 | `20260723200056_4379bc04-b394-4081-b083-198ee22c7120.sql` | `4ec760a6f541a53458d12c3359a0be763e4872a5325ada5a44bea7b2cfc144a9` |
| 12 | `20260723201307_cac97cc5-42fc-46aa-a4b6-247da16af185.sql` (Migration 4 of the hardening block) | `a896eb7fa5f4343e820c783a37fcff5fccdf3a5703c016683bfc12d992acc45e` |

Migration result: **12/12 applied successfully.**
Seller backfill: **not rerun** (preflight already reported 0 eligible sellers; no duplicate execution occurred).

Note on live introspection: `supabase_migrations.schema_migrations` is not
readable from the app's `authenticated`/`anon` roles by design; the deployed
migration list is therefore attested from the checked-in migration files
and the resulting live-schema shape (below), not from that internal table.

---

## 3. Post-deployment verification results

### 3.1 Redaction suite — ✅ 10/10 PASSED
Executed against the deployed code: `bun run scripts/redaction-tests.ts`.
All ten assertions passed (top-level/nested token redaction, arrays,
Authorization/Cookie headers, Bol ciphertext/iv/auth_tag, small payloads,
JWT key-match, non-sensitive preservation, circular refs).

### 3.2 T34 structural verification — ✅ PASS
Live DB, per-check:
- `owner_update_revoked` — PASS (`has_column_privilege('authenticated','public.companies','owner_user_id','UPDATE')` is false)
- `transfer_company_ownership` RPC exists — PASS
- `companies_before_update_owner_guard` trigger present — PASS

### 3.3 Privileged `orphan_seller_roles` check — ✅ 0 orphans
```
SELECT COUNT(*) FROM public.user_roles ur
LEFT JOIN public.company_members cm
  ON cm.user_id = ur.user_id AND cm.status='active'
WHERE ur.role='seller' AND cm.id IS NULL;
→ 0
```

### 3.4 Exactly-one-active-owner reconciliation — ✅ PASS
| total_companies | with_exactly_one_active_owner | violations |
|---:|---:|---:|
| 3 | 3 | 0 |

### 3.5 SECURITY DEFINER `search_path` audit — ✅ PASS (11/11)
All 11 SECURITY DEFINER functions in `public` carry `search_path=""`:
`_companies_after_insert_bootstrap_owner`,
`_companies_before_update_owner_guard`,
`_company_member_roles_guard_owner_role`,
`_company_members_guard_owner_membership`,
`company_member_has_permission`, `decide_product_suggestion`,
`handle_new_user`, `has_role`, `is_company_member`, `is_company_owner`,
`transfer_company_ownership`.

### 3.6 40 tenancy tests + 17 security tests — CLASSIFIED "NOT RE-EXECUTED AGAINST A FRESH INTEGRATED SUPABASE STACK"
Per your standing instruction, these suites remain honestly classified as
**not executed against a fresh integrated Supabase stack** in this
deployment step. Their previous successful execution on the deployed stack
(40/40 tenancy, 17/17 security), combined with the clean-DB PostgreSQL
migration replay and verified object equivalence from the deployment
readiness Revision 2, is the accepted evidence for Phase 1.

---

## 4. Rollback / remediation

None performed. No migration or verification failure occurred; no ad-hoc
production fix was applied.

---

## 5. Final status

| Item | Status |
|---|---|
| Phase 1 code baseline | APPROVED AND LOCKED |
| 12 migrations applied in filename order | ✅ |
| Seller backfill duplicated | ❌ (not rerun) |
| T34 structural verification | ✅ PASS |
| Orphan seller roles | ✅ 0 |
| Exactly-one-active-owner reconciliation | ✅ 3/3, 0 violations |
| SECURITY DEFINER search_path audit | ✅ 11/11 |
| Redaction suite | ✅ 10/10 |
| 40 tenancy + 17 security suites | Accepted per prior evidence; not re-executed against a fresh integrated stack |
| **Phase 1 production deployment** | **✅ APPROVED — LIVE** |
| Phase 2 | ❌ NOT AUTHORIZED |
