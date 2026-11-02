# PRODUCT.md — BORVAT storefront redesign brief

**Surface:** storefront (home, discover, product, cart) of the recovered BORVAT application.
**Mode:** isolated demo runtime. Synthetic catalogue, no real orders, no real payments. Copy must never imply otherwise.

## Who it is for

European household shoppers (NL/BE first, EUR, Dutch copy) buying considered objects for the home: furniture, kitchenware, lighting, small electronics. They compare, they read, they hesitate. They expect a shop that looks like it respects the products and their money.

## Three jobs

1. Make a first-time visitor trust the shop within five seconds of the hero.
2. Make browsing one object across a category feel calm, fast and legible.
3. Make the step from product to cart feel inevitable, with the price and what happens next always visible.

## Single commercial goal

Increase product-detail views per session by making discovery and listing pages worth scrolling, without changing any behaviour, pricing, inventory rule or API.

## Constraints

- Existing stack only: TanStack Start, React, Tailwind v4 (`src/styles.css` `@theme`), existing components. No new runtime dependency, no external font CDN (build runs with a no-network guard).
- Preserve every route, hook, Supabase call, cart rule and copy meaning. Visual layer only.
- No database migration, no Supabase permission change, no merge, no Render deploy.
- The demo ribbon and the "geen echte bestelling of betaling" statement stay visible and honest.

## What "premium" means here

Quiet European retail, not luxury theatre. Paper-white ground, ink typography, one restrained oxblood accent, an editorial serif for display, generous space, hairline rules instead of boxes and shadows, photography that is allowed to breathe. The opposite of the current surface: no gradient hero, no yellow pill badges, no card grid with drop shadows, no everything-left-aligned form look.
