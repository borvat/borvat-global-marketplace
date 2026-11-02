# bol.com reference study — BORVAT marketplace v2 (2026-11-02)

## Access: what could and could not be observed

| Attempt | Result |
|---|---|
| `https://www.bol.com/nl/nl/` through the collector (Playwright, chromium) | `IP address is blocked` — 77 nodes, h1 "IP address is blocked" |
| Same URL through the user's real Chromium profile | identical block page ("possible abuse from this IP address") |
| Internet Archive snapshot of the homepage (2026-10-05) | **rendered fully**: 4 180 nodes, 206 links, styled |
| Internet Archive snapshot of a category page `/nl/nl/l/zwemvesten/25311/` (2026-06-15) | **rendered fully**: 5 834 nodes, 231 links, styled |
| Internet Archive snapshots of product detail pages | 404 / 403 (the crawler's snapshots captured bol's block page) |

Per the analysis rules: no VPN, no proxy rotation, no UA spoofing, no anti-bot workaround.
bol.com's own IP block is reported as a finding, not defeated. The archived public snapshots are
used as the visual reference, and the product detail page is marked **غير متاح** below rather than
described as if it had been seen.

## What the homepage actually shows (مؤكد)

- **Utility strip** on top: three service claims left (free shipping from €25, same-day/evening/weekend
  delivery, free returns) and a loyalty entry right.
- **Search-first bar**: logo left, one dominant search field across the middle
  (placeholder "Waar ben je naar op zoek?"), account, wishlist, cart right.
- **Category row** directly under it: `Categorieën ⌄`, `Cadeaus & Inspiratie ⌄`, `Aanbiedingen ⌄`
  left; `Zakelijk`, `Cadeaukaart`, `Bestelstatus`, `Klantenservice`, country selector right.
- **Promo band**: one large campaign tile plus a grid of smaller category tiles, all image-led.
- **Product rows**: "Trending nu", "Trending Deals" — four to six cards per row, each card carrying
  image, title, price, discount, delivery line and rating.
- **Link farm** ("Ontdek alles bij bol") with six columns of category links, then a blue footer with
  service, contact and payment blocks.

## Listing page anatomy (مؤكد, measured on the 1440 capture)

| Element | Observed |
|---|---|
| Breadcrumb | `🏠 › Sport › Watersport › Zwemvesten`, 12 px, above the H1 |
| H1 | category name, bold, ~32 px, followed by a two-line SEO intro and a "Lees meer" link |
| Applied filters | chips row under the intro, with a scroll arrow |
| Result bar | `361 resultaten` left; `Sortering [Populariteit ⌄]` and a view toggle right |
| Facet column | ~230 px wide, groups (Doelgroep, Merk, Geslacht, Maat, Kleur), each a checkbox list with counts, "Meer" expansion, collapsible headers |
| Grid | 3 columns at 1440 in this capture, ~14 px gutters |
| Card | image on a very light grey field with rounded corners and a heart button top-right, then two-line title, then price (bold) with a red discount label, then delivery line, then rating, then seller |
| Pagination | numbered strip at the bottom |

## Product detail page (غير متاح)

No archived PDP rendered, so the PDP layout is **not** presented as observed. The rebuild uses the
patterns the cards and the mandate establish: gallery left, sticky buy box right with price,
delivery, seller, quantity and CTA, then description, specifications and reviews blocks.

## Type, colour and shape (مؤكد from the captured pages)

- Type: a single sans family throughout; hierarchy is built from weight and size (12 / 13 / 14 / 16 /
  32 px), not from a second typeface.
- Colour roles: near-black text `oklch(0.1867 0 0)`, white surfaces `oklch(1 0 0)`, a saturated blue
  brand `oklch(0.3249 0.2251 264.05)` used for the bar, links and primary actions, a green
  `oklch(0.4795 0.1036 161.98)` for delivery/stock, and a red used only for discount and error.
- Density: the listing fits ~361 products into a 3-column grid with a 230 px facet column; no
  decorative whitespace, no oversized type.

## What was deliberately not copied

No bol.com logo, brand blue, yellow, illustrations, copy or page composition. BORVAT keeps its own
identity: oxblood accent `#a11d2a`, graphite ink `#12141a`, 6 px corners, Inter, and its own
information architecture (two live categories, not a fake mega menu).

## What the rebuild borrows structurally

1. Three-tier header: utility claims → search-first bar → category row.
2. Facet column with counts and a results bar that states the count before the sort control.
3. Dense card grid where price, delivery and seller sit on fixed rows, so a row shares one baseline.
4. Delivery and seller signals on the card, not only on the PDP.
5. A homepage built from service claims, a promo band and product rows — not an editorial hero.
6. A PDP whose buy box answers price, stock, delivery, seller and CTA before anything decorative.

## Evidence files

- `C:/Users/Zulik/web-intel/reports/bol-com/home/report.json` + `home-desktop.png`, `home-mobile.png`
- `C:/Users/Zulik/web-intel/reports/bol-com/arch-home/` (archived homepage, 4 180 nodes)
- `C:/Users/Zulik/web-intel/reports/bol-com/arch-category/` (archived listing, 5 834 nodes)
- `C:/Users/Zulik/web-intel/reports/bol-com/cat-top-1440.png`, `cat-cards-1440.png`, `home-cards-1440.png`
