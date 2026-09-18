// =====================================================================
// worker.js — Cloudflare Worker لموقع Bazar Dzair
// (noisy-lake-ace8.a-bazar-dzair-pro.workers.dev)
//
// ملخّص التاريخ (باش يبقى مفهوم لماذا الملف مبني هكذا):
//   • قديمًا: هذا الـ Worker كان يبعث فقط إشعار Telegram. الكتابة فـ Firestore
//     كانت تصير مباشرة من المتصفح (addDoc)، لأن firestore.rules كانت تسمح بذلك.
//   • بعدين firestore.rules تحدّثت إلى "allow create: if isAdmin()" على
//     orders — أي أن المتصفح ما يقدرش يكتب مباشرة نهائيًا لأي زبون عادي.
//   • لهذا صار إجباريًا أن هذا الـ Worker هو من يكتب الطلب فـ Firestore
//     بصلاحيات Service Account (تتجاوز Security Rules، وهذا مقصود ومتوقَّع).
//
// ما يفعله هذا الملف لكل طلب POST /create-order:
//   1) يتحقق من صحة البيانات (نفس شروط isValidOrder فـ firestore.rules).
//   2) يتحقق أن رقم الهاتف غير محظور (collection blockedPhones).
//   3) يقارن السعر المُرسل بالسعر الحقيقي المخزّن فـ Firestore.
//   4) يكتب الطلب فـ Firestore عبر REST API بصلاحيات Service Account.
//   5) يبعث إشعار Telegram (فشل هذه الخطوة لا يُسقط الطلب — الطلب مسجّل فعلًا).
//
// ✅ تشخيص سريع بلا تجربة طلبية حقيقية:
//   افتحي فـ المتصفح: https://noisy-lake-ace8.a-bazar-dzair-pro.workers.dev/health
//   لو رجعت {"ok":false,"missingSecrets":[...]} → هذاك السبب بالضبط.
//
// الأسرار المطلوبة (Cloudflare Dashboard > Workers > Settings > Variables
// and Secrets, أو عبر: npx wrangler secret put <NAME>):
//   FIREBASE_PROJECT_ID    — "bazar-dzair-33816"
//   FIREBASE_CLIENT_EMAIL  — من ملف Service Account JSON (client_email)
//   FIREBASE_PRIVATE_KEY   — من نفس الملف (private_key)، الصقيه كاملاً بأسطره
//   TELEGRAM_BOT_TOKEN     — لإشعار Telegram (اختياري: لو ناقص، الطلب يتسجّل
//                            فـ Firestore رغم كل شيء، فقط بلا إشعار)
//   TELEGRAM_CHAT_ID       — نفس الملاحظة أعلاه
//
// كيفية الحصول على Service Account JSON:
//   Firebase Console > ⚙️ Project Settings > Service Accounts >
//   Generate new private key. لا تضعي هذا الملف فـ أي مستودع Git إطلاقًا —
//   انسخي قيمه فقط كأسرار Worker.
// =====================================================================

// ---------------------------------------------------------------------
// إعدادات عامة
// ---------------------------------------------------------------------

// الدومينات المسموح لها بإرسال طلبات إلى هذا الـ Worker. لو أضفتِ دومين
// مخصص (custom domain) للموقع مستقبلاً، زيديه هنا فـ القائمة.
const ALLOWED_ORIGINS = ["https://bazar-dzair.github.io"];

// أسرار إجبارية لكتابة الطلب فـ Firestore — بدونها لا يمكن تسجيل أي طلب.
const REQUIRED_SECRETS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

// ---------------------------------------------------------------------
// نقطة الدخول (Entry point) + راوتر بسيط
// ---------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const origin = request.headers.get("Origin");
      const cors = corsHeaders(origin);

      // فحص سريع للنشر والأسرار — GET، بدون قيود Origin (لتقدري تفتحيه
      // مباشرة من المتصفح للتأكد أن كل شيء مضبوط).
      if (pathname === "/health" && request.method === "GET") {
        const missing = REQUIRED_SECRETS.filter((k) => !env[k]);
        const telegramConfigured = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
        return json(
          {
            ok: missing.length === 0,
            missingSecrets: missing,
            telegramConfigured,
          },
          missing.length === 0 ? 200 : 500
        );
      }

      if (pathname !== "/create-order") {
        return new Response("Not found", { status: 404 });
      }

      // Preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405, cors);
      }

      // رأس CORS وحده لا يمنع سوى المتصفح من قراءة الرد؛ لمنع أي جهة خارجية
      // (سكربت، سيرفر آخر...) من استدعاء هذا المسار مباشرة، نرفض صراحةً أي
      // طلب يحمل رأس Origin غير مسموح به (ونسمح بغياب Origin تمامًا، وهي
      // حالة طلبات غير المتصفح التي لا تُغني عنها حماية CORS أصلاً).
      if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return json({ error: "Origin not allowed" }, 403, cors);
      }

      // حارس مبكر وواضح: لو أحد أسرار Firebase ناقص، نرجّع خطأ فوري بدل ما
      // الطلب يفشل بعد عدة خطوات بخطأ غامض يصعب تشخيصه.
      const missingSecrets = REQUIRED_SECRETS.filter((k) => !env[k]);
      if (missingSecrets.length) {
        console.error("Missing required secrets:", missingSecrets.join(", "));
        return json({ error: "خطأ فـ إعدادات الخادم، تواصلي مع الدعم" }, 500, cors);
      }

      return await handleCreateOrder(request, env, cors);
    } catch (err) {
      // شبكة أمان أخيرة: أي خطأ غير متوقع يُسجَّل فـ Cloudflare > Workers >
      // Logs (تقدري تشوفيه هناك) بدل ما يرجع خطأ 1101 فارغ للزبون.
      console.error("Unhandled worker error:", err && err.stack ? err.stack : err);
      return json({ error: "حدث خطأ غير متوقع، حاولي مجددًا" }, 500);
    }
  },
};

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

// ---------------------------------------------------------------------
// معالج /create-order
// ---------------------------------------------------------------------
async function handleCreateOrder(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "بيانات غير صالحة" }, 400, cors);
  }

  const {
    customerName,
    customerPhone,
    wilaya,
    address,
    product,
    productId,
    quantity,
    price,
    shipping,
    deliveryType,
    shippingCompany,
    total,
  } = body || {};

  // 1) نفس شروط isValidOrder() فـ firestore.rules، بالضبط
  const validationError = validateOrder({
    customerName, customerPhone, wilaya, address, product,
    productId, quantity, price, shipping, total,
  });
  if (validationError) {
    return json({ error: validationError }, 400, cors);
  }

  // 2) توكن Service Account — مبكرًا، يُستخدم لفحص الحظر ثم للكتابة لاحقًا
  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (e) {
    // نسجّل رسالة الخطأ الحقيقية (بدون كشف السرّ نفسه) فـ الـ Logs — هذا هو
    // أكثر مكان تفشل فيه الأمور عمليًا (مفتاح خاص بصيغة غير صحيحة، بريد
    // Service Account خاطئ...)، والرسالة المرجعة للزبون تبقى عامة ومهذبة.
    console.error("getGoogleAccessToken failed:", e && e.message ? e.message : e);
    return json({ error: "تعذّر الاتصال بالخادم" }, 502, cors);
  }

  // 3) رفض الطلب إذا كان رقم الهاتف محظورًا من لوحة تحكم الأدمن
  let phoneBlocked;
  try {
    phoneBlocked = await isPhoneBlocked(env, accessToken, customerPhone);
  } catch (e) {
    console.error("isPhoneBlocked failed:", e && e.message ? e.message : e);
    return json({ error: "تعذّر التحقق من رقم الهاتف" }, 502, cors);
  }
  if (phoneBlocked) {
    return json({ error: "لا يمكن تسجيل الطلب بهذا الرقم" }, 403, cors);
  }

  // 4) مطابقة السعر الحقيقي — نفس منطق get(...).data.price == d.price فـ القواعد
  let realPrice;
  try {
    realPrice = await getProductPrice(env, productId);
  } catch (e) {
    console.error("getProductPrice failed:", e && e.message ? e.message : e);
    return json({ error: "تعذّر التحقق من المنتج" }, 502, cors);
  }
  if (realPrice === null || Math.abs(realPrice - Number(price)) > 0.001) {
    console.error(
      `Price mismatch for productId=${productId}: real=${realPrice}, sent=${price}`
    );
    return json({ error: "السعر لا يطابق المنتج الحقيقي" }, 400, cors);
  }

  const shippingValue = Number(shipping || 0);
  const totalValue = Number(total);
  const expectedTotal = Number(price) * Number(quantity) + shippingValue;

  // حارس صريح ضد NaN: لو shipping أو total قيمة غير رقمية (نص، object...)
  // فإن Number(...) تُعطي NaN، و"NaN > 0.01" فـ JS تُرجع false بصمت — نرفض
  // الطلب صراحةً فـ هذه الحالة بدل الاعتماد على المقارنة وحدها.
  if (
    !Number.isFinite(shippingValue) || shippingValue < 0 ||
    !Number.isFinite(totalValue) ||
    !Number.isFinite(expectedTotal) ||
    Math.abs(expectedTotal - totalValue) > 0.01
  ) {
    return json({ error: "المجموع غير صحيح" }, 400, cors);
  }

  // 5) الكتابة فـ Firestore عبر Service Account
  let doc;
  try {
    doc = await createOrderDoc(env, accessToken, {
      customerName, customerPhone, wilaya, address, product, productId,
      quantity: Number(quantity),
      price: Number(price),
      shipping: shippingValue,
      deliveryType: deliveryType || "",
      shippingCompany: shippingCompany || "",
      total: totalValue,
      status: "جديد",
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("createOrderDoc failed:", e && e.message ? e.message : e);
    return json({ error: "تعذّر حفظ الطلب" }, 502, cors);
  }

  // 6) إشعار Telegram — لا يُسقط الطلب لو تعطّل، لأنه مسجّل فعلًا فـ Firestore
  try {
    await sendTelegram(env, { customerName, customerPhone, wilaya, address, product, quantity, total: totalValue });
  } catch (e) {
    console.error("sendTelegram failed:", e && e.message ? e.message : e);
  }

  const id = doc && doc.name ? doc.name.split("/").pop() : null;
  return json({ ok: true, id }, 200, cors);
}

// ---------------------------------------------------------------------
// نفس شروط isValidOrder() الموجودة فـ firestore.rules
// ---------------------------------------------------------------------
function validateOrder(d) {
  if (typeof d.customerName !== "string" || d.customerName.trim().length === 0 || d.customerName.length >= 100)
    return "اسم غير صالح";
  if (typeof d.customerPhone !== "string" || !/^0[5-7][0-9]{8}$/.test(d.customerPhone))
    return "رقم هاتف غير صالح";
  if (typeof d.wilaya !== "string" || d.wilaya.trim().length === 0 || d.wilaya.length >= 100)
    return "ولاية غير صالحة";
  if (typeof d.address !== "string" || d.address.trim().length === 0 || d.address.length >= 300)
    return "عنوان غير صالح";
  if (typeof d.product !== "string" || d.product.trim().length === 0 || d.product.length >= 200)
    return "اسم منتج غير صالح";
  if (typeof d.productId !== "string" || d.productId.trim().length === 0 || d.productId.length >= 200)
    return "معرّف منتج غير صالح";
  if (!Number.isInteger(d.quantity) || d.quantity <= 0 || d.quantity > 50)
    return "كمية غير صالحة";
  if (typeof d.price !== "number" || d.price < 0) return "سعر غير صالح";
  if (typeof d.total !== "number" || d.total < 0) return "مجموع غير صالح";
  // shipping اختياري، لكن إن أُرسل يجب أن يكون رقمًا غير سالب — منع التلاعب
  // بقيمة الشحن (نص أو object يتحوّل إلى NaN ويُفسد فحص المجموع لاحقًا).
  if (
    d.shipping !== undefined && d.shipping !== null &&
    (typeof d.shipping !== "number" || !Number.isFinite(d.shipping) || d.shipping < 0)
  )
    return "قيمة شحن غير صالحة";
  return null;
}

// ---------------------------------------------------------------------
// يتحقق هل رقم الهاتف موجود فـ collection "blockedPhones" (معرّف الوثيقة =
// رقم الهاتف نفسه). القراءة تتم بصلاحيات Service Account حتى لو كانت
// firestore.rules تمنع القراءة العامة لهذا الـ collection.
// ---------------------------------------------------------------------
async function isPhoneBlocked(env, accessToken, phone) {
  if (!phone || typeof phone !== "string") return false;
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blockedPhones/${encodeURIComponent(phone)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error("blockedPhones lookup failed: " + resp.status);
  return true;
}

// ---------------------------------------------------------------------
// جلب السعر الحقيقي للمنتج (قراءة عامة، بدون حاجة توثيق — نفس ما تسمح به
// firestore.rules لِـ collection products أصلاً)
// ---------------------------------------------------------------------
async function getProductPrice(env, productId) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/products/${encodeURIComponent(productId)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    if (resp.status !== 404) {
      console.error("getProductPrice: unexpected status", resp.status, "for productId=", productId);
    }
    return null;
  }
  const data = await resp.json();
  const p = data.fields && data.fields.price;
  if (!p) return null;
  if ("doubleValue" in p) return Number(p.doubleValue);
  if ("integerValue" in p) return Number(p.integerValue);
  return null;
}

// ---------------------------------------------------------------------
// OAuth2 عبر Service Account (JWT Bearer flow) — يعمل داخل Workers runtime
// بالكامل عبر Web Crypto، بدون الحاجة لـ firebase-admin (غير متوافق مع Workers).
// ---------------------------------------------------------------------
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encClaims = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encClaims}`;

  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error("OAuth token error: " + JSON.stringify(data));
  }
  return data.access_token;
}

// 🛠️ ملاحظة إصلاح: لصق مفتاح Service Account فـ Cloudflare قد يحفظ أسطره
// الجديدة كنص حرفي "\n" (حرفين: باكسلاش + n) بدل سطر جديد حقيقي، حسب طريقة
// اللصق/الأداة المستعملة. النسخة القديمة كانت تتعامل فقط مع الحالة "سطر جديد
// حقيقي"، فتفشل فـ الحالة الأخرى بصمت (atob() ترمي خطأ Base64 غير صالح).
// هذا الإصلاح يتعامل مع الحالتين معًا.
async function importPrivateKey(pem) {
  if (typeof pem !== "string" || !pem.trim()) {
    throw new Error("FIREBASE_PRIVATE_KEY is missing or empty");
  }
  const normalizedPem = pem.replace(/\\n/g, "\n").trim();
  const pemContents = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  let binaryDer;
  try {
    binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  } catch (e) {
    throw new Error("FIREBASE_PRIVATE_KEY is not valid base64 — تأكدي أنك لصقتِ المفتاح كاملاً بصيغته الأصلية (من -----BEGIN PRIVATE KEY----- إلى -----END PRIVATE KEY-----)");
  }
  return crypto.subtle.importKey(
    "pkcs8", binaryDer.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
}

function base64url(buf) {
  let str = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------
// كتابة الطلب فـ Firestore عبر REST API (بصلاحيات Service Account)
// ---------------------------------------------------------------------
async function createOrderDoc(env, accessToken, order) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders`;
  const fields = {};
  for (const [k, v] of Object.entries(order)) {
    if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (typeof v === "number") fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else fields[k] = { stringValue: String(v ?? "") };
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("Firestore write error: " + JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------------
// إشعار Telegram
// ---------------------------------------------------------------------
async function sendTelegram(env, o) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text =
    `🛒 طلب جديد\n👤 الاسم: ${o.customerName}\n📞 الهاتف: ${o.customerPhone}\n` +
    `📍 الولاية: ${o.wilaya}\n🏠 العنوان: ${o.address}\n📦 المنتج: ${o.product}\n` +
    `🔢 الكمية: ${o.quantity}\n💰 المجموع: ${o.total} دج`;
  const resp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error("Telegram API error: " + resp.status + " " + errBody);
  }
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
                                     }
    
