# Integration contracts, no live adapters

Canonical proposed REST and event schema live in docs/mission03/04-openapi.json and 05-events.json. Warehouse/Accounting/SAM/Carrier/PSP command/reply/error boundaries are in docs/mission03/09-integration-contracts.md. All identities, company_id and provider account contexts are reauthorized by receiver, not trusted from caller JSON.

No connector was activated. Existing e-Boekhouden permission remains read-only. Tests use fixture IDs and local fakes, with no customer mail, carrier booking, stock write or money movement. Contract tests do not certify live API compatibility. Stage C4 requires actual PSP sandbox evidence; C5 requires named test adapter evidence and future connector certification before live use.
