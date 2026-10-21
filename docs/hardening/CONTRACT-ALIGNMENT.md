# Cross-system contract alignment

Read-only source review:
- Accounting PR #23: `borvat/surooh-accounting@f8d250805548f9ab4e2730bd50a5b0150ec96828`, `contracts/event-envelope.schema.json` and `docs/evaluation/reuse-integration.md`. ERPNext 16 is a candidate, not a production approval.
- WMS PR #16: `borvat/surooh-commerce@35232d0a5015bcc39e7b91604d17a5259cafc464`, `src/lib/warehouse-command-contract.ts`; its architecture decision is unresolved. Do not assume Tryton is selected or deploy a second valuation ledger.
- SAM boundary carries forward the approved read/proposal restriction. No SAM job or connector was started; its live implementation/contract version was not independently certified here.

| Data/operation | Single authority | Contract alignment / conflict resolved in design |
|---|---|---|
| Master product merchandising, seller offer and commercial order | Marketplace | Map native opaque IDs to registry IDs; external aliases are unique per system/company/type. WMS UUID order IDs cannot receive raw `order_...` Mercur IDs |
| Physical stock/reservation/warehouse movement | WMS | Native marketplace inventory is a projection or delegated reservation port. Existing reviewed WMS gateway exposes progress commands, **not a proven reservation API**. Reserve/get/release port is still a required contract gap |
| Monetary inventory valuation and GL/COGS | Accounting's selected engine | Send legal owner/UOM/movement/cost/date facts from WMS; one valuation/posting owner. If both eventually use ERPNext, coordinate one authoritative stock valuation posting and separate UI/operations permissions |
| Fee policy and commercial allocation | Marketplace | Versioned commission facts; Accounting owns posted fee invoices/journals, numbering, credits and statutory validation. No independent second commission engine |
| PSP payment/refund/payout facts | Licensed PSP via authorized adapter | Surooh durable operation record and Accounting clearing reconcile the same provider references. Webhook/queue receipt is not financial finality |
| Invoice/credit/voucher/settlement clearing | Accounting | Its v1 envelope requires string schema_version `1.0`, company_id, event_version, source_ref, effective_date and evidence_refs. Previous generic Marketplace event envelope needs an explicit translator, not a rename |
| Monitoring / proposed actions | SAM | Allowlisted tenant-scoped projection; no buyer email/KYB documents, raw SQL, paid flag or native financial command authority |

The pure adapters in `experiments/mercur-hardening/contracts` test company binding, balanced integer amounts, v1 required fields, deterministic source IDs, UUID mapping, unsupported WMS actions and SAM PII/authority filtering. They are **8 local semantic contract probes**, not full JSON-schema business validation, authenticated gateway acceptance or a connected system test.

All consumers require a transactional inbox key `(consumer, company, event_id)` plus payload hash; changes on replay are conflicts. Producer outbox is post-commit, versioned and at least once. Acknowledgements distinguish received, accepted, posted/reconciled and rejected. Use bounded retry/jitter, expiry, DLQ and correlation IDs. Multi-company sites/companies are selected from trusted registry/session, never arbitrary body fields. Accounting/WMS outages preserve visible pending state; no fallback writes to a shadow ledger.

No modifications were made to either other repository or any connected service. Native contracts need joint owner review and actual isolated implementations before integration readiness can be claimed.
