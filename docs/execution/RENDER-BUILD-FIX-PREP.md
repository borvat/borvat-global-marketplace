# Render staging — إصلاح أمر البناء، مُحضَّر ومُختبر محلياً

**الفرع:** `prep/render-build-20261102` (معزول، غير مدموج)
**الخدمة المستهدفة:** `borvat-marketplace-staging-verified` — `srv-dbdr4rgm7kps73bdvmfg`
**التاريخ:** 2026-11-02

## الخلل

أمر البناء الحالي:

```
npm exec --yes --package=bun@1.3.13 -- npm run commerce:build:isolated
```

لا يثبّت أي اعتمادية. `scripts/commerce-integration/build.mjs` يشغّل `node_modules/vite/bin/vite.js` من داخل `apps/marketplace`، والمستودع لا يحوي `node_modules`، و`package.json` في الجذر بلا اعتماديات، ولا يوجد hook تثبيت. فالنشر يفشل بعد 20 ثانية عند أول استدعاء.

## الإصلاح المقترح (إعداد الخدمة، لا كود)

| البند | القيمة |
|---|---|
| Build command | `cd apps/marketplace && npm exec --yes --package=bun@1.3.13 -- bun install --frozen-lockfile --ignore-scripts && cd ../.. && npm run commerce:build:isolated` |
| Start command | بلا تغيير: `node apps/marketplace/.output/server/index.mjs` |
| Env var | `NODE_VERSION=24` (ويُثبّتها `.node-version` في هذا الفرع) |
| Health check | مسار يرد 200، مثل `/` (الخدمة الآن بلا فحص صحة) |
| الخطة | free، بلا مورد جديد، بلا تكلفة إضافية |

## البرهان المحلي (Linux، داخل WSL Ubuntu)

نُفِّذ على الكميت نفسه الذي فشل عليه النشر `5e91ecce2b`، وليس على آخر نسخة من الفرع:

| الخطوة | النتيجة |
|---|---|
| `bun install --frozen-lockfile --ignore-scripts` بإصدار 1.3.13 | نجح، 567 حزمة |
| `node scripts/commerce-integration/build.mjs isolated` | **نجح**، `✓ built in 10.18s` وتوليد `.output/nitro.json` |
| تشغيل `node .output/server/index.mjs` على `PORT=10000` | `Listening on http://localhost:10000/` |
| `GET /` | **200**، 8829 بايت، HTML بالعربية/الهولندية (`lang="nl-NL"`) |
| `GET /discover` | **200** |

**استنتاج مزدوج:** الكود يبني ويعمل، والسبب الوحيد لفشل Render هو غياب خطوة التثبيت من أمر البناء.

**تصحيح لملاحظة قديمة:** توثيق سابق في المستودع نسب الفشل إلى `hero.jpg`. هذا غير صحيح على هذا الكميت: البناء الكامل نجح بما فيه الصفحة الرئيسية.

## القيود

- لم أعدّل إعداد الخدمة ولا شغّلت نشراً: كلاهما خارج المأذون.
- تشغيل الخدمة على Render لم يُثبَت بعد؛ المثبت هو البناء والتشغيل على Linux محلياً بنفس الأمر.
- `NODE_VERSION=24` مطلوب لأن الجذر يفرض `engines.node >=24 <25`، وإصدار Render الافتراضي أدنى. البناء المحلي نجح على Node 22.22.1 أيضاً، لكن التثبيت على 24 يطابق التعريف.
