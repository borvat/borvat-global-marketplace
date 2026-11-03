# BORVAT Marketplace v4 — bol.com-grade retail, implemented (2026-11-03)

Branch `design/marketplace-v4-bol`, cut from `design/marketplace-v3-atelier`.
Working storefront in the real app: routes, adapters, pricing, inventory and auth untouched.
Nothing merged, deployed or spent.

## What was rebuilt

**Header — three tiers, like the reference.** Service strip (free delivery threshold taken from
`SHIPPING_METHODS`, not invented), then the search-first bar with a category scope control, account,
orders, wishlist and cart with a live count, then the category row with `Alle categorieën`, the two
live categories and `Aanbiedingen`, with `Zakelijk · Cadeaukaart · NL/BE · taal` on the right.

**Homepage — merchandising, not a hero.** A static, server-rendered hero tile (fixed height at both
breakpoints), four tiles beside it, a trust band, then two dense rows of four cards and a category
strip with real counts. Every card carries category, title, offer count, price, delivery and seller.

**Listing — facet rail and a result bar.** Breadcrumb, `h1`, intro, 236px facet column (category with
counts, price range, availability), active-filter chips, result count, sort, and a 2/3/4-column grid.
Filters and search operate on the existing selector; nothing is decorative.

**Product page — a purchase decision.** Gallery plate, title, price with VAT line, availability,
delivery, a **seller comparison table** (seller · price · stock, radio selection that re-prices the
page), quantity, CTA, delivery/returns block, specification grid, and a related-products row built
from the same category.

**Cart — multi-vendor.** Lines grouped per seller with a per-seller subtotal, one order summary
(subtotal, shipping, VAT, total) computed by `orderTotals`, a split-shipment note, and a reconciliation
line that stays silent unless the seller subtotals and the order subtotal diverge.

## Comparison with the reference

| Area | bol.com pattern | BORVAT v4 |
|---|---|---|
| Header | service strip → search bar → category row | same three tiers, oxblood accent, category scope in the search field |
| Density | 4-column grid, price/delivery on the card | same density, offer count and seller added to every card |
| Facets | collapsible groups with counts | category with counts, price range, availability; chips for active filters |
| Product page | gallery, buy box, seller block, specs | gallery, buy box, **seller comparison table with stock**, specs, related row |
| Cart | grouped delivery, totals | grouped **per seller with per-seller subtotal**, one reconciled order total |
| Trust | delivery and returns messaging | same, with the shipping threshold read from the pricing model |

## What we add beyond the reference

1. **Seller comparison by price and stock** in one table on the product page, with the page re-pricing
   on selection.
2. **Per-seller subtotals in the cart**, plus an explicit reconciliation check between those subtotals
   and the order total.
3. **Related products** chosen deterministically from the same category — no model calls, no guessing.
4. **No invented discounts.** The cross-seller price spread is shown as an offer count, never as a
   markdown; a `-x%` badge appears only when a real reference price exists in the data.
5. **Language switch in the header** (NL / EN / AR) wired to the existing copy layer.

## Evidence

Screenshots at 1440 and 390 in `docs/design/visual/v4/`: `v4-home-*`, `v4-category-*`, `v4-pdp-*`,
plus `v4-cart-*` captured from a two-seller session.

Functional checks on this build:

| Check | Result |
|---|---|
| Two sellers in one cart | 2 groups, per-seller subtotals € 749,00 and € 3.897,00 |
| Order arithmetic | group sum € 4.646,00 = order subtotal = total; no warning rendered |
| Seller switching on the product page | selection re-prices and re-stocks the buy box |
| Search and facets | `?q=` and `?category=` both filter the grid and render chips |
| Mobile 390 | no horizontal overflow on home, listing, product, cart |
| Console | no application errors |

Engineering gate: `vlab gate --config gate.config.borvat-storefront.json` →
**DEMO READY (production stages excluded by scope)**. Stage 1 clean, 2: 27/27, 3: 2/2 E2E,
3.1 axe zero, 3.2 **LCP 1471 ms · CLS 0.009 · TBT 90 ms**, 4: seven `info`-only findings.
Report: `out/gate-borvat-storefront-2026-11-03T03-13-32-130Z.json`.

During this round the gate caught two real defects that a screenshot would not: the homepage had lost
its `h1` (E2E failed on heading count) and the hero was mounted after the catalogue resolved, which
cost **CLS 0.131 and LCP 2.4 s**. The hero is now static, fixed-height and preloaded.

## Remaining gaps

1. **Two photos do not represent their article**: the wool rug is a museum carpet and the pine cabinet
   is a dark antique cupboard. Wikimedia Commons has no clean studio shot for either; supplier media
   or one photo day closes it.
2. **Shipping is one model per order.** The pricing layer has no per-seller shipping rules, so the cart
   shows one shipping line and states that the order may split. Per-seller shipping costs are not
   invented.
3. **No review data** in the fixtures, so no ratings are rendered anywhere.
4. **Checkout is the existing test checkout**, untouched by this branch.
5. **Nine articles, two categories**, no pagination — enough to judge the system, not an assortment.
6. Search suggestions are deterministic substring matches, not a ranking service.

## Preview

`http://127.0.0.1:4173` while the WSL build server runs:

```bash
wsl -d Ubuntu -- bash -c 'cd ~/dsgn/apps/marketplace && PORT=4173 node .output/server/index.mjs'
```
