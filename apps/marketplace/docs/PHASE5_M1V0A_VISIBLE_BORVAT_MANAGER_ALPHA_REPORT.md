# PHASE 5 — M1V-0A VISIBLE BORVAT MANAGER ALPHA — REPORT

Status: DELIVERED (UI-only, read-only, demo data)
Date: 2026-07-26

## 1. Scope executed

Built a browsable visual alpha of three manager surfaces on demo fixtures only:
Seller Manager, Borvat Admin Manager, Customer Service Manager, plus a
customer-side support preview.

## 2. Prohibitions honoured

| Prohibition | Evidence |
|---|---|
| No migration / DDL / DML | Zero migration tool calls this milestone; no SQL executed. |
| No new table, function or RPC | None created. |
| No DB writes | Demo screens import only `src/demo/*.ts`; no `supabase` client import in any new file. |
| No checkout / payment / order creation | No such control exists; order references are literal placeholders (`ORDER-PLACEHOLDER-0001`). |
| No channel execution, Bol or Stripe live | Store screen shows Bol live as `blocked by governance gate`. |
| No real customer or seller data | All fixtures are invented entities (Vandenberg, Maasdal). |
| No fake-production buttons | Every non-wired control renders through `DemoAction`, labelled `demo`, tooltip "Demo action — not persisted", and raises an explicit "not persisted" toast. |

## 3. Demo data (frontend fixtures only)

- `src/demo/companies.ts` — 2 companies, 3 stores, 2 warehouses.
- `src/demo/products.ts` — 10 listings across 3 stores + stock movements.
- `src/demo/shipping.ts` — origins, shipping profiles, rate cards, delivery promises, transit profiles.
- `src/demo/quotes.ts` — manual quote requests with package snapshots and versioned offers.
- `src/demo/messages.ts` — dual-channel conversations, messages and cases.

## 4. Route inventory

Seller Manager (auth-gated):
- `/seller/manager` — dashboard: sales, orders, active products, low stock, pending offers, alerts.
- `/seller/store` — profile, company/verification, channels, fulfilment origins.
- `/seller/catalog` — products/listings with tabs, search and a detail drawer.
- `/seller/inventory` — stock levels, low-stock filter, ledger movements.
- `/seller/shipping` — origins, profiles, rate cards, delivery/transit profiles.
- `/seller/quotes` — quote requests, package snapshots, offer versions, accepted terms.
- `/seller/messages` — Borvat ↔ merchant channel only.

Borvat Admin Manager (existing platform-admin gate):
- `/admin/dashboard`, `/admin/companies`, `/admin/products`, `/admin/shipping`,
  `/admin/quotes`, `/admin/security` (new, demo)
- `/admin/stores`, `/admin/channels`, `/admin/listings` (pre-existing real read-only screens, untouched)

Customer Service Manager:
- `/support/inbox/customers` — customer ↔ Borvat inbox.
- `/support/inbox/merchants` — Borvat ↔ merchant inbox.
- `/support/cases/$caseId` — dual-channel case workspace with linked product/quote/offer/order records.

Customer preview:
- `/account/support` — the customer's own conversations, product and shipping-quote context.
- `/account/support/$conversationId` — single thread; internal merchant channel is never rendered here.

Scope deviation (documented, non-blocking): the demo catalogue lives at
`/seller/catalog` because `/seller/products` is an existing production screen
and `/seller/listings/$listingId` already claims the `listings` segment.

## 5. Dual-channel bridge model

Cases carry two conversation IDs. Support staff see both panes side by side in
`/support/cases/$caseId`; the seller surface renders only `borvat_merchant`
conversations and the customer surface only `customer_borvat` conversations.
No customer PII reaches the seller screens, and no seller identity or internal
note reaches the customer screens.

## 6. Interaction model

Tabs, search, low-stock toggle, drawers and thread selection are local React
state only. Reply textareas are non-submitting.

## 7. Verification

- Typecheck: `bunx tsgo --noEmit` → exit 0, no errors.
- Static check: no `@/integrations/supabase` import in any `src/demo/**` or new demo route.
- Zero DDL, zero DML this milestone.
- ACL gate: unchanged from the M1C-1E-E-R3 run (58/58 PASS); no backend surface was touched.

## 8. Definitions requested by the owner

- BOR-DEC-133 — Advisory family lock is acquired only inside guard-path triggers on `request_family_id`.
- BOR-DEC-134 — Acceptance settlement validates against surviving R1 objects only; references to dropped objects are prohibited.
- R-Q1 — The advisory lock binds guard-path writers only; a write path that bypasses the guards is not serialized.
- R-Q2 — All writers on one quote family queue behind a single transaction lock, so throughput per family is serial.

## 9. Open items for owner review

1. Confirm the `/seller/catalog` route naming or authorise renaming the existing production screen.
2. Confirm whether the Admin demo pages should stay behind the platform-admin gate (current behaviour) or move to a separate staff role.
3. Nothing further is authorised until this alpha is reviewed.
