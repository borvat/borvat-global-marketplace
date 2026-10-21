# BORVAT PHASE 5 EXECUTION SPEC V1.0

## Borvat Direct & Founding Merchant Alpha

**الحالة:** Approved for implementation — Not completed  
**الإصدار:** 1.0  
**التاريخ:** 24 يوليو 2026  
**المالك وصاحب الموافقة النهائية:** مؤسس Borvat  
**المرجع الأعلى:** `BORVAT_MASTER_BLUEPRINT_V1.md`  
**الملفات الإلزامية المصاحبة:**

- `BORVAT_CURRENT_STATE_V1.md`
- `BORVAT_DECISION_LOG_V1.md`
- `README_BORVAT_GOVERNANCE.md`

---

# 0. النص الملزم للمبرمج قبل البدء

> اقرأ `BORVAT_MASTER_BLUEPRINT_V1.md` و`BORVAT_CURRENT_STATE_V1.md` و`BORVAT_DECISION_LOG_V1.md` وهذه الوثيقة كاملًا قبل تعديل أي كود أو Migration. Phase 5 ليست إعادة بناء للنظام، وليست مشروعًا جديدًا موازيًا. يجب إعادة استخدام النواة المقفلة من Phases 1–4، وعدم إنشاء مصدر حقيقة ثانٍ للمنتجات أو المخزون أو الطلبات أو الشحن. لا تُعد المرحلة مكتملة بسبب نجاح الاختبارات فقط؛ يلزم تقرير Traceability، إعادة بناء من بيئة نظيفة، إثبات RLS، تشغيل E2E فعلي، وتحديث Current State وDecision Log.

## 0.1 قاعدة منع التخمين

قبل إنشاء أي جدول أو RPC جديد:

1. افحص الجداول والوظائف والأنواع الموجودة.
2. حدد إن كان الكيان المطلوب موجودًا باسم مختلف.
3. وثق قرار `reuse / extend / migrate / deprecate`.
4. لا تنشئ جدولًا موازيًا لمجرد أن الاسم الحالي غير مريح.
5. أي تعارض بين Phase 0 وPhases 2–4 يجب حله عبر Migration انتقالية موثقة، لا عبر تجاهل النظام القديم.

## 0.2 قاعدة المراحل المقفلة

- لا تعدل Migrations المقفلة الخاصة بـPhases 1–4.
- جميع تغييرات Phase 5 تكون Additive Migrations جديدة.
- أي Hotfix يحتاج Migration مستقلة، سببًا موثقًا، واختبار Regression.
- لا يتم فتح Bol Live ضمن Phase 5.

---

# 1. اسم المرحلة وغايتها

## 1.1 الاسم الرسمي

**Phase 5 — Borvat Direct & Founding Merchant Alpha**

## 1.2 الغاية التجارية

تحويل Borvat من نواة تجارة قوية وربط Bol جاهز تقنيًا إلى **قناة بيع مستقلة قابلة للتشغيل فعليًا** تستطيع الشركات الست المؤسسة استخدامها كبائعين مستقلين، من عرض المنتج وحتى الدفع والشحن والمرتجع، دون اعتماد تشغيلي على Bol.

## 1.3 الغاية التقنية

ربط النواة الحالية للـTenancy والكتالوج والمخزون والحجز والتنفيذ وOutbox مع:

- واجهة Borvat Direct الإنتاجية.
- Storefront لكل تاجر.
- Shipping Profiles واقتباس شحن حتمي.
- Multi-merchant cart and checkout.
- Parent order + merchant suborders.
- Stripe test-mode payment orchestration عبر Payment Adapter.
- Seller Dashboard تشغيلي.
- Admin Operations Dashboard.
- Source-aware communications and packaging policy.
- Founding Six onboarding.
- SaaS usage metering and invoice-preview foundation.

## 1.4 نتيجة النجاح

في نهاية Phase 5 يجب أن يستطيع عميل حقيقي ضمن Beta محدودة:

1. تصفح منتجات منشورة من أكثر من شركة.
2. رؤية سعر المنتج شامل الضريبة، والشحن كبند منفصل.
3. وضع منتجات من عدة تجار في سلة واحدة.
4. الحصول على Shipping Quote صحيح لكل تاجر/مركز تنفيذ.
5. تنفيذ Checkout تجريبي آمن.
6. حجز المخزون ذريًا.
7. إنشاء Parent Order وMerchant Orders منفصلة.
8. دفع الطلب عبر Stripe test mode.
9. تجهيز وشحن كل Merchant Order بصورة مستقلة.
10. استلام رسائل تشغيلية صحيحة المصدر.
11. طلب مرتجع واسترداد تجريبي.
12. رؤية التاجر للطلب والمخزون والشحن والاستخدام من Seller Dashboard.
13. إدارة Borvat للتاجر والمنتجات والمخاطر من Admin Dashboard.

---

# 2. نطاق Phase 5

## 2.1 داخل النطاق

### A. Borvat Direct Marketplace

- Production hardening للواجهة الحالية.
- Public merchant storefronts.
- Active product/listing discovery.
- Seller attribution.
- Search/filter/category compatibility مع النواة الحالية.
- Customer account, addresses, order history and tracking.

### B. Pricing, VAT and Shipping

- سعر B2C شامل VAT.
- الشحن منفصل عن سعر المنتج.
- Shipping profiles data-driven.
- Paid shipping.
- Free shipping per product/profile.
- Free shipping above threshold per seller.
- Quote snapshots and expiry.
- دعم NL وBE كبلدين أوليين، دون Hardcoding معدلات الضريبة في الواجهة.

### C. Cart, Checkout and Direct Orders

- Multi-merchant cart.
- Grouping by merchant and fulfillment node.
- Deterministic quote.
- Atomic reservation across checkout.
- Parent marketplace order.
- Merchant suborders.
- Immutable price/tax/shipping snapshots.

### D. Payments and Refund Foundation

- PSP abstraction.
- Stripe test-mode implementation.
- Webhook verification.
- Payment idempotency.
- Full and partial refund in test mode.
- No production custody or seller payout.

### E. Seller Dashboard

- Actionable operations dashboard.
- Store settings.
- Catalog/listings.
- Inventory and reservations.
- Orders, fulfillment, returns.
- Shipping labels/status.
- Channel sync visibility.
- SaaS usage preview.
- Team permissions.
- AI suggestions with approval gates.

### F. Admin Dashboard

- Merchant onboarding and review.
- Store activation/suspension.
- Listing moderation.
- Risk and exception queues.
- Support access sessions.
- Feature flags and kill switches.
- Platform operational metrics.

### G. Communications and Compliance

- Transactional email outbox.
- Template versioning.
- Source-aware branding policy.
- Packaging/insert policy metadata.
- Consent recording.
- No Borvat marketing on external-channel orders unless legally and contractually allowed.

### H. Founding Six Onboarding

- Six companies as normal tenants.
- One synthetic seventh company acceptance test.
- Catalog, inventory, warehouses, members and store setup.
- Dry-run imports and reconciliation.

### I. SaaS Metering Foundation

- Order usage events.
- Idempotent counting.
- Plan assignment.
- Tier-aware invoice preview.
- No automatic real charging in Phase 5.

## 2.2 خارج النطاق

- Bol Live activation.
- Amazon, Shopify or eBay production adapters.
- Real seller payouts or custody of seller funds.
- Production wallet with withdrawable money.
- Full accounting/ERP.
- Full auction settlement engine.
- Advanced loyalty redemption.
- Full WMS optimization, route planning or robotics.
- Cross-border tax engine beyond the controlled NL/BE alpha requirements.
- Public self-service onboarding at uncontrolled scale.
- Live Stripe marketplace settlement unless separately approved after legal/PSP review.

---

# 3. المبادئ غير القابلة للتفاوض

## 3.1 Borvat هي المركز

- `Borvat Core` هو مصدر الحقيقة.
- Bol أو أي Channel Adapter هو طرف خارجي.
- لا تعتمد Borvat Direct على API خارجي لإتمام طلبها الداخلي.

## 3.2 الشركات الست ليست حالات خاصة

- لا Hardcoding للأسماء أو IDs.
- `founding_merchant` صفة تجارية Configurable فقط.
- الشركة السابعة الاختبارية يجب أن تعمل دون تعديل كود.

## 3.3 مصدر حقيقة واحد لكل مجال

- Product identity: مصدر واحد.
- Sellable SKU: مصدر واحد.
- Inventory ledger/balance: مصدر واحد.
- Reservation engine: مصدر واحد.
- Canonical order: مصدر واحد.
- Shipment truth: مصدر واحد.
- لا جداول موازية تنفذ المنطق نفسه.

## 3.4 كل عملية حساسة Server-side

العميل لا يكتب مباشرة في:

- inventory transactions.
- reservations.
- order totals.
- payment status.
- refund state.
- usage billing events.
- merchant activation.
- listing moderation.

يتم ذلك عبر RPC/Service موثوق وصلاحيات واضحة.

## 3.5 Idempotency في كل حدود خارجية

إلزامية في:

- checkout creation.
- reservation.
- payment intent creation.
- PSP webhooks.
- order creation.
- refund.
- shipping label creation.
- communication enqueue.
- usage metering.

## 3.6 Auditability

كل تغيير حساس يسجل:

- actor.
- company/store.
- action.
- before/after أو event payload آمن.
- source.
- idempotency key.
- timestamp.
- correlation/trace ID.

لا تُسجل Tokens أو Secrets أو بيانات دفع حساسة.

---

# 4. الحدود المعمارية المطلوبة

## 4.1 العلاقة بين الطلبات الداخلية والخارجية

- `channel_order_inbox`: سجل استقبال خام للقنوات الخارجية.
- `channel_orders`: تمثيل الطلب الخارجي المستورد إن كان هذا هو التصميم الحالي.
- `canonical/internal order`: الحقيقة التشغيلية التي تحجز المخزون وتُنفذ.
- طلب Borvat Direct ينشئ الحقيقة الداخلية مباشرة ولا يمر عبر Inbox خارجي.
- لا يجوز أن يوجد مساران مختلفان لحجز المخزون بين طلب Borvat وطلب Bol.

## 4.2 علاقة Listing Borvat بالقنوات

الخيار المفضل:

- تمثيل Borvat كقناة داخل نموذج `channel_listing` الحالي (`channel = borvat`) إذا كان النموذج يسمح دون تشويه.

الخيار البديل:

- Extension table خاصة بخصائص Marketplace فقط، مرتبطة بالـcanonical listing/SKU.

ممنوع:

- نسخ المنتج والمخزون إلى `marketplace_products` مستقلة تصبح مصدر حقيقة ثانٍ.

## 4.3 Events and Outbox

يجب استخدام Outbox الحالية أو Stream جديدة مبررة للأحداث التالية:

- listing published/unpublished.
- checkout reserved.
- payment succeeded/failed.
- order created.
- merchant order created.
- shipment created/status changed.
- return requested/approved/refunded.
- communication requested.
- SaaS usage recorded.

كل Event يحتوي:

- event ID.
- aggregate type/id.
- company ID عند الحاجة.
- event version.
- occurred_at.
- correlation ID.
- causation ID.

---

# 5. نموذج البيانات المنطقي

> الأسماء التالية Logical Names. على المبرمج مطابقتها مع الموجود وإعادة الاستخدام أولًا. أي اختلاف أسماء يجب توثيقه في تقرير Phase 5.

## 5.1 Merchant Store

### `merchant_stores`

حقول أساسية:

- `id`
- `company_id`
- `slug` unique
- `display_name`
- `legal_display_name`
- `status`: `draft | pending_review | active | suspended | closed`
- `default_locale`
- `default_currency`
- `customer_service_email`
- `return_policy_version_id`
- `shipping_origin_id`
- `founding_merchant` boolean/config flag
- `created_at`, `updated_at`

### قواعد

- متجر واحد أو أكثر لكل شركة حسب قرار التصميم، لكن كل متجر مربوط بشركة واحدة فقط.
- `slug` لا يعاد استخدامه مباشرة بعد الإغلاق دون سياسة واضحة.
- لا يظهر متجر Public إلا إذا كان `active`.
- تعليق المتجر يمنع Checkout جديدًا ولا يلغي الطلبات القائمة تلقائيًا.

## 5.2 Marketplace Publication

يجب أن تحتوي الـlisting المنشورة على Snapshot/Configuration يشمل:

- company/store.
- canonical SKU.
- publication status.
- gross consumer price.
- tax category.
- shipping profile.
- sales limits.
- availability window.
- moderation status.
- content version.

Statuses:

`draft | pending_review | active | paused | rejected | archived`

## 5.3 Customer

### كيانات مطلوبة

- `customer_profiles`
- `customer_addresses`
- `customer_consents`
- `customer_order_access`

### قواعد

- العميل يرى بياناته وطلباته فقط.
- عنوان الطلب يؤخذ Snapshot ولا يتغير بتعديل العنوان المحفوظ لاحقًا.
- Marketing consent منفصل عن transactional necessity.

## 5.4 Shipping

### كيانات منطقية

- `shipping_profiles`
- `shipping_zones`
- `shipping_methods`
- `shipping_rules`
- `shipping_quote_snapshots`

### أنواع القواعد

- fixed price.
- weight-based.
- price threshold.
- per-item surcharge.
- free shipping.
- pickup.
- fulfillment-managed.

### الحقول الحرجة في Quote

- quote ID.
- seller/store.
- fulfillment node.
- destination country/postcode zone.
- method.
- merchandise subtotal gross.
- discounts.
- shipping gross.
- tax breakdown.
- rule/version IDs.
- `expires_at`.
- hash/signature of inputs.

## 5.5 Cart and Checkout

### كيانات منطقية

- `carts`
- `cart_items`
- `cart_quote_versions`
- `checkout_sessions`

Statuses:

- Cart: `active | quoted | checkout_pending | converted | expired | abandoned`
- Checkout: `created | reserving | reserved | payment_pending | paid | failed | expired | cancelled`

### قواعد

- السلة ليست مصدر سعر نهائي.
- كل Checkout يستخدم Quote version ثابتة.
- أي تغير في السعر أو المخزون أو الشحن بعد انتهاء Quote يفرض Requote.
- `client_request_id` فريد لكل محاولة إنشاء Checkout.

## 5.6 Orders

### النموذج المطلوب

- Parent Marketplace Order للعميل والدفع الإجمالي.
- Merchant Order لكل شركة/fulfillment node.
- Order Lines مرتبطة بـMerchant Order.

### Snapshots إلزامية

- product title.
- SKU/EAN.
- seller identity.
- quantity.
- unit gross/net/tax.
- discounts.
- shipping allocation.
- tax jurisdiction inputs.
- commission rule/version.
- fulfillment node.
- customer shipping/billing address.

### حالات Parent Order

`pending_payment | paid | processing | partially_shipped | shipped | partially_delivered | delivered | cancelled | partially_refunded | refunded`

### حالات Merchant Order

`pending | accepted | processing | packed | partially_shipped | shipped | delivered | cancelled | return_in_progress | partially_refunded | refunded`

## 5.7 Payments

### كيانات منطقية

- `payment_attempts`
- `payment_provider_events`
- `payment_allocations`
- `refunds`
- `refund_events`

### قواعد

- لا يتم اعتبار الطلب مدفوعًا من Redirect في Frontend.
- المصدر الموثوق هو Webhook verified أو Provider status verified.
- amount/currency/order binding يجب أن تتطابق.
- duplicate webhook لا ينشئ دفعًا أو Order ثانيًا.
- لا تخزن card data.

## 5.8 Returns

### كيانات منطقية

- `return_requests`
- `return_items`
- `return_events`
- `return_inspections`

Statuses:

`requested | approved | rejected | label_issued | in_transit | received | inspected | refund_pending | refunded | closed`

## 5.9 SaaS Metering

### كيانات منطقية

- `subscription_plans`
- `merchant_subscriptions`
- `usage_events`
- `billing_periods`
- `invoice_previews`
- `invoice_preview_lines`

### Usage Event key

يجب أن يمنع العد المكرر بواسطة مفتاح مثل:

`company_id + source_order_id + billable_event_type + plan_version`

---

# 6. قواعد التسعير والضريبة والشحن

## 6.1 عرض السعر للمستهلك

إلزامي:

- سعر المنتج الظاهر B2C شامل VAT.
- الشحن منفصل وواضح.
- لا إضافة رسوم إلزامية مفاجئة في آخر خطوة.
- إجمالي Checkout يعرض breakdown كاملًا.

## 6.2 Free Shipping Threshold

يُحسب:

- لكل Seller/Store، وليس على السلة كلها.
- على merchandise subtotal لذلك البائع.
- بعد خصومات المنتج وقبل الشحن.
- وفق Gross consumer amount ما لم يعتمد قرار مختلف لاحقًا.
- لا يجمع بائعين مختلفين للوصول إلى Threshold واحد.

## 6.3 تعدد مراكز التنفيذ

إذا كان البائع يشحن من أكثر من Fulfillment Node:

- إما Quote منفصلة لكل Node.
- أو Consolidation rule موثقة.
- لا تفترض شحنة واحدة دون دليل.

## 6.4 تغير السعر أثناء السلة

- السلة تعرض سعرًا تقديريًا.
- عند Checkout يتم Quote نهائية.
- بعد `reserved` يحفظ السعر خلال مدة الدفع المحددة.
- إذا انتهت الجلسة، تُحرر الحجوزات ويطلب Requote.

## 6.5 الضرائب

- لا Hardcoding لمعدل VAT في React components.
- Tax category/rate resolution تكون Server-side وVersioned.
- Alpha الأولى تدعم NL وBE بوضوح.
- إذا تعذر تحديد الضريبة يقفل Checkout بدل التخمين.

---

# 7. Checkout Orchestration

## 7.1 التسلسل الإلزامي

1. Validate customer and destination.
2. Resolve active listings and merchant/store status.
3. Recalculate prices, discounts, VAT and shipping.
4. Create immutable quote version.
5. Atomically reserve all required inventory.
6. Create checkout session in `reserved` state.
7. Create/reuse payment intent with idempotency key.
8. Wait for verified payment result.
9. On payment success: create/finalize parent order and merchant orders once.
10. Emit outbox events.
11. On failure/expiry: release reservations exactly once.

## 7.2 Atomicity decision

Phase 5 default:

> Checkout reservation is all-or-nothing across the full cart. إذا تعذر حجز أي سطر، لا يتم قبول جزء من السلة ولا إنشاء طلب مدفوع جزئيًا.

أي تغيير مستقبلًا إلى partial checkout يحتاج Decision Log جديدًا.

## 7.3 Idempotency

نفس `client_request_id` مع نفس payload:

- يعيد نفس checkout/session.

نفس المفتاح مع payload مختلف:

- يرفض بخطأ conflict محدد.

## 7.4 Concurrency

يجب إثبات:

- آخر قطعة لا تُباع مرتين.
- Checkoutين متزامنين لا يحصلان على reservation نفسها.
- expiry worker لا يحرر reservation تحولت إلى paid.
- payment success المتزامن مع expiry يعالج بترتيب آمن.

---

# 8. Payments and Refunds

## 8.1 Phase 5 payment posture

- Stripe test mode فقط للإغلاق الرسمي للمرحلة.
- Payment Adapter interface عام.
- لا Seller Payout live.
- لا Wallet custody live.

## 8.2 Provider Adapter contract

الحد الأدنى:

- `create_payment_intent`
- `get_payment_status`
- `verify_webhook`
- `create_refund`
- `get_refund_status`

## 8.3 Payment invariants

- Payment amount يساوي Order total snapshot.
- Currency ثابتة عبر Checkout/Payment/Order.
- لا يمكن للعميل تعديل amount من Frontend.
- كل Provider event يسجل مرة واحدة.
- فشل إنشاء order بعد نجاح الدفع يدخل Recovery Queue، ولا يُعاد تحصيل المبلغ.

## 8.4 Refund foundation

يدعم:

- full refund.
- partial line refund.
- shipping refund optional by policy.
- reason codes.
- provider reconciliation.
- order refund status derived from refund events.

---

# 9. Seller Dashboard Requirements

## 9.1 الصفحة الرئيسية

لا تكون Dashboard شكلية. يجب أن تعرض Action Queues:

- orders needing action.
- shipments due today.
- low stock.
- failed syncs.
- returns awaiting review.
- listings rejected/paused.
- billing usage.
- unresolved exceptions.

## 9.2 Store Management

- store identity.
- customer service details.
- return policy.
- shipping origin.
- vacation/pause mode.
- public status preview.

## 9.3 Catalog and Listings

- canonical products/SKUs.
- Borvat publication.
- channel listing status.
- price and shipping profile.
- moderation feedback.
- bulk import with dry-run.

## 9.4 Inventory

- on-hand.
- reserved.
- available.
- damaged/quarantine if supported.
- ledger history.
- warehouse/location.
- no direct balance editing.

## 9.5 Orders and Fulfillment

- filter by status/date/source.
- merchant order details.
- pick/pack/ship.
- label creation.
- cancellation rules.
- customer-safe notes.
- audit events.

## 9.6 Returns

- request review.
- approve/reject with reason.
- return label.
- receive/inspect.
- refund request.

## 9.7 Channels

- connection health.
- sync runs.
- findings.
- read-only/shadow/live flags.
- Bol live remains locked.

## 9.8 Billing Usage

- current billing period.
- counted orders.
- excluded/non-billable orders.
- expected rate tiers.
- invoice preview.
- line-level audit drill-down.

## 9.9 Team and Permissions

UI actions map إلى permissions الموجودة، مثل:

- catalog manage.
- inventory manage.
- orders manage.
- fulfillment manage.
- billing view.
- company admin.

لا تعتمد الصلاحية على إخفاء زر فقط؛ Server authorization إلزامي.

---

# 10. Admin & Operations Dashboard

## 10.1 Merchant Lifecycle

- application/draft.
- review.
- approved.
- active.
- restricted.
- suspended.
- closed.

كل تغيير يحتاج:

- reason.
- actor.
- effective time.
- audit entry.

## 10.2 Store and Listing Moderation

- pending stores.
- pending/rejected listings.
- compliance evidence.
- intellectual property concerns.
- unsafe/prohibited products.
- appeal/review notes.

## 10.3 Support Access

لا يوجد Super Admin صامت.

المطلوب:

- support access session.
- ticket/reason.
- scope.
- expiry.
- actor.
- actions audited.
- optional merchant notification policy.

## 10.4 Feature Flags and Kill Switches

على الأقل:

- marketplace checkout global.
- checkout per merchant.
- payments.
- shipping label creation.
- communications.
- SaaS metering.
- channel dispatch.

## 10.5 Risk Queues

- payment mismatch.
- repeated failed checkout.
- inventory drift.
- unusual refund rate.
- prohibited listing.
- cross-tenant access attempts.
- worker dead letters.

---

# 11. Communications & Channel Compliance

## 11.1 Transactional Message Types

- account verification.
- order confirmation.
- payment confirmation/failure.
- processing.
- shipment and tracking.
- delivery.
- cancellation.
- return updates.
- refund.

## 11.2 Source-aware policy

### Borvat Direct order

- Borvat-branded transactional email.
- merchant identity visible as required.
- Borvat packaging/discount/referral rules allowed according to consent and policy.
- loyalty eligibility can be enabled later.

### External channel order

- communication and packaging follow channel policy.
- no automatic Borvat marketing.
- no referral insert that violates channel rules.
- customer data used only for permitted fulfillment/support purposes.

## 11.3 Communication Outbox

- templates versioned.
- enqueue idempotent.
- send attempts recorded.
- PII minimized in logs.
- failed sends retried.
- customer-visible status does not depend on email delivery success.

---

# 12. Founding Six Onboarding

## 12.1 Onboarding sequence per company

1. Create/verify company tenant.
2. Verify owner/members/roles.
3. Create merchant store in draft.
4. Configure warehouses and locations.
5. Import catalog dry-run.
6. Resolve SKU/EAN conflicts.
7. Import inventory through trusted opening-balance process.
8. Reconcile ledger to imported balance.
9. Configure Borvat listings.
10. Configure shipping profile.
11. Configure customer service and returns.
12. Configure channel connections.
13. Run tenant security tests.
14. Activate store in controlled alpha.

## 12.2 Import requirements

- no direct SQL copy without import record.
- import batch ID.
- source file/system.
- row-level status.
- duplicate detection.
- dry-run result.
- commit/rollback behavior.
- reconciliation report.

## 12.3 Seventh-company test

إنشاء Tenant سابع اصطناعي وإثبات:

- onboarding without code changes.
- own store/listings/inventory/orders.
- no access to founding six.
- deactivation does not affect others.

لا تغلق Phase 5 دون هذا الاختبار.

---

# 13. SaaS Metering and Billing Foundation

## 13.1 ما يعتبر Billable Order

قرار Phase 5 المقترح:

- external channel order successfully imported into canonical operations.
- or direct order managed under a paid merchant plan if configured.
- cancelled duplicates/test orders are not billable according to plan rules.

يجب أن يكون التعريف Configurable وVersioned.

## 13.2 التسعير

المفهوم التجاري:

- حتى 3,000 طلب: €0.10 لكل طلب.
- حجم أعلى: €0.07.

لمنع Pricing Cliff، يبني Phase 5 Engine يدعم:

- `graduated` tiers.
- `volume` tiers.
- minimum monthly fee.
- setup fee.
- discounts/trials.

### Default invoice-preview rule

إلى حين موافقة المالك على الفوترة الحية:

- أول 3,000 طلب × €0.10.
- ما فوق 3,000 × €0.07.
- Invoice preview فقط.
- لا Auto-charge.

## 13.3 Metering invariants

- duplicate webhook/order لا يُحسب مرتين.
- reprocessing لا يغير العدد.
- deleted/archived order لا يمحو usage event.
- corrections عبر adjustment events، لا تعديل التاريخ بصمت.
- كل invoice line قابلة للوصول إلى usage events التي أنشأتها.

---

# 14. AI and MCP Scope in Phase 5

## 14.1 Read-only tools

- list merchant stores.
- store health summary.
- inventory availability.
- order action queue.
- shipping quote explanation.
- usage/billing preview.
- reconciliation findings.

## 14.2 Proposal tools

- suggest listing improvement.
- suggest shipping threshold.
- suggest low-stock action.
- suggest slow-stock auction candidate.
- suggest customer-service response.

## 14.3 Controlled execution

يمكن السماح، مع Approval Object صريح، بـ:

- publish/unpublish Borvat listing.
- pause store checkout.
- approve operational action.

ممنوع في Phase 5 دون موافقة بشرية واضحة:

- refund.
- payment action.
- payout.
- permission change.
- company ownership transfer.
- Bol live activation.

## 14.4 MCP requirements

كل tool يحدد:

- input schema.
- tenant context.
- required permission.
- dry-run support.
- idempotency key.
- approval requirement.
- audit output.
- safe error model.

---

# 15. Security and RLS Requirements

## 15.1 Public access

Public/anon يمكنه فقط:

- قراءة active stores.
- قراءة active approved listings.
- قراءة public content الضروري.

لا يرى:

- inventory internals.
- cost.
- supplier data.
- company members.
- channel credentials.
- internal findings.
- billing.

## 15.2 Customer access

- own profile/addresses.
- own carts.
- own orders/returns.
- no access by guessed IDs.

## 15.3 Merchant access

- company-scoped only.
- permission-scoped actions.
- no read/write across companies.
- no ability to alter payment truth or order totals.

## 15.4 Admin access

- platform role separate from merchant role.
- support impersonation/session audited.
- no frontend-exposed service-role key.
- no broad RPC grants by default.

## 15.5 Worker RPCs

- `service_role` only where required.
- revoke from `anon` and `authenticated` explicitly.
- validate company IDs and row ownership inside trusted functions.
- search_path pinned.
- SECURITY DEFINER reviewed individually.

## 15.6 Secrets

- no plaintext provider secrets.
- use approved Vault/secret_ref model.
- logs redact tokens and headers.
- frontend receives no secret_ref that enables retrieval.

---

# 16. Observability and Operations

## 16.1 Required metrics

- checkout created/succeeded/failed/expired.
- reservation failures.
- payment webhook latency/failures.
- order creation recovery queue.
- inventory drift findings.
- shipment SLA.
- communication failures.
- usage metering counts.
- cross-tenant denied attempts.

## 16.2 Correlation

نفس Trace/Correlation ID يجب أن يربط:

- cart quote.
- checkout.
- reservation.
- payment intent/event.
- parent order.
- merchant orders.
- shipments.
- emails.
- billing usage.

## 16.3 Dead-letter and Recovery

- كل worker لديه bounded retries.
- terminal failure واضح.
- manual retry آمن وIdempotent.
- لا حذف صامت للأحداث.

## 16.4 Runbooks

مطلوب Runbook لكل:

- payment succeeded but order not finalized.
- stuck reservation.
- inventory drift.
- failed shipping label.
- duplicate provider webhook.
- communication outage.
- tenant suspension.
- checkout kill switch.

---

# 17. Milestone Plan

## M0 — Verified Baseline

### الهدف

تثبيت الحالة قبل البناء.

### المخرجات

- inventory of existing tables/functions/types.
- migration list and hashes.
- clean-room migration run.
- all Phase 1–4 tests rerun.
- conflict report Phase 0 vs Phase 2 order/product models.
- secret-storage clarification.

### بوابة الإغلاق

- لا coding functional قبل تسليم Preflight Report.
- جميع الاختبارات الأساسية خضراء أو كل failure موثق ومقبول.

---

## M1 — Merchant Store & Borvat Listing Publication

### المخرجات

- merchant store lifecycle.
- Borvat publication mapped to canonical SKU/listing.
- public store pages.
- listing moderation state.
- active-store/active-listing gates.

### اختبارات حاسمة

- suspended store cannot checkout.
- inactive listing not public.
- cross-tenant listing edit denied.
- same SKU can be offered by different companies without ownership leakage.

---

## M2 — Shipping, VAT and Quote Engine

### المخرجات

- shipping profiles/zones/rules.
- NL/BE address zoning.
- gross VAT display.
- per-seller free shipping threshold.
- quote snapshots and expiry.

### اختبارات حاسمة

- €50 threshold applies only to relevant seller.
- two sellers produce separate shipping charges.
- stale quote rejected.
- tax-resolution failure blocks checkout.
- frontend cannot override shipping amount.

---

## M3 — Multi-Merchant Cart, Checkout and Reservation

### المخرجات

- carts/items.
- quote versioning.
- atomic all-cart reservation.
- checkout session state machine.
- parent/merchant order preparation.

### اختبارات حاسمة

- oversell concurrency.
- all-or-nothing reservation.
- same idempotency key returns same checkout.
- changed payload with same key conflicts.
- expiry releases once.

---

## M4 — Payment Adapter, Stripe Test Mode and Order Finalization

### المخرجات

- payment adapter contract.
- Stripe test implementation.
- verified webhooks.
- payment/order recovery queue.
- refund foundation.

### اختبارات حاسمة

- redirect alone does not mark paid.
- duplicate webhook no duplicate order.
- amount mismatch quarantined.
- success + worker retry creates one order.
- partial refund updates derived state correctly.

---

## M5 — Seller Operations Dashboard

### المخرجات

- action dashboard.
- store/catalog/listings.
- inventory/reservations.
- orders/pick-pack-ship.
- returns.
- channel health.
- billing usage preview.
- team permissions.

### بوابة الإغلاق

موظف غير تقني ينفذ السيناريو الكامل دون SQL أو تدخل المبرمج.

---

## M6 — Admin & Compliance Operations

### المخرجات

- merchant/store review.
- listing moderation.
- support sessions.
- risk queues.
- kill switches.
- audit drill-down.

### اختبارات حاسمة

- admin action requires platform role.
- support session expiry enforced.
- no silent cross-tenant mutation.
- kill switch blocks new action but preserves existing records.

---

## M7 — Communications and Source Policy

### المخرجات

- communication outbox.
- templates.
- Borvat Direct transactional emails.
- source/channel policy evaluation.
- packaging/insert instruction output.

### اختبارات حاسمة

- Borvat order receives Borvat template.
- Bol order cannot receive Borvat marketing template.
- duplicate event sends once.
- email failure does not roll back shipped state.

---

## M8 — Founding Six Onboarding

### المخرجات

- six normal tenants.
- stores, users, roles, warehouses, inventory and listings.
- import/reconciliation reports.
- synthetic seventh tenant.

### بوابة الإغلاق

- no tenant leakage.
- no special code.
- each tenant can be suspended independently.
- company 7 operates through same workflow.

---

## M9 — SaaS Metering & Invoice Preview

### المخرجات

- plans/subscriptions.
- usage events.
- graduated and volume tier engine.
- invoice preview.
- audit drill-down.

### اختبارات حاسمة

- order counted once.
- replay does not double bill.
- tier boundary correct.
- adjustment is append-only.
- invoice total reconciles to lines/events.

---

## M10 — Security, E2E and Alpha Release Gate

### المخرجات

- full RLS suite.
- concurrency suite.
- E2E browser flows.
- observability dashboards.
- runbooks.
- rollback plan.
- owner acceptance report.

### بوابة الإغلاق

- no Bol live.
- Stripe remains test unless separately approved.
- controlled Alpha flag only.
- explicit owner sign-off.

---

# 18. Mandatory Test Matrix

> الأرقام لا تستبدل التغطية. الاختبارات يجب أن ترتبط بمتطلبات واضحة.

## 18.1 Database/RLS

على الأقل:

- tenant read isolation.
- tenant write isolation.
- customer object ownership.
- public visibility gates.
- admin/platform role boundaries.
- worker RPC grants.
- SECURITY DEFINER checks.
- support-session restrictions.

## 18.2 Inventory/Reservation

- concurrent last-unit checkout.
- reservation expiry.
- paid checkout not expired.
- cancellation release.
- refund/return stock disposition.
- ledger/balance reconciliation.

## 18.3 Pricing/Shipping/Tax

- VAT included display.
- shipping separate.
- free per product.
- free over threshold.
- multi-seller.
- multiple fulfillment nodes.
- quote expiry.
- rate version snapshot.

## 18.4 Checkout/Payments

- idempotent checkout.
- duplicate webhook.
- out-of-order webhook.
- amount mismatch.
- currency mismatch.
- provider timeout.
- paid-but-order-finalization recovery.
- refund replay.

## 18.5 Orders/Fulfillment/Returns

- parent totals equal child totals.
- independent merchant shipment.
- partial shipment.
- cancellation eligibility.
- return request ownership.
- partial refund.
- event history append-only.

## 18.6 Communications

- template source selection.
- transactional vs marketing consent.
- external-channel restriction.
- retry/idempotency.
- PII redaction.

## 18.7 Metering/Billing

- exact once counting.
- tier boundary at 3,000.
- invoice preview reconciliation.
- non-billable duplicate/test order.
- plan-version changes.
- adjustments.

## 18.8 E2E Flows

حد أدنى 15 تدفقًا كاملاً، منها:

1. Single seller purchase.
2. Multi-seller purchase.
3. Free shipping threshold.
4. Payment failure and release.
5. Duplicate payment webhook.
6. Seller ships order.
7. Partial shipment.
8. Customer return request.
9. Seller approves return.
10. Partial refund.
11. Store suspension.
12. Listing moderation rejection.
13. Founding merchant onboarding.
14. Seventh tenant onboarding.
15. SaaS invoice preview.

## 18.9 Meaningful assertion floor

الحد الأدنى المستهدف للمرحلة:

- 180 meaningful backend/integration/security assertions.
- 15 E2E flows.
- 8 real concurrency scenarios.

لا يجوز ملء الرقم باختبارات شكلية أو تكرار نفس invariant.

---

# 19. Required Developer Deliverables

عند كل Milestone:

- migration files.
- schema diff.
- generated types.
- RPC/service contracts.
- RLS/grants matrix.
- test files and output.
- traceability matrix.
- UI screenshots or E2E evidence.
- discovered bugs.
- hotfix migrations.
- rollback notes.
- open risks.
- commit hash/tag.

عند نهاية Phase 5:

1. `PHASE_5_FINAL_REPORT.md`
2. `PHASE_5_TRACEABILITY_MATRIX.md`
3. `PHASE_5_RLS_GRANTS_MATRIX.md`
4. `PHASE_5_RUNBOOKS.md`
5. `PHASE_5_TEST_REPORT.md`
6. `PHASE_5_MIGRATION_MANIFEST.md`
7. updated `BORVAT_CURRENT_STATE_V1.md`
8. updated `BORVAT_DECISION_LOG_V1.md`

---

# 20. Required Final Report Format

## Phase 5 Final Verification Report

- Scope delivered.
- Out of scope respected.
- Migrations and hashes.
- Tables/types/functions added or extended.
- Existing entities reused.
- Deprecated/transitioned legacy entities.
- RLS and grants evidence.
- Test counts by category.
- Concurrency evidence.
- E2E evidence.
- Founding six onboarding status.
- Seventh tenant evidence.
- Payment mode and live flags.
- Bol mode and live flags.
- Security findings.
- Bugs discovered and hotfixes.
- Clean-room rebuild result.
- Rollback/runbooks.
- Open risks.
- Owner decisions still required.
- Commit/tag.

---

# 21. Stop Conditions

يوقف المبرمج التنفيذ ويبلغ بوضوح إذا اكتشف:

- مصدرَي حقيقة متعارضين للمخزون أو الطلبات.
- Migration مقفلة يجب تعديلها لإكمال العمل.
- RLS لا يمكن إثباتها بسبب نموذج قديم.
- Payment architecture قد تحتجز أموال التجار دون PSP مناسب.
- Tax logic غير محدد لبلد الإطلاق.
- إنشاء Order يمكن أن ينجح دون حجز مخزون.
- فتح Bol Live مطلوب ضمن المهمة.
- Secrets مخزنة plaintext.
- حساب شركة يحتاج Hardcoding.

التوقف هنا لا يعني إلغاء المشروع؛ يعني تقديم Decision Request موثق بدل إخفاء الخطر.

---

# 22. قرارات المالك المطلوبة قبل أي Production Live

Phase 5 يمكن تنفيذها وإغلاقها تقنيًا في Alpha/Test، لكن Production Live يحتاج قرارات منفصلة:

1. PSP/marketplace payment provider النهائي.
2. Seller settlement and payout model.
3. SaaS billing formula النهائية وحد أدنى شهري إن وجد.
4. عمولة Marketplace حسب الفئات.
5. البلدان الأولى النهائية.
6. Return-policy baseline.
7. Customer-service SLA.
8. شروط التاجر والعقود.
9. Privacy/marketing consent policy.
10. Owner approval for public Beta.

---

# 23. Definition of Done — Phase 5

Phase 5 تعتبر مكتملة فقط إذا تحقق جميع ما يلي:

- M0–M10 مقفلة أو أي استثناء مقبول كتابيًا من المالك.
- Borvat Direct ينفذ طلبًا متعدد التجار من التصفح إلى الشحن والمرتجع.
- العملية لا تعتمد على Bol.
- الشركات الست Onboarded كـnormal tenants.
- الشركة السابعة الاختبارية نجحت دون كود خاص.
- B2C price شامل VAT والشحن منفصل.
- Shipping profiles والـthresholds تعمل per seller.
- لا oversell تحت concurrency.
- Checkout/payment/order idempotent.
- Stripe test-mode webhooks verified.
- Seller Dashboard تشغيلي.
- Admin operations وsupport access audited.
- Source-aware communications مثبتة.
- SaaS usage metering قابل للتدقيق.
- clean-room migrations ناجحة.
- RLS/grants matrix كاملة.
- runbooks وrollback موجودة.
- لا Bol live.
- لا real payouts/custody.
- Current State وDecision Log محدثان.
- المالك وافق صراحة على إغلاق المرحلة.

---

# 24. أمر التنفيذ المختصر للمبرمج

> نفّذ Phase 5 حسب `BORVAT_PHASE_5_EXECUTION_SPEC_V1.md` على شكل M0–M10. ابدأ بـM0 read-only inspection وقدم Preflight Report قبل أي Migration. أعد استخدام النواة المقفلة ولا تنشئ مصادر حقيقة موازية. نفّذ كل Milestone مع migrations additive، RLS/grants، tests، traceability، runbook، وتقرير. لا تفتح Bol live ولا Stripe live ولا payouts. لا تعتبر المرحلة مكتملة قبل clean-room rebuild، E2E، seventh-tenant test، وتحديث ملفات الحوكمة.

---

# 25. تحليل الأثر المستقبلي

## الفرصة الريادية

Phase 5 تحول Borvat من بنية تقنية إلى أصل تجاري قابل للاستخدام: Marketplace فعلي، ستة تجار مؤسسين، قناة بديلة مستقلة، وبنية SaaS قابلة لضم تجار خارجيين وتسعيرهم حسب الطلبات.

## المخاطرة الحرجة

أكبر خطر هو محاولة تنفيذ كل الوحدات بسرعة عبر إنشاء جداول وواجهات موازية للنواة القائمة. هذا قد يعطي Demo سريعًا لكنه يعيد مشكلة اختلاف المخزون والطلبات والتسويات. لذلك معيار Phase 5 هو **الدمج مع النواة الحالية وإثبات invariants**، لا عدد الصفحات أو الشاشات.
