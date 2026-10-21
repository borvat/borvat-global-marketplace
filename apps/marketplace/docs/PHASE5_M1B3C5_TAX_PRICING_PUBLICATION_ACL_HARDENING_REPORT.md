# PHASE 5 — M1B-3C-5 — TAX / PRICING / PUBLICATION ACL HARDENING REPORT

**Scope:** privileges only (GRANT/REVOKE + documentation). No business-model schema change, no rate
rows, no band-status change, no classifications, no company tax profiles, no prices, no approval
workflow, no shipping, no publication transition, no storefront, no checkout.

**Executed:** 2026-07-26. Environment: Lovable-native managed Postgres. Session role: `sandbox_exec`
(read/insert-capable, `BYPASSRLS`) — deliberately used as the adversarial probe role.

---

## 1. Objects inspected

Tables (7, all `public`): `tax_categories`, `tax_rate_bands`, `tax_rate_versions`,
`catalog_product_tax_classifications`, `company_tax_profiles`, `merchant_store_offer_prices`,
`borvat_direct_listing_publications`.

Functions in scope (guards/triggers): `msop_guard_tax_integrity()`, `msop_guard_active_immutable()`,
`msop_guard_store_sku_ownership()`, `trg_tax_rate_versions_band_country()`,
`_borvat_direct_publication_provider_guard()`, `_borvat_direct_publication_touch_updated_at()`.

Sequences: the scope tables use `gen_random_uuid()` primary keys — **no owned sequences**. The only
sequence in `public` is `channel_api_audit_id_seq` (Phase 3/4 audit, out of scope; left unchanged).

Default privileges: `pg_default_acl` inspected for `postgres` and `supabase_admin` in `public`.

Test/helper functions: `pg_proc` scan for `_m1b3c4_verify` and any `%verify%`/`%test%` helper in
`public` → **0 rows**. No temporary helper survived M1B-3C-4.

Repository scan (`rg` over `src/`, `scripts/`, excluding generated `types.ts`) for any direct client
read of the 7 tables → **0 matches**. No UI or server function selects these tables directly.

## 2. ACL matrix — BEFORE (from `pg_class.relacl`)

| Table | PUBLIC | anon | authenticated | service_role | sandbox_exec | postgres |
|---|---|---|---|---|---|---|
| `tax_categories` | – | – | `arwdDxtm` (full DML) | `arwdDxtm` | `ar` (SELECT+INSERT) | owner |
| `tax_rate_bands` | – | – | – | – | `ar` | owner |
| `tax_rate_versions` | – | – | `rm` (SELECT) | `rm` | `ar` | owner |
| `catalog_product_tax_classifications` | – | – | `arwdDxtm` | `arwdDxtm` | `ar` | owner |
| `company_tax_profiles` | – | – | `arwdDxtm` | `arwdDxtm` | `ar` | owner |
| `merchant_store_offer_prices` | – | – | – | – | `ar` | owner |
| `borvat_direct_listing_publications` | – | – | `r` | `arwdDxtm` | `ar` | owner |

**Two findings confirmed by measurement, not assumption:**

1. **R-T18 confirmed** — `authenticated` and `service_role` held full table DML on
   `tax_categories`, `catalog_product_tax_classifications`, `company_tax_profiles`; `service_role`
   held full DML on `borvat_direct_listing_publications`.
2. **Grant drift re-confirmed on `sandbox_exec`** — despite the M1B-3C-1/M1B-3C-4 revocations,
   `sandbox_exec` again held `INSERT`+`SELECT` (`ar`) on **all seven** tables. Cause: the
   `postgres`-owned **default ACL** for `public` tables includes `sandbox_exec=ar`, so every
   subsequent `CREATE TABLE` re-grants it and every table-level revoke is undone the next time an
   object is (re)created. This is the structural driver of the drift and is why the Owner's
   pre-seed blocker was correct.

## 3. Revokes applied (migration `M1B-3C-5`)

One migration, privileges only, guarded by an in-migration `DO` assertion that aborts unless
`tax_rate_versions`, `catalog_product_tax_classifications`, `company_tax_profiles`,
`merchant_store_offer_prices` and `borvat_direct_listing_publications` all hold **0 rows**
(assertion evaluated as owner; migration committed ⇒ assertion held).

```
REVOKE ALL PRIVILEGES ON TABLE <each of the 7 tables>
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;   -- 35 revokes

REVOKE ALL PRIVILEGES ON FUNCTION <each of the 6 guard/trigger functions>
  FROM PUBLIC, anon, authenticated, service_role, sandbox_exec;   -- 30 revokes
```

Plus one `COMMENT ON TABLE public.tax_rate_versions` recording the deny-by-default contract
(BOR-DEC-055) alongside the existing platform-vs-legal semantics.

`postgres` (owner) retains full control. No `GRANT` was issued anywhere in this stage.

## 4. ACL matrix — AFTER (measured with `has_table_privilege`, per privilege)

Probed privileges per cell: `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`.

| Table | PUBLIC | anon | authenticated | service_role | sandbox_exec | postgres |
|---|---|---|---|---|---|---|
| `tax_categories` | all **false** | all false | all false | all false | all false | all true |
| `tax_rate_bands` | all false | all false | all false | all false | all false | all true |
| `tax_rate_versions` | all false | all false | all false | all false | all false | all true |
| `catalog_product_tax_classifications` | all false | all false | all false | all false | all false | all true |
| `company_tax_profiles` | all false | all false | all false | all false | all false | all true |
| `merchant_store_offer_prices` | all false | all false | all false | all false | all false | all true |
| `borvat_direct_listing_publications` | all false | all false | all false | all false | all false | all true |

7 tables × 5 non-owner roles × 7 privileges = **245 assertions, all `false`**. Owner: 7 × 7 = 49
assertions, all `true`.

Live probe as `sandbox_exec` (the `BYPASSRLS` role):

```
INSERT INTO public.tax_rate_versions … → ERROR: permission denied for table tax_rate_versions
SELECT count(*) FROM public.tax_rate_bands → ERROR: permission denied for table tax_rate_bands
```

Grants — not RLS — are now the effective barrier. **No probe row was created in this stage**
(the insert was rejected before execution), so no cleanup and no count drift.

## 5. Function ACLs — AFTER

`has_function_privilege(role, fn, 'EXECUTE')` over the 6 guard/trigger functions × 5 roles
(`PUBLIC, anon, authenticated, service_role, sandbox_exec`) → **0 rows returned true**.

All six are `RETURNS trigger`, owner `postgres`, `search_path=''`, schema-qualified, no dynamic SQL —
verified in `pg_proc.proconfig`/`prosrc`. Trigger functions do not require application `EXECUTE`;
they execute in the table-owner path.

Deliberately unchanged (real, designed RPCs, still `authenticated`-callable):
`admin_list_merchant_stores`, `admin_list_borvat_direct_accounts`,
`admin_list_borvat_direct_draft_listings`, `create_borvat_direct_draft_listing`.
`place_order` re-verified: `proacl = postgres=X ; sandbox_exec=X` — **P5-HF-001 intact**, no
`anon`/`authenticated`/`service_role`/PUBLIC EXECUTE.

## 6. Sequence ACLs

No sequences are owned by, or referenced by, any of the 7 scope tables (UUID keys). Nothing to
revoke. `channel_api_audit_id_seq` (out of scope) retains its pre-existing Phase 3/4 grants.

## 7. Default-privilege assessment (`pg_default_acl`)

| Grantor | Schema | Type | ACL |
|---|---|---|---|
| `postgres` | `public` | tables | `anon`, `authenticated`, `service_role` = full DML; `sandbox_exec` = `ar` |
| `postgres` | `public` | sequences | `anon`, `authenticated`, `service_role` = `rwU`; `sandbox_exec` = `rU` |
| `postgres` | `public` | functions | `anon`, `authenticated`, `service_role`, `sandbox_exec` = `EXECUTE` |
| `supabase_admin` | `public` | tables/sequences/functions | equivalent platform-managed defaults |

**Assessment: this is the root cause of grant drift**, but altering it was judged **NOT SAFE inside
this round** and is therefore documented, not applied:

- The defaults are platform-managed (`supabase_admin` duplicates them) and apply to **every** future
  `public` object across the whole product, not just tax objects — including Supabase/Auth/Lovable
  helper objects and future migrations that rely on implicit grants.
- Revoking default function `EXECUTE` from PUBLIC/`authenticated` would silently break newly created
  RPCs (they would need explicit `GRANT`s that existing project conventions do not always emit),
  which is a change to migration policy, i.e. outside a privileges-only stage.
- Any change here must be validated against all existing critical RPCs (checkout-adjacent, MCP,
  outbox workers), which is a separate verification campaign.

**Recommendation (separate, Owner-authorized ACL-policy stage):** either revoke the `postgres`
default table/function ACLs in `public` and make every migration emit explicit least-privilege
GRANTs, or at minimum drop `sandbox_exec` from the `public` default ACLs so verification tooling
stops re-acquiring `ar` on every new table. Until then, **every new tax/pricing/publication table
must be followed by an explicit revoke block in the same migration**, and a post-migration ACL probe
is mandatory before any tax data load.

## 8. RLS is not a justification for a grant

Recorded explicitly, per Owner instruction: **RLS is defense-in-depth, not a justification for
unnecessary table privileges.** The pattern "`authenticated` holds `INSERT`, a policy blocks it
today" is **not** acceptable, and was not accepted: those `INSERT`/`UPDATE`/`DELETE` grants were
removed even though no write policy existed. RLS state on these tables was left exactly as-is
(unchanged, still enabled/FORCE where previously set) and was not used to close anything.

## 9. Read-path regression results

| Path | Mechanism | Result |
|---|---|---|
| Seller stores UI (`/seller/stores`) | client `SELECT` on `merchant_stores` via RLS | unaffected — `merchant_stores` not in scope, no ACL change |
| Seller listings UI (`/seller/listings`, store listings) | client `SELECT` on `channel_listings` via RLS | unaffected — not in scope |
| Admin stores/channels/listings UI | `admin_list_*` SECURITY DEFINER RPCs | unaffected — RPC EXECUTE for `authenticated` retained and verified |
| Any UI reading the 7 scope tables | — | **none exists** (repo scan: 0 matches) |
| Tax data in Admin UI | — | not surfaced; no VAT numbers, no prices rendered anywhere |
| `borvat_direct_listing_publications` seller SELECT | previously granted `authenticated=r` | **no documented caller** in code or docs → revoked per §3 baseline ("if no documented caller, withdraw SELECT") |

No `ARCHITECTURE BLOCKER — UNDOCUMENTED DIRECT TABLE READ DEPENDENCY` was triggered: no interface
depended on direct table reads of the scope tables. No SELECT was re-granted to repair any surface.

## 10. Row / object delta

| Item | Delta |
|---|---|
| Rows inserted / updated / deleted | **0** (probe insert was rejected by the ACL, not rolled back) |
| Tables, columns, constraints, enums, triggers, policies | **0 changes** |
| RPCs created/changed | **0** |
| Revokes applied | 35 table-level + 30 function-level = **65** |
| Grants applied | **0** |
| Comments | 1 (`tax_rate_versions`) |
| Temporary/test helpers | **0 created, 0 remaining** |

Data state (asserted inside the migration as owner, before the revokes; unreadable by
`sandbox_exec` afterwards **by design**): `tax_rate_versions`, `catalog_product_tax_classifications`,
`company_tax_profiles`, `merchant_store_offer_prices`, `borvat_direct_listing_publications` = **0
rows** (migration aborts otherwise; it committed). `tax_rate_bands` = **9 draft bands**, untouched —
no statement in this migration references band rows or band status.

Environment invariants re-verified: `place_order` EXECUTE revoked from all application roles
(P5-HF-001 intact), checkout route still blocked, Stripe Live off, Bol live-write kill switches
unchanged (Phase 4 shadow/live fixture state untouched by this stage — no dispatch, connection or
kill-switch row was read for mutation or modified here).

## 11. R-T18 status

**R-T18 CLOSED — LEGACY APPLICATION DML GRANTS REMOVED.** All direct table DML and SELECT for
PUBLIC, `anon`, `authenticated`, `service_role` and `sandbox_exec` are removed from all seven
tax/pricing/publication tables, verified per-privilege with `has_table_privilege` and by a live
denied probe. No ACL exception was retained for operational reasons; no caller required one.

**New residual — R-T19 (ACL POLICY):** the `postgres` default ACLs in schema `public` still grant
future tables/sequences/functions to `anon`/`authenticated`/`service_role`/`sandbox_exec`. This
baseline holds for the seven existing objects but will be re-introduced on any **new** table unless
each migration revokes explicitly. Closing R-T19 requires the separate ACL-policy stage in §7.

## 12. Rollback / forward-fix

Rollback (only if a documented caller later proves necessary) is a targeted re-grant of the minimum
privilege for that one object/role, with the caller named — e.g.
`GRANT SELECT ON public.borvat_direct_listing_publications TO authenticated;`. Restoring the former
full-DML grants is explicitly **not** an approved rollback. Forward-fix is preferred: writes go
through a trusted `SECURITY DEFINER` RPC or an approved migration.

## 13. Confirmation

**No tax data was loaded.** No rate version, VAT percentage, legal or platform date, band-status
change, product classification, company tax profile, price row, publication transition, shipping
rule, storefront surface or checkout path was created, modified or enabled in this stage. The only
changes are REVOKEs, one comment, and this document.

---

## Final verdict

**M1B-3C-5 PASS WITH RESIDUAL RISKS**

Residuals: **R-T19** (schema-level default ACLs still re-grant future objects — recommendation in
§7, deliberately not applied inside a privileges-only stage), and the unchanged
**R-T15** / **R-T17** / **R-T13** / **R-T11-R-T12** tax blockers.

Halted. No current-rate seed, no tax approval workflow, no seller pricing, no price activation, no
shipping, no publication transition, no storefront and no checkout reactivation without separate
Owner authorization.
