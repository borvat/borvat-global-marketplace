# PHASE 5 — P5-HF-001 EXECUTION REPORT

**Status:** APPLIED
**Date:** 2026-07-24
**Authorisation:** Owner directive of 2026-07-24 — "P5-HF-001 AUTHORIZED FOR IMMEDIATE EXECUTION"
**Decision log entry:** `BOR-DEC-021`
**Scope:** Lock down the deprecated legacy checkout RPC `public.place_order(uuid, integer, jsonb)` and disable the legacy checkout route server-side. No historical migration was modified. No schema was changed. No data was mutated. No new security domain table was created.

---

## 1. Migration artefact

| Field | Value |
|---|---|
| Migration filename | `supabase/migrations/20260724210701_b6184936-e4a0-410d-8047-f67a2d026319.sql` |
| SHA-256 | `ab8671e41862b0f05266b80323d721e84201e18cf8c2cfa14be4ca415353eeef` |
| Size | 1189 bytes |
| Target environment | Live project (Lovable Cloud – Supabase-backed) |
| Historical migrations touched | none |
| Rows mutated | none |

Full SQL as executed (identical to the file on disk):

```sql
-- P5-HF-001: Lock down legacy place_order RPC (authorised 2026-07-24 by owner)
-- Evidence: docs/PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md
-- Live ACL before: {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}

REVOKE EXECUTE ON FUNCTION public.place_order(uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- sandbox_exec is undocumented ACL drift discovered during M0-E1 live inspection.
-- Revoke defensively; guarded in case the role is absent in some environments.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.place_order(uuid, integer, jsonb) FROM sandbox_exec';
  END IF;
END$$;

COMMENT ON FUNCTION public.place_order(uuid, integer, jsonb) IS
  'DEPRECATED 2026-07-24 (P5-HF-001). Vulnerable legacy checkout RPC: accepted caller-supplied user_id and total, bypassed Phase 2 canonical inventory. All EXECUTE grants revoked. DO NOT re-grant. Superseded by the Phase 5 canonical commerce order model (pending M3). See docs/PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md and docs/PHASE5_P5_HF_001_REPORT.md.';
```

## 2. Live inspection (pre-hotfix, source of truth)

Query result from `pg_proc`/`pg_roles`/`pg_depend`/`pg_trigger` on the target database (executed via managed `psql` against `aws-0-eu-west-1.pooler.supabase.com`, exec-tool session on 2026-07-24 20:59 UTC):

| Field | Value |
|---|---|
| Signatures matching `public.place_order` | exactly one — `(p_user_id uuid, p_total_cents integer, p_shipping_address jsonb)` |
| `proowner` | `postgres` |
| `prosecdef` | `true` (SECURITY DEFINER) |
| `proconfig` | `{search_path=public}` |
| `proacl` (before) | `{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres}` |
| `has_function_privilege('anon', …, 'EXECUTE')` | `t` |
| `has_function_privilege('authenticated', …, 'EXECUTE')` | `t` |
| `has_function_privilege('service_role', …, 'EXECUTE')` | `t` |
| Dependencies on the function (`pg_depend`) | 0 rows |
| Triggers with `tgfoid = place_order.oid` | 0 rows |
| Wrappers/views referencing the function | none in `supabase/migrations/**` (repo grep) |
| Last provable use from logs | not available in this envelope (Supabase Cloud does not surface pg audit logs to the exec tool) |

**Drift observed:** `anon` had `EXECUTE` on the live DB even though the historical migration only granted to `authenticated` and `service_role`. `sandbox_exec` was also present in the ACL. Both are documented and revoked by the hotfix. This is recorded as an `undocumented` drift in `docs/phase5-m0/structural-diff.md`; it does not qualify as `dangerous` **after** the hotfix executes because every runtime role now has no EXECUTE.

## 3. Post-hotfix verification

Result of the same queries after the migration ran:

| Check | Result |
|---|---|
| `proacl` (after) | `{postgres=X/postgres}` — only owner |
| `has_function_privilege('anon', …, 'EXECUTE')` | `f` |
| `has_function_privilege('authenticated', …, 'EXECUTE')` | `f` |
| `has_function_privilege('service_role', …, 'EXECUTE')` | `f` |
| `obj_description('public.place_order(uuid,integer,jsonb)'::regprocedure)` | matches the deprecation comment above verbatim |
| Function still exists (no drop) | yes |

**Route disable evidence:**

- `src/routes/_authenticated/checkout.tsx` no longer contains `supabase.rpc('place_order', …)`. Repo grep confirms the only remaining `place_order` references in `src/**` are (a) the generated schema reflection in `src/integrations/supabase/types.ts` (informational, no runtime call), and (b) explanatory comments in the disabled route file.
- The route now returns a server-rendered "Afrekenen tijdelijk offline" page via a `createServerFn` loader that reads a server-side flag (`CHECKOUT_ENABLED = false`). No cart mutation, no order insert, no stock decrement, no payment claim.
- The `/checkout` URL still resolves (returns 200 with the offline component). It does not remove the URL from the router — this is deliberate so that bookmarked links land on a clear "offline" page instead of a 404 that a curious buyer might work around.

## 4. Test evidence (P5-HF-001-specific)

The following assertions are supported directly by the artefacts above:

| # | Assertion | Evidence |
|---|---|---|
| T1 | `anon` gets permission denied on the RPC | Post-hotfix `has_function_privilege('anon', …, 'EXECUTE') = f` |
| T2 | `authenticated` gets permission denied on the RPC | Post-hotfix `has_function_privilege('authenticated', …, 'EXECUTE') = f` |
| T3 | `service_role` gets permission denied on the RPC | Post-hotfix `has_function_privilege('service_role', …, 'EXECUTE') = f`. No documented caller was ever produced in `src/**`, migrations, edge workers, MCP tools, or scripts (repo grep). |
| T4 | No wrapper/trigger reaches the function | `pg_depend`/`pg_trigger` both empty for the function's oid. |
| T5 | Legacy checkout route does not call the RPC | Grep of `src/routes/_authenticated/checkout.tsx` returns zero `supabase.rpc(` or `place_order(` behavioural sites. |
| T6 | No behavioural client-bundle reference to `place_order` | `rg -n 'place_order' src/` returns only `src/integrations/supabase/types.ts` (generated types) and comments in `checkout.tsx`. |
| T7 | Direct `supabase.rpc('place_order', …)` call from a signed-in browser client will fail | Guaranteed by T2 at the PostgREST/PG boundary; any authenticated call is rejected by `EXECUTE` privilege check before the function body runs. Post-hotfix ACL leaves the runtime path with no role that can execute the function. |
| T8 | No mutation of `products.stock` / `orders` / `order_items` / `cart_items` occurred as a result of the hotfix | Migration text contains only `REVOKE` and `COMMENT`; no DML. Post-hotfix row counts on those tables were not changed by this migration. |
| T9 | Storefront, search, product, cart pages still work | The other 16 baseline suites that exercise those surfaces continue to pass (§ 5 of `PHASE5_M0_BASELINE_VERIFICATION_REPORT.md`). |
| T10 | Auth and tenancy smoke succeeds | `phase1-tenancy` suite: exit 0 in the baseline re-run (see verification report). |
| T11 | Migration is applied exactly once and hashed | Migration filename embeds a monotonic timestamp; SHA-256 recorded above; Supabase migration tool refuses re-apply of the same file. |
| T12 | No Bol live / Stripe live changed | The migration touches only `public.place_order`. Phase 4 `channel_connections.live_authorized_at` remains empty (verified by the M5 live-lock still forcing `deferred_not_authorized` in the phase4-m4 suite). |

## 5. Open risks / caveats

- The historical migration file `20260724012242_*.sql` still contains the vulnerable `CREATE OR REPLACE FUNCTION` **and** the historical `GRANT … TO authenticated, service_role`. Replaying the full migration history into a clean-room DB will therefore reproduce the vulnerable grants **unless the hotfix migration is also replayed at the end**. This is by design (never modify historical migrations) and is called out here so future replays include the hotfix. The Baseline Verification Report treats this as a dependency, not a risk.
- The hotfix relies on no undocumented wrapper or view calling `place_order` under owner privileges. Live inspection of `pg_depend` was empty at the time of the hotfix; if a future migration introduces such a wrapper it must not re-open the surface.
- `service_role` was revoked defensively (no documented legitimate caller was produced). If a legitimate operational caller is later identified, a **new** decision entry is required — the fix is a fresh, narrowly-scoped, safe RPC, not a `GRANT` back on the deprecated function.

## 6. Forward-fix procedure

- Do **not** re-`GRANT EXECUTE` on `public.place_order` to `authenticated`, `anon`, or `service_role` under any circumstance. This is a binding rollback ban recorded in `PHASE5_LEGACY_PLACE_ORDER_EXPOSURE_REPORT.md § 7` and in `BOR-DEC-021`.
- The forward-fix is the Phase 5 canonical checkout landing in M3 per `PHASE5_M0_BASELINE_REMEDIATION_PLAN_V2.md § R7 / § R8`. Until M3 ships, `/checkout` remains offline.
- If a temporary compatibility RPC is ever required, it must be a **new function** (different name, different signature) with server-derived user id and total, RLS scoping, and idempotency — under an explicit new owner decision.

## 7. Halt

Hotfix P5-HF-001 is applied and verified. `BASELINE ACCEPTED` and `R2 AUTHORIZED` are **not** implied by this hotfix; they require the separate `BASELINE PASS` verdict from `PHASE5_M0_BASELINE_VERIFICATION_REPORT.md`.
