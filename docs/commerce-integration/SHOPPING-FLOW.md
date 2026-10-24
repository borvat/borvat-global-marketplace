# Isolated guest shopping flow (branch `emergent/borvat-shopping-flow`)

Base: PR #31 `implementation/sku-pack-selection-2026-10-24` @ `0b20a0b`. It contains PRs #29 and #30. `main` holds only documentation.

## Scope

This is a test-only buyer journey inside the original TanStack Start application. It runs only when the build sets `VITE_BORVAT_RUNTIME=isolated`. The default build is unchanged: the new routes return 404 and the legacy checkout stays disabled.

- **Discovery:** search across title, category and description, without diacritics. Suggestions are a keyboard-accessible combobox. Filters cover category, price range in euros and "only deliverable". Sorting is by name, price low–high or price high–low. The page shows active-filter chips, a result count and states for empty, loading and error. You can simulate a catalog error with `?testfout=catalogus`.
- **Product page:** labelled placeholder media (the original binaries are still missing), a synthetic description and specs, SKU/variant/pack selection and seller choice. It shows price including VAT, availability, a quantity stepper, the test shipping rules and a notice that there are no reviews.
- **Cart:** stored in browser `localStorage` (`borvat.isolated-test-shop.v1`). The data is restored after hydration, so SSR stays deterministic. Quantity is limited to `min(availability, 10)`. Unavailable lines are flagged. Money is handled in integer cents.
- **Shipping:** Standaard costs €4,95, or is free from €50, with delivery in 2–3 workdays. Express costs €7,95, with delivery in 1 workday.
- **Guest checkout (`/afrekenen`):** validates the NL/BE address, phone and email. Payment options are iDEAL (test) and credit card (test); no card data is collected. The buyer must tick an explicit test-order acknowledgement. The submit button shows a loading state.
- **Orders:** `placeTestOrder` creates `TEST-XXXXXXXX` with an idempotency key, so double submits produce a single order. The cart is emptied afterwards. The confirmation page `/bestelling/:id` and the order history `/requests` survive a reload. They also appear in the seller/admin workbench.
- **Copy:** Dutch text lives in `src/components/commercial/shop/nl.ts`, ready for further dictionaries.

## What it does not do

There is no payment, PSP, carrier booking, email, WMS reservation, Accounting entry or server write. Isolated mode still rejects every non-GET request. Surooh WMS and Surooh Accounting remain the authorities for stock and accounting. Availability shown here is a read-only example projection.

## Reproduce

```bash
cd apps/marketplace && bun install --frozen-lockfile --ignore-scripts   # Bun 1.3.13
cd ../.. && npm run commerce:build:isolated                            # Node 24
cd apps/marketplace && npm run test:commerce                           # tsc + 22 node tests
HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs                   # open /discover
```

The earlier browser harness `scripts/commerce-integration/browser.mjs` asserts the previous buyer copy ("Bewaar demo-aanvraag", reload-reset). Those assertions are superseded by this flow and were not rerun here.
