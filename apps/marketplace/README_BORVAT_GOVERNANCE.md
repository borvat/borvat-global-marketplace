# README — BORVAT GOVERNANCE PACK V1

هذه الحزمة تمنع ضياع رؤية المشروع أو إعادة تفسيرها من كل محادثة أو مبرمج.

## الملفات

1. `BORVAT_MASTER_BLUEPRINT_V1.md`  
   الرؤية وخطة العمل والمعمارية والتنفيذ. يتغير نادرًا وبإصدار جديد.

2. `BORVAT_CURRENT_STATE_V1.md`  
   الحالة الفعلية للكود والمراحل والاختبارات والمخاطر. يُحدّث بعد كل مرحلة.

3. `BORVAT_DECISION_LOG_V1.md`  
   سجل قرارات append-only.

4. `BORVAT_MASTER_BLUEPRINT_V1.docx`  
   نسخة إدارية قابلة للمشاركة والطباعة.

## مكانها في مستودع الكود

```text
/docs/BORVAT_MASTER_BLUEPRINT_V1.md
/docs/BORVAT_CURRENT_STATE_V1.md
/docs/BORVAT_DECISION_LOG_V1.md
/README_BORVAT_GOVERNANCE.md
```

## تعليمات إلزامية للمبرمج أو أي AI جديد

انسخ النص التالي في بداية المهمة:

> اقرأ `BORVAT_MASTER_BLUEPRINT_V1.md` و`BORVAT_CURRENT_STATE_V1.md` و`BORVAT_DECISION_LOG_V1.md` كاملًا قبل اقتراح أو تنفيذ أي تغيير. اعتبرها المرجع الرسمي. لا تغيّر قرارًا ثابتًا ولا تعلن مرحلة مكتملة دون تحديث Current State وإضافة أي قرار جديد إلى Decision Log. اذكر التعارضات بوضوح ولا تخمّن.

## بعد كل مرحلة

- تحديث Current State.
- إضافة القرارات الجديدة.
- تسجيل commit/tag والمigrations.
- إرفاق تقرير الاختبارات.
- توضيح live flags وrollback.
- إنشاء إصدار جديد من Master Blueprint فقط عند تغيير الرؤية أو المعمارية الأساسية.
