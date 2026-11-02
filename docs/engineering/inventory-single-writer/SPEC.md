# مواصفة: فرض كاتب مخزون وحيد (WMS) في BORVAT

**رقم الكارت:** t_08b2182f
**الفرع المصدر:** `implementation/payment-port-2026-10-29` عند `d7090e78c70f8d5c9265eabcc5f549748d1d0cae`
**الفرع العاملة (الكتابة):** `work/inventory-single-writer` — نقطة `d7090e7`, متطابقة مع المصدر، نظيفة (git status: لا ملفات معدلة)
**المراجع المؤسسة:** `C:/Users/Zulik/borvat-audit/INVENTORY-OWNERSHIP-AUDIT.md` (القراءة الكاملة، كاملة النص، ملفة بيانات الحالة)
**هدف الكارت:** تحويل BORVAT من "مالك مخزون ثانٍ" إلى "مستهلك قراءة فقط"، مع إثبات أن البيع يتوقف عند غياب WMS، دون حذف أي بيانات أو جداول.

> لغة الوثائق: **عربية**. الأسماء التقنية: **إنجليزية**. لا تُكتب هوامش، لا تبرر، لا أسلوب.

---

## 1. الحالة الحالية (حقائق مثبتة، لا تعيد فحصها)

| العنصر | الحال المؤكدة |
|---|---|
| السلطة المخزونية الثانية | تسعة جداول قابلة للكتابة، ودوال RPC ممنوحة لدور `authenticated` و `service_role` |
| عدد `GRANT EXECUTE` في المشروع | 143 سطر، منها ما لا يقل عن 9 دوال مخزون مفتوحة |
| الواجهة (UI) | لا تستدعي أي دالة كتابة للمخزون. الملف الوحيد في `src` يذكر الجداول هو `src/integrations/supabase/types.ts` (أنواع مولَّدة) |
| القارئ الوحيد للمخزون | `src/lib/commercial/wms-availability-adapter.ts` — دالة نقية، لا شبكة، لا كتابة، لا حالة |
| دوال الحجز البديلة | `create_reservation`, `reserve_bol_order_line` (service_role) |
| المسار المؤجل | `outbox_events` (وظائف `enqueue_outbox_event`، `complete_outbox_event`، `fail_outbox_event`، دور `service_role`) — لا علاقة مباشرة للمخزون، متتبع بها كاعتماد لاحق |

**حكم P1:** وجود مسار كتابة مخزون ثانٍ "مسلَّح لكن غير مستعمل في UI"، قابل التنشيط بأي صفحة أو سكربت لاحق، وبلا نسخ احتياطي من WMS. هذا هو التعارض الوحيد ذي المصلحة، وليس الأداء ولا التصميم.

---

## 2. القائمة الدقيقة للصلاحيات المطلوب سحبها أو تقييدها

### 2.1 دوال الحفظ (GRANT / RPC) — السحب أو التقييد المطلوب

الإشارة: `M` = ملف الـmigration، `SR` = رقم السطر.

| الدالة | الغرض | الدور الحالي | ملف الـmigration | SR | الإجراء |
|---|---|---|---|---|---|
| `post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid)` | ترحيل حركة مخزون وتحديث الأرصدة | `authenticated` | `20260723210329_c6066fad-95de-4b38-a1d7-f9746e14c5f1.sql` | 412 | سحب `EXECUTE` من `authenticated` |
| `reverse_inventory_transaction(uuid,text)` | عكس حركة بناءً على قيد معاكس | `authenticated` | `20260723210329_c6066fad-95de-4b38-a1d7-f9746e14c5f1.sql` | 455 | سحب `EXECUTE` من `authenticated` |
| `rebuild_inventory_balances(uuid)` | إعادة بناء الأرصدة من الدفتر | `authenticated` | `20260723210329_c6066fad-95de-4b38-a1d7-f9746e14c5f1.sql` | 481 | سحب `EXECUTE` من `authenticated` |
| `create_reservation(uuid,text,uuid,jsonb)` | إنشاء حجز (جميع-or-لا شيء) | `authenticated` | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 272 | سحب `EXECUTE` من `authenticated` |
| `pick_reservation_allocation(uuid,int,uuid,uuid,uuid)` | التقاط كمية من تخصيص | `authenticated` | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 352 | سحب `EXECUTE` من `authenticated` |
| `release_reservation(uuid,jsonb,boolean)` | تحرير الحجز | `authenticated` | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 442 | سحب `EXECUTE` من `authenticated` |
| `cancel_reservation(uuid)` | إلغاء الحجز | `authenticated` | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 451 | سحب `EXECUTE` من `authenticated` |
| `reserve_bol_order_line(uuid)` | حجز سطر طلب من قناة BOL | `service_role` | `20260723230949_0df12683-6bb0-434c-af8c-c5eb74d9687e.sql` | 315 | سحب `EXECUTE` من `service_role` |
|| `cancel_bol_order_line(uuid,text)` | إلغاء سطر BOL | `service_role` | `20260723230949_0df12683-6bb0-434c-af8c-c5eb74d9687e.sql` (SR 354) + `approved-routines.json` (BOR-DEC-142) | — | سحب من `service_role` في كلا العرضين |
| `pack_reservation_allocation(...)` | تعبئة من تخصيص | `authenticated, service_role` | `approved-routines.json` (BOR-DEC-142) | — | سحب من كلا الدورين في الـallowlist |
| `ship_reservation_allocation(...)` | شحن من تخصيص | `authenticated, service_role` | `approved-routines.json` (BOR-DEC-142) | — | سحب من كلا الدورين في الـallowlist |

> ملاحظة: `cancel_bol_order_line`، `pack_reservation_allocation`، `ship_reservation_allocation` لا تظهر في ملفات الـmigration المدرَّسة مباشرة، لكنها تظهر في `approved-routines.json` (BOR-DEC-142، مرحلة M1V-1D). الرجوع إليها هناك كمرجع، ويجب تحديث هذا الملف في المرحلة (ب).

### 2.2 الجداول التسعة وجدول السياسة (RLS)

| الجدول | السياسة الكتابية الحالية | الإجراء | ملف الـmigration | SR |
|---|---|---|---|---|
| `inventory_lots` | `INSERT` + `UPDATE` لـ `authenticated` (3 سياسات: `lots_read`, `lots_write`, `lots_update`) | تحويل إلى قراءة فقط | `20260723210329_…c6066fad.sql` | 32–36 |
| `inventory_serials` | `INSERT` + `UPDATE` لـ `authenticated` (3 سياسات: `serials_read`, `serials_write`, `serials_update`) | تحويل إلى قراءة فقط | `20260723210329_…c6066fad.sql` | 74–78 |
| `inventory_transactions` | `SELECT` فقط (policy `inv_tx_read`) — محمية بـ trigger `p2_tx_header_guard` | لا تغيير | `20260723210329_…c6066fad.sql` | 116 |
| `inventory_transaction_entries` | `SELECT` فقط (policy `inv_entries_read`) — محمية بـ trigger `p2_ledger_immutable` | لا تغيير | `20260723210329_…c6066fad.sql` | 162 |
| `inventory_balances` | `SELECT` فقط (policy `inv_balances_read`) | لا تغيير | `20260723210329_…c6066fad.sql` | 196 |
| `inventory_reservation_headers` | `SELECT` فقط (policy `inv_resv_headers_read`) | لا تغيير | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 32 |
| `inventory_reservation_lines` | `SELECT` فقط (policy `inv_resv_lines_read`) | لا تغيير | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 56 |
| `inventory_reservation_allocations` | `SELECT` فقط (policy `inv_resv_alloc_read`) | لا تغيير | `20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` | 82 |
| `inventory_dispositions` | `SELECT` فقط (policy `inv_disp_read`) — قاموس أسباب الحركة، بيانات ثابتة | لا تغيير | `20260723205432_8880115d-…sql` | 298 |

> `inventory_dispositions` ليس مسار كتابة، بل قاموس ثابت (استلام، بيع، مرتجع، تسوية). مصلحته هنا إجرائية (أين تُسحب السياسات) وليس عملية.

### 2.3 الأدوار الممنوحة (نفسها، مصححة، للقراءة المسموح بها)

| الدالة | السبب بالاحتفاظ |
|---|---|
| `seller_list_inventory(uuid,uuid,integer,integer)` | وجه قراءة فعالة للمخزون البիրاعي (تُستدعى في UI) |
| `sku_active_reserved(uuid,uuid)` | تقرأ الكمية المحجوزة؛ تُستهلك في `wms-availability-adapter.ts` |
| `sku_sellable_quantity(uuid,uuid)` | قراءة الكمية القابلة للبيع |

---

## 3. تحليل أثر السحب

### 3.1 حجز طلبات BOL — `reserve_bol_order_line`

- `reserve_bol_order_line(uuid)` ممنوح لـ `service_role` (SR 315 في `20260723230949`).
- الدالة تكتب داخل BORVAT: `inventory_reservation_headers` (رأس الحجز)، `inventory_reservation_lines` (سطور الحجز)، وتحديث `channel_order_lines` (تغيير `status` إلى `reserved` وربط `reservation_id`).
- بعد السحب من `service_role`، **لا يمكن لـ BORVAT حجز أي سطر BOL محلياً**. سطر BOL يبقى في `pending_reservation`، لا ينتقل إلى `reserved` عبر BOL، ويُكتشف أو يُصحّح عبر `resolve_bol_order_line_link` أو الإشعارات/الـoutbox.
- **الاعتماد:** `approved-routines.json` (BOR-DEC-142) يُدرجها كـ `service_role`؛ `scripts/phase4-m3-tests.ts` يختبر دورة حياة الحجز (reserve → cancel → resolve). يجب مراجعة كلاهما.

### 3.2 السكربتات والـedge functions

| الملف | التأثير | الإجراء المطلوب |
|---|---|---|
| `scripts/phase4-m3-tests.ts` | يختبر دورة حجز BOL (وظائف كتابة) | تحديث أسماء/الأدوار، أو تحويل إلى سكربت قراءة فقط (مزامنة موقتة) |
| `scripts/phase4-m5-tests.ts` | دورة الطلب/الشحن | مراجعة النطاق الجديد (لم يظهر في الفحص المباشر للمخزون) |
| `scripts/phase2-mig4-tests.ts`، `phase5-acl-gate/approved-routines.json` | allowlist الأدوار | سحب `post_*` و `reserve_bol_*` و `cancel_bol_*` و `create_reservation*` من الأدوار الممنوحة |
| `p4_writes_allowed(uuid)` (SR 112 في `20260723225107_344df817-…`) | بوابة حماية للقناة، لا تكتتب مباشرة للمخزون | مراجعة منفصلة (مهمة، لا تُعدل في هذا الكارت). دوران: تقرأ `channel_connections` و `channel_kill_switches` فقط |
| `ingest_bol_order`, `ingest_bol_shipment_status`, `ingest_imported_offer`, `resolve_bol_order_line_link` (SR في `20260723230949`، `20260723230213`، `20260724003715`) | إدخال البيانات الخارجية، يتفاعل مع حجز BOL | تحديد النطاق في المرحلة (ب)، لا كتابة فورية |

### 3.3 الواجهة (UI)

- **بدون تأثير.** `src/` لا تستدعي أي دالة كتابة للمخزون. الملف الوحيد في `src` يذكر الجداول هو `src/integrations/supabase/types.ts` (أنواع مولَّدة، لا استدعاء).
- `wms-availability-adapter.ts` يظل الوجه القراءي الوحيد للمخزون. لا تُعدَّل إدخالات الواجهة.
- ملاحظة: `types.ts` (7291 سطر) هو ملف أنواع مولَّد ضخم — لا يُعدَّل في هذا الكارت إلا إذا طلب قرار لاحق، وليس مطلوباً للكarto.

---

## 4. خطة التنفيذ (مرحلتان)

### 4.1 المرحلة (أ) — السحب القابل للعكس فوراً (بدون كود جديد، بدون بيانات)

الإجراءات فقط (لا ملفات كود جديدة، لا إسقاط للبيانات):

1. سحب `EXECUTE` على الدوال المكتوبة من `authenticated` (سبعة دوال في الإحداثيات 2.1: SR 272، 352، 412، 442، 451، 455، 481). ملاحظة: `sku_active_reserved` (SR 126) هو دالة قراءة تُحتفظ بها، لا تسحب.
2. سحب `EXECUTE` من `service_role` على `reserve_bol_order_line` (SR 315 في `20260723230949`) و `cancel_bol_order_line` (SR 354 في `20260723230949`، ومسجل في `approved-routines.json` بقرار BOR-DEC-142).
3. سحب `INSERT`, `UPDATE` من الأدوار على `inventory_lots` و `inventory_serials` (إزالة السياسات `lots_write` و `serials_write`، والسماح فقط بـ `SELECT`).
4. تسجيل كل `REVOKE` في ملف التنفيذ (ملف منفصل، لا تعديل في أي كود أو بيانات إنتاجية).
5. فحص فوري في الواجهة: `seller_list_inventory`، `sku_active_reserved`، `wms-availability-adapter.ts` لا تزال تعمل.

**مبدأ التحويل:** لا يُحذف جدول ولا صف. الملكية تُنزع بالصلاحيات أولاً (قابلة للعكس في ثانية)، ثم تُحوَّل الجداول إلى "سجل تدقيق/ملاحظة" بعد إثبات تغطية WMS.

### 4.2 المرحلة (ب) — تحويل الجداول إلى قراءة فقط بعد إثبات تغطية WMS

سياق القرار: بعد امتحان أن WMS يغطي دورة البيع بالكامل في staging (دون بيانات إنتاجية، بيانات اصطناعية فقط في الاختبار):

1. إعادة الجداول إلى `READ-ONLY` عبر `REVOKE INSERT, UPDATE ON <table> FROM authenticated;` لجميع الجداول التسعة (بما في ذلك الأربعة التي كانت مكتوبة مسبقاً: `lots`, `serials`).
2. إزالة السياسات الكتابية المتبقية عن طريق إعادة تعريف `CREATE POLICY` لكل جدول بسياسة `SELECT` فقط.
3. تحديث `approved-routines.json` (BOR-DEC-142) ليعكس السياسة الجديدة (لا `inventory` كتابة في أي دور).
4. تفعيل هذا الاختبار الإلزامي: **إيقاف WMS يجب أن يمنع البيع**، ولا يسمح ببيع من رصيد محلي.

**تأثير المرحلة (ب) لا يكاد يغير أي كود UI.** فقط الجدول نظاماً يُنظر فيه عبر `SELECT` من دور `authenticated` أو `service_role`.

---

## 5. خطة الـrollback

### 5.1 الأمر الوحيد للرجوع

أمر متسق واحد، لاستعادة السلطة السابقة كاملة (لا تحذف بيانات، لا تُعدِّل أي كود):

```sql
-- rollback الوحدة الواحدة: إعادة صلاحيات المخزون (الكود والتحكم) دون لمس البيانات
GRANT EXECUTE ON FUNCTION public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_reservation(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_reservation_allocation(uuid,int,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_reservation(uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_bol_order_line(uuid) TO service_role;
GRANT INSERT, UPDATE ON public.inventory_lots TO authenticated;
GRANT INSERT, UPDATE ON public.inventory_serials TO authenticated;
GRANT EXECUTE ON FUNCTION public.p4_writes_allowed(uuid) TO service_role;  -- إذا أُغلقت دوراً (مراجعة منفصلة)
```

> ملاحظة: هذا "أمر واحد" بمعنى متسق (تنفيذ في نفس مسافة، بداية/نهاية، لا تقطع). لا يُغري البيانات. يجب اختبار الـrollback في بيئة مصغرة قبل الإنتاج، ولن تُستخدم إلا في حالة كارثة.

---

## 6. معايير القبول (قابلة للاختبار)

### 6.1 إثبات رفض الكتابة عبر أي من الـRPCs

| رقم | الإدخال | رفع | الآلية القابلة للمقارنة |
|---|---|---|---|
| A1 | استدعاء `create_reservation(...)` من دور `authenticated` | `permission denied for function` (SQLSTATE 42501) | `mocha`/`assert` (بدون بيانات إنتاجية) |
| A2 | استدعاء `reserve_bol_order_line(...)` من دور `service_role` | `permission denied` | نفس الإطار |
| A3 | استدعاء `post_inventory_transaction(...)` من `authenticated` | `permission denied` | نفس الإطار |
| A4 | استدعاء `cancel_reservation(...)` من `authenticated` | `permission denied` | نفس الإطار |
| A5 | `seller_list_inventory(...)` من `authenticated` | ناجح، يُرجع رصيداً (القراءة لا تزال تعمل) | مقارنة الناتج بقاعدة بيانات القراءة |
| A6 | `sku_active_reserved(...)` من `authenticated` | ناجح | مقارنة الناتج |
| A7 | `INSERT INTO inventory_lots ...` | `permission denied` | نفس الإطار |
| A8 | `INSERT INTO inventory_serials ...` | `permission denied` | نفس الإطار |
| A9 | `revoke` ثم `GRANT` (أمر واحد) ثم استدعاء `create_reservation(...)` | ناجح فوراً (الدورة تُغلق) | الاختبار يكشف تسلسل الـREVOKE/GRANT |

### 6.2 إثبات بقاء `wms-availability-adapter.ts` موظفاً

وحدة اختبار (بيانات اصطناعية فقط، لا إنتاجية، لا شبكة):

1. تمرير `catalogInput`، `bindingInput`، `projectionInput` (مقلدة، قيم ASCII/UUID ثابتة).
2. التأكد من أن `projectWmsAvailability` تعيد `availability: []` أو مصفوفة عناصر، وتحسب `availableQuantity` من `nativeById` (ولا تكتب أبداً).
3. التأكد من رفع `Error("Unknown marketplace company binding")` في حال مفعول الشرط الأول.
4. التأكد من رفع `Error("WMS company scope mismatch")` في حال مفعول الشرط الثاني وللأصناف المكررة.
5. تغطية جميع مسارات الإخراج في الإدخال الصالح وغير الصالح (بدون إنشاء ملف، بدون قطع، بدون شبكة).
6. الفحص الثابت: لا توجد استدعاءات لـ `fetch`/`XMLHttpRequest`/`supabase` داخل الدالة (فحص النص، لا تنفيذ).

### 6.3 إثبات حظر البيع عند غياب WMS

- سيناريو: وحدة WMS المطابقة "متوقفة" (مفاتيح تجريبية أو مُحاكاة، بدون بيانات إنتاجية).
- طلب `seller_list_inventory` للمورد المطابق: `availability.length === 0` أو `unmappedSkuIds.length > 0`، ولا يُسمح بالدفع (بيع من رصيد محلي).
- ملاحظة: هذا الاختبار يعتمد على محاكاة مؤقتة، ويجب تسجيته كـ `synthetic`، لا كقبول إنتاجي.

### 6.4 الإثبات على البيانات

- لا حذف لجدول ولا صف دراسي. الخريطة المقارنة: `inventory_dispositions`، `inventory_lots`، `inventory_serials`، `inventory_transactions`، `inventory_transaction_entries`، `inventory_balances`، `inventory_reservation_headers`، `inventory_reservation_lines`، `inventory_reservation_allocations` — بدون تغيير في الصفوف (فقط الصلاحيات).
- الروابط المرجعية: `inventory_transaction_entries` ← `ON DELETE RESTRICT`؛ `reservation_lines` و `allocations` ← `ON DELETE CASCADE`؛ `reserve_bol_order_line` ← `ON DELETE SET NULL`. لا تُستخدم "القيم الرئيسية" أبداً كوسيلة لحذف البيانات.

---

## 7. مخرجات هذا الكارت (المطلوب في نهاية التنفيذ)

1. `docs/engineering/inventory-single-writer/SPEC.md` — هذه الوثيقة.
2. `docs/engineering/inventory-single-writer/EXECUTION-STATE.md` — سجل دورة حياة التنفيذ (المرحلة أ والب)، لا تصل إلى بيانات إنتاجية، وبيانات اصطناعية فقط.
3. `docs/engineering/inventory-single-writer/ACCEPTANCE.md` — سجل دليل الاختبار (رقم الاختبار، الرفع، النتيجة، توقيت الاختبار، دليل).

---

## 8. مرجع

- `C:/Users/Zulik/borvat-audit/INVENTORY-OWNERSHIP-AUDIT.md` — القراءة الكاملة، كاملة النص
- `apps/marketplace/supabase/migrations/20260723210329_c6066fad-95de-4b38-a1d7-f9746e14c5f1.sql` — الجداول الخمسة الأولى + `post`/`reverse`/`rebuild` + السياسات
- `apps/marketplace/supabase/migrations/20260723211217_bdbee695-4b09-4f95-9e8d-a80f53321cd2.sql` — جداول الحجز + `create_reservation`/قراءة الحجز
- `apps/marketplace/supabase/migrations/20260723230949_0df12683-6bb0-434c-af8c-c5eb74d9687e.sql` — `reserve_bol_order_line`، `cancel_bol_order_line` + SR
- `apps/marketplace/supabase/migrations/20260723205432_8880115d-…` — `inventory_dispositions` + RLS
- `apps/marketplace/supabase/migrations/20260723225107_344df817-…` — `p4_writes_allowed` (SR 112)
- `apps/marketplace/supabase/migrations/20260726214308_03045e91-…` — `seller_list_inventory` + SR
- `apps/marketplace/scripts/phase4-m3-tests.ts` — دورة حجز BOL
- `apps/marketplace/scripts/phase5-acl-gate/approved-routines.json` — allowlist (BOR-DEC-142)
- `apps/marketplace/src/lib/commercial/wms-availability-adapter.ts` — القارئ الوحيد
- `apps/marketplace/src/integrations/supabase/types.ts` — أنواع مولَّدة (لا تُعدَّل)
- `docs/native-closure/C0-C6.md` — قاعدة C3: "كاتب واحد للمخزون والحجز، ولا كاتب ثانٍ للحجز داخل Medusa"
