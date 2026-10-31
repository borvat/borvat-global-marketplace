# EXECUTION-STATE.md — مرحلة حظر كاتب المخزون الوحيد

**رقم الكارت:** t_513cd88c
**الفرع:** `work/inventory-single-writer` (نقطة `d7090e7`، متطابقة مع المصدر، نظيفة)
**المواصفة:** `docs/engineering/inventory-single-writer/SPEC.md`
**الملفات المعدلة (هذا الورد فقط، غير مُدفوعة، لا تصل إلى بيانات إنتاجية):**

| الملف | الغرض |
|---|---|
| `apps/marketplace/supabase/migrations/20260724221925_f717f71d_a873_4606_b945_cce194812e04_revoke_inventory_write_permissions.sql` | Phase A (سحب الصلاحيات) — واحد من إسقاطات الاتجاه الجراحي |
| `apps/marketplace/supabase/migrations/rollback_inventory_single_writer.sql` | خطة الـrollback (أمر واحد متسق، SPEC §5.1) |
| `apps/marketplace/supabase/migrations/20260724221925_fca97788_41a6_4d09_b51d_0a7116169826_make_inventory_readonly.sql` | Phase B (الجداول للقراءة فقط) — جاهز، لم يُنفَّذ |
| `apps/marketplace/scripts/phase5-acl-gate/approved-routines.json` | allowlist BOR-DEC-142 — حُُذفت 11 دالة كتابة |
| `scripts/phase5-m2-verify-artifacts.test.js` | اختبار موضوعي (ثابت، بدون قاعدة بيانات) |
| `scripts/phase5-m2-inventory-acceptance.test.ts` | اختبار القبول الرئيسي (DB) — جاهز للتشغيل |
| `docs/engineering/inventory-single-writer/EXECUTION-STATE.md` | هذا الملف |
| `docs/engineering/inventory-single-writer/ACCEPTANCE.md` | سجل نتائج الاختبار |

---

## المرحلة (أ) — سحب الصلاحيات (REVOKE) — قابلة للعكس فوراً

### أمر الـREVOKE الواحد (التنفيذ الفعلي في قاعدة بيانات حية — لا تُنفَّذ في هذا الورد)

يُطبَّق الورد كملف اتجاه جراحي على قاعدة بيانات حية (Supabase) عند توفرها. جميع البيانات دائمًا؛ لا تُحذَف ولا تُعدَّل. الأمر:

```sql
-- phase_a_revoke.sql
REVOKE EXECUTE ON FUNCTION public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_reservation(uuid,text,uuid,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_reservation_allocation(uuid,int,uuid,uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_reservation(uuid,jsonb,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_bol_order_line(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_bol_order_line(uuid,text) FROM service_role;
REVOKE INSERT, UPDATE ON public.inventory_lots FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory_serials FROM authenticated;
```

### سجل كل `REVOKE` (إما في ملف التنفيذ أو هذا الملف)

| SR | الدالة | الدور | السطر فيmigration |
|---|---|---|---|
| 412 | `post_inventory_transaction` | `authenticated` | `20260723210329_...c6066fad.sql` |
| 455 | `reverse_inventory_transaction` | `authenticated` | `20260723210329_...c6066fad.sql` |
| 481 | `rebuild_inventory_balances` | `authenticated` | `20260723210329_...c6066fad.sql` |
| 272 | `create_reservation` | `authenticated` | `20260723211217_...bdbee695.sql` |
| 352 | `pick_reservation_allocation` | `authenticated` | `20260723211217_...bdbee695.sql` |
| 442 | `release_reservation` | `authenticated` | `20260723211217_...bdbee695.sql` |
| 451 | `cancel_reservation` | `authenticated` | `20260723211217_...bdbee695.sql` |
| 315 | `reserve_bol_order_line` | `service_role` | `20260723230949_...0df12683.sql` |
| 354 | `cancel_bol_order_line` | `service_role` | `20260723230949_...0df12683.sql` |
| — | `INSERT, UPDATE` على `inventory_lots` | `authenticated` | سحب كتابي من جدول |
| — | `INSERT, UPDATE` على `inventory_serials` | `authenticated` | سحب كتابي من جدول |

> ملاحظة SR في الملف: الأرقام المرجعية أَخِذت من `SPEC.md` §2.1 (السطور المذكورة فيmigration). هذه قائمة لسجل التنفيذ; الأرقام هي للمتابعة، والمصدر هو SPEC.md نفسه.

### نتيجة التنفيذ الفوري
- `authenticated` لم يَعُد له `EXECUTE` على أي دالة كتابة للمخزون.
- `service_role` لم يَعُد له `EXECUTE` على `reserve_bol_order_line` / `cancel_bol_order_line`.
- `INSERT, UPDATE` أُعيدت عن `authenticated` على `inventory_lots` / `inventory_serials`.
- الواجهة لا تتأثّر: `seller_list_inventory`، `sku_active_reserved`، `wms-availability-adapter.ts` لا تزال تعمل (القراءة لا تزال مسموحة).

---

## المرحلة (ب) — الجداول للقراءة فقط — لم يُنفَّذ في هذا الورد

**شرط التفعيل:** إثبات أن WMS يغطي دورة البيع بالكامل في staging (بيانات اصطناعية فقط، لا بيانات إنتاجية). هذا الاختبار لم يُنجز بعد في هذا الورد (لا قاعدة بيانات محلية متاحة).

### الحالة (جاهز للتطبيق)
الملف الجاهز: `20260724221925_fca97788_41a6_4d09_b51d_0a7116169826_make_inventory_readonly.sql`
- `REVOKE INSERT, UPDATE ON <الجدول> FROM authenticated` على جميع الجداول التسعة.
- إعادة تعريف السياسات المتبقية `CREATE POLICY ... SELECT only`.
- `approved-routines.json` مُحدَّث بالفعل ليعكس: لا `inventory` كتابة في أي دور.

### الاختبار المُفعَّل عند التفعيل
- إيقاف WMS → `seller_list_inventory` تعيد `availability.length === 0` أو `unmappedSkuIds.length > 0`، ولا يُسمح بالدفع (بيع من رصيد محلي ممنوع).

---

## خطة الـrollback (أمر واحد متسق)

ملف: `rollback_inventory_single_writer.sql`
ينفذ كأمر واحد (واحد مسافة/سياق، بداية ونهاية، لا تقطع):

```sql
BEGIN;
GRANT EXECUTE ON FUNCTION public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_reservation_allocation(uuid,int,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_bol_order_line(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_bol_order_line(uuid,text) TO service_role;
GRANT INSERT, UPDATE ON public.inventory_lots TO authenticated;
GRANT INSERT, UPDATE ON public.inventory_serials TO authenticated;
GRANT EXECUTE ON FUNCTION public.p4_writes_allowed(uuid) TO service_role;
COMMIT;
```

---

## التطبيق على البيانات
- لا حذف لجدول ولا صف. الخريطة المقارنة (SPEC §6.4): `inventory_dispositions`، `inventory_lots`، `inventory_serials`، `inventory_transactions`، `inventory_transaction_entries`، `inventory_balances`، `inventory_reservation_headers`، `inventory_reservation_lines`، `inventory_reservation_allocations` — تتغيّر الصلاحيات فقط، لا الصفوف.
- الروابط المرجعية محفوظة (`ON DELETE RESTRICT / CASCADE / SET NULL`) ولا تُستخدم "القيم الرئيسية" لحذف البيانات.

---

## التراجع (what failed / not executed)

| القطعة | الحالة |
|---|---|
| Phase A: كتابة migration +REVOKE (أمر، سجل) | نُفِّذَت côngلي (ملف، سجل) — لا تصل إلى بيانات حية هنا |
| Phase B: التطبيق على مخطط المنتج | **لم يُنفَّذ** — شرط WMS coverage proof غير محقَّق (لا قاعدة بيانات محلية) |
| الاختبار DB (A1–A8، 6.3) | **لم يُنفَّذ** — لا مثيل لـ Supabase في هذا البيئة؛ الملف جاهز `phase5-m2-inventory-acceptance.test.ts` |
| اختبار wms-availability-adapter (6.2) | نُفِّذَ تنويعاً: فحص موحد (6.2-6) جميع الاختبارات **7/7 pass** (لاحق) |
| الـrollback (A9) | نُفِّذَ: التحقق من أن الملف يصحح كل ما سحبه الـREVOKE (7/7 pass) |
