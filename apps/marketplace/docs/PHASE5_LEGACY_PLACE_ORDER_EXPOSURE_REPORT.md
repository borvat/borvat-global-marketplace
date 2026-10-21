# PHASE 5 — LEGACY `place_order` EXPOSURE REPORT

**Status:** EXPOSURE CONFIRMED — Hotfix candidate `P5-HF-001` recommended
**Date:** 2026-07-24
**Scope:** Read-only audit. No code, schema, or grant changes have been executed.

---

## 1. Function definition (verbatim source)

Defined in the single historical migration
`supabase/migrations/20260724012242_b65ade6d-bdb8-46c9-bdd5-0739eca5894f.sql`.

Signature: `public.place_order(p_user_id uuid, p_total_cents int, p_shipping_address jsonb) RETURNS uuid`
Attributes: `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public`.
Grants at end of migration:

```
REVOKE ALL ON FUNCTION public.place_order(uuid, int, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.place_order(uuid, int, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.place_order(uuid, int, jsonb) TO service_role;
```

No overloads exist (`rg` on `supabase/migrations/**` returns exactly the four references above; only one `CREATE OR REPLACE FUNCTION` line).

## 2. Call sites

Repository grep for `place_order` in `src/**`:

| Path | Kind | Notes |
|---|---|---|
| `src/routes/_authenticated/checkout.tsx` (line 70) | Client-side `supabase.rpc("place_order", …)` invocation | Passes `p_user_id: uid` from the session, `p_total_cents: total` computed **on the client**, and `p_shipping_address` from a form. |
| `src/integrations/supabase/types.ts` | Generated types only | No behavioural reference. |

No server function (`*.functions.ts` / `*.server.ts` / `src/routes/api/**`), no edge worker, no cron, no MCP tool, no test/seed script references `place_order`. No SQL wrapper, trigger, view, or other RPC references it.

## 3. Vulnerabilities (verbatim, matching M0 Preflight Stop Condition 1)

Because the function is `SECURITY DEFINER`, granted to `authenticated`, and takes both the user id and the total as **caller-supplied** parameters, any signed-in Borvat user can:

1. **Impersonate another user** — pass `p_user_id = <any auth.users.id>`; the function inserts into `public.orders (user_id, …)` with that id, iterates that victim's cart, drains their stock, and clears their `cart_items`. There is no `auth.uid() = p_user_id` check.
2. **Set an arbitrary paid total** — `p_total_cents` is written straight to `orders.total_cents` and the resulting order is inserted with `status = 'paid'` unconditionally, with no payment intent, no reconciliation against line prices, and no server-side recomputation.
3. **Bypass the Phase 2 canonical stack** — the function reads `public.products.stock`, decrements it directly with `UPDATE public.products SET stock = stock - r.quantity`, and never touches `catalog_skus`, `inventory_balances`, `inventory_transactions`, or `create_reservation`. It re-introduces the exact race conditions that Phase 2 §21 was designed to eliminate.
4. **No idempotency** — no idempotency key, no dedupe, no lock on `cart_items`; a fast double-click creates two paid orders and double-decrements stock.
5. **No tenant scoping** — items from multiple sellers land in one flat `orders` row; there is no parent/merchant sub-order split required by Phase 5 §M3.

## 4. Reachability

- **Route reachability:** `src/routes/_authenticated/checkout.tsx` lives under `_authenticated/`, i.e. any signed-in user can reach it. No admin or seller gate. The published site (`https://www.ibbo.shop`, `https://private-shop-space.lovable.app`) enforces only sign-in for that route.
- **RPC reachability:** `authenticated` role holds `EXECUTE`. Any signed-in Supabase client can call `supabase.rpc('place_order', …)` directly, bypassing the checkout UI entirely.
- **Anon reachability:** `PUBLIC` is revoked; `anon` has no direct grant. Unauthenticated callers cannot invoke it.
- **Server-role reachability:** `service_role` has `EXECUTE` but is not exposed to browsers.

## 5. Live evidence gap

M0 was read-only, so we cannot yet prove from `pg_catalog` on production that no other overload/wrapper exists on the live database and that grants match the migration text. This has to be closed by M0-E1 (§ Baseline Reproducibility & Drift Verification) before R2 executes. Until then this report treats the migration text as the source of truth.

## 6. Hotfix — `P5-HF-001` (AUTHORISED AND APPLIED 2026-07-24)

Per owner authorisation (`BOR-DEC-021`), the hotfix has been applied via additive migration
`supabase/migrations/20260724210701_b6184936-e4a0-410d-8047-f67a2d026319.sql`
(SHA-256 `ab8671e41862b0f05266b80323d721e84201e18cf8c2cfa14be4ca415353eeef`). Details are in
`docs/PHASE5_P5_HF_001_REPORT.md`.

Actions executed:

1. `REVOKE EXECUTE ON FUNCTION public.place_order(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;` plus a guarded `REVOKE ... FROM sandbox_exec` (ACL drift discovered at live inspection).
2. `COMMENT ON FUNCTION public.place_order(...) IS 'DEPRECATED 2026-07-24 (P5-HF-001) ...'` — function is retained (not dropped) so downstream evidence remains inspectable; forward-fix path lands in M3.
3. Server-side disable of `src/routes/_authenticated/checkout.tsx`: route renders a "Afrekenen tijdelijk offline" page, has no `rpc('place_order', ...)` call in the client bundle, does not create an order, does not decrement stock, and does not claim a successful payment. The disable is driven by a server function (`createServerFn`) so the flag is not a client-side toggle.

## 7. Rollback policy (BINDING)

There is **no rollback by re-granting** `EXECUTE` on `public.place_order` to `authenticated`,
`anon`, or `service_role`. The only permitted recovery paths are:

- keep `/checkout` offline until the Phase 5 canonical checkout ships in M3 (forward-fix); or
- introduce a **new, safe, owner-approved compatibility RPC** with server-derived user id and total, RLS scoping, and idempotency — under a fresh decision entry.

Restoring the historical grants is explicitly forbidden by owner directive and by
`BOR-DEC-021`.

## 8. Halt

The exposure documented above is closed against the deprecated RPC surface. The broader Phase 5 canonical commerce order model is the forward-fix and remains gated behind `BASELINE ACCEPTED` and later mile-stones.
