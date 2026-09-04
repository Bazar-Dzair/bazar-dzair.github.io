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
 * ⚠️ استبدل ADMIN_UID أدناه بنفس UID المستخدم في firestore.rules الحقيقي إن أردت
 * اختبار سيناريوهات الأدمن بدقة أكبر (هنا نستخدم قيمة وهمية لأننا في المحاكي).
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
    .replace(/ADMIN_UID_HERE/g, ADMIN_UID);
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

const validOrder = {
  customerName: "أحمد بن علي",
  customerPhone: "0551234567",
  wilaya: "16 - الجزائر",
  address: "شارع ديدوش مراد",
  product: "منتج تجريبي",
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
  it("can create a valid order", async () => {
    const db = anon();
    await assertSucceeds(db.collection("orders").add(validOrder));
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
  it("cannot inject extra fields into an order (privilege fields)", async () => {
    const db = anon();
    await assertFails(
      db.collection("orders").add({ ...validOrder, isAdmin: true })
    );
    await assertFails(
      db.collection("orders").add({ ...validOrder, adminNotes: "x" })
    );
  });
  it("cannot create an order with a non-default status", async () => {
    const db = anon();
    await assertFails(
      db.collection("orders").add({ ...validOrder, status: "مقبول" })
    );
  });
  it("cannot create an order with a manipulated total (price mismatch)", async () => {
    const db = anon();
    await assertFails(
      db.collection("orders").add({ ...validOrder, total: 1 })
    );
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
});

describe("Admin", () => {
  it("can manage products and categories", async () => {
    const db = admin();
    await assertSucceeds(db.doc("products/p1").set({ name: "منتج", price: 100 }));
    await assertSucceeds(db.doc("products/p1").delete());
    await assertSucceeds(db.doc("categories/c1").set({ name: "فئة" }));
  });
  it("can read/update/delete orders", async () => {
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
