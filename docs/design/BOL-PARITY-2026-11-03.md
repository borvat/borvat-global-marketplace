# BORVAT — bol.com reference parity (branch `fix/bol-parity-20261103`)

Owner directive: reproduce the reference composition, keep the BORVAT name, identity and data.
This round changed layout, proportions and type only. Inventory, payment, auth and the database were
not touched, nothing was merged and nothing was deployed.

## 1. Three separate verdicts

| Judgement | Result | Basis |
|---|---|---|
| Technical | **PASS** | gate stages 1–4: build, 27/27 tests, 2/2 E2E, axe 0, LCP 1458 ms · CLS 0.000 · TBT 15 ms |
| Reference match | **MEASURED, NOT IDENTICAL** | band geometry matches the reference within 1 px, see §3; imagery and assortment do not |
| Owner acceptance | **PENDING** | awaiting review of the comparison sheets |

## 2. The reference, and what could actually be inspected

Live `https://www.bol.com/nl/nl/` is unreachable from this machine: the page returns
`IP address is blocked` (recorded again this session, in Chromium). No VPN, proxy or user-agent
spoofing was used.

The reference used instead is the public Wayback snapshot, rendered in a real Chromium at the same
viewport as the local build:

| Page | Snapshot | Capture |
|---|---|---|
| Home | `web.archive.org/web/20261005195203/https://www.bol.com/nl/nl/` | `docs/design/reference/bol/bol-home-{1440,390}.png` + geometry JSON |
| Listing | `web.archive.org/web/20260615045304/https://www.bol.com/nl/nl/l/zwemvesten/25311/` | `docs/design/reference/bol/bol-listing-{1440,390}.png` + geometry JSON |

Still unavailable, therefore **not compared**:

- **Product detail page** — archived PDPs return 404/403; the PDP here follows the same measured system
  but has no pixel reference.
- **Cart** — the reference cart needs a session; no archived cart state exists.
- **Category tile imagery** — the archived homepage's tile images are missing from the snapshot (empty
  boxes in the reference column). Image-level comparison is impossible there; geometry was compared.

## 3. Measured comparison (1440)

Measured from the live DOM of both pages, not by eye.

| Element | Reference | BORVAT | Delta |
|---|---|---|---|
| Header total | 161 px | 161 px | 0 |
| Header bands | 32 white / 72 brand / 57 nav | 32 / 72 / 57 | 0 |
| Content container | 1216 box, 32 padding, content 1152 at x=144 | same | 0 |
| Search field | 512 × 48 | 512 × 48 | 0 |
| Hero band | 568 promo + 4×2 tiles, 311 tall | 568 + 4×2, 312 tall | +1 px |
| Category tile | 130 wide, 148 row, 98 image | 130 / 148 / 98 | 0 |
| Promo tiles | 6 columns × 172, gap 24, 229 tall | 6 × 172, gap 24, 229 tall | 0 |
| Section heading | 32 px / weight 300 / 48 lh | 32 / 300 / 48 | 0 |
| Product row | 6 columns | 6 columns, card 172 | 0 |
| Search x position | 343 | 273 | −70 px (wider logo block) |
| Header colour | `oklch(0.3249 0.2251 264.05)` | `#12357f` | different hue, same weight |

Two deliberate deviations:

1. **Cobalt, not bol blue.** Same saturation and depth, a different hue, so the identity stays BORVAT.
2. **A 30 px test banner above the header** (`TESTOMGEVING · Fictieve producten …`) shifts every band
   down by 30 px. It exists because the data is demo data and must be labelled.

## 4. What changed

- `styles.css`: cobalt palette, container 1216/32, header bands, 48 px search, borderless cards at 4 px
  radius, band/grid/promo/section/link-directory components, `minmax(0,1fr)` tracks.
- `shop-header.tsx`: three-band header, search with category scope, icons, 57 px nav row, country and
  language selectors, dark footer with the wordmark accent fixed.
- `discovery-view.tsx`: homepage rebuilt into the reference bands — hero (1 promo + 4×2 tiles), six
  172×229 promo tiles, 6-column product rows, "Ontdek alles" directory; placeholder cards reserve the
  rows while the catalogue loads.
- `product-view.tsx`: seller comparison table (seller · price · stock) and a related-products row.
- `routes/index.tsx`: preload for the hero image.

Copy correction found while reviewing the listing capture: cards promised **"Morgen in huis"** and the
header promised free 30-day returns. Neither is backed by the app — the shipping model computes cost at
checkout and there is no returns flow. Cards now read *Levertijd in checkout*, the strip reads
*Retourneren* without the free/days claim, and the same wording was fixed on the legacy PDP route and the
landing route. The demo label stays, but no delivery date is promised anywhere.

## 5. Artifacts

| Artifact | Path |
|---|---|
| Comparison sheet (side by side + overlay per page) | `docs/design/compare-v5/index.html` |
| Comparison sheet, rendered | `docs/design/compare-v5/side-by-side-1440.png` |
| First screen + difference overlay | `docs/design/compare-v5/first-screen.html`, `first-screen-1440.png` |
| BORVAT captures | `docs/design/visual/v5/borvat-{home,listing,pdp,cart}-{1440,390}.png` |
| Reference captures + geometry | `docs/design/reference/bol/` |
| Gate report | `docs/design/evidence/gate-bol-parity.json` |

## 6. Remaining differences, and why

| Area | Difference | Reason |
|---|---|---|
| Category tile imagery | Reference tiles show empty boxes | the archived snapshot lost those images |
| Hero promo | Reference hero is a blank blue ad slot in the snapshot | the real banner was not archived; ours carries a real article |
| Photography | Mixed studio shots, two of them wrong for their article (rug, cabinet) | Commons-licensed only; no studio shoot |
| Assortment | 9 articles, 2 categories; second row has 3 of 6 | fixture size, not layout |
| Ratings | none rendered | no review data in the fixtures |
| Mega menu | "Alle categorieën" is a link, not a panel | only two real categories exist; a panel would be empty |
| Test banner | 30 px strip above the header | demo data must be labelled |
| Search x position | 273 vs 343 | shorter wordmark block; width and height match |
| Delivery messaging | reference promises next-day | ours states the lead time is calculated at checkout, because no carrier data exists |

## 7. Preview

```bash
wsl -d Ubuntu -- bash -c 'cd ~/dsgn/apps/marketplace && PORT=4173 node .output/server/index.mjs'
# http://127.0.0.1:4173
```

Restore point before this branch: tag `restore/pre-bol-parity-20261103` at `6e4fe9d`.
