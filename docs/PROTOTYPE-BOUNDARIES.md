# BORVAT Domain Prototype — Scope and Limitations

The dependency-free files in `prototypes/` and `tests/` demonstrate only:
- Seller-specific offers for a shared product.
- Comparing offers within one specified market and currency.
- Integer-money commission rounding.
- A trivial seller-filtered in-memory order list.

Run from repo root: `node --test tests/*.test.mjs`.

These files are NOT MercurJS modules, not API access control, not RLS, not a checkout system, and are not production-safe authorization or payment logic. Never use a sellerId supplied by an untrusted client as an authorization credential. In real implementation, derive access from the authenticated session and enforce database-level filtering.

The example assumes currencies with conventional minor units and is *not* a complete currency model (e.g. zero-decimal or three-decimal currencies). Regional settings, VAT, settlement, fulfillment and FX are deferred until the Mercur runtime is installed and verified.
