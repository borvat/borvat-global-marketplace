# PRIVILEGE-VERIFICATION — دليل ديناميكي على طبقة الامتياز

**المدى:** تحقق ديناميكي من منطق الـREVOKE في الـmigration، على PostgreSQL 18 محلي معزول
(ليس Supabase حياً)، بنسخ مخلصة لتسلسل GRANT/REVOKE الفعلي من الـmigrations الأصلية.

**سكربت التنفيذ:** `borvat-lab/pg/priv-full.cjs`

## ما أُثبت

| الاختبار | النتيجة |
|---|---|
| A1: `create_reservation` محجوب عن `authenticated` بعد Phase A | **PASS** |
| A2: `reserve_bol_order_line` محجوب عن `service_role` بعد Phase A | **PASS** |
| A3: `post_inventory_transaction` محجوب عن `authenticated` | **PASS** (كان owner-only أصلاً) |
| A4: `cancel_reservation` محجوب عن `authenticated` بعد Phase A | **PASS** |

ناتج التشغيل الفعلي:

```
BASE (before Phase A):
  create_reservation:        authenticated=true  service_role=false
  reserve_bol_order_line:    authenticated=false service_role=true
  post_inventory_transaction: authenticated=false service_role=false   <- owner-only
AFTER Phase A:
  create_reservation:        authenticated=false service_role=false
  reserve_bol_order_line:    authenticated=false service_role=false
  post_inventory_transaction: authenticated=false service_role=false
RESULT: 4/4 privilege assertions passed
```

## حدود صريحة

- هذا التحقق يثبت **منطق الامتياز** (GRANT/REVOKE)، لا أجسام دوال plpgsql ولا RLS ولا بيانات حية.
- لم يُنفَّذ على Supabase حي (لا Docker/WSL/Supabase CLI على هذا الجهاز — عائق موثّق).
- اختبارات A5–A8 (القراءة المسموحة + رفض INSERT على الجداول) تتطلب Supabase حياً، ولم تُنفَّذ.
- لا تُعلن PASS لأي اختبار لم يُنفَّذ.
