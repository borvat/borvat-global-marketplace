# التدقيق الأول والأدلة

## النطاق الثابت

| المصدر | النسخة المقروءة | النتيجة |
|---|---|---|
| Lovable BORVAT STORE | `42fcde8cf1b2a11422c32301b6b423d3b5d39942` | تطبيق TanStack Start / React 19 / Supabase PostgreSQL، واجهات وRPC وترحيلات واختبارات |
| GitHub borvat/borvat-global-marketplace | `02243d583fb935555177d105e22ee45dc0b93a34` | README، .gitignore، docs/ARCHITECTURE.md، docs/ACCEPTANCE.md فقط؛ لا تطبيق ولا migrations |
| Replit surooh-commerce | تقرير فحص Replit للنسخة main `18aa4ca51a44d624879dd2bd9e41fdc96cc450fd` | origin يشير إلى borvat/surooh-commerce؛ لم يجد الفاحص صلة بـBORVAT STORE أو المستودع المحدد. خارج دمج هذه المهمة حتى يثبت الربط |

آخر نسخة التطبيق قُرئت بالـSHA بعد اكتشاف المشروع؛ بعض وثائق الاستكشاف الأولى قرئت عند HEAD. التقارير التاريخية مؤرخة يوليو/أغسطس، لا يجوز اعتبارها حالة قاعدة أكتوبر. `creation_status=completed` ووجود نشر سابق ليسا شهادة جاهزية.

## أجوبة الأسئلة الستة

| السؤال | الحكم المدعوم | الدليل وحدود الإثبات |
|---|---|---|
| حسابات البائع والمشتري حقيقية ومفصولة؟ | كود مصادقة حقيقي ونموذج عضوية شركات وطلبات اعتماد موجود؛ فصل شامل غير مثبت حالياً | `auth.tsx` يستدعي signUp/signInWithPassword وGoogle OAuth؛ `useSellerData.ts` يقرأ company-scoped RPC؛ `useSellerApplication.ts` يملك submit/review. نفس الشخص يمكنه امتلاك أكثر من صفة؛ الفصل بالصلاحيات والعضوية لا بقواعد مستخدمين منفصلة. لا اختبار جلسات حالي أو RLS حالي |
| دورة طلب كاملة؟ | لا | `checkout.tsx` يضع CHECKOUT_ENABLED=false في مسار خادم. السلة وPDP يستخدمان نموذج `products` القديم؛ ليسا دليلاً على canonical seller offers checkout |
| دفع مربوط؟ | لا يوجد دفع قابل للاستخدام مثبت في المسار المفحوص | checkout مقفل، لا Stripe SDK في package.json المقروء، ولا جداول دفع/استرداد/تسوية مخصصة في types المفحوص. عدم وجود SDK وحده ليس إثبات غياب أي تكامل خارجي؛ يلزم فحص كامل عند نقل المصدر |
| عمولات وتسويات؟ | واجهة تجريبية في المسار المالي؛ محرك مالي تشغيلي غير مثبت | `seller.finances.tsx` يستورد demoInvoices ويعرض أرصدة ومبالغ ثابتة وDemoAction |
| مرتجعات وشحن فعليان؟ | توجد أسس شحن وحجز مخزون وقنوات، لكن دورة بيع BORVAT/مرتجع/استرداد غير مثبتة | seller.shipping يستورد demoRateCards وdemoDeliveryPromises؛ admin/orders يستورد demoOrders. جداول reservations وoutbox في الأنواع، وتقارير manual quote؛ لا قبول رحلة carrier→delivery→return→refund |
| مؤهل للتوسع؟ | قابل للتطوير بعد سد فجوات؛ غير مؤهل لإطلاق واسع الآن | وجود حدود شركات وoutbox أساس جيد؛ تضارب legacy/canonical، ACL drift وتاريخ replay غير مكتمل، وعدم قياسات حمل أو استعادة أو قبول أموال يمنع استنتاج الجاهزية |

## النتائج ذات الأولوية

| ID | الأولوية | النتيجة | الإجراء المطلوب |
|---|---|---|---|
| F01 | P0 إطلاق | دورة الشراء مقفلة عمداً؛ لا تغيير العلم وحده | بناء checkout قانوني جديد مع حجز وتسعير خادمي وPSP sandbox |
| F02 | P0 أمن/تحقق | سجل القرارات حتى BOR-DEC-160 يبقي R-T21 مفتوحاً؛ BOR-DEC-152 يقول ACL gate يفشل بسبب sandbox grants | فحص catalog حي بصلاحية قراءة، ثم معالجة في staging. لا نعيد منح صلاحيات ولا ننقل schema قبل ADR واختبارات replay |
| F03 | P0 تحقق | P0-2 migration ما زال ينص على INSERT orders للمالك وINSERT order_items لمالك الطلب؛ route disabled وحده لا يثبت إغلاق data API | فحص grants+RLS+RPC النهائي وكل مسارات REST/MCP. احتمال bypass، وليس استغلالاً حياً مثبتاً؛ يجب رفض إنشاء مبلغ/طلب/بند مباشرة من العميل |
| F04 | P1 مؤكد محلياً | `buyerOrderStatus('new')` يعرض Betaald = مدفوع | فصل payment_status عن order_status؛ الجديدة لا تعني دفعاً. أعيد إنتاجه بتنفيذ الدالة الأصلية |
| F05 | P1 كود | `updateOrderItemStatus` يقبل inputValidator يعيد input دون Zod، ويحدث حسب seller_id=userId | اعتماد membership+permission+state machine خادمية، validation وoptimistic version، وربط العنوان الآمن. نحتاج RLS/trigger النهائي قبل الحكم بإمكانية استغلال |
| F06 | P1 بيانات | السلة تعرض شحناً ثابتاً 4.95 ومجانياً من 20 يورو على الإجمالي | إرجاع shipping_quote من الخادم لكل seller/offer/destination مع صلاحية؛ منع السعر الصامت الخاطئ |
| F07 | P1 تدقيق | MCP logAudit يبتلع فشل الحفظ، والذاكرة owner-scoped دون company scope ظاهر | إجراءات المال والمخزون الحساسة تفشل قبل الأثر إذا تعذر حفظ الأمر/التدقيق؛ ذاكرة SAM والتحليلات مقيدة بالشركة |
| F08 | P1 تحقق | اعتماد QNAN ليس مثبتاً؛ تقارير قديمة تتطلب مراجعاً مستقلاً وتمنع self_review | التحقق التجاري وPSP KYC بوابتان منفصلتان؛ لا شارة اعتماد بسبب اسم الشركة أو حساب المالك |
| F09 | P1 حوكمة | GitHub المقصود لا يحوي التطبيق، وADR-001 يقترح تقييم MercurJS فقط | تثبيت مصدر الحقيقة واستيراد آمن يحفظ التاريخ، أو spike معزول لـMercur. لا نعتمد Mercur كقرار واقع ولا نكرر بناء تطبيقين |

## ما يعاد استخدامه

| المكون | القرار | شرط النقل/القبول |
|---|---|---|
| مكونات UI والبحث والتصنيفات وPDP | إعادة استخدام مشروطة | ربطها بالكتالوج والعروض canonical، مراجعة ملكية الصور والشعار، تمييز demo، accessibility |
| Supabase Auth وbuyer-account | إعادة استخدام مشروطة | OAuth/reset/verify/session/revocation عبر اختبارات حقيقية مع مستخدمين صناعيين؛ إصلاح F04 |
| company_members وmerchant_stores وseller applications | أصل مفيد | snapshot للـDDL الفعلي، منع self-approval وcross-company وmass assignment، تحويل الإجراءات إلى capabilities |
| catalog_products/catalog_skus/catalog_offers/channel_listings | أصل مفيد يحتاج mapping | تثبيت الفرق بين المنتج المركزي وSKU التاجر والعرض العام؛ منع duplication بمراجعة بشرية حين يلتبس التطابق |
| inventory reservations/ledger وoutbox | إعادة استخدام عبر عقود | مخزون له مالك واحد، atomic last-unit، retries وreplay وtenant scope؛ لا نسخ أرصدة بين نظامين |
| tax/shipping foundations | إعادة استخدام جزئي | قواعد فعالة ومعتمدة، ربط بالخادم والوجهة والضرائب الفعلية؛ لا ترحيل بذور الأسعار تلقائياً |
| صفحات demo المالية والإدارة والشحن والدعم | هيكل واجهة فقط | استبدال البيانات والأوامر، عدم عرض مقاييس demo كأنها تشغيل |
| legacy place_order | لا يعاد تشغيله | يبقى ممنوعاً؛ استبدال canonical كامل مع قطع مسارات legacy |
| MercurJS | خيار spike فقط | ADR يقيّم نسخته وترخيصه وعزل البائع وoffer model وكلفة الانتقال، بمقارنة reuse stack الحالي |

## سجل التحقق الحالي

نجحت U01–U03 باستخدام الدالة الأصلية بعد إزالة أنواع TypeScript بواسطة Node 24 وتكييف تأكيدات الاختبارات الأصلية. R01 يعيد F04. S01–S04 ملاحظات static، لا اختبارات جاهزية. لم ننفذ build كاملاً أو PostgreSQL replay أو اختبارات جلسات أو PSP sandbox أو E2E أو load. لم تقرأ أسرار .env. استعلامات قاعدة Lovable الحالية أعادت UNAVAILABLE؛ لا أعداد تشغيل حية نستند إليها. لا تغييرات على التطبيقات أو GitHub أو قاعدة البيانات.

تقارير 14/14 أو 64/64 أو 91 اختباراً هي أدلة تاريخية من مؤلفيها، وليست نتائجنا. suite أو صفحة ناجحة لا تغني عن رحلة متعددة الهويات والطلبات وتحقق مستقل في PSP وWarehouse وAccounting.
