// =====================================================================
// worker/create-order.js — مسار جديد يُضاف إلى Cloudflare Worker الحالي
// (noisy-lake-ace8.a-bazar-dzair-pro.workers.dev)
//
// ⚠️ هذا الملف NOT مخصص لمجلد الموقع (Pages/GitHub). ضعه في مستودع الـ
// Worker المنفصل الخاص بك، وادمج المسار /create-order مع الراوتر الحالي
// الذي يحتوي بالفعل /send-telegram. لا تضعه داخل مجلد الاستضافة الثابت —
// لو وُضع هناك سيُنشر كملف عام قابل للتحميل (حتى لو أسراره بأمان في env).
//
// ما يفعله هذا المسار:
//   1) يعيد نفس التحقق الموجود في firestore.rules (شكل البيانات، الهاتف، الكمية...).
//   2) يتحقق أن رقم هاتف الزبون غير موجود في قائمة الأرقام المحظورة (collection
//      blockedPhones يديرها الأدمن من لوحة التحكم).
//   3) يجلب السعر الحقيقي للمنتج من Firestore ويقارنه بالسعر المُرسل.
//   4) يكتب الطلب في Firestore بصلاحيات Service Account (تتجاوز Security Rules
//      تمامًا، وهذا مقصود ومتوقَّع لأي Admin SDK / Service Account).
//   5) يرسل إشعار Telegram (التوكن يبقى في env هنا فقط، لا يمر عبر المتصفح أبدًا).
//
// الأسرار المطلوبة (Cloudflare Dashboard > Workers > Settings > Variables,
// أو عبر: npx wrangler secret put <NAME>):
//   FIREBASE_PROJECT_ID    — "bazar-dzair-33816"
//   FIREBASE_CLIENT_EMAIL  — من ملف Service Account JSON (client_email)
//   FIREBASE_PRIVATE_KEY   — من نفس الملف (private_key) — الصقه كاملاً بأسطره \n
//   TELEGRAM_BOT_TOKEN     — إن لم يكن معرّفًا مسبقًا في الـ Worker الحالي
//   TELEGRAM_CHAT_ID       — إن لم يكن معرّفًا مسبقًا في الـ Worker الحالي
//
// كيفية الحصول على Service Account JSON:
//   Firebase Console > ⚙️ Project Settings > Service Accounts >
//   Generate new private key. لا تضع هذا الملف في أي مستودع Git إطلاقًا —
//   انسخ قيمه فقط كأسرار Worker.
// =====================================================================

export async function handleCreateOrder(request, env) {
  const cors = {
    "Access-Control-Allow-Origin": "*", // يمكن تضييقها لدومين المتجر فقط
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

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

  // 1) نفس شروط isValidOrder() في firestore.rules، بالضبط
  const validationError = validateOrder({
    customerName,
    customerPhone,
    wilaya,
    address,
    product,
    productId,
    quantity,
    price,
    shipping,
    total,
  });
  if (validationError) {
    return json({ error: validationError }, 400, cors);
  }

  // 2) الحصول على توكن Service Account مبكرًا — يُستخدم لفحص الحظر ثم للكتابة لاحقًا
  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (e) {
    return json({ error: "تعذّر الاتصال بالخادم" }, 502, cors);
  }

  // 3) رفض الطلب إذا كان رقم الهاتف محظورًا من لوحة تحكم الأدمن
  let phoneBlocked;
  try {
    phoneBlocked = await isPhoneBlocked(env, accessToken, customerPhone);
  } catch (e) {
    return json({ error: "تعذّر التحقق من رقم الهاتف" }, 502, cors);
  }
  if (phoneBlocked) {
    return json({ error: "لا يمكن تسجيل الطلب بهذا الرقم" }, 403, cors);
  }

  // 4) مطابقة السعر الحقيقي — نفس منطق get(...).data.price == d.price في القواعد
  let realPrice;
  try {
    realPrice = await getProductPrice(env, productId);
  } catch {
    return json({ error: "تعذّر التحقق من المنتج" }, 502, cors);
  }
  if (realPrice === null || Math.abs(realPrice - Number(price)) > 0.001) {
    return json({ error: "السعر لا يطابق المنتج الحقيقي" }, 400, cors);
  }
  const expectedTotal =
    Number(price) * Number(quantity) + Number(shipping || 0);
  if (Math.abs(expectedTotal - Number(total)) > 0.01) {
    return json({ error: "المجموع غير صحيح" }, 400, cors);
  }

  // 5) الكتابة في Firestore عبر Service Account
  let doc;
  try {
    doc = await createOrderDoc(env, accessToken, {
      customerName,
      customerPhone,
      wilaya,
      address,
      product,
      productId,
      quantity: Number(quantity),
      price: Number(price),
      shipping: Number(shipping || 0),
      deliveryType: deliveryType || "",
      shippingCompany: shippingCompany || "",
      total: Number(total),
      status: "جديد",
      createdAt: new Date(),
    });
  } catch (e) {
    return json({ error: "تعذّر حفظ الطلب" }, 502, cors);
  }

  // 6) إشعار Telegram — لا يفشل الطلب لو تعطّل الإشعار
  try {
    await sendTelegram(env, {
      customerName,
      customerPhone,
      wilaya,
      address,
      product,
      quantity,
      total,
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }

  const id = doc && doc.name ? doc.name.split("/").pop() : null;
  return json({ ok: true, id }, 200, cors);
}

// ---------------------------------------------------------------------
// يتحقق هل رقم الهاتف موجود في collection "blockedPhones" (معرّف الوثيقة =
// رقم الهاتف نفسه). القراءة تتم بصلاحيات Service Account حتى لو كانت
// firestore.rules تمنع القراءة العامة لهذا الـ collection.
// ---------------------------------------------------------------------
async function isPhoneBlocked(env, accessToken, phone) {
  if (!phone || typeof phone !== "string") return false;
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blockedPhones/${encodeURIComponent(
    phone
  )}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return false;
  if (!resp.ok) throw new Error("blockedPhones lookup failed: " + resp.status);
  return true;
}

// ---------------------------------------------------------------------
// نفس شروط isValidOrder() الموجودة في firestore.rules
// ---------------------------------------------------------------------
function validateOrder(d) {
  if (
    typeof d.customerName !== "string" ||
    d.customerName.trim().length === 0 ||
    d.customerName.length >= 100
  )
    return "اسم غير صالح";
  if (
    typeof d.customerPhone !== "string" ||
    !/^0[5-7][0-9]{8}$/.test(d.customerPhone)
  )
    return "رقم هاتف غير صالح";
  if (
    typeof d.wilaya !== "string" ||
    d.wilaya.trim().length === 0 ||
    d.wilaya.length >= 100
  )
    return "ولاية غير صالحة";
  if (
    typeof d.address !== "string" ||
    d.address.trim().length === 0 ||
    d.address.length >= 300
  )
    return "عنوان غير صالح";
  if (
    typeof d.product !== "string" ||
    d.product.trim().length === 0 ||
    d.product.length >= 200
  )
    return "اسم منتج غير صالح";
  if (
    typeof d.productId !== "string" ||
    d.productId.trim().length === 0 ||
    d.productId.length >= 200
  )
    return "معرّف منتج غير صالح";
  if (
    !Number.isInteger(d.quantity) ||
    d.quantity <= 0 ||
    d.quantity > 50
  )
    return "كمية غير صالحة";
  if (typeof d.price !== "number" || d.price < 0) return "سعر غير صالح";
  if (typeof d.total !== "number" || d.total < 0) return "مجموع غير صالح";
  return null;
}

// ---------------------------------------------------------------------
// جلب السعر الحقيقي للمنتج (قراءة عامة، بدون حاجة توثيق — نفس ما تسمح به
// firestore.rules لِـ collection products أصلاً)
// ---------------------------------------------------------------------
async function getProductPrice(env, productId) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/products/${encodeURIComponent(
    productId
  )}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
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
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=${encodeURIComponent(
        "urn:ietf:params:oauth:grant-type:jwt-bearer"
      )}&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error("OAuth token error: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) =>
    c.charCodeAt(0)
  );
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(buf) {
  let str = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------
// كتابة الطلب في Firestore عبر REST API (بصلاحيات Service Account)
// ---------------------------------------------------------------------
async function createOrderDoc(env, accessToken, order) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders`;
  const fields = {};
  for (const [k, v] of Object.entries(order)) {
    if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (typeof v === "number")
      fields[k] = Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    else fields[k] = { stringValue: String(v ?? "") };
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("Firestore write error: " + JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------------
// إشعار Telegram — ادمج هذا مع الدالة الموجودة لديك مسبقًا في /send-telegram
// إن كانت موجودة، لتفادي التكرار.
// ---------------------------------------------------------------------
async function sendTelegram(env, o) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text =
    `🛒 طلب جديد\n👤 الاسم: ${o.customerName}\n📞 الهاتف: ${o.customerPhone}\n` +
    `📍 الولاية: ${o.wilaya}\n🏠 العنوان: ${o.address}\n📦 المنتج: ${o.product}\n` +
    `🔢 الكمية: ${o.quantity}\n💰 المجموع: ${o.total} دج`;
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    }
  );
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}

// ---------------------------------------------------------------------
// دمج مع الراوتر الحالي في worker الرئيسي، مثال:
//
//   import { handleCreateOrder } from "./create-order.js";
//   export default {
//     async fetch(request, env, ctx) {
//       const url = new URL(request.url);
//       if (url.pathname === "/create-order") return handleCreateOrder(request, env);
//       if (url.pathname === "/send-telegram") return handleSendTelegram(request, env); // الموجودة مسبقًا
//       return new Response("Not found", { status: 404 });
//     }
//   };
// ---------------------------------------------------------------------
