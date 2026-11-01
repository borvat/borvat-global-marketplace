# chain-rebuild

إعادة بناء سلسلة ترحيلات BORVAT على قاعدة PostgreSQL نظيفة، ثم قياس حالة الامتياز ديناميكياً.

الغرض تشخيصي وإثباتي فقط: لا يعدّل أي ترحيل، ولا يمسّ مشروع Supabase حياً، ولا يستخدم بيانات إنتاجية.

## التشغيل

```bash
# 1) قاعدة نظيفة. PostgreSQL 18، مستخدم superuser، لا امتدادات خارجية.
#    initdb -U postgres -A trust -D <datadir> && postgres -D <datadir> -p 5434

# 2) مسار وحدة pg (المشروع لا يضيف اعتمادية جديدة لهذا الغرض)
export PG_MODULE=/path/to/node_modules/pg
export PGHOST=127.0.0.1 PGPORT=5434 PGUSER=postgres PGDATABASE=postgres

# 3) التطبيق بترتيب أسماء الملفات، مع إحصاء النجاح والفشل
node scripts/chain-rebuild/apply.cjs apps/marketplace/supabase/migrations apply-result.json --reset

# 4) قياس الامتياز على القاعدة الناتجة
node scripts/chain-rebuild/verify.cjs verify-result.json
```

`--reset` يسقط مخططات `public/auth/storage/extensions/supabase_migrations` ويعيد تطبيق `bootstrap.sql`. بدون `--reset` يُطبَّق الترحيل فوق قاعدة قائمة.

## الملفات

| الملف | الدور |
|---|---|
| `bootstrap.sql` | يستنسخ فقط ما ينشئه Supabase مسبقاً: الأدوار (`anon`, `authenticated`, `service_role`, `authenticator`, `supabase_admin`, `sandbox_exec`) ومخططا `auth` و`storage` ودوال `auth.uid/role/email/jwt` و`storage.foldername`، ومنح `USAGE` على `public` للأدوار الثلاثة |
| `apply.cjs` | ينفّذ كل ملف ترحيل كاستعلام واحد متعدد العبارات (= معاملة ضمنية للملف) ويوثّق كل فشل برمزه ونصه |
| `verify.cjs` | فحوص A1–A9 على القاعدة الناتجة، بمحاولات فعلية تحت `SET LOCAL ROLE authenticated` لا بقراءة نص المنح |

## ما لا يفعله

- لا يزوّد بيانات وهمية. ملفات الترحيل التي تحتوي harness يعتمد على بيانات مزروعة ستفشل، وهذا مقصود ومُوثَّق.
- لا يثبت صحة منطق المخزون ولا أجسام الدوال؛ يقيس طبقة الامتياز وRLS.
- لا يصلح للاستخدام كبديل عن تشغيل Supabase CLI على المشروع الحقيقي.
