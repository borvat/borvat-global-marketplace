# DELIVERY — Ateliermarkt storefront redesign

**Branch:** `design/premium-storefront-20261102` (isolated, not merged, not deployed)
**Base:** `work/inventory-single-writer` @ `f816097`
**Commits:** `c0a05f1` tokens + header + primitives + hero · `989bc95` product card · `3489ea9` hero featured object · `ae45ca3` alignment + price guard · `39c89c7` caption · `29e1a24` featured product access

## Verdict

**READY for owner review** as a visual direction implemented on the real storefront, with the limitations below. Not deployed: staging still serves the previous design.

## Before / after

| | File |
|---|---|
| Before (staging, 1905px) | `.design/before/staging-cart-1905.png` |
| After home 1440 / 390 | `.design/after/home-1440.png`, `home-390.png` |
| After discover 1440 / 390 | `.design/after/discover-1440.png`, `discover-390.png` |
| After product 1440 / 390 | `.design/after/pdp-1440.png`, `pdp-390.png` |
| After cart 1440 / 390 | `.design/after/cart-1440.png`, `cart-390.png` |

What changed in the first screen: gradient hero with a yellow "NIEUW" pill replaced by a paper hero with a serif display headline, a small-caps eyebrow, hairline rules and a featured object; marketplace-style cards replaced by image-led 4:5 crops; a dark rounded filter card replaced by hairline filters; the dark header bar replaced by a paper header with an underlined search field and one oxblood accent.

## Design system (full tokens in `.design/DESIGN.md`)

- **Type:** system serif display (Iowan Old Style → Palatino → Georgia) for headings, Inter for UI, small-caps tracked labels, tabular numerals for prices.
- **Palette:** paper `#FAF8F5`, ink `#17161A`, muted `#6B6660`, hairline `#E3DED7`, oxblood `#8C2F39` as the only accent. Yellow retired from the storefront.
- **Shape:** radius 2px, one shadow used only on the floating search suggestion list; every other separation is a hairline.
- **Space:** 4/8/12/16/24/32/48/64/96 scale, 1240px container, 32px desktop gutters.
- **Motion:** 220ms opacity/transform on hover, image scale 1.03, reduced-motion honoured.

## Changed files

| File | Change |
|---|---|
| `apps/marketplace/src/styles.css` | token layer: palette, serif display, type scale, radius, utilities (`brv-container`, `brv-eyebrow`, `brv-display`, `brv-btn`, `brv-btn-quiet`, `brv-link`, `brv-price`, `brv-media`) |
| `apps/marketplace/src/components/commercial/shop/shop-header.tsx` | paper two-row header, underlined search, quiet nav, oxblood cart count, editorial footer |
| `apps/marketplace/src/components/commercial/shop/shop-parts.tsx` | media 4:5 with quiet missing-media caption, tracked availability, square stepper, hairline notice, tabular totals, uppercase buttons |
| `apps/marketplace/src/components/commercial/shop/discovery-view.tsx` | editorial hero with featured object, hairline filter panel, wider listing rhythm |
| `apps/marketplace/src/components/product-card.tsx` | image-led card, serif title, oxblood rating, tabular price |
| `apps/marketplace/src/components/site-header.tsx` | same header treatment for non-isolated routes |
| `.design/PRODUCT.md`, `DIRECTION.md`, `DESIGN.md` | brief, three directions with rejections, tokens |

No route, hook, handler, query, data shape, copy meaning, migration or Supabase permission was touched. The demo ribbon and "geen echte bestelling of betaling" wording are unchanged.

## Evidence

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `bun run test:commerce` (commerce + catalog + shopping flow) | **27/27 pass** |
| Build (`build.mjs isolated`, Linux) | success, `.output` generated |
| HTTP `/`, `/discover`, `/product/prd_001`, `/cart` | 200 |
| Horizontal overflow at 1440 and 390 | none on all four pages |
| One `h1` per page, heading order | preserved |
| Focus ring, tap targets ≥44px on buttons/steppers | implemented in the shared primitives |

## Limitations (honest list)

1. **Product imagery is the existing placeholder.** The isolated catalogue has no real product photos; the design treats the placeholder honestly (labelled "voorbeeldafbeelding"). It cannot look like a photographed catalogue until real media exists.
2. **The PDP buy box is still a rounded, shadowed card** — the one surface that did not get the hairline treatment. Left as-is after two fix cycles rather than opening a third.
3. **Add-to-cart was not clicked end-to-end in this session**: the browser daemon timed out twice during the interaction. Cart and pricing behaviour is covered by the 27 passing commerce tests and the PDP screenshot shows the enabled "IN WINKELWAGEN" control, but the click itself is not proven here.
4. No Safari/Firefox pass, no screen-reader pass, no RTL exercise (the storefront ships Dutch only; the Arabic/RTL rules in DESIGN.md apply if enabled).
5. Not deployed: staging still serves the old design until you approve a deploy.
