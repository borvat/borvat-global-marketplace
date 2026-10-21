# BORVAT MASTER BLUEPRINT V1.0

## خطة العمل، الرؤية المعمارية، وخطة التنفيذ

**الحالة:** المرجع الرسمي الأساسي للمشروع (Single Source of Truth)  
**الإصدار:** 1.0  
**التاريخ:** 24 يوليو 2026  
**المالك وصاحب القرار النهائي:** مؤسس Borvat  
**نطاق الوثيقة:** Borvat Marketplace + Seller Dashboard + Multichannel SaaS + Admin + Auctions + Inventory/Fulfillment/Shipping + Wallets + Loyalty + AI/MCP

---

## 0. قاعدة استخدام هذه الوثيقة

هذه الوثيقة هي المرجع الرسمي لهوية مشروع Borvat وحدوده وأولوياته المعمارية والتنفيذية. لا يجوز اعتبار ملخص محادثة، اسم مرحلة، أو تقرير مبرمج بديلًا عنها ما لم يتم تسجيل التغيير في **سجل القرارات** وإصدار نسخة جديدة منها.

قواعد العمل الإلزامية:

- يقرأ المبرمج هذه الوثيقة وملف `BORVAT_CURRENT_STATE_V1.md` وسجل `BORVAT_DECISION_LOG_V1.md` قبل بدء أي مرحلة.
- لا يتم تغيير اتجاه المنتج أو نموذج البيانات أو صلاحيات التاجر بناءً على محادثة عابرة.
- أي تغيير جوهري يحتاج: سبب، أثر، مخاطرة، خطة انتقال، اختبارات، وموافقة صريحة من المالك.
- الشركات الست الأولى هي أول تجار حقيقيين في المنصة، وليست حالات خاصة داخل الكود.
- يجب أن يكون إدخال الشركة السابعة الخارجية ممكنًا دون تعديل خاص في قاعدة البيانات أو منطق التطبيق.
- لا تُعد أي مرحلة مكتملة بسبب عدد الاختبارات فقط؛ الإغلاق يحتاج إثبات قبول تشغيلي وأمني وتجاري.

---

# الجزء الأول — خطة العمل

## 1. التعريف التنفيذي

**Borvat ليست متجرًا إلكترونيًا عاديًا، وليست أداة داخلية لشركات المؤسس.**

Borvat هي **منظومة تجارة ذكية متكاملة (Smart Commerce Ecosystem)** تجمع ضمن شركة ومنصة واحدة:

1. Marketplace متعدد التجار للمستهلك النهائي.
2. Seller Dashboard لإدارة متجر التاجر داخل Borvat.
3. Multichannel SaaS شبيه بمنصات إدارة القنوات مثل StockitUp، لربط Bol.com وAmazon وShopify وeBay وغيرها.
4. منصة إدارة مركزية لفريق Borvat.
5. منصة مزادات وتصفيات للمخزون الفائض والمرتجعات والكميات التجارية.
6. مخزون ومستودعات وتجهيز وشحن ومرتجعات.
7. محافظ وتسويات وعمولات وأرصدة.
8. ولاء وإحالات وقسائم وStore Credit.
9. طبقة AI-native عبر MCP ووكلاء ذكيين مع موافقات وضوابط.

الوصف التقني والتجاري المختصر:

> **Agentic Commerce Platform + Marketplace + Multichannel SaaS + Auction Network**

الشعار:

> **Smart living, made affordable.**

## 2. المشكلة التي تحلها Borvat

السوق الحالي يعاني من تجزئة شديدة:

- التاجر يعتمد على Marketplace خارجي واحد وقد يفقد قناة البيع فجأة.
- فتح حسابات القنوات قد يكون بطيئًا أو غير مضمون.
- أدوات إدارة القنوات منفصلة عن المتجر، الشحن، الفواتير، الولاء والمزادات.
- التاجر يكرر المنتجات والمخزون والطلبات في عدة أنظمة.
- العملاء لا يملكون علاقة مباشرة ومستدامة مع التاجر خارج القناة.
- المخزون الفائض والمرتجعات لا يملكان مسار تصفية منظمًا.
- الذكاء الاصطناعي غالبًا واجهة نصية، وليس جزءًا من النظام التشغيلي.

Borvat توحد هذه الوظائف وتمنح التاجر:

- قناة بيع داخل Borvat.
- إدارة قنواته الخارجية من مكان واحد.
- مخزونًا وشحنًا وفواتير وأتمتة.
- قناة احتياطية مستقلة عن أي Marketplace خارجي.
- أدوات نمو: ولاء، إحالات، إعلانات، وتحليلات ذكية.

## 3. الرؤية

بناء منصة تجارة أوروبية ذكية تجعل التاجر قادرًا على البيع والإدارة والتوسع من نظام واحد، وتجعل العميل يحصل على تجربة شراء موثوقة وسعر واضح وخدمة موحدة، مع بقاء القرارات الحساسة تحت تحكم الإنسان.

### الرؤية طويلة المدى

أن تصبح Borvat طبقة التشغيل التجاري التي يعتمد عليها التاجر في:

- البيع المباشر.
- البيع متعدد القنوات.
- إدارة الكتالوج والمخزون.
- تنفيذ الطلبات والشحن.
- إدارة العوائد المالية.
- تصفية الفائض بالمزاد.
- بناء الولاء والعلاقة المباشرة مع العميل.
- استخدام وكلاء ذكاء اصطناعي يعملون ضمن صلاحيات وموافقات واضحة.

## 4. الرسالة

تخفيض تكلفة وتعقيد التجارة الإلكترونية للتاجر، وتقليل اعتماده على منصة واحدة، مع توفير Marketplace فعلي وخدمات تشغيلية تنمو معه.

## 5. الأهداف الاستراتيجية

1. إطلاق قناة بيع مستقلة وفعالة تستطيع الشركات الست استخدامها حتى عند توقف أي قناة خارجية.
2. جعل الشركات الست أول مجموعة Founding Merchants تختبر النظام بحركة حقيقية.
3. استقطاب تجار خارجيين عبر تسعير SaaS منخفض وخدمات مترابطة.
4. تحويل التاجر من مستخدم أداة ربط إلى بائع داخل Borvat، ثم إلى مستخدم للشحن والمزادات والمحفظة والولاء.
5. حماية المنصة من التجار عاليي المخاطر عبر تحقق مستقل وعدم قبول أي تاجر لمجرد أنه موقوف من منصة أخرى.
6. بناء بيانات تشغيلية موحدة تسمح بأتمتة وذكاء اصطناعي فعليين.
7. إضافة قنوات جديدة عبر Adapters دون إعادة بناء النواة.

## 6. الشرائح المستهدفة

### 6.1 العميل النهائي

يريد منتجات منزلية وتقنية بأسعار منافسة، شحنًا واضحًا، خدمة موثوقة، ولاءً وقسائم وتجربة سهلة.

### 6.2 التاجر داخل Borvat

يريد متجرًا جاهزًا، منتجات وطلبات ومخزونًا وشحنًا ومرتجعات وتقارير دون بناء بنية خاصة.

### 6.3 التاجر متعدد القنوات

يريد ربط Bol.com وAmazon وShopify وeBay، وإدارة الطلبات والمخزون والفواتير والشحن من لوحة واحدة.

### 6.4 التاجر الباحث عن قناة بديلة

تاجر نظامي يريد تقليل مخاطر الاعتماد على قناة خارجية واحدة، أو ينتظر تفعيل حساب جديد، أو خسر قناة بسبب أداء تشغيلي قابل للإصلاح. لا تُستخدم Borvat للالتفاف على الحظر أو بيع منتجات غير قانونية أو مزورة.

### 6.5 تاجر الفائض والمرتجعات

يريد تصفية سريعة ومنظمة عبر المزادات أو البيع بالجملة أو Buy Now.

## 7. الشركات الست المؤسسة

تبدأ Borvat بست شركات فعلية مستأجرة/مدارة من المؤسس، وتعمل كأول تجار حقيقيين في المنصة.

دورها:

- توفير كتالوج ومخزون حقيقي منذ البداية.
- توليد طلبات وشحنات ومرتجعات فعلية.
- اختبار العزل بين الشركات والصلاحيات.
- اختبار ربط القنوات تحت ضغط واقعي.
- بناء بيانات للذكاء الاصطناعي والتحليلات.
- إطلاق Marketplace غير فارغ.
- إثبات المنصة أمام التجار والمستثمرين.

### قاعدة غير قابلة للتفاوض

الشركات الست تعامل تقنيًا كأي عميل خارجي:

- `company_id` مستقل.
- أعضاء وصلاحيات مستقلة.
- كتالوج ومخزون وقنوات ومحفظة مستقلة.
- لا شروط `if company_name` ولا استثناءات دائمة.
- يمكن منحها تصنيفًا تجاريًا مثل `founding_merchant` عبر إعدادات، لا عبر Hardcoding.

## 8. محركات الإيراد

| الوحدة | نموذج الإيراد |
|---|---|
| Marketplace | عمولة على الطلب أو الفئة |
| Seller SaaS | رسوم لكل طلب + حد أدنى/باقات |
| Channel Integration | رسوم استخدام أو وحدات متقدمة |
| Shipping | هامش أو رسوم إدارة الملصقات والشحن |
| Fulfillment | تخزين، Pick & Pack، مواد تغليف، مرتجعات |
| Auctions | عمولة بائع ومشتري ورسوم خدمات |
| Advertising | منتجات ممولة ومساحات ترويجية |
| AI Premium | أدوات تحليل ومحتوى وتسعير متقدمة |
| Wallet/Payout | رسوم مسموحة عبر مزود دفع مرخص |
| Loyalty Campaigns | رسوم حملات أو تمويل مشترك |
| Premium Analytics | تقارير وBI للتاجر |

## 9. عرض SaaS للتجار

العرض التجاري الأساسي المقترح:

- حتى 3,000 طلب شهريًا: **€0.10 لكل طلب**.
- فوق 3,000 طلب: **€0.07 لكل طلب** وفق نموذج فوترة يعتمد رسميًا قبل البرمجة.
- تشمل الخدمة الأساسية: الطلبات، الفواتير، ربط الشحن، مزامنة الحالات، والمخزون الأساسي.
- الشرط التجاري: فتح متجر داخل Borvat أو ربط المتجر/القناة بطريقة تزيد كتالوج Borvat وحركتها.

### قرار فوترة مطلوب قبل التنفيذ

يجب ألا يبرمج النظام نقطة سعر تسبب انخفاض الفاتورة عند تجاوز 3,000 طلب. الخيارات المقبولة:

1. تسعير تدريجي: أول 3,000 بسعر €0.10 وما فوق بسعر €0.07.
2. باقة حجمية مع حد أدنى شهري واضح.
3. خصم Retrospective مضبوط بحيث لا تنخفض الفاتورة عند زيادة الطلبات.

المطلوب من النظام دعم:

- حد أدنى شهري اختياري.
- رسوم إعداد قابلة للإعفاء.
- Add-ons منفصلة.
- Trial مضبوط.
- Invoice line items واضحة.
- حساب الاستخدام بشكل Idempotent وقابل للتدقيق.

## 10. ما يشمله السعر وما لا يشمله

### مشمول افتراضيًا

- استيراد الطلبات.
- مزامنة المخزون الأساسية.
- إنشاء الفاتورة.
- إنشاء أو ربط ملصق الشحن.
- إرسال Track & Trace للقناة.
- مزامنة حالات الطلب.
- لوحة الطلبات والمبيعات.
- معالجة أساسية للإلغاء والمرتجع.

### غير مشمول إلا بعقد أو Add-on

- سعر ملصق الشحن نفسه.
- رسوم شركة الشحن.
- SMS أو WhatsApp مدفوع.
- Custom Integrations.
- دعم يدوي غير محدود.
- Repricing متقدم.
- PIM ومحتوى متقدم.
- WMS/Fulfillment كامل.
- تخزين وتغليف ومواد كرتون.
- إدارة مطالبات وتعويضات معقدة.

## 11. سياسة السعر والشحن في Marketplace

قرار المنتج الأساسي:

- يظهر **سعر المنتج منفصلًا عن الشحن**.
- للعميل B2C يظهر سعر المنتج شامل الضريبة المطبقة، بينما يظهر الشحن كبند منفصل قبل الشراء.
- يمكن للتاجر اختيار:
  - شحن مدفوع بسعر ثابت.
  - شحن حسب الوزن أو المنطقة.
  - شحن مجاني لمنتج محدد.
  - شحن مجاني فوق حد مثل €50.
  - استلام من المستودع.
  - Fulfillment عبر Borvat.
- في B2B يمكن عرض السعر قبل الضريبة مع عرض السعر شاملها أيضًا حسب السياق.

مثال العرض:

```text
€19.95 incl. VAT
+ shipping from €4.95

أو

€19.95 incl. VAT
Free shipping from €50 with this seller
```

### السلة متعددة التجار

تقسم السلة حسب البائع أو Fulfillment node، لأن الشحن قد يخرج من مستودعات مختلفة.

```text
Seller A: products €40 + shipping €4.95
Seller B: products €25 + free shipping
Total: €69.95
```

## 12. حلقة النمو (Growth Flywheel)

```text
سعر SaaS منخفض
    ↓
انضمام تاجر وربط قنواته
    ↓
دخول المنتجات والمخزون إلى Borvat
    ↓
Marketplace أكبر وأكثر تنوعًا
    ↓
طلبات وحركة عملاء
    ↓
شحن وفواتير وFulfillment
    ↓
ولاء وإحالات ومحافظ ومزادات
    ↓
تكلفة انتقال أعلى وقيمة أكبر للتاجر
    ↓
بيانات أفضل ووكلاء أذكى
```

## 13. الاستمرارية التجارية

يجب أن تمتلك الشركات الست القدرة على الاستمرار في البيع عبر Borvat إذا أغلقت أو توقفت القنوات الخارجية.

**Business Continuity Objective:**

> تستطيع كل شركة مؤسسة عرض منتجاتها، استقبال الدفع، إنشاء الطلب، تخصيص المخزون، الشحن، التتبع، إدارة المرتجع، وخدمة العميل عبر Borvat دون اعتماد تشغيلي على Bol أو Amazon أو Shopify.

هذا لا يعني أن Borvat تعوض حركة Bol فورًا؛ بل يعني أن قناة البيع والبنية والبيانات موجودة وتعمل، ويمكن توجيه التسويق إليها فورًا.

---

# الجزء الثاني — الرؤية المعمارية

## 14. المبادئ المعمارية

1. **Multi-tenant by design:** كل مورد تجاري مرتبط بشركة أو سياق ملكية واضح.
2. **No hardcoded founding tenants:** الشركات الست ليست استثناءات برمجية.
3. **Marketplace and SaaS share a core, not a database shortcut:** مشاركة النواة لا تعني خلط ملكية البيانات.
4. **Ledger-first:** المخزون والمال والتسويات تعتمد دفاتر حركة قابلة للتدقيق.
5. **Event-driven integrations:** القنوات الخارجية لا تتحكم مباشرة بالحقيقة الداخلية.
6. **Idempotency everywhere:** كل webhook، import، dispatch، billing event وشحنة قابلة لإعادة المحاولة بأمان.
7. **Human control for high-impact actions:** الذكاء الاصطناعي يقترح ويجهز، والتنفيذ الحساس يخضع لسياسة وموافقة.
8. **Adapters, not channel-specific core:** Bol أول قناة، وليست شكل النظام النهائي.
9. **Compliance by source channel:** الرسائل والتغليف والولاء تعتمد مصدر الطلب وسياسة القناة.
10. **Progressive delivery:** read-only ثم shadow ثم canary ثم live محدود.
11. **Observability is a product requirement:** لا يوجد worker أو sync بلا logs وmetrics وaudit.
12. **Privacy and secret minimization:** الأسرار خارج الجداول التشغيلية، والـaudit لا يخزن tokens أو secrets.

## 15. المشهد العام للنظام

```text
Customers / Merchants / Staff
             │
             ▼
     Borvat Web & Apps
             │
 ┌───────────┼───────────────────────────────┐
 ▼           ▼               ▼               ▼
Marketplace  Seller SaaS     Admin           Auction
             │
             ▼
       Commerce Core
 ┌───────────┼─────────────────────────────────────────┐
 ▼           ▼          ▼          ▼          ▼        ▼
Catalog    Inventory   Orders   Fulfillment  Wallet   Loyalty
             │          │          │          │
             └────── Event / Outbox Backbone ─────────┘
                            │
                            ▼
                  Integration Adapters
             Bol / Amazon / Shopify / eBay / Carriers
                            │
                            ▼
                      Reconciliation

AI Agents ↔ MCP ↔ Policy/Approval Layer ↔ Commerce Core
```

## 16. السياقات المحددة (Bounded Contexts)

### 16.1 Identity & Tenancy

- المستخدمون.
- الشركات.
- عضوية الشركة.
- الأدوار والصلاحيات.
- دعوات الفريق.
- نقل الملكية.
- Platform staff access.

### 16.2 Merchant Onboarding & Compliance

- التحقق من الشركة.
- بيانات الضرائب والبنك.
- قبول الشروط.
- تقييم المخاطر.
- المستندات.
- حالة التفعيل والتعليق.
- سياسات المنتجات المحظورة.

### 16.3 Catalog & PIM

- Product family.
- Sellable SKU.
- Variants.
- EAN/GTIN mappings.
- Media.
- Attributes.
- Categories.
- Localized content.
- Ownership and evidence.
- Bundles and packs.

### 16.4 Listings & Channels

- Channel connections.
- Imported offers.
- Channel listings.
- Listing status.
- Published quantity.
- Price rules.
- Channel-specific content.
- Shadow/live dispatch.

### 16.5 Inventory

- Warehouses.
- Locations.
- Stock ownership.
- Append-only inventory transactions.
- Balances.
- Reservations.
- Transfers.
- Adjustments.
- Damaged/quarantine/in-transit states.

### 16.6 Orders

- Marketplace orders.
- Imported channel orders.
- Order lines.
- Payments status.
- Exceptions.
- Cancellations.
- Customer service events.
- Returns and refunds.

### 16.7 Fulfillment & Shipping

- Allocation.
- Pick.
- Pack.
- Ship.
- Parcels.
- Labels.
- Carriers.
- Track & Trace.
- Delivery events.
- Return labels.
- Packaging rules by channel.

### 16.8 Marketplace Checkout

- Cart.
- Seller splits.
- Shipping quotes.
- Promotions.
- Tax presentation.
- Payment sessions.
- Order creation.
- Fraud/risk checks.

### 16.9 Billing & Subscriptions

- SaaS plan.
- Usage metering.
- Per-order pricing.
- Minimum fee.
- Add-ons.
- Invoices.
- Credits.
- Failed billing.

### 16.10 Wallet, Settlement & Payout

- Seller payable ledger.
- Pending/available balance.
- Commission.
- Shipping deductions.
- Return costs.
- Auction fees.
- PSP references.
- Payout batches.
- Reconciliation.

الأموال الفعلية يجب أن تبقى لدى مزود دفع مرخص وفق النموذج القانوني المناسب؛ Borvat تحتفظ بالدفتر التشغيلي والمراجع، ولا تتحول دون قصد إلى بنك أو مزود دفع غير مرخص.

### 16.11 Loyalty & Referral

- Points.
- Cashback promotional credit.
- Coupons.
- Referral codes.
- Customer levels.
- Campaign funding.
- Expiration.
- Fraud limits.

رصيد الولاء ليس نفس دفتر أموال التاجر، ولا يخلط معه.

### 16.12 Auctions

- Lots.
- Seller consignments.
- Reserve price.
- Bid increments.
- Bids.
- Anti-sniping.
- Buy Now.
- Winner settlement.
- Pickup/shipping.
- Buyer/seller fees.
- Disputes.

### 16.13 CRM & Communications

- Transactional email.
- Seller messaging.
- Customer notifications.
- Marketing consent.
- Templates per brand/channel.
- Deliverability and audit.

### 16.14 AI & Automation

- MCP tools.
- Agent identities.
- Read/write scopes.
- Approval requests.
- Suggested actions.
- Execution receipts.
- Model/audit metadata.
- Kill switches.

### 16.15 Platform Administration

- Merchant review.
- Disputes.
- Catalog moderation.
- Risk alerts.
- Commission configuration.
- Support impersonation with explicit audit.
- Operational dashboards.
- Feature flags.

## 17. نموذج الهوية والملكية

العلاقة المرجعية:

```text
Legal Company
  ├── Members & Roles
  ├── Merchant Store on Borvat
  ├── External Channel Connections
  │     ├── Bol Account
  │     ├── Amazon Account
  │     └── Shopify Store
  ├── Warehouses / Fulfillment Agreements
  ├── Inventory Ownership
  ├── Seller Wallet / Settlement Account
  └── Subscription / Billing Account
```

قواعد:

- حساب Bol ليس شركة.
- المتجر ليس مستودعًا.
- المستودع ليس مالك المخزون تلقائيًا.
- EAN وسيلة مطابقة، وليس دليل ملكية.
- مشاركة المنتج المركزي لا تعني مشاركة المخزون أو Listing أو الإيراد.

## 18. نموذج الكتالوج

الهيكل المستهدف:

```text
Product Concept / Central Product Family
      ↓
Sellable SKU / Variant / Pack
      ↓
Merchant Offer
      ↓
Channel Listing
```

يجب الفصل بين:

- الحقيقة العامة للمنتج.
- ملكية التاجر للعرض.
- السعر والمخزون.
- محتوى القناة.
- الصور وحقوق استخدامها.
- EAN mapping confidence.

## 19. نموذج المخزون

لا يعتمد المخزون على حقل رقم قابل للتعديل مباشرة. الحقيقة تتكون من:

- دفتر `inventory_transactions` append-only.
- أرصدة محسوبة/مادية قابلة للمطابقة.
- Reservations all-or-nothing.
- حالة المخزون: available, reserved, picked, packed, shipped, damaged, quarantine, in_transit.
- Ownership منفصل عن physical location.
- كل تعديل يملك actor, reason, reference, idempotency key وtimestamp.

معادلة النشر لكل قناة يجب أن تراعي:

- On-hand.
- Reserved.
- Safety stock.
- Channel cap.
- Allocation policy.
- Pending outbound updates.

## 20. نموذج الطلب والتنفيذ

```text
Order Intake
  → Validate & Normalize
  → Resolve Merchant/SKU
  → Reserve Inventory
  → Payment/Authorization State
  → Allocate
  → Pick
  → Pack
  → Internal Ship Commit
  → Channel Confirmation
  → Track & Deliver
  → Return/Refund if needed
```

قاعدة شحن Bol الحالية:

> يسجل الشحن داخليًا أولًا، ثم يرسل تأكيد الشحن إلى Bol. فشل Bol لا يعكس الشحن الداخلي تلقائيًا.

## 21. Outbox وWorkers

- كل تكامل خارجي يمر عبر Outbox أو stream موثوق.
- one-in-flight-per-target عند الحاجة.
- leases قابلة للاسترداد.
- retry مع backoff.
- dead-letter / exception queue.
- correlation IDs.
- process-status polling عند القنوات التي تستخدم عمليات غير متزامنة.
- reconciliation مستقل يعثر على الاختلافات ولا يخفيها.

## 22. Channel Adapters

كل Adapter يطبق عقدًا موحدًا قدر الإمكان:

- Authenticate.
- Import catalog/offers.
- Import orders.
- Publish inventory.
- Publish price.
- Confirm shipment.
- Cancel/refund where supported.
- Poll status.
- Normalize errors.
- Respect rate limits.
- Audit sanitized requests/responses.

قناة جديدة لا يجوز أن تضيف شروطًا عشوائية إلى النواة؛ الاختلافات تحفظ في adapter capabilities وchannel policy.

## 23. Channel Compliance Policy Engine

النظام يقرر تلقائيًا حسب مصدر الطلب:

| المصدر | الرسائل | التغليف | بطاقات خصم/إحالة | ولاء Borvat |
|---|---|---|---|---|
| Borvat Marketplace | باسم Borvat/التاجر | Borvat أو التاجر | مسموح وفق الموافقة | مسموح |
| Bol.com | حسب سياسة القناة | محايد/مسموح | غير مسموح إذا يسحب العميل خارج القناة | لا يفعّل تلقائيًا |
| Amazon | حسب سياسة القناة | حسب السياسة | حسب السياسة | حسب السياسة |
| Shopify للتاجر | حسب عقد التاجر | اختياري | اختياري | اختياري |

يجب ربط Packing Rules وCommunication Templates وMarketing Permissions بمصدر الطلب، لا بذاكرة الموظف.

## 24. الأمن والعزل

غير قابل للتفاوض:

- `company_id` أو ownership scope واضح على جميع بيانات التجار.
- RLS لكل الجداول المناسبة.
- worker/adapter RPCs لـ`service_role` فقط.
- لا وصول مباشر من `anon` أو المستخدم العادي إلى وظائف العمال.
- أقل صلاحية ممكنة.
- أسرار القنوات في Vault أو secret manager؛ قاعدة البيانات تحفظ `secret_ref` أو ciphertext وفق قرار موثق واحد.
- Audit logs تنظف secrets/tokens.
- Platform admin ليس Super Admin غير مراقب.
- Support access يحتاج سببًا ومدة وسجلًا.
- MFA للحسابات الحساسة.
- Kill switches عامة ولكل شركة ولكل قناة ولكل عملية.

## 25. الذكاء الاصطناعي وMCP

### الهدف

جعل الذكاء الاصطناعي جزءًا من التشغيل، لا مجرد محادثة.

### أنواع الأدوات

- Read tools: مبيعات، مخزون، طلبات، listings، findings.
- Suggest tools: سعر، محتوى، replenishment، تصفية فائض.
- Prepare tools: تجهيز مسودة أو workflow للموافقة.
- Execute tools: عمليات محدودة بموافقة وسياسة وreceipt.

### درجات التنفيذ

1. `REPORT_ONLY`
2. `SUGGEST_ONLY`
3. `PREPARE_FOR_APPROVAL`
4. `APPROVED_EXECUTION`
5. `LIMITED_AUTONOMY` لعمليات منخفضة المخاطر فقط

### متطلبات كل أداة

- هوية الوكيل.
- الشركة المستهدفة.
- scope واضح.
- idempotency key.
- dry-run إن أمكن.
- preview للأثر.
- approval عند الحاجة.
- receipt وaudit بعد التنفيذ.
- kill switch.

## 26. الرصد والتشغيل

يجب توفير:

- Structured logs.
- Metrics لكل worker وadapter.
- Queue depth.
- Lease age.
- Retry/failure rate.
- Reconciliation findings.
- Inventory drift.
- Payment/settlement mismatches.
- Shipping SLA.
- Email delivery failures.
- Security audit alerts.
- Tenant-level dashboards.

أي فشل صامت يعتبر عيبًا معماريًا.

## 27. التقنية الأساسية الحالية

- Frontend & Backend: TanStack Start، React 19، Vite 7، SSR.
- Database: PostgreSQL عبر Lovable Cloud/Supabase مع RLS.
- Hosting: Lovable Cloud وEdge Workers.
- Styling: Tailwind CSS v4.
- Payments الحالي: Stripe demo mode، ويحتاج تصميم Marketplace payments قبل الإنتاج.
- Transactional emails.
- MCP server ووكلاء ذكيون.
- Bol.com هو أول تكامل حقيقي، وليس التكامل الوحيد المستهدف.

---

# الجزء الثالث — خطة التنفيذ

## 28. الحالة المعروفة عند إصدار الوثيقة

بحسب ملخص المالك، تم تنفيذ:

### Phase 0 — Marketplace Core

- Home, categories, search, product detail.
- Cart and Stripe demo checkout.
- Seller dashboard basic CRUD/orders.
- Order status tracking and emails.
- Seller demo with RLS.

### Phase 1 — Tenancy & Security

- Companies and company members.
- Multi-role system.
- Secure ownership transfer.
- `company_id` scoping.
- رقم الاختبارات يحتاج توحيدًا بين تقرير 28 وتقرير 34.

### Phase 2 — Catalog, Inventory, Reservation, Fulfillment

- Product hierarchy.
- Warehouses and locations.
- Append-only inventory ledger.
- All-or-nothing reservations.
- Pick/Pack/Ship.
- 153/153 tests.

### Phase 3 — Outbox, Workers, Reconciliation

- Outbox and leases.
- Worker RPCs.
- Mock/Bol adapters.
- Reconciliation snapshots/findings.
- Phase 2 + 3 cumulative: 275/275.

### Phase 4 — Bol.com FBR M1–M5

- M1 Control Plane.
- M2 Offers import and EAN mapping.
- M3 Orders intake and exceptions.
- M4 shadow/live dispatch, live locked.
- M5 shipments and confirmation stream.
- Phase 4 total stated: 358 tests.
- No Bol account is in live mode.

### Phase 5

كانت هناك محادثة محذوفة وتقرير مبرمج لم يُراجع بعد. لا تسجل Phase 5 كمكتملة في المرجع قبل قراءة التقرير والتحقق من الكود والاختبارات والمigrations.

## 29. الأولويات التنفيذية الجديدة

بما أن الهدف التجاري يتجاوز ربط Bol، يجب عدم الاستمرار في بناء التكاملات الخلفية وحدها. ترتيب القيمة:

1. **Borvat Direct:** قناة بيع مستقلة حقيقية.
2. تشغيل الشركات الست كتجار مستقلين.
3. Seller Dashboard عملي للموظف والتاجر.
4. Marketplace Admin وتشغيل الدعم والمخاطر.
5. Multichannel SaaS onboarding + metering + billing.
6. Shipping and fulfillment workflows.
7. External merchant beta.
8. Auctions.
9. Wallet/settlement production architecture.
10. Loyalty/referral.
11. Additional channels.
12. Advanced AI automation.

## 30. مسارات التنفيذ

### Stream A — توثيق وتثبيت الحالة

المخرجات:

- مراجعة تقرير Phase 5.
- حصر migrations والوظائف والجداول.
- توحيد أرقام الاختبارات.
- حل تعارض نموذج تخزين أسرار Bol.
- تحديث `BORVAT_CURRENT_STATE_V1.md`.
- إنشاء traceability من requirement إلى test.

بوابة الإغلاق:

- لا ادعاءات غير مثبتة.
- migrations قابلة لإعادة البناء.
- جميع الاختبارات تعمل من clean environment.
- rollback/runbook موثق.

### Stream B — Borvat Direct / Business Continuity

المخرجات:

- Production-ready storefront.
- Product availability and seller attribution.
- Shipping quote engine.
- VAT-inclusive B2C display with shipping separate.
- Checkout and payment flow suitable for multi-seller design.
- Order split by merchant/fulfillment node.
- Transactional emails.
- Returns and refund foundation.
- Customer account and order tracking.
- SEO/feed readiness.

بوابة الإغلاق:

- طلب حقيقي من التصفح حتى الشحن والمرتجع.
- لا اعتماد على Bol أثناء العملية.
- inventory reservation and release proven.
- payment, order and shipment reconciliation.

### Stream C — Founding Six Merchant Onboarding

المخرجات:

- إنشاء الشركات الست كtenants عادية.
- أعضاء وأدوار.
- متاجر داخل Borvat.
- warehouses/inventory ownership.
- channel connections.
- billing profiles.
- wallets/settlement accounts logical records.
- import of catalog and stock.

بوابة الإغلاق:

- لا cross-tenant leakage.
- شركة سابعة test tenant تُضاف دون كود خاص.
- كل شركة تستطيع إيقاف أو فصل قناة دون التأثير على البقية.

### Stream D — Seller Dashboard

المخرجات:

- Dashboard حقيقي لا مجرد إحصاءات.
- Catalog CRUD/import.
- Inventory and reservations.
- Orders/exceptions/returns.
- Shipping labels and manifests.
- Channel sync status.
- Billing usage.
- Team roles.
- AI suggestions and approvals.

بوابة الإغلاق:

- موظف غير تقني ينفذ الدورة اليومية دون تدخل المبرمج.
- كل عملية حساسة واضحة وقابلة للتراجع أو التصحيح.

### Stream E — Admin & Operations

المخرجات:

- Merchant review and status.
- Catalog moderation.
- Risk and fraud queue.
- Disputes/support.
- Commissions/plans.
- Feature flags and kill switches.
- Support access audit.
- Platform financial/operational dashboard.

### Stream F — Multichannel SaaS Commercialization

المخرجات:

- Public merchant onboarding.
- Subscription plans.
- Usage metering per order.
- Tiered billing decision.
- Invoicing.
- Add-ons.
- Trial/activation/suspension.
- SLA and support policy.
- Channel connection wizard.

بوابة الإغلاق:

- invoice usage matches imported orders exactly.
- duplicate webhooks do not double bill.
- failed syncs are visible and supportable.

### Stream G — Shipping & Fulfillment

المخرجات:

- Carrier abstraction.
- shipping profiles.
- rate tables.
- labels.
- manifests.
- pickup handoff.
- packaging rules by source.
- return labels.
- storage and pick/pack charging.
- SLA metrics.

### Stream H — Auctions

المخرجات:

- Seller consignment.
- Lot creation and moderation.
- bidding engine.
- reserve price and buy now.
- winner checkout.
- pickup/shipping.
- settlement and fees.
- disputes and cancellation rules.

لا يبدأ المزاد المالي الكامل قبل تثبيت payment/settlement ledger.

### Stream I — Wallet, Settlement & Payout

المخرجات:

- Double-entry or equivalent auditable ledger.
- payable/receivable states.
- pending/available funds.
- commission and deductions.
- refunds/chargebacks.
- payout schedules.
- PSP reconciliation.
- negative balance handling.

بوابة الإغلاق:

- مجموع القيود متوازن.
- لا payout دون reconciled source.
- إعادة webhook لا تنشئ قيدًا ثانيًا.

### Stream J — Loyalty & Referral

المخرجات:

- points ledger.
- referral attribution.
- coupon engine.
- cashback/store credit.
- expiration.
- anti-abuse.
- seller-funded/platform-funded campaigns.

### Stream K — Additional Channels

الترتيب المبدئي:

1. Bol.com production canary.
2. Shopify.
3. Amazon.
4. eBay.
5. قنوات أخرى حسب الطلب التجاري.

الترتيب قابل للتغيير حسب أول عميل خارجي مدفوع، لكن لا يتم تغيير النواة لقناة واحدة.

### Stream L — Advanced AI Agents

المخرجات:

- customer service assistant.
- listing content agent.
- pricing suggestions.
- replenishment agent.
- slow stock and auction recommendation.
- reconciliation triage.
- merchant performance coach.
- controlled execution under approvals.

## 31. تسلسل الإطلاق المقترح

### Release 1 — Verified Core

- إغلاق فجوات الحالة الحالية.
- مراجعة Phase 5.
- clean build and migrations.
- security baseline.

### Release 2 — Founding Merchant Alpha

- الشركات الست.
- seller dashboard operations.
- direct orders in controlled environment.
- no public scale promises.

### Release 3 — Borvat Direct Beta

- checkout, shipping, returns.
- catalog from founding merchants.
- limited real customers.
- metrics and support runbook.

### Release 4 — Bol Controlled Canary

- test/read-only/shadow.
- explicit owner approval.
- limited account/offers/orders.
- process status success.
- kill switch drill.

### Release 5 — External Merchant Beta

- أول تجار خارجيين.
- SaaS billing.
- onboarding/compliance.
- support and SLA.

### Release 6 — Auction Pilot

- selected excess stock.
- controlled settlement.
- operational pickup/shipping.

### Release 7 — Wallet/Loyalty Expansion

- PSP-backed settlement.
- loyalty/referral.
- campaigns.

### Release 8 — Multi-channel Growth

- Shopify/Amazon/eBay.
- paid acquisition.
- fulfillment scale.

## 32. Definition of Done العام

أي وحدة لا تعتبر مكتملة حتى تحقق:

- Requirements مكتوبة.
- Data ownership واضح.
- RLS/authorization tests.
- Idempotency tests.
- Failure and retry tests.
- Audit trail.
- Observability.
- Migration and rollback.
- UI operational flow.
- Support runbook.
- Security review.
- Owner acceptance for high-risk live operations.

## 33. اختبارات قبول حاسمة

### Tenancy

- الشركة A لا ترى أو تعدل أي بيانات للشركة B.
- service role bypass موثق ومحدود.
- support access مسجل.

### Inventory

- لا oversell تحت التزامن.
- reservations all-or-nothing.
- ledger يطابق balances.
- failure الخارجي لا يفسد الحقيقة الداخلية.

### Orders

- duplicate webhook لا ينشئ طلبًا ثانيًا.
- unknown SKU يدخل exception queue.
- cancellation/refund حالات صريحة.

### Shipping

- internal ship commit قبل channel confirmation.
- label retry لا ينشئ شحنتين.
- source-channel packaging policy مطبقة.

### Billing

- order counted once.
- tier transition لا يخفض الفاتورة بلا قرار مقصود.
- credits and adjustments auditable.

### Wallet

- no unbalanced entries.
- no payout before reconciliation.
- refunds/chargebacks traceable.

### AI

- agent cannot escape tenant scope.
- high-risk action requires approval.
- every execution has receipt and actor.

## 34. مؤشرات الأداء

### Marketplace

- GMV.
- conversion rate.
- active buyers.
- repeat purchase rate.
- average order value.
- shipping SLA.
- return/refund rate.

### Merchant SaaS

- active merchants.
- connected channels.
- processed orders.
- revenue per merchant.
- sync success rate.
- support tickets per 1,000 orders.
- churn.

### Operations

- inventory accuracy.
- oversell incidents.
- pick/pack time.
- label failure rate.
- reconciliation findings age.
- failed outbox age.

### Auctions

- sell-through rate.
- recovery value versus cost.
- bidder participation.
- unpaid winners.

### Loyalty

- redemption rate.
- referred customers.
- repeat purchase uplift.
- fraud rate.

## 35. سجل المخاطر

| الخطر | الأثر | المعالجة |
|---|---|---|
| توسع النطاق بسرعة | تأخير وعدم إغلاق الوحدات | إطلاق تدريجي ومسارات واضحة |
| الاعتماد على Bol | توقف المبيعات | Borvat Direct وقنوات متعددة |
| قبول تجار عاليي المخاطر | قانون/سمعة/Chargebacks | Onboarding مستقل وRisk Engine |
| سعر SaaS منخفض جدًا | خسارة دعم وبنية | حد أدنى وAdd-ons وقياس Unit Economics |
| خلط عملاء القنوات | إغلاق حسابات | Channel Compliance Engine |
| خلط المحافظ والولاء | أخطاء مالية وتنظيمية | Ledgers منفصلة وPSP مرخص |
| Hardcoding للشركات الست | فشل مع أول عميل خارجي | Tenants طبيعية واختبار شركة سابعة |
| كثرة الاختبارات دون تشغيل | ثقة زائفة | Canary وrunbooks ومراقبة |
| بيانات منتج غير موثوقة | نزاعات وحظر listings | evidence, moderation, confidence matching |
| Agent overreach | تنفيذ غير مصرح | scopes, approvals, receipts, kill switches |

## 36. الحوكمة وتغيير القرارات

### أنواع القرارات

- Product Decision.
- Architecture Decision.
- Security Decision.
- Commercial Decision.
- Legal/Compliance Decision.
- Operational Decision.

### كل قرار جديد يسجل

- ID.
- التاريخ.
- القرار.
- السبب.
- البدائل المرفوضة.
- الأثر.
- المخاطر.
- owner approver.
- الملفات والمigrations المتأثرة.

### قاعدة الإصدار

- تعديل لغوي صغير: 1.0.1.
- إضافة أو توضيح غير كاسر: 1.1.
- تغيير جوهري في الرؤية أو architecture: 2.0.

## 37. القرارات الثابتة الحالية

1. Borvat منصة سوق وSaaS ومزادات وتشغيل، وليست نظامًا داخليًا لشركات المؤسس.
2. الشركات الست هي Founding Merchants عادية تقنيًا.
3. Bol قناة أولى، وليس مركز النظام.
4. يجب وجود قناة بيع مباشرة مستقلة.
5. B2C يعرض سعر المنتج شامل الضريبة والشحن منفصلًا.
6. التاجر يتحكم في الشحن المجاني أو threshold أو profiles.
7. طلبات القنوات الخارجية تطبق سياسات القناة في الرسائل والتغليف.
8. SaaS منخفض السعر أداة استقطاب، لكن الفوترة يجب أن تبقى اقتصادية وقابلة للتدقيق.
9. المخزون والمال يعتمد Ledger وIdempotency.
10. الأسرار لا تخزن نصيًا في الجداول التشغيلية.
11. لا Bol live دون test → read-only → shadow → approval → limited live.
12. AI لا يملك سلطة غير مقيدة.
13. أي Phase 5 أو مرحلة لاحقة تحتاج تحققًا قبل اعتمادها.

## 38. تعليمات التسليم للمبرمج

يوضع هذا الملف في المستودع:

```text
/docs/BORVAT_MASTER_BLUEPRINT_V1.md
/docs/BORVAT_CURRENT_STATE_V1.md
/docs/BORVAT_DECISION_LOG_V1.md
/README_BORVAT_GOVERNANCE.md
```

قبل كل مرحلة، يقدم المبرمج:

1. Scope واضح.
2. ما لن يتم تنفيذه.
3. الجداول والوظائف المتأثرة.
4. Security/RLS impact.
5. Migration plan.
6. Test plan.
7. Rollback plan.
8. Acceptance report.
9. تحديث Current State.
10. أي قرار جديد في Decision Log.

لا تقبل عبارة “كل شيء ناجح” دون أدلة قابلة لإعادة التشغيل.

## 39. معيار النجاح النهائي

Borvat تنجح عندما تستطيع:

- تشغيل الشركات الست بصورة مستقلة وآمنة.
- إضافة شركة سابعة خارجية دون تعديل خاص.
- بيع طلب مباشر كامل عبر Borvat دون قناة خارجية.
- مزامنة القنوات دون أن تصبح أي قناة مصدر الحقيقة الوحيد.
- حساب المخزون والشحن والعمولات والتسويات بدقة.
- تقديم SaaS اقتصادي وقابل للتوسع.
- تحويل المخزون الفائض إلى مزاد منظم.
- بناء ولاء وعلاقة مباشرة مع العميل.
- تشغيل وكلاء ذكاء اصطناعي ضمن صلاحيات وموافقات قابلة للتدقيق.

---

# الخلاصة

Borvat هي شركة تجارة تقنية متكاملة، تبدأ بست شركات حقيقية كحجر أساس، لكنها مصممة منذ اليوم الأول لتخدم تجارًا خارجيين على نطاق واسع. قوتها ليست في متجر واحد أو تكامل واحد؛ بل في جمع البيع، الربط، المخزون، الشحن، الفواتير، المزادات، المحافظ، الولاء والذكاء الاصطناعي داخل حل واحد.

الأولوية العملية التالية هي تثبيت حالة الكود الحالية، ثم ضمان وجود **Borvat Direct** كقناة بيع مستقلة وتشغيل الشركات الست عليها، بالتوازي مع تشغيل Bol بشكل متدرج ومقفل. كل توسع لاحق يجب أن يزيد الحركة والقيمة دون أن يضعف العزل أو الدقة المالية أو قابلية التشغيل.
