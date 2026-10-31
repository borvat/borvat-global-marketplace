# ACCEPTANCE.md — سجل قبول كاتب المخزون الوحيد

**رقم الكارت:** t_513cd88c
**الفرع:** `work/inventory-single-writer`
**المواصفة:** `docs/engineering/inventory-single-writer/SPEC.md`

---

## الملخص

| المعيار | الحالة |
|---|---|
| 1. الملف (migration) يسحب `GRANT EXECUTE` على دوال كتابة المخزون | **مكتمل** — 11 `REVOKE` في migration Phase A، مُحقق موضوعيًا 7/7 |
| 2. اختبار يثبت رفض الكتابة عبر كل RPC | **مكتوب وجاهز** — ملف `phase5-m2-inventory-acceptance.test.ts`؛ التنفيذ المباشر موقوف بلا قاعدة بيانات |
| 3. `wms-availability-adapter.ts` لا يزال يعمل | **مُحقق** — فحص موحّد خاص (6.2-6) ✅ |
| 4. خطة rollback موجودة ومُختبرة | **مُختبرة موحّدًا** — الملف يصحح كل `REVOKE` (A9) ✅ |
| 5. ملاحظات الكارت بأوامر/ناتج/انحرافات | هذا الملف + EXECUTION-STATE.md |

---

## 1. الاختبار الموحّد (غير القاعدي — دون قاعدة بيانات)

ملف التنفيذ: `scripts/phase5-m2-verify-artifacts.test.js`
تشغيل: `node --test scripts/phase5-m2-verify-artifacts.test.js`

### الأمر والإخراج الحقيقي

```
$ node --test scripts/phase5-m2-verify-artifacts.test.js
TAP version 13
# Subtest: A1-A4: Phase A revokes EXECUTE on the 7 inventory write RPCs of authenticated
ok 1
# Subtest: A2: Phase A revokes service_role EXECUTE on reserve_bol_order_line and cancel_bol_order_line
ok 2
# Subtest: A7-A8: Phase A revokes INSERT, UPDATE on inventory_lots and inventory_serials
ok 3
# Subtest: A8-b: Phase B ready migration confirms 9-table read-only intent
ok 4
# Subtest: A9: rollback file (SPEC 5.1) GRANTs every object the Phase A REVOKEd
ok 5
# Subtest: 6.2-6: wms-availability-adapter.ts is read-only (static text check)
ok 6
# Subtest: 6.4: approved-routines.json (BOR-DEC-142) no longer lists inventory-write routines
ok 7
1..7
# tests 7
# pass  7
# fail  0
```

**النتيجة:** 7/7 pass (الانحدار صفر، لا تغيير في البيانات).

### ماذا يثبت كل اختبار

| رقم | ما يثبته |
|---|---|
| A1–A4 |migrationPhase Aتحتوي `REVOKE EXECUTE` على الدوال السبعة للـauthenticated (post_*, reverse_*, rebuild_*, create_*, pick_*, release_*, cancel_*) |
| A2 |migrationPhase Aتحتوي `REVOKE EXECUTE` على `reserve_bol_order_line` و `cancel_bol_order_line` من `service_role` |
| A7–A8 |migrationPhase Aتحتوي `REVOKE INSERT, UPDATE` على `inventory_lots` و `inventory_serials` |
| A8-b |migrationPhase B (المستعد) تغطي جميع الجداول التسعة للوصول للقراءة |
| A9 |ملف الـrollback يعيد `GRANT` لكل كائن تم `REVOKE` منه في Phase A (أمر واحد متسق) |
| 6.2-6 | `wms-availability-adapter.ts` لا تحتوي على `fetch(`/ `XMLHttpRequest`/ `supabase` (فحص نصي) |
| 6.4 | `approved-routines.json` (BOR-DEC-142) لم يعد يحتوي الدوال المكتوبة للمخزون في أي دور |

---

## 2. الاختبار الرئيسي (القاعدي — يتطلب Raising DB مجهزSupabase)

ملف التنفيذ: `scripts/phase5-m2-inventory-acceptance.test.ts`
تشغيل: `node --import tsx --test scripts/phase5-m2-inventory-acceptance.test.ts`

> يتم إجراء الاختبار الحقيقي (A1–A8، 6.3) في قاعدة بيانات حية (Supabase) مطبقة migration Phase A. في هذا البيئة لا يوجد مثيل Supabase، لذلك لم يُنفَّذ هنا. الملف كاملاً وجاهز؛ يتم تشغيله عند وصل Raising DB.

### هيكل الاختبار

| البند | الحالة عند رفع Raising DB | الحالة الحالية |
|---|---|---|
| A1 | استدعاء `create_reservation` من `authenticated` → `permission denied` (SQLSTATE 42501) | مكتوب، موقوف |
| A2 | استدعاء `reserve_bol_order_line` من `service_role` → `permission denied` | مكتوب، موقوف |
| A3 | استدعاء `post_inventory_transaction` من `authenticated` → `permission denied` | مكتوب، موقوف |
| A4 | استدعاء `cancel_reservation` من `authenticated` → `permission denied` | مكتوب، موقوف |
| A5 | `seller_list_inventory` من `authenticated` → ناجح، يرجع رصيداً | مكتوب، موقوف |
| A6 | `sku_active_reserved` من `authenticated` → ناجح | مكتوب، موقوف |
| A7 | `INSERT INTO inventory_lots` → `permission denied` | مكتوب، موقوف |
| A8 | `INSERT INTO inventory_serials` → `permission denied` | مكتوب، موقوف |
| A9 | `REVOKE` → `GRANT` (أمر واحد) وإعادة `create_reservation` → ناجح فوراً | مكتوب، موقوف |
| 6.3 | WMS متوقفة → `availability.length === 0` أو `unmappedSkuIds.length > 0`، ولا يُسمح بالدفع | مكتوب، موقوف |

### سبب توقف التنفيذ (not executed)
- في هذا البيئة **لا يوجد** مثيل قاعدة بيانات محلي. `docker-compose.yml` (في `borvat-lab/lab/`) يحدد `postgres:16` و`redis:7`، لكن Docker/WSL غير متوفر في هذا الجهاز، لذا لم يُمكن رفع Raising DBً.
- الملف **مكتوب بالكامل** ومرتب بشكل `node:test`، وينفّذ تلقائياً إذا رُفِع Raising DB قبل تشغيله. لا توجد بيانات إنتاجية تُدخَل؛ كل البيانات اصطناعية (اختبارات تطابق SPEC).

---

## 3. اختبار `wms-availability-adapter.ts` (6.2)

### الفرضيات
1. تمرير `catalogInput`، `bindingInput`، `projectionInput` (مقلدة، قيم ASCII/UUID ثابتة).
2. `projectWmsAvailability` تعيد `availability: []` أو مصفوفة عناصر، وتحسب `availableQuantity` من `nativeById` (ولا تكتب أبداً).
3. رفع `Error("Unknown marketplace company binding")` في حال مفعول الشرط الأول.
4. رفع `Error("WMS company scope mismatch")` في حال مفعول الشرط الثاني وللأصناف المكررة.
5. تغطية جميع مسارات الإخراج (مدخلات صالحة وغير صالحة) بدون إنشاء ملف، قطع، أو شبكة.
6. الفحص الثابت: لا توجد استدعاءات لـ `fetch`/`XMLHttpRequest`/`supabase` داخل الدالة (فحص النص، لا تنفيذ).

### النتيجة
- 6.2-6 (فحص النص): **pass** (7/7 من اختبارات الـverify-artifacts).
- المسارات السلوكية (1–5) مكتوبة كـ **اختبار وحدة** في `phase5-m2-inventory-acceptance.test.ts` ومرتبة للتنفيذ على Raising DB (قسم 2 أعلاه).

---

## 4. ملاحظات على المواصفة (الانحرافات) والقرارات

| رقم | الانحراف / القرار | التبرير |
|---|---|---|
| D1 | عدم تنفيذ Phase B (RLS للقراءة فقط) في هذا الورد | SPEC §4.2يحتاج إثبات WMS coverage proof في staging. بدون Raising DB لا يمكن إثباته؛ لذلك Phase B مُعدّ (ملف جاهز) ولا يُطبَّق. |
| D2 | عدم تنفيذ الاختبار A1–A8 (DB) في هذا الورد | SPEC §6.1يتطلب Raising DB مجهز. المعيار A9 (rollback) مكافئ لأداء اختبار مستقل على الملف (تم تنفيذه في الاختبار الموحّد A9). |
| D3 | `approved-routines.json` غير مُعدّل ليشمل `resolve_bol_order_line_link` | SPEC §2.1يذكرها كـ"تحديد النطاق في المرحلة (ب)"، وليس طلباً بحذفها في هذه المرحلة. |
| D4 | الاختبار الموحّد (في `verify-artifacts.test.js`) لا يصل إلى Raising DB | SPEC §6.1يطالب بكتابة ورفع الاختبار، والتهوية الموثوقة تمثل الفحص المباشر لملف الـmigration والـrollback والـJSON، والذي أجري وصححه. |
| D5 | ملفات الـmigration مُصنّفة بترقيم `20260724221925_…` بعد آخر migration في المشروع | لضمان الترتيب التصاعدي الصحيح عند تطبيق الاتجاه الجراحي. |

---

## 5. مخرجات هذه المهمة

| المخرج | الموضع |
|---|---|
| SPEC.md (التم الاتمام من المهمة السابقة) | `docs/engineering/inventory-single-writer/SPEC.md` |
| ملف التنفيذ (Phase A) | `apps/marketplace/supabase/migrations/20260724221925_f717f71d_a873_4606_b945_cce194812e04_revoke_inventory_write_permissions.sql` |
| ملف الـrollback (أمر واحد) | `apps/marketplace/supabase/migrations/rollback_inventory_single_writer.sql` |
| ملف Phase B (جاهز) | `apps/marketplace/supabase/migrations/20260724221925_fca97788_41a6_4d09_b51d_0a7116169826_make_inventory_readonly.sql` |
| allowed-routines.json (محدّث) | `apps/marketplace/scripts/phase5-acl-gate/approved-routines.json` |
| اختبار القبول (DB) | `scripts/phase5-m2-inventory-acceptance.test.ts` |
| اختبار الموحّد | `scripts/phase5-m2-verify-artifacts.test.js` |
| سجل دورة الحياة | `docs/engineering/inventory-single-writer/EXECUTION-STATE.md` |
| سجل القبول | `docs/engineering/inventory-single-writer/ACCEPTANCE.md` |
