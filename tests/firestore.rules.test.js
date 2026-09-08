/**
 * اختبارات Firestore Security Rules — Bazar Dzair
 * ============================================================
 * هذه الاختبارات تستخدم @firebase/rules-unit-testing وتعمل ضد
 * Firebase Local Emulator (لا تلمس بيانات المشروع الحقيقي إطلاقًا).
 *
 * طريقة التشغيل (على جهازك، يحتاج Node.js + اتصال إنترنت لتنزيل الحزم مرة واحدة):
 *
 *   npm install --save-dev @firebase/rules-unit-testing firebase-tools mocha
 *   npx firebase emulators:exec --only firestore "npx mocha tests/firestore.rules.test.js"
 *
 * ⚠️ لم يتم تشغيل هذه الاختبارات فعليًا في بيئة التحليل هذه (لا يوجد اتصال إنترنت
 * لتنزيل حزم npm ولا Firebase CLI). هي جاهزة للتشغيل من طرفك للتحقق قبل النشر.
 *
 * ⚠️ محدَّثة بعد نقل إنشاء الطلبات إلى Cloudflare Worker (Service Account):
 * "allow create" في orders أصبح Admin-only فقط. الكتابة الحقيقية من الزبون تتم
 * الآن عبر Service Account في الـ Worker، وهذه تتجاوز Security Rules أصلاً —
 * لذلك لا يمكن اختبارها بمحاكي rules-unit-testing (الذي يختبر عملاء Firebase
 * العاديين فقط، لا Admin SDK). اختبر مسار /create-order يدويًا (Postman أو
 * curl) بعد نشر الـ Worker للتأكد من أن Turnstile والتحقق من السعر يعملان.
 */
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const fs = require("fs");
const path = require("path");

const ADMIN_UID = "test-admin-uid"; // يجب أن يطابق ما تضعه في القواعد أثناء الاختبار محليًا
const PROJECT_ID = "bazar-dzair-rules-test";

let testEnv;

before(async () => {
  const rules = fs
    .readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")
    // في بيئة الاختبار فقط: نستبدل ثابت الأدمن الحقيقي بقيمة الاختبار حتى تعمل السيناريوهات
    .replace(/GOBngnCP2eMTLZrJpf72GOmXvvO2/g, ADMIN_UID);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

after(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}
function user() {
  return testEnv.authenticatedContext("normal-user-uid").firestore();
}
function admin() {
  return testEnv.authenticatedContext(ADMIN_UID).firestore();
}

// إدراج منتج حقيقي (بتجاوز القواعد) قبل اختبارات السعر، لأن isValidOrder
// تستخدم get(products/$(productId)).data.price للمقارنة.
async function seedProduct() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("products/p1").set({ name: "منتج", price: 1000 });
  });
}

const validOrder = {
  customerName: "أحمد بن علي",
  customerPhone: "0551234567",
  wilaya: "16 - الجزائر",
  address: "شارع ديدوش مراد",
  product: "منتج تجريبي",
  productId: "p1",
  quantity: 2,
  price: 1000,
  shipping: 500,
  total: 2500, // 1000*2 + 500
  status: "جديد",
};

describe("Anonymous user (زائر غير مسجل)", () => {
  it("can read products", async () => {
    const db = anon();
    await assertSucceeds(db.doc("products/p1").get());
  });
  it("can read categories", async () => {
    const db = anon();
    await assertSucceeds(db.doc("categories/c1").get());
  });
  // ✅ محدَّث: إنشاء الطلبات مباشرة من عميل غير موثوق أصبح ممنوعًا نهائيًا.
  // إنشاء الطلب الحقيقي يمر إجباريًا عبر Worker موثوق (Turnstile + Service Account).
  it("cannot create an order directly from an untrusted client (even a valid-looking one)", async () => {
    await seedProduct();
    const db = anon();
    await assertFails(db.collection("orders").add(validOrder));
  });
  it("cannot read orders", async () => {
    const db = anon();
    await assertFails(db.collection("orders").get());
  });
  it("cannot update or delete an order", async () => {
    const db = anon();
    await assertFails(
      db.doc("orders/some-id").update({ status: "مقبول" })
    );
    await assertFails(db.doc("orders/some-id").delete());
  });
  it("cannot write products or categories", async () => {
    const db = anon();
    await assertFails(db.doc("products/p1").set({ name: "hack" }));
    await assertFails(db.doc("products/p1").delete());
    await assertFails(db.doc("categories/c1").set({ name: "hack" }));
  });
  it("cannot read private settings (settings/email)", async () => {
    const db = anon();
    await assertFails(db.doc("settings/email").get());
  });
  it("can read public settings", async () => {
    const db = anon();
    await assertSucceeds(db.doc("settings/general").get());
  });
  it("cannot write to an undeclared collection (deny-by-default)", async () => {
    const db = anon();
    await assertFails(db.doc("admins/whoever").set({ isAdmin: true }));
  });
});

describe("Normal authenticated (non-admin) user", () => {
  it("has the same restrictions as anonymous on admin operations", async () => {
    const db = user();
    await assertFails(db.doc("products/p1").set({ name: "hack" }));
    await assertFails(db.collection("orders").get());
    await assertFails(db.doc("settings/email").get());
  });
  // ✅ محدَّث: حساب عادي مسجّل دخول (وليس UID الأدمن) لا يقدر ينشئ طلب أيضًا.
  it("cannot create an order either", async () => {
    await seedProduct();
    const db = user();
    await assertFails(db.collection("orders").add(validOrder));
  });
});

describe("Admin", () => {
  it("can manage products and categories", async () => {
    const db = admin();
    await assertSucceeds(db.doc("products/p1").set({ name: "منتج", price: 100 }));
    await assertSucceeds(db.doc("products/p1").delete());
    await assertSucceeds(db.doc("categories/c1").set({ name: "فئة" }));
  });
  it("can create/read/update/delete orders", async () => {
    await seedProduct();
    const db = admin();
    const ref = await db.collection("orders").add(validOrder);
    await assertSucceeds(db.doc(`orders/${ref.id}`).update({ status: "مقبول" }));
    await assertSucceeds(db.doc(`orders/${ref.id}`).get());
    await assertSucceeds(db.doc(`orders/${ref.id}`).delete());
  });
  it("can read/write private settings", async () => {
    const db = admin();
    await assertSucceeds(
      db.doc("settings/email").set({ smtpHost: "example.com" })
    );
    await assertSucceeds(db.doc("settings/email").get());
  });
});
