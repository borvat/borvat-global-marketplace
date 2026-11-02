# BORVAT marketplace v2 — replacement design (2026-11-02)

Branch `design/marketplace-v2-20261102` (isolated, from `work/inventory-single-writer`).
The rejected editorial branch `design/premium-storefront-20261102` is untouched.

## What changed in the approach

The rejected design was an art-directed lifestyle page: a serif display hero, wide whitespace and
three-column cards with no shopping signals. The replacement is a working marketplace shell:
three-tier header (service strip, search-first bar, category row), 248 px facet column, a results
bar that states the count before the sort control, and four-column cards whose title, price,
delivery and seller sit on fixed rows so every row shares one baseline.

| | Rejected branch | This branch |
|---|---|---|
| Header | two rows, serif wordmark, underlined search | service strip + search-first bar + category row |
| Hero | serif display, empty right column | promo tile + four category tiles |
| Grid | 3 columns, 1:1.25 media, no delivery/seller | 2 / 3 / 4 columns, price + delivery + seller on every card |
| Listing | filters as a card, no breadcrumb, no chips row | breadcrumb, SEO intro, facet counts, chips, result bar, sort |
| PDP | buy box on a card, no trust rows | sticky buy box, delivery + seller rows, quantity, trust list, spec grid |
| Type | serif display + Inter | Inter only; hierarchy from weight and size |

## Evidence

Screenshots in `docs/design/visual/v2/` (widths verified from the PNG headers: 1440 and 390):

| Page | Desktop | Mobile |
|---|---|---|
| Homepage | `v2-home-1440.png` | `v2-home-390.png` |
| Category / search results | `v2-category-1440.png` | `v2-category-390.png` |
| Product detail | `v2-pdp-1440.png` | `v2-pdp-390.png` |

Rejected design, for contrast: `docs/design/visual/after/` (same three pages).

## Functional evidence (Playwright, this build)

| Check | Result |
|---|---|
| Search "tafel" → results | URL `?q=tafel`, `2 resultaten`, H1 `Resultaten voor “tafel”` |
| Category facet "Wonen" | URL `?category=Wonen`, `5 resultaten`, one removable chip |
| Product → add to cart | badge `1`, cart H1 `Mandje (1 artikel)`, checkout button visible |
| Mobile 390 overflow | none on `/`, `/discover`, `/discover?category=Tuin`, `/product/prd_001`, `/cart` |
| Console errors | none |

## Gate

`vlab gate --config gate.config.borvat-storefront.json` →
`DEMO READY (production stages excluded by scope)`: stages 1, 2, 3, 3.1, 3.2, 4 pass
(27/27 unit, 2/2 E2E, axe 0, CLS 0.000, LCP 1330 ms, TBT 104 ms, security 7 info-only findings).
Stages 6 and 7 remain excluded because deploying is outside this mandate.

## Content limitation, stated plainly

The catalogue has no product photography. Every tile therefore shows a neutral field labelled
"Geen productfoto / Voorbeeldafbeelding · origineel niet beschikbaar" instead of a generated image
that would read as a product photo. Ratings are absent in the data, so cards say "Nog geen
beoordelingen" rather than showing a fabricated star count. Delivery text is the demo's own
indicative promise, not a carrier guarantee. With real media and review data the grid will look
substantially richer without any layout change.

## Local preview

`http://127.0.0.1:4173` while the WSL preview server runs:

```bash
wsl -d Ubuntu -- bash -c 'cd ~/dsgn/apps/marketplace && PORT=4173 node .output/server/index.mjs'
```

Routes: `/` homepage, `/discover` listing, `/discover?category=Wonen`, `/product/prd_001`, `/cart`.

## Remaining limitations

1. Two live categories only (Wonen, Tuin); the header does not pretend to a mega menu it cannot fill.
2. No product photography and no review data, as above.
3. Seller facet is absent on purpose: the route model has no seller filter, and a facet that cannot
   filter is exactly the non-functional component the mandate forbids.
4. Not deployed, not merged, no PR opened.
