# BORVAT — three visual directions (2026-11-02)

The v2 design was rejected as a product. This pack stops implementation and puts three
genuinely different directions in front of the owner as rendered interfaces, not prose.

Nothing in the application was changed for this pack: no route, component, migration or
deployment. The mockups are standalone HTML under `docs/design/directions-2026-11-02/`.

## Method

1. **References, multi-category.** bol.com was studied first (homepage + listing), live access
   blocked by an IP block and worked around with public archive snapshots — see
   `docs/design/BOL-ANALYSIS-2026-11-02.md`. Four more multi-category shops were captured the same
   way and are stored in `references/`: **Amazon.nl** (delivery bar, `All` scope select, promo
   tiles with mini product grids), **Zalando.nl**, **MediaMarkt.nl** and **Otto.nl**. Coolblue.nl
   answered 403 to the capture and is recorded as blocked rather than described. All of these are
   archive snapshots with partially missing styles, so they are used for structure and density
   only, never for colour or type decisions.
2. **Real, licensed imagery.** Fourteen product photos are downloaded from Wikimedia Commons
   (CC BY, CC BY-SA, public domain) with per-file credit in
   `docs/design/directions-2026-11-02/assets/ATTRIBUTION.md`. No competitor asset is reused.
3. **Three different decisions**, not palette swaps: different type systems, layout logic, colour
   roles, density and motion register.
4. **Rendered at both sizes** with Playwright at 1440×900 and 390×844, full page.

## A — Kiosk (dense practical marketplace)

White surfaces, cool grey page, red action, Inter at 13–14px, four-column grid, facet sidebar with
counts, three-tier header. Closest to a high-volume marketplace; the shopping path is the shortest
of the three.

- Screens: `shots/a-kiosk-1440.png`, `shots/a-kiosk-390.png`
- Strength: information density, familiar patterns, every card carries price, delivery, seller.
- Weakness: identity is thin — remove the logo and it could be any marketplace.

## B — Signaal (bold, modern, graphic)

Near-black canvas, lime accent, mono numerals, oversized headline, sticky search, three-column
cards with a floating add button, ticker strip with live shop signals.

- Screens: `shots/b-signaal-1440.png`, `shots/b-signaal-390.png`
- Strength: unmistakable, contemporary, strong for audio/tech and campaign traffic.
- Weakness: dark canvas across a whole assortment is heavy; premium categories lose warmth, and
  trust cues need more room than the layout gives them.

## C — Maison (premium marketplace with BORVAT's own identity)

Oxblood and warm paper, serif for product names, Inter for utility, curated row + dense listing band
+ PDP with a **seller comparison table** (three sellers, price and delivery per row).

- Screens: `shots/c-maison-1440.png`, `shots/c-maison-390.png`
- Strength: reads as a brand that curates, while the seller table makes the marketplace mechanics
  explicit; the product is the hero without an empty hero band.
- Weakness: depends on photography quality; mixed photo backgrounds show more here than in A.

## Scoring

1 = poor, 5 = strong. Scores are my judgement after looking at the renders, not measurements.

| Direction | Commercial appeal | Ease of shopping | Product clarity | Brand identity | Realism as a live shop | Risk |
|---|---|---|---|---|---|---|
| A Kiosk | 3.5 | 5 | 4.5 | 2.5 | 4.5 | reads generic |
| B Signaal | 4 | 4 | 4 | 5 | 3.5 | fatigue, trust |
| C Maison | 4.5 | 4 | 4 | 4.5 | 4 | needs photography |

**My recommendation:** C as the brand spine, with A's listing density and facet behaviour inside it.
If the owner wants one direction only, C is the one that can carry a premium price without hiding
the marketplace mechanics.

## Reference captures

| Shop | File | What it contributed |
|---|---|---|
| Amazon.nl | `references/amazon-nl.png` | delivery/location bar above the logo, `All` category scope inside the search field, promo tiles holding four mini product cards with `-10%` tags |
| Zalando.nl | `references/zalando-nl.png` | fashion grid rhythm and filter placement |
| MediaMarkt.nl | `references/mediamarkt-nl.png` | category strip density and product badges |
| Otto.nl | `references/otto-nl.png` | dense listing with price and delivery in one line |
| Coolblue.nl | — | blocked: 403 on capture, nothing claimed from it |

## Content gaps that no design can close

- No supplier or studio photography. The photos here are licensed third-party images shot on
  different backgrounds; a real assortment needs one seamless shooting standard, or supplier feeds.
- No review data, no order history, no real delivery promises per seller. The mockups show the
  components; they cannot show real social proof.
- Two real categories exist today (Wonen, Tuin). The navigation shows more because a marketplace
  needs a category system; those extra entries are structural placeholders and are labelled as such
  in the mockups' own demo navigation.

## What happens next

Pick a direction (or a combination) and only then does implementation start, on a fresh branch from
`work/inventory-single-writer`. Until then nothing is merged, deployed or spent.
