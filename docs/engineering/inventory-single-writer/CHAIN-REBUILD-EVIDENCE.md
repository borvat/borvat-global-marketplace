# بناء السلسلة الكاملة من الصفر — دليل ديناميكي على قاعدة نظيفة

**التاريخ:** 2026-11-02
**الفرع:** `work/inventory-single-writer`
**البيئة:** PostgreSQL 18.6 محلي معزول (منفذ 5434)، بيانات وهمية فقط، لا مشروع Supabase حيّ ولا بيانات إنتاجية.
**السكربتات:** `scripts/chain-rebuild/` (bootstrap.sql, apply.cjs, verify.cjs)

## ما يميز هذا الدليل عن `PRIVILEGE-VERIFICATION.md`

الدليل السابق أثبت **منطق** تسلسل `GRANT/REVOKE` بإعادة محاكاته على قاعدة فارغة. هذا الدليل لا يحاكي شيئاً: يشغّل **ملفات الترحيل الحقيقية الـ128** بالترتيب على قاعدة فارغة نظيفة، ثم يقيس حالة الامتياز الناتجة باستعلامات فعلية ومحاولات كتابة حقيقية تحت الدور `authenticated`.

## النتيجة: 107 من 128 ترحيلاً تُطبَّق، 21 تفشل

| المجموعة | العدد | الملفات | السبب |
|---|---|---|---|
| تعتمد على بيانات وهمية (fixtures) داخل ملف الترحيل نفسه | 8 | `20260725220916`, `20260726094140`, `20260726130022`, `20260726135308`, `20260726142346`, `20260726145235`, `20260726151219`, `20260801002900` | الملف ينشئ جداول ثم يؤكد وجود مستخدمين/شركات مزروعة؛ على قاعدة فارغة يجهض الـ harness فيُلغى الملف كاملاً |
| تالفة تتابعياً من المجموعة الأولى | 13 | `20260726153323`, `20260726162558`, `20260726163821`, `20260726164218`, `20260726170407`, `20260726171748`, `20260726173300`, `20260726174310`, `20260726175606`, `20260726182333`, `20260726184803`, `20260726192627`, `20260726192842` | `20260726145235` كان ينشئ `merchant_store_sku_delivery_promise_assignments`، ولما أُلغي غاب الجدول؛ ثم `20260726162558` كان ينشئ `schema internal_shipping` في ملف يفشل لغياب الجدول، فغاب الـ schema وتوالى فشل 9 ملفات أخرى عليه |

**الخلاصة على السلسلة نفسها:** لا يمكن إعادة بناء المخطط كاملاً من قاعدة فارغة. السبب بنيوي: ملفات الترحيل تخلط DDL مع تأكيدات بيانات. هذا عيب في نظافة الترحيلات، وهو نفس النوع الذي عالجه الكميت `a4a057b` حين أخرج Phase B وملف التراجع من `migrations/`. الإصلاح المطلوب (لم يُنفَّذ هنا): فصل الـ harness عن DDL، أو تصنيف ملفات التأكيد خارج مسار الترحيل.

**الملفات المستهدفة في هذا الورد لم تتأثر:** `20260724210701` (حظر `place_order`) و`20261101000000` (سحب صلاحيات المخزون) نجحا، والجدولان `inventory_lots` و`inventory_serials` موجودان.

## تحقق الامتياز الديناميكي: 10 من 11

| المعرّف | الفحص | النتيجة |
|---|---|---|
| A1 | `create_reservation` مسحوبة من `authenticated` | PASS |
| A2 | `reserve_bol_order_line` مسحوبة من `service_role` | PASS |
| A3 | `post_inventory_transaction` محجوبة عن `authenticated` (owner-only) | PASS |
| A4 | `cancel_reservation` مسحوبة من `authenticated` | PASS |
| A5 | `authenticated` يقرأ جداول المخزون تحت RLS | **FAIL** |
| A5b | تحديد سبب رفض القراءة | PASS |
| A6 | `INSERT` فعلي على `inventory_lots` بدور `authenticated` مرفوض | PASS (`42501` على مستوى الجدول) |
| A7 | `UPDATE` فعلي على `inventory_serials` بدور `authenticated` مرفوض | PASS (`42501` على مستوى الجدول) |
| A8 | ملف التراجع يعيد كل امتياز مسحوب | PASS |
| A8b | إعادة تطبيق Phase A تسحب ثانيةً (دورة مغلقة) | PASS |
| A9 | `place_order` القديمة غير قابلة للتنفيذ من أي دور عميل | PASS (`anon/authenticated/service_role/sandbox_exec/public` كلها false) |

### A5: سبب الفشل وتأثيره

الترحيل `20260726222737` (M1B-0R، تطبيع انحراف ACL) يسحب `EXECUTE` من `PUBLIC, anon, authenticated, service_role, sandbox_exec` على **كل** دالة في `public`، ثم يعيد المنح لـ11 دالة تطبيقية محددة فقط. الدوال المساعدة التي تعتمد عليها سياسات RLS لم تُعد إلى قائمة المنح:

- `is_company_member(uuid,uuid)`
- `is_company_owner(uuid,uuid)`
- `company_member_has_permission(uuid,uuid,text)`

النتيجة المقاسة فعلياً: أي قراءة مباشرة لجداول المخزون بدور `authenticated` ترجع خطأ `42501 permission denied for function is_company_member` بدل أن ترجع صفوفاً أو مجموعة فارغة. السياسات المتأثرة عشرة: `inventory_lots.lots_read/lots_update`، `inventory_serials.serials_read/serials_update`، `inventory_transactions.inv_tx_read`، `inventory_balances.inv_balances_read`، `inventory_reservation_headers/lines/allocations`، `inventory_transaction_entries`.

هذا **خطأ تنفيذي لا منع**: سياسة لا تستطيع التنفيذ لا تعني "منع القراءة"، تعني انهيار الاستعلام. أي استعلام يمر بدور `authenticated` (واجهة المتصفح بمفتاح anon + JWT المستخدم) على هذه الجداول سيفشل.

لم يُطبَّق أي إصلاح. الخيارات أمام المالك:
1. إضافة الدوال الثلاث إلى قائمة المنح في `20260726222737` أو ترحيل جديد لاحق لها (سحب/منح فقط، لا بيانات).
2. إسقاط سياسات القراءة لـ`authenticated` إن كانت القراءة يجب أن تمر حصراً عبر RPC الـ`SECURITY DEFINER`.
3. قبول الحالة إذا كان الوصول المباشر ممنوعاً بالتصميم — لكن يجب توثيق أن الخطأ مقصود، لأن الفرق بين منع وخطأ فرق في سلوك الواجهة.

## إعادة التوليد

```bash
# قاعدة نظيفة: initdb ثم تشغيل postgres على منفذ 5434
export PG_MODULE=/path/to/node_modules/pg PGHOST=127.0.0.1 PGPORT=5434 PGUSER=postgres PGDATABASE=postgres

node scripts/chain-rebuild/apply.cjs apps/marketplace/supabase/migrations result.json --reset
node scripts/chain-rebuild/verify.cjs verify.json
```

النتائج الخام: `evidence/chain-apply-result.json` (107/21 مع نصوص الأخطاء) و`evidence/chain-privilege-result.json` (10/11 مع التفاصيل).

## حدود صريحة

- PostgreSQL 18.6 عادي، وليس Supabase حياً. المخططات `auth` و`storage` والصلاحيات الافتراضية استُنسخت بحد أدنى في `bootstrap.sql`، لا شيء من جداول BORVAT أنشأه الـbootstrap.
- لا بيانات إنتاجية ولا مشروع Supabase حيّ ولا نشر ولا دمج. لم يُغيَّر أي ملف ترحيل.
- اختبارات A تتعلق بطبقة الامتياز وRLS فقط؛ لا تثبت أجسام دوال plpgsql ولا صحة منطق المخزون نفسه.
- فشل 21 ترحيلاً يخصّ بناء المخطط من الصفر، ولم يُغيَّر أي منها.
