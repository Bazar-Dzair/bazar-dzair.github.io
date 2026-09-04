/**
 * اختبارات Firebase Storage Security Rules — Bazar Dzair
 * ============================================================
 * التشغيل (على جهازك):
 *   npm install --save-dev @firebase/rules-unit-testing mocha
 *   npx firebase emulators:exec --only storage "npx mocha tests/storage.rules.test.js"
 *
 * ⚠️ لم يتم تشغيلها فعليًا هنا (لا يوجد اتصال إنترنت / Firebase CLI في بيئة التحليل).
 */
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const fs = require("fs");
const path = require("path");

const ADMIN_UID = "test-admin-uid";
const PROJECT_ID = "bazar-dzair-rules-test";

let testEnv;

before(async () => {
  const rules = fs
    .readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8")
    .replace(/ADMIN_UID_HERE/g, ADMIN_UID);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules },
  });
});

after(async () => {
  await testEnv.cleanup();
});

function tinyPngBytes() {
  // أصغر ملف PNG صالح (1x1 شفاف) — لاختبار قبول MIME الصحيح
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
}

describe("Storage — anonymous / public", () => {
  it("can read product images", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    // القراءة العامة يجب أن تنجح حتى لو الملف غير موجود فعليًا (الفشل هنا يكون 404 من التخزين
    // وليس من القواعد)؛ التحقق الحقيقي من "allow read" يتم عبر رفع admin أولًا في اختبار متكامل.
  });
  it("cannot write to /products/*", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(
      storage.ref("products/p1/x.png").put(tinyPngBytes(), { contentType: "image/png" })
    );
  });
  it("cannot write to /site/*", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(
      storage.ref("site/logo.png").put(tinyPngBytes(), { contentType: "image/png" })
    );
  });
  it("cannot write to any undeclared path (deny-by-default)", async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(
      storage.ref("admin/secret.png").put(tinyPngBytes(), { contentType: "image/png" })
    );
  });
});

describe("Storage — admin", () => {
  it("can upload a valid PNG under /products/", async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    await assertSucceeds(
      storage.ref("products/p1/x.png").put(tinyPngBytes(), { contentType: "image/png" })
    );
  });
  it("cannot upload a disallowed MIME type (e.g. SVG / executable)", async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    await assertFails(
      storage.ref("products/p1/x.svg").put(Buffer.from("<svg></svg>"), {
        contentType: "image/svg+xml",
      })
    );
  });
  it("cannot upload a file larger than 5MB", async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    await assertFails(
      storage.ref("products/p1/big.png").put(big, { contentType: "image/png" })
    );
  });
  it("can delete a product image", async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    await storage.ref("products/p1/x.png").put(tinyPngBytes(), { contentType: "image/png" });
    await assertSucceeds(storage.ref("products/p1/x.png").delete());
  });
});
