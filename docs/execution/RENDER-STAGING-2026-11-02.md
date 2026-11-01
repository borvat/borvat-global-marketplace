# Render staging — سبب الفشل وإمكانية التشغيل بلا نشر

**التاريخ:** 2026-11-02
**الخدمة:** `borvat-marketplace-staging-verified` — `srv-dbdr4rgm7kps73bdvmfg`
**اللوحة:** https://dashboard.render.com/web/srv-dbdr4rgm7kps73bdvmfg

## ما تقوله المنصة

| البند | القيمة |
|---|---|
| النوع | `web_service`، Node، منطقة frankfurt، خطة **free** |
| البرانش | `implementation/canonical-catalog-2026-10-23` (موجود على GitHub عند `5e91ecc`) |
| النشر التلقائي | `no` |
| Health check | غير مضبوط |
| أمر البناء | `npm exec --yes --package=bun@1.3.13 -- npm run commerce:build:isolated` |
| أمر التشغيل | `node apps/marketplace/.output/server/index.mjs` |
| آخر نشر | `dep-dbdr4s0m7kps73bdvoj0` — **build_failed**، من 19:16:00 إلى 19:16:21 (≈20 ثانية)، trigger=manual |
| الكميت | `5e91ecc` |
| أحداث المنصة | `build_started` → `build_ended` → `deploy_ended: failed`، بلا رسالة سبب |

**حدود صريحة:** واجهة Render لا تعطي سجل البناء. جرّبت `/v1/services/{id}/deploys/{dep}/logs` و`/v1/services/{id}/logs` و`/v1/logs?...` فكانت 404 و404 و400. `finishedReason` راجع `null`. فالسبب أدناه مستنتج من أمر البناء ومحتوى المستودع، لا من نص سجل.

## السبب: أمر البناء لا يثبّت الاعتماديات

1. أمر البناء يشغّل `npm run commerce:build:isolated`، أي `node scripts/commerce-integration/build.mjs isolated`.
2. `build.mjs` يشغّل `node_modules/vite/bin/vite.js build` بـ`cwd = apps/marketplace`، أي أن vite يجب أن يكون داخل `apps/marketplace/node_modules`.
3. المستودع عند `5e91ecc` **لا يحتوي** أي `node_modules` (`git ls-tree -r | grep apps/marketplace/node_modules = 0`)، و`package.json` في الجذر بلا أي اعتمادية، ولا يوجد `preinstall`/`install`/`postinstall`/`prepare` في أي من الملفين.
4. إذن على نسخة نظيفة لا يمكن أن يوجد `apps/marketplace/node_modules/vite`، والبناء يفشل عند أول استدعاء قبل أي تحويل أو تجميع.
5. المدة (20 ثانية) تؤكد ذلك: تنزيل `bun@1.3.13` عبر `npm exec` ثم فشل فوري. تثبيت 567 حزمة وحده يحتاج دقائق.

الملاحظة السابقة في تقارير المستودع بأن البناء «يفشل على `hero.jpg`» تخص مرحلة لاحقة بعد نجاح التثبيت، وليست سبب هذا النشر.

**ثغرة ثانية محتملة:** الجذر يفرض `engines.node = ">=24 <25"`، ولا يوجد ملف تثبيت إصدار (`.node-version` أو `NODE_VERSION`) في المستودع. Render يستخدم إصداره الافتراضي، فسينتج `EBADENGINE` وقد يفشل التسجيل إن فُعّل `engine-strict`.

## إعادة الإنتاج محلياً: ما نجح وما لم ينجح

| الخطوة | النتيجة |
|---|---|
| `bun install --frozen-lockfile --ignore-scripts` بإصدار 1.3.13 | **نجح**: 244 مدخلاً في `apps/marketplace/node_modules`، و`vite/bin/vite.js` موجود |
| `vite build` بالنمط المعزول على Windows | **فشل بسبب عيب خاص بويندوز** داخل `@lovable.dev/mcp-js`: يطابق `src/routes` مقابل مسار بشرطة مائلة عكسية، ويرفض. لا علاقة له بـRender |
| `build.mjs` على Windows | يفشل قبل ذلك بسبب `NODE_OPTIONS=--import=<مسار ويندوز>` (يحتاج `file://`) |

**الخلاصة:** تحقّق كامل لبناء Linux غير ممكن على هذا الجهاز. Docker غير مثبّت، وWSL غير مستخدم في هذه الجلسة، والتحقق النهائي يحتاج إما نشراً على Render أو بيئة Linux.

## إمكانية التشغيل بلا تكلفة جديدة

- الخطة `free`، والخدمة موجودة أصلاً، فلا موارد ولا تكلفة إضافية.
- الإصلاح المقترح **إعداد فقط**، بلا تغيير كود:
  - `buildCommand`: `cd apps/marketplace && npm exec --yes --package=bun@1.3.13 -- bun install --frozen-lockfile --ignore-scripts && cd ../.. && npm run commerce:build:isolated`
  - متغير بيئة: `NODE_VERSION=24`
  - `healthCheckPath`: مسار يرد 200 بعد الإقلاع (الخدمة الآن بلا فحص صحة)
- تطبيق ذلك يتطلب كتابة على الخدمة (تعديل إعداد) ثم **نشراً**، وكلاهما خارج المأذون حالياً. لم أنفّذ أياً منهما.
- الجهة الأصح للجذر أن يصلح في المستودع: ملف `.node-version` بقيمة `24`، وإضافة التثبيت إلى أمر البناء في توثيق النشر، حتى لا يعتمد على إعداد يدوي في اللوحة.

## القرار المطلوب

1. الموافقة على تعديل إعداد الخدمة أعلاه وتشغيل نشر تجريبي واحد (بلا تكلفة، لكنه نشر)، أو
2. إصلاح الجذر في المستودع أولاً (`.node-version` + أمر بناء موثّق) ثم النشر، أو
3. ترك الخدمة كما هي واعتبار staging **غير صالح** حتى يُتخذ القرار.
