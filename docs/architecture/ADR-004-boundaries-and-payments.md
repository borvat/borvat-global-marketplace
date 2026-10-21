# ADR-004 — System ownership and test-only payment boundary

Status: proposed for owner review.

Warehouse is the stock/reservation/pick/pack/return-disposition authority. Accounting owns legal document numbering and books, while Marketplace owns offers/order contracts and reconciliation allocations. SAM uses scoped reads and approved domain commands; it is never an SQL/superuser or payment-state authority. Contracts live in docs/mission03/09-integration-contracts.md and packages/integration-contracts.

MVP proposal: NL domestic, EUR, verified business sellers, one seller per checkout, multiple sellers/offers discoverable on central product. No live PSP/custody/wallet. Stripe Connect is a sandbox candidate only, contingent on business underwriting and exact responsibility/fee/refund agreement. No platform ordinary bank pass-through. One-charge multi-seller settlement is a later explicit design decision.

GDPR, consumer rights/withdrawal, DSA scope/exemptions, DAC7 operator/seller tests, product safety and VAT treatment require final operating-model review; the dated primary-source study is a baseline, not legal approval. Operator entity is not inferred from brand name.
