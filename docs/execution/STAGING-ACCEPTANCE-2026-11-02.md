# قبول Staging — نشر تجريبي واحد

**التاريخ:** 2026-11-02
**الخدمة:** `borvat-marketplace-staging-verified` — `srv-dbdr4rgm7kps73bdvmfg`
**الرابط:** https://borvat-marketplace-staging-verified.onrender.com
**الكميت المنشور:** `5e91ecce2b6e6cc65924a2739459a491b220b260`
**النشر:** `dep-dbjtql3bc2fs73drl1p0` — `build_in_progress` 03:45:5x ← `update_in_progress` 03:46:49 ← **live** 03:47:29

## التحقق قبل التنفيذ (شروط الموافقة)

| الشرط | النتيجة |
|---|---|
| خطة مجانية | `plan = free`، منطقة frankfurt، مثيل واحد، بلا قرص، بلا قاعدة بيانات مُدارة |
| لا موارد جديدة | لم يُنشأ أي مورد؛ عدّلت إعداد الخدمة القائمة فقط |
| معزولة عن الإنتاج | متغير بيئة واحد فقط: `NODE_VERSION`. لا `DATABASE_URL` ولا مفاتيح Supabase ولا أي ربط بمشروع إنتاجي |

## الإعداد الذي تغيّر

| البند | قبل | بعد |
|---|---|---|
| Build command | `npm exec --yes --package=bun@1.3.13 -- npm run commerce:build:isolated` | `cd apps/marketplace && npm exec --yes --package=bun@1.3.13 -- bun install --frozen-lockfile --ignore-scripts && cd ../.. && npm run commerce:build:isolated` |
| Health check | بلا | `/` |
| `NODE_VERSION` | قيمة سابقة بطول حرفين | `24` |

## HTTP من خارج الخدمة

| المسار | النتيجة |
|---|---|
| `/` | **200**، 8829 بايت، `<title>Borvat — Smart living, made affordable</title>`، `lang="nl-NL"` |
| `/discover` | **200**، 8398 بايت، `<title>Ontdek onze collectie · BORVAT</title>` |
| `/assets/index-BUvYizh0.js` | **200** |
| الهيدرز | `rndr-id` + `Server: cloudflare`، أي الرد من Render لا من تخزين وسيط |

حجم الصفحة الرئيسية على staging **8829 بايت**، وهو الرقم نفسه الذي أنتجه البناء المحلي على Linux لنفس الكميت، أي أن ما يخدمه staging هو نفس ناتج البناء.

## اختبار المتصفح

| الصفحة | ما تحقّق |
|---|---|
| `/` | عنوان، `h1` = «Ontdek onze voorbeeldcollectie»، 8 بطاقات منتجات، 8 أسعار، روابط `/discover` و`/cart` و`/requests` و`/workbench` |
| `/discover` | 16 رابط منتج، مرشّحات: بلد (هولندا/بلجيكا)، بحث، تصنيف، ترتيب |
| `/product/prd_001` | `h1` = «Eiken eettafel 180×90 — natuurlijke afwerking»، زر «Voeg gekozen aanbod toe» |
| إضافة إلى السلة | الزر يعمل، وشارة الرأس تصبح `Mandje (1)` |
| `/cart` عبر تنقّل داخلي | السطر «Eiken eettafel 180×90 — natuurlijke afwerking»، الكمية، الحذف، `Artikeltotaal: € 749,00` |
| `/requests` | يفتح بحالة فارغة صحيحة |
| `/workbench` | يفتح ويعرض مساحات البائع والمدير |

**سلوك متوقع لا عيب:** إعادة تحميل الصفحة تمسح السلة؛ التطبيق يعلن ذلك في شريطه: «LOKALE DEMO · fictieve collectie · geen echte bestelling of betaling · herladen wist wijzigingen». التنقل الداخلي يحفظ الحالة، وإعادة التحميل لا.

**لم يُثبت:** اختبار العرض الضيق (320px). محاكاة المقاس أبلغت عن عرض 1521px، فالقياس غير صالح كدليل على التخطيط الضيق. لا أعلنه PASS.

## الحدود

- التطبيق في النمط المعزول: بيانات اصطناعية، بلا مصادقة حقيقية، بلا دفع، بلا كتابة إلى قاعدة. النشر يثبت البناء والتشغيل والمسارات، لا الجاهزية الوظيفية.
- لا يُعلن `READY FOR PRODUCTION`. هذا `READY FOR STAGING` فقط، وبمحتوى معزول.
- لم يُدمج PR #38، ولم تُنشأ موارد مدفوعة، ولم تُمسّ بيانات إنتاج.
