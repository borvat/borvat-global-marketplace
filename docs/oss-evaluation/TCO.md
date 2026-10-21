# Total cost model — planning assumptions, not supplier quotes

Scenario: NL-only EUR MVP, 50 business sellers, 10,000 master products, 30,000 offers and 5,000 orders/month. This is a sizing assumption, not measured capacity. A loaded engineering day is assumed at **EUR 650**. Estimates include adaptation, three Surooh adapters, migration tooling, security/compliance engineering, acceptance and launch preparation; they exclude sunk work. Monthly maintenance includes patch triage, upgrades, regression tests, incident review and backup/restore work.

| Foundation | Initial engineering days / EUR | Maintenance days/month / annual EUR | Hosting, backups, observability EUR/month | 12-month subtotal EUR |
|---|---|---|---|---|
| Current + OSS components | 120–180 / 78,000–117,000 | 4–7 / 31,200–54,600 | 250–800 | **112,200–181,200** |
| Mercur + Surooh extensions | 65–100 / 42,250–65,000 | 3–5 / 23,400–39,000 | 350–1,000 | **69,850–116,000** |
| Medusa with custom marketplace | 110–160 / 71,500–104,000 | 3–5 / 23,400–39,000 | 350–1,000 | **99,100–155,000** |
| Vendure marketplace adaptation | 85–125 / 55,250–81,250 | 3–5 / 23,400–39,000 | 300–900 | **82,250–131,050** |
| Saleor + custom seller layer | 120–175 / 78,000–113,750 | 4–6 / 31,200–46,800 | 450–1,400 | **114,600–177,350** |

Formula: `initial_days × 650 + monthly_maintenance_days × 12 × 650 + monthly_hosting × 12`. These are independent engineering estimates with low-to-medium confidence, roughly ±40% sensitivity. They are not bids, current cloud prices or evidence of vendor performance. A 50-day upgrade/patch overrun adds EUR 32,500, which can erase much of Mercur's estimated saving. At EUR 900/day, labor costs rise about 38.5%; at EUR 500/day they fall about 23.1%.

OSS core license fees are assumed zero only for the applicable permissive/GPL paths. Commercial Vendure or Medusa Enterprise fees and support contracts are **unknown and excluded**, not assumed free. Mercur Enterprise is excluded. A mandatory commercial feature would require a new quote and may change the decision.

Also excluded: VAT/taxes, payment processing/Connect/refund/dispute/payout charges, KYB provider fees, carrier labels and storage/fulfillment labor, email/SMS usage, external legal/privacy/tax counsel, 24/7 staffing, search/media growth and company establishment. None is waived by using OSS. No paid resource or provider account was purchased.

Mercur's advantage comes from avoiding new seller/offer/order-split/commission engines; its cost risk comes from Medusa patch coupling, migration changes and permission/finance hardening. Current-core reuse preserves strong domain tests but still needs durable PSP orchestration, returns, reconciliation, moderation and the original UI's clean build. Vendure adds educational-plugin completion and license decisions. Saleor adds Python operations and a custom marketplace layer. Review these ranges after a small approved integration slice and an actual infrastructure quote; do not approve launch using this table alone.
