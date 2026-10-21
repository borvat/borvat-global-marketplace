# BORVAT MANAGER VISUAL BASELINE V1

Status: **ACCEPTED (M1V-0B)** — frozen visual baseline. UI-only, fixtures only, zero DDL/DML.
Scope of this document: the approved shell, component inventory, route inventory, and the
minor-polish round executed after acceptance.

> Change control: Layout, navigation, tables, status system, inbox structure, case context and
> Borvat visual identity are **frozen**. Backend wiring must replace fixture data sources only.
> Any redesign of shells or information architecture requires an explicit Owner decision.

---

## 1. Minor polish executed after acceptance

| # | Item | Result |
|---|---|---|
| 1 | Single UI language per screen | All manager, admin, support and customer-support demo surfaces are English. Public storefront/checkout remains Dutch by design (NL market). Status keys are humanised centrally via `statusLabel()` / `STATUS_LABELS` in `src/components/demo/shell.tsx`. |
| 2 | Customer identity hidden from merchant workspace | Demo order/question/review actors are pseudonymous refs (`Customer #C-1041`…). `ChannelInbox` accepts `viewer="merchant"`, which renames customer-side participants to "Borvat customer", hides assignee/escalation controls, and replaces "Open full case" with "Request Borvat callback". Used by `/seller/messages`. |
| 3 | Demo Mode indicator | `DemoBanner` + `ClassificationChip` retained unchanged on every manager surface. |
| 4 | Component and route documentation | Sections 3 and 4 below. |
| 5 | No full-page white flashes | Verified desktop 1440×1000 and mobile 390×844: during client-side navigation the app background stays `oklch(0.985 0.005 240)` and body text never drops to 0 characters at 60/120/240 ms after click; 0 console errors. Router keeps `defaultPendingMs` + `ShellSkeleton` so route transitions render the shell, never a blank document. |

## 2. Visual identity (frozen)

- Typography: **Inter** (sans-serif) across the whole manager surface. No serif.
- Surfaces: Borvat "Ink"/graphite chrome, light neutral content canvas.
- Accent: Borvat red for primary actions and role accents (Seller / Admin / Support themes).
- Density: operational tables 10–20 rows, compact row height, hover affordance.
- Buttons: Primary / Secondary / Ghost / Icon; inputs share rounded-md + focus ring.

## 3. Approved component library

`src/components/demo/shell.tsx`
`ManagerShell`, `DemoBanner`, `ClassificationChip`, `Card`, `Metric`, `Toolbar`, `DataTable`,
`Row`, `Cell`, `Pagination`, `EmptyState`, `LoadingRows`, `Skeleton`, `DemoAction`, `SearchInput`,
`FilterSelect`, `Tabs`, `Drawer`, `KeyValue`, `BarChart` (axes, gridlines, legend, tooltips,
range selector, CSV export), `InboxLayout`, `StatusBadge` / `statusLabel` / `toneForStatus`,
`useLocalToggle`, and navigation models `SELLER_NAV` (9 groups), `ADMIN_NAV`, `SUPPORT_NAV`.

`src/components/demo/inbox.tsx`
`ChannelInbox` — three-column operational inbox (list | thread | context) with SLA timers,
tags, assignment, linked records, dual-channel bridge and the `viewer` privacy mode.

Fixtures: `src/demo/ops.ts`, `src/demo/messages.ts`, plus store/catalog/shipping/quote fixtures.

## 4. Approved routes

**Seller Manager (`/seller/*`)** — manager, dashboard, catalog, products, products/new,
products/$id/edit, listings/$listingId, inventory, order-desk, orders, questions, reviews,
messages, quotes, shipping, promotions, advertising, performance, analysis, finances,
suggestions, store, stores, stores/$storeId, stores/$storeId/listings, settings.

**Borvat Admin (`/admin/*`)** — dashboard, orders, users, merchants, catalog, shipping, quotes,
finance, health, audit, security/risk.

**Customer Service (`/support/*`)** — queue, inbox/customers, inbox/merchants, cases/$caseId.

**Customer preview** — `/account/support`, `/account/support/$conversationId`.

**Owner hub** — `/owner-review` (dedicated Borvat shell; identity block showing signed-in email,
detected role and build id; direct links to all surfaces above).

## 5. Compliance

- No DDL, no DML, no migrations, no backend calls in this round.
- All data rendered from `src/demo/*` fixtures; every action button is a demo no-op.
- No real customer PII anywhere; merchant-facing surfaces see pseudonymous references only.
- Typecheck clean; navigation probes show 0 console errors.

## 6. Next gate

Awaiting Owner selection of the **first operational vertical slice** before any backend wiring.
