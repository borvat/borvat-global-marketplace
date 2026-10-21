# European requirements and payment design — as reviewed 21 October 2026

This is a product/engineering applicability study. Operator entity, size, contracts, seller residency, product origin and provider acceptance remain unknown. Requirements below become launch gates when applicable; legal text and Dutch implementation must be checked against the final operating model. Engineering controls may deliberately exceed exemptions. No live account setup or financial action was performed.

## Provider recommendation

Recommend **Stripe Connect as the MVP sandbox candidate**, subject to underwriting and a written account/charge/liability configuration. DNB's public register identifies Stripe Technology Europe, Limited, R161769, with EEA cross-border electronic-money services in the Netherlands. Registration supports provider status; it does not approve BORVAT's business, every jurisdiction or every Connect feature. [S01]

For the deliberately one-seller checkout MVP, evaluate **direct charges on the seller connected account plus application fee**, using hosted onboarding and hosted Checkout. Seller proceeds go to the seller's PSP balance, and the platform's fee to its PSP balance. No customer funds traverse BORVAT's ordinary bank account. Provider bank payouts and risk holds follow the approved provider contract; no homemade escrow or wallet. Stripe documents direct charges principally for SaaS/storefront-style models, so suitability for BORVAT's disclosed buyer-facing marketplace must be confirmed, not assumed. Fee responsibility, negative balances and dispute liability depend on configuration; the charge type alone does not settle all responsibility. [S02]

Model money flow: buyer→licensed PSP→seller connected balance/bank, plus agreed platform commission→platform PSP balance/bank. BORVAT records receivables/fees/statuses in a reconciliation subledger, not a spendable consumer balance. Platform fees need an actual commission invoice/credit and correct VAT treatment; application_fee is a collection mechanism, not the tax invoice itself.

For later multi-seller one-charge checkout, Stripe **separate charges and transfers** supports multiple sellers, but Stripe debits the platform balance for provider fees/refunds/chargebacks and a refund does not automatically reverse transfers. This is a materially different responsibility model and must not be slipped into MVP. Adyen for Platforms can be a later procurement comparison; no approval, cost or feature parity is asserted here. [S03]

### Settlement/reconciliation controls

- Versioned commission per seller/category/effective date, base (e.g. goods net excluding VAT/shipping), rounding and refund policy frozen on order line. Percentage is a commercial decision, not an invented default.
- Illustration only: goods gross €121, tax €21, commission base €100, rate 10%, platform service VAT €2.10 if domestic 21% treatment is confirmed. Application fee €12.10. Seller PSP proceeds €108.90 minus provider fees; tax payable and goods revenue stay in seller's accounting. No provider fee amount assumed. Other VAT treatment must not inherit this example.
- Partial return allocates refundable goods/tax/shipping and platform fee credit at cents level; original snapshots preserved. Refund application fee explicitly when policy/legal analysis calls for it; do not assume PSP processing fees are recovered.
- After payout, insufficient seller PSP balance triggers provider-supported recovery/deficit handling and a finance case. Do not promise instant refund or net out unrelated sellers. Consumer refund duties remain independent of internal recovery.
- Reconcile order allocation→payment/refund/fee→PSP balance movement→bank payout for each provider account and currency. Closed statement requires zero unexplained variance or explicitly approved exception; payout.paid is provider confirmation, not independent bank statement evidence. Track bank matching separately when bank data becomes available.

## Applicability and implementation matrix

| Regime | Applicability | Required product/data/control | Acceptance evidence |
|---|---|---|---|
| GDPR | EU establishment/targeting applies to this planned NL service | lawful purpose/basis per processing, minimal buyer/seller data, privacy notices, retention schedule, rights workflow, contracts defining controller/processor roles, secure access and international-transfer assessment. Seller/PSP are not automatically platform processors | cross-tenant/PII denial, SAR/export/erasure with lawful retention exception, private KYB documents, incident drill [S04,S05] |
| GDPR breach handling | risk-based notification duties | detect/record/triage breach, authority notification within 72 hours where required, high-risk affected-person communication and evidence log; no blanket assumption all incidents notify | timed tabletop and decision record [S06] |
| EU consumer rights / Dutch enforcement | B2C distance goods sales | disclose legal seller and platform role, total charges before order, payment obligation confirmation, durable contract copy, delivery complaint and conformity route, withdrawal notice and refund timelines/exceptions | accessible withdrawal function, partial/full return, statutory delivery-cost logic, delayed refund/complaint escalation [S07,S08] |
| Dutch withdrawal function | current official RVO page says in effect since 25 June 2026 | obvious cancellation/withdrawal function plus receipt/confirmation; distinguish notice of withdrawal from physical return authorization. Some earlier official notices mention 19 June; both dates precede planned launch; current detailed Dutch implementation must be reconciled before legal signoff | no forced customer-service approval before lodging notice; timestamps/confirmation test [S08] |
| DSA | service classification and operator size needed; not blanket SME exemption | Article 16 notice/action for hosting layer, reasoned moderation records; assess Article 19 platform exemptions and Article 29 marketplace-section exemption independently. Articles 30–32 include trader traceability/compliance design/customer information where applicable; classify enterprise with linked companies before relying on micro/small status | illegal-product reporting, traceable decisions/appeal route, seller public/private field separation, applicability memo [S09,S10] |
| DAC7 | assess whether BORVAT is a reporting platform operator and seller exclusions; payment facilitation/sales model matters | collect/verify legally required tax identity, residence/TIN/VAT/register data and consideration/fees/refunds by reporting period; reporting/export corrections, seller information and restricted access | goods-sale excluded-seller threshold test: fewer than 30 activities AND consideration ≤€2,000; exactly 30 or >€2,000 leaves that specific exclusion. Other exclusions assessed separately; threshold is not tax exemption [S11] |
| GPSR/product safety | ordinary non-food consumer goods in scope; category rules may add duties | manufacturer/responsible EU person where required, identifiers/photo/warnings visible on distance offer; marketplace Safety Gate contact/registration/processes, notices and recall notification capability | block unsafe/missing-data listing, recall affected buyers, safety queue deadlines [S12,S13] |
| VAT/OSS/deemed supplier | cannot decide merely from PSP fund flow or agent label | for NL MVP tax classification and platform commission VAT approved; for EU expansion evaluate OSS and electronic-interface deemed-supplier rules, invoice ownership and recordkeeping | no 21% hardcoded for all goods/fees; approved versioned treatment or quote blocked [S14] |

Additional gates: accessible consumer experience and applicable European Accessibility Act/small-service-enterprise exemption; seller terms/ranking and own-product treatment under applicable P2B rules; verified-review authenticity and lawful discount comparison claims. These are scoped legal checks before launch, not declarations that exemptions apply. Marketing/behavioral analytics wait until cookie/consent and direct-marketing conditions are assessed. Imported goods, biocides/rat poison, gas/flammables, medical claims, toys/electronics conformity and other regulated categories remain blocked until category-specific compliance is proven.

## Sources (official, checked during this mission)

- S01 DNB register: https://www.dnb.nl/en/public-register/information-detail/?registerCode=WFTEG&relationNumber=R161769
- S02 Stripe direct charges (hosted variant): https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted
- S03 Stripe charge models: https://docs.stripe.com/connect/charges and https://docs.stripe.com/connect/separate-charges-and-transfers
- S04 EDPB basics: https://www.edpb.europa.eu/sme/learn-the-basics/data-protection-basics_en
- S05 Commission GDPR principles: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en
- S06 EDPB breach guidance: https://www.edpb.europa.eu/topics/security-data-breaches/personal-data-breaches_en
- S07 Your Europe returns: https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm
- S08 RVO cancellation function: https://business.gov.nl/amendments/online-shops-must-have-cancellation-button/
- S09 Commission DSA Q&A: https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers
- S10 DSA official EUR-Lex index/search text: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=uriserv%3AOJ.L_.2022.277.01.0001.01.ENG ; direct page read was bot-blocked, so detailed applicability remains a pre-launch verification gate
- S11 Belastingdienst seller checklist: https://download.belastingdienst.nl/belastingdienst/docs/dac7-checklist-verkopers-al4811z1ed.pdf
- S12 Commission Safety Gate report: https://op.europa.eu/webpub/just/safety-gate-2025-report/en/
- S13 GPSR Commission implementation guidance: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AC_202506233
- S14 Commission VAT OSS: https://vat-one-stop-shop.ec.europa.eu/index_en

Official sources explain obligations and provider products; the proposed launch scope, controls and architecture are our design inference. This file does not assert final legal approval or guarantee provider eligibility.
