# BORVAT — design package for owner review (2026-11-03)

A clickable prototype, not another storefront build. No application code, database or deployment
was touched. Direction: **Heirloom Modern** — a department-store system built on the approved A+C
combination (A's shopping mechanics, C's identity and seller logic).

## What is in the package

`C:/Users/Zulik/borvat-prototype/` — four pages served locally on **http://127.0.0.1:4180**:

| Page | File | What it demonstrates |
|---|---|---|
| Homepage | `index.html` | hero with a real product, category tiles, curated row, publisher-style deal band, trust band |
| Listing | `listing.html` | facets with counts, chips, sort, grid; filters and search actually work |
| Product | `product.html?id=prd_001` | gallery, three seller offers as a price ladder, quantity, add to basket, specs, illustrative-delivery notice |
| Cart | `cart.html` | grouped per seller, per-seller subtotal, one order summary, split-shipment note |

It is interactive, not a picture: sellers can be switched on the product page, quantities change,
articles land in the basket, and the cart recalculates from a single pricing function
(`priceCart`) shared with the product page.

## Design system

- **Ground and ink** bone `#F4F0E9` and `#16130F`; **accent** oxblood `#7A1F2B`; **detail** brass
  `#A98545`. One accent only, reserved for price movement, active facets and links.
- **Type** Iowan Old Style / Palatino for the brand voice (hero, section heads, product detail
  title); Inter for every control, label and price; tabular numerals in all money and counts.
- **Grid** 1320px shell, 4/3/2 product columns, 244px facet rail, 1–2px radii, hairline rules only.
- **Photography** every product sits on the same bone plate, contained with equal padding, multiplied
  onto the paper so mixed sources read as one catalogue.
- **Density** the home shows 4 + 3 products, 4 categories, a deal band and a trust band without a
  single empty decorative row; the listing fits 9 items in a 4-column grid beside its facets.

## Independent critique, and what I changed because of it

I reviewed the renders as a critic, not as the author. Cycle 1 findings and the fixes:

| Finding | Fix |
|---|---|
| The "floor lamp" photo was a church chandelier — fatal for credibility | replaced with a licensed floor lamp; the category tile now shows it |
| The deals band repeated the same four cards as the grid above | rebuilt as a horizontal savings list (article, seller, old price, saving, new price) |
| Cards fell off one baseline because a portrait photo grew its plate | images are absolutely positioned inside a fixed 1:1 plate; all four cards now end on one line |
| The Verlichting tile was an empty beige rectangle | tiles now contain the product on a plate instead of cropping a portrait photo |
| `vanaf € 749,00` repeated the price printed 8px below it | replaced with the seller count only |
| The prototype badge landed in the middle of full-page captures | hidden in capture mode (`?shot=1`) |

Cycle 2 review: hierarchy reads brand → category → product → proof; the price ladder on the product
page is the strongest marketplace signal; the cart's per-seller subtotals and the arithmetic check
line make the multi-vendor model legible.

## Functional proof (Playwright, this prototype)

| Check | Result |
|---|---|
| Offers on the product page | 3 sellers, selectable |
| Switching seller | price changes € 749,00 → € 1.349,00 on the second offer |
| Add to basket, two products, two sellers | 2 seller groups in the cart |
| Per-seller subtotals | € 1.498,00 + € 1.349,00 |
| Order total | € 2.847,00 — equals the sum, printed by the page itself |
| VAT | € 494,11 of the total |
| Mobile 390 | no horizontal overflow on any page; separate mobile layout (stacked hero, wrapped header, 2-column grid, sticky buy bar on the product page) |
| Empty cart | explicit empty state with a route back to the assortment |

## Accessibility

axe-core 4.14 on all four pages at 1440: **0 violations** (was 4 serious and 3 moderate before
this pass). What the audit forced:

- secondary text `#857C72` on bone measured 3.6:1 — darkened to `#6C645A`;
- the brass kicker measured 3.37:1 on white cards — darkened to `#8A6A2F`;
- the footer used `h4` under an `h1`, and the listing grid jumped `h1 → h3` — both fixed with real
  heading levels;
- the logo carried an `aria-label` that omitted its own visible text — replaced with the wordmark
  plus a visually hidden destination;
- page content sat outside landmarks — the service strip is now a labelled `section`, content sits
  in `main`, and the prototype badge is marked decorative.

## Screenshots

`shots/home-1440.png`, `home-390.png`, `listing-1440.png`, `listing-390.png`,
`pdp-1440.png`, `pdp-390.png`, `cart-1440.png`, `cart-390.png`.

## Remaining gaps (stated, not hidden)

1. **Two photos still misrepresent their article**: the "massief grenen" cabinet is a dark antique
   cupboard, and the "wollen vloerkleed" is a museum carpet. Wikimedia Commons has no clean studio
   shot for either. A supplier feed or one studio day closes this.
2. **Nine articles, two categories.** Enough to judge a system, not to look like a full assortment.
3. **Shipping, returns and stock are illustrative** and labelled as such in the header, the product
   trust list and the cart summary. No carrier or warehouse integration is implied.
4. **Checkout is deliberately absent** from the prototype; the button is inert and says the
   demonstration stops there.
5. Ratings are not shown anywhere because the fixture data has none.

## How to review

```bash
# the prototype server (already running on 4180)
wsl -d Ubuntu -- bash -c 'cd /mnt/c/Users/Zulik/borvat-prototype && python3 -m http.server 4180'
```
Open `http://127.0.0.1:4180/index.html` and click through: sort and filter on the listing, switch
seller on the product page, add two articles from different sellers, then open the cart.

Nothing is merged, deployed or spent. Implementation starts only after this direction is approved.
