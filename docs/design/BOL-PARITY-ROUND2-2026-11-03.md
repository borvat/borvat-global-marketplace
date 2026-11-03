# BORVAT — bol.com parity, round 2 (branch `fix/bol-parity-20261103`)

This round answers eight specific corrections. Only layout, type, colour and copy changed: inventory,
payment, auth and the database were not touched, nothing was merged, nothing was deployed.

## 1. The reference was fixed first

The previous reference was an archive snapshot whose images and banners were missing, so it could not
support a parity claim. A snapshot sweep of the archive found one where every asset resolves:

| | |
|---|---|
| Snapshot | `20260507133613` |
| URL | `web.archive.org/web/20260507133613/https://www.bol.com/nl/nl/` |
| Assets | **29 / 29 images loaded** (checked in the DOM: `naturalWidth > 0`) |
| Viewports | 1440×900 and 390×844, full page, real Chromium |
| Captures | `docs/design/reference/bol/bol-complete-{1440,390}.png` + geometry JSON |

Live bol.com remains unreachable from this machine (`IP address is blocked`). No protection was
bypassed.

## 2. What each correction produced

| # | Correction | Result |
|---|---|---|
| 2 | Header | White utility strip 32 px, cobalt bar 72 px, **white navigation row** 57 px with a cobalt "Categorieën" pill, one rounded search field with no internal divider, "Land" and "Taal" selectors labelled separately |
| 3 | Surface | Body and cards white; borders `#e5e5e5`; no grey page background |
| 4 | Banner | Full-width 356 px promo: eyebrow, 44 px headline, body line, dark call-to-action button, image occupying 54% — BORVAT content, no invented discount |
| 5 | Category row | Categories only: Wonen, Tuin, and "Alle producten", each with image, short name and count. No product titles inside the grid |
| 6 | Promo row | Six service tiles with icon, title and one true line each (bezorging, retourneren, verkopen, betalen). No repeated product photo, no fake campaign |
| 7 | Type | Headings at the measured sizes with weight 700–800 in Inter; the thin 300 headings are gone. bol's Product/Graphik faces are proprietary and were not used |
| 8 | Composition | Second row: two cards plus a full-width workspace panel; blue service band with three items; white footer with five link columns and a legal bar |

Measured result at 1440: header **162 px** (reference 161), container **1216 px** with 1152 content at
x=144, banner **356 px**, category tiles 150 px image + meta. At 390 the header is **144 px**, exactly
the reference.

## 3. Comparison artifacts

| Artifact | Path |
|---|---|
| Comparison pack (side by side, overlay, mobile pair) | `docs/design/compare-v6/index.html` |
| Rendered sheet | `docs/design/compare-v6/sheet-1440.png` |
| First screen only | `docs/design/compare-v6/sheet-1440-first.png` |
| BORVAT captures, with the test strip | `docs/design/visual/v6/borvat-{home,listing,pdp,cart}-{1440,390}.png` |
| BORVAT captures, alignment version (strip removed) | same folder, `*-align.png` |
| Reference captures + geometry | `docs/design/reference/bol/bol-complete-*` |

The test-notice strip is kept in the preview and removed only in the `-align` captures used for the
alignment sheet, as instructed.

## 4. Remaining differences

| Area | Difference | Reason |
|---|---|---|
| Promo carousels | Reference runs two image carousels of campaign tiles; BORVAT runs one service tile row | Campaign copy and discounts would be invented; the panels carry real destinations |
| Category tiles | Reference six, BORVAT three | Only two categories exist in the catalogue |
| Assortment | Row of six, then two cards plus a panel | Nine articles; the composition is sized to the real content |
| Photography | Two photos do not represent their article | Commons-licensed material only |
| Ratings, badges, struck prices | Absent | No review or campaign data exists |
| Type | Inter instead of bol's Product/Graphik | Proprietary faces, not purchased |
| Product and cart pages | No reference capture | Not archived (404/403; the cart needs a session) |

## 5. Verification

Gate `vlab gate --config gate.config.borvat-storefront.json`:
**DEMO READY (production stages excluded by scope)** — build clean, 27/27 tests, 2/2 E2E, axe
0 serious/critical/0 moderate, **LCP 1448 ms · CLS 0.000 · TBT 17 ms**.
Evidence: `docs/design/evidence/gate-bol-parity.json`.

Two defects were caught by the gate and fixed during this round, not after: a serious contrast failure
on the cobalt service tile (grey text on cobalt), and the same failure reappearing through a CSS
specificity conflict that a utility class could not override.

## 6. Preview

```bash
wsl -d Ubuntu -- bash -c 'cd ~/dsgn/apps/marketplace && PORT=4173 node .output/server/index.mjs'
# http://127.0.0.1:4173
```

Restore point: tag `restore/pre-bol-parity-20261103` at `6e4fe9d`.
