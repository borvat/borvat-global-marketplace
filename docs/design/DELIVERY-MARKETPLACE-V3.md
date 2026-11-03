# BORVAT Marketplace v3 — implementation report (2026-11-03)

Approved direction: **A (Kiosk) as the shopping spine + C (Maison) for identity, seller grouping
and per-seller delivery**. B (Signaal) is not used.

Branch `design/marketplace-v3-atelier`, cut from `design/marketplace-v2-20261102`
(itself `work/inventory-single-writer` + presentation work only). The rejected branches
(`design/premium-storefront-20261102`, `design/marketplace-v2-20261102`) are untouched and still
available for comparison.

## What is implemented

| Surface | State |
|---|---|
| Header | three tiers: service strip, search-first bar with suggestions, category row (`Alle categorieën`, Wonen, Tuin, Aanbiedingen) |
| Homepage | oxblood hero carrying a product photo, category tiles built from real fixtures, two product rows (`Populair`, `Meer uit de collectie`), category strip |
| Listing | breadcrumb, H1 + intro, facet column with counts (category, price, availability), chips for active filters, result count, sort, 2/3/4-column grid |
| Product detail | 4:5 gallery, price + VAT line, availability, delivery, seller offers as selectable rows, quantity, CTA, delivery/returns block, specification table |
| Cart | **grouped per seller**, per-seller subtotal, one reconciled order summary (subtotal, shipping, VAT, total), split-shipment note, quantity steppers, per-line errors |
| States | loading skeleton that matches the final grid, error with retry, empty results with clear filters, empty cart |

Everything is computed: prices, line totals, VAT and shipping come from
`lib/commercial/shop-pricing` (`orderTotals`, `lineTotalCents`). The cart renders per-seller
subtotals from the same `lineTotal` values the model sums, and shows an explicit alert if the two
ever diverge (`cart-reconcile-warning`, never triggered in this build).

## Evidence

### Visual (full page, 1440 and 390)

| Surface | Desktop | Mobile |
|---|---|---|
| Homepage | `docs/design/visual/v3/v3-home-1440.png` | `v3-home-390.png` |
| Category / search | `v3-category-1440.png` | `v3-category-390.png` |
| Product detail | `v3-pdp-1440.png` | `v3-pdp-390.png` |
| Multi-vendor cart | `v3-cart-1440.png` | `v3-cart-390.png` |

Rejected designs for comparison: `docs/design/visual/after/` (editorial) and
`docs/design/visual/v2/` (first marketplace attempt).

### Functional (Playwright, this build)

| Check | Result |
|---|---|
| Two sellers in one cart | 2 groups, 2 lines, header `Mandje 3 artikelen · 2 verkopers` |
| Per-seller subtotals | € 749,00 + € 2.598,00 |
| Order subtotal | € 3.347,00 — **equals the sum of the group subtotals** |
| Shipping | Gratis (threshold met) |
| VAT 21% | € 580,88 |
| Total | € 3.347,00 |
| Reconcile warning | not rendered |
| Console errors | none (resource 404s excluded) |
| Mobile 390 overflow | none on `/`, `/discover`, `/product/prd_001`, `/cart` |
| Search "tafel" | `?q=tafel`, `Resultaten voor “tafel”`, filtered grid |
| Category filter | `?category=Wonen`, chip rendered, count drops to 5 |

### Engineering

- Gate: `vlab gate --config gate.config.borvat-storefront.json` →
  **DEMO READY (production stages excluded by scope)**.
  Stage 1 build/typecheck PASS, 2 tests 27/27 PASS, 3 E2E 2/2 PASS, 3.1 axe 0 findings,
  3.2 LCP 1385 ms · CLS 0.000 · TBT 30 ms, 4 security 7 checks with 7 `info` findings.
- Report: `C:/Users/Zulik/verification-lab/out/gate-borvat-storefront-2026-11-03T02-03-23-789Z.json`
- Focused checks only: the commerce suite, the storefront spec, axe and lighthouse. No unrelated
  suites were re-run.

### Changed files

- `apps/marketplace/src/styles.css` — warm surface tokens, density rules, component classes
- `apps/marketplace/src/components/commercial/shop/shop-header.tsx` — three-tier marketplace header
- `.../shop-parts.tsx` — product card, media, badge, stepper, totals, buttons
- `.../discovery-view.tsx` — homepage sections and listing with facets
- `.../cart-view.tsx` — seller grouping and reconciled summary
- `.../product-view.tsx` — buy box, seller offers, trust rows, spec grid
- `.../demo-media.ts` — fixture → demo photo mapping
- `apps/marketplace/public/demo/*.jpg` + `ATTRIBUTION.md` — nine licensed demo photos
- `docs/design/visual/v3/*.png` — the eight captures above

## Remaining gaps (nothing here is hidden)

1. **Imagery is not supplier media.** The nine photos are Wikimedia Commons files (CC BY, CC BY-SA,
   CC0) used as demo imagery and rendered with a "Demonstratiebeeld" label. A production shop needs
   supplier feeds or a studio shoot; the layout is ready for them.
2. **Shipping is one model per order.** The backend has no per-seller shipping rules, so the cart
   shows one shipping line and states that the order may split into multiple shipments. Per-seller
   shipping costs are *not* faked.
3. **No review data** exists in the fixtures, so no ratings are shown anywhere. The card and PDP
   leave the slot empty rather than inventing stars.
4. **Checkout is the existing test checkout**, untouched. Payment providers, carrier integration and
   real inventory reservations remain out of scope for this design branch.
5. **Two live categories.** The navigation shows only categories the catalogue can fill.
6. Search suggestions are deterministic substring matches, not a ranking model; nothing is labelled
   AI.
7. Not deployed, not merged, no PR, no production data touched.
