# اختبارات Firebase Security Rules

هذه الاختبارات جاهزة لكن **لم تُشغَّل فعليًا** في بيئة إعداد هذا التقرير (لا يوجد اتصال إنترنت
لتنزيل حزم npm ولا Firebase CLI هناك). شغّلها بنفسك قبل النشر النهائي:

```bash
npm install --save-dev @firebase/rules-unit-testing firebase-tools mocha
npx firebase emulators:exec --only firestore,storage "npx mocha tests/*.test.js"
```

القواعد تُحمَّل من `firestore.rules` و`storage.rules` الفعليين في المشروع (مع استبدال
`ADMIN_UID_HERE` بقيمة اختبار وهمية تلقائيًا)، لذا أي تعديل تُدخله على القواعد الحقيقية
ينعكس مباشرة على الاختبارات.
